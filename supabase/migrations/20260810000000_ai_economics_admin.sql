-- Phase 11: privacy-conscious AI economics analytics and admin-only reporting.
-- Provider prices are intentionally NULL until reviewed values are configured.

alter table public.billing_plans
  add column monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0);

update public.billing_plans set monthly_price_cents = case plan_key
  when 'free' then 0 when 'family' then 1200 when 'creator' then 2400 else null end;

alter table public.ai_usage
  add column request_id uuid,
  add column reservation_id uuid references public.entitlement_usage(id) on delete set null,
  add column parent_request_id uuid,
  add column resource_id uuid,
  add column generation_kind text,
  add column page_count integer check (page_count is null or page_count between 1 and 30),
  add column image_size text,
  add column image_quality text,
  add column entitlement_bucket text check (entitlement_bucket is null or entitlement_bucket in ('story','image','lightweight')),
  add column entitlement_amount integer check (entitlement_amount is null or entitlement_amount >= 0),
  add column plan_key text references public.billing_plans(plan_key),
  add column failure_stage text check (failure_stage is null or failure_stage in ('validation','entitlement','provider','storage_database','unknown'));

create unique index ai_usage_request_id_uidx on public.ai_usage(request_id) where request_id is not null;
create index ai_usage_created_operation_idx on public.ai_usage(created_at desc, operation);
create index ai_usage_generation_kind_idx on public.ai_usage(generation_kind, page_count, created_at desc);
create index ai_usage_plan_created_idx on public.ai_usage(plan_key, created_at desc);

create table public.story_generation_segments (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null,
  generation_kind text not null check (generation_kind = 'continuation'),
  page_count integer not null check (page_count in (3,5,10)),
  start_page integer not null check (start_page > 0),
  end_page integer not null check (end_page >= start_page),
  created_at timestamptz not null default now(),
  foreign key (user_id, story_id) references public.stories(user_id, id) on delete cascade
);

create index story_generation_segments_page_idx on public.story_generation_segments(story_id, start_page, end_page);

create table public.ai_provider_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai' check (provider = 'openai'),
  model text not null,
  image_size text,
  image_quality text,
  input_usd_per_million numeric(18,8) check (input_usd_per_million is null or input_usd_per_million >= 0),
  output_usd_per_million numeric(18,8) check (output_usd_per_million is null or output_usd_per_million >= 0),
  image_usd_per_unit numeric(18,8) check (image_usd_per_unit is null or image_usd_per_unit >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  config_version text not null,
  effective_from timestamptz not null,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (provider, model, image_size, image_quality, effective_from)
);

insert into public.ai_provider_pricing(model,image_size,image_quality,input_usd_per_million,output_usd_per_million,image_usd_per_unit,config_version,effective_from)
values
  ('gpt-5.6-sol', null, null, null, null, null, 'phase11-unconfigured-v1', '2026-08-09T00:00:00Z'),
  ('gpt-image-2', '1024x1024', 'medium', null, null, null, 'phase11-unconfigured-v1', '2026-08-09T00:00:00Z');

create or replace function public.estimate_ai_usage_cost(
  p_model text,
  p_created_at timestamptz,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_image_count integer,
  p_image_size text,
  p_image_quality text
)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare p public.ai_provider_pricing%rowtype; total numeric := 0; measurable boolean := false;
begin
  select * into p from public.ai_provider_pricing c
  where c.model=p_model and c.effective_from<=p_created_at
    and (c.image_size is null or c.image_size is not distinct from p_image_size)
    and (c.image_quality is null or c.image_quality is not distinct from p_image_quality)
  order by (c.image_size is not null) desc,c.effective_from desc limit 1;
  if not found then return null; end if;
  if coalesce(p_input_tokens,0)>0 then
    if p.input_usd_per_million is null then return null; end if;
    total:=total+(p_input_tokens::numeric/1000000)*p.input_usd_per_million; measurable:=true;
  end if;
  if coalesce(p_output_tokens,0)>0 then
    if p.output_usd_per_million is null then return null; end if;
    total:=total+(p_output_tokens::numeric/1000000)*p.output_usd_per_million; measurable:=true;
  end if;
  if coalesce(p_image_count,0)>0 then
    if p.image_usd_per_unit is null then return null; end if;
    total:=total+p_image_count*p.image_usd_per_unit; measurable:=true;
  end if;
  return case when measurable then total else null end;
end;
$$;

create view public.ai_usage_cost_estimates with (security_invoker=true) as
select u.*,
  public.estimate_ai_usage_cost(u.model,u.created_at,u.input_tokens,u.output_tokens,u.image_count,u.image_size,u.image_quality) estimated_cost_usd
from public.ai_usage u;

create or replace function public.link_story_ai_usage(p_story_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.stories s where s.id=p_story_id and s.user_id=v_user) then raise exception 'PERMISSION_DENIED'; end if;
  update public.ai_usage set story_id=p_story_id
  where request_id=p_request_id and user_id=v_user and operation='generate-story' and success and story_id is null;
  if not found then raise exception 'USAGE_LINK_INVALID'; end if;
end;
$$;

create or replace function public.get_admin_ai_economics(p_range text default '30d')
returns jsonb language plpgsql security definer set search_path='' stable as $$
declare v_user uuid:=auth.uid(); v_start timestamptz; v_result jsonb;
begin
  if v_user is null or not exists(select 1 from public.profiles p where p.id=v_user and p.role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
  v_start:=case p_range when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days' when 'month' then date_trunc('month',now()) when 'all' then '-infinity'::timestamptz else null end;
  if v_start is null then raise exception 'RANGE_INVALID'; end if;

  with usage as (
    select u.*,coalesce(u.plan_key,(select s.plan_key from public.subscriptions s where s.user_id=u.user_id and s.status in ('active','trialing') and s.current_period_start<=u.created_at and s.current_period_end>u.created_at order by s.current_period_end desc limit 1),'free') effective_plan
    from public.ai_usage_cost_estimates u where u.created_at>=v_start
  ), operation_rows as (
    select operation,count(*) requests,count(*) filter(where success) successes,count(*) filter(where not success) failures,
      round(100.0*count(*) filter(where success)/nullif(count(*),0),1) success_rate,
      sum(estimated_cost_usd) filter(where success) estimated_cost_usd,
      avg(estimated_cost_usd) filter(where success) avg_success_cost_usd,
      count(estimated_cost_usd) filter(where success) priced_samples
    from usage group by operation
  ), image_rows as (
    select generation_kind,count(*) filter(where success) samples,sum(image_count) filter(where success) images,
      avg(estimated_cost_usd) filter(where success) avg_cost_usd,sum(estimated_cost_usd) filter(where success) estimated_cost_usd
    from usage where generation_kind in ('character_portrait','initial_page_illustration','continuation_illustration','repaint','custom_cover') group by generation_kind
  ), initial_books as (
    select t.story_id,t.page_count,t.estimated_cost_usd+coalesce(sum(i.estimated_cost_usd),0) cost,
      count(i.id) filter(where i.success) image_count
    from usage t left join usage i on i.story_id=t.story_id and i.generation_kind='initial_page_illustration' and i.success
    where t.generation_kind='initial_story' and t.success and t.story_id is not null group by t.id,t.story_id,t.page_count,t.estimated_cost_usd
  ), story_sizes as (
    select sizes.page_count,count(b.story_id) samples,avg(b.cost) avg_initial_cost_usd,avg(b.image_count) avg_successful_images
    from (values(6),(10),(15),(24),(30)) sizes(page_count) left join initial_books b using(page_count) group by sizes.page_count order by sizes.page_count
  ), continuation_rows as (
    select sizes.page_count,count(c.id) filter(where c.success) samples,
      avg(c.estimated_cost_usd+coalesce((select sum(i.estimated_cost_usd) from usage i where i.parent_request_id=c.request_id and i.success),0)) filter(where c.success) avg_cost_usd,
      avg((select count(*) from usage i where i.parent_request_id=c.request_id and i.success)) filter(where c.success) avg_successful_images
    from (values(3),(5),(10)) sizes(page_count) left join usage c on c.generation_kind='continuation' and c.page_count=sizes.page_count group by sizes.page_count order by sizes.page_count
  ), character_rows as (
    select generation_kind,count(*) filter(where success) samples,avg(estimated_cost_usd) filter(where success) avg_cost_usd,sum(estimated_cost_usd) filter(where success) estimated_cost_usd
    from usage where generation_kind in ('character_analysis','character_portrait') group by generation_kind
  ), user_rows as (
    select u.user_id,au.email,count(*) requests,sum(u.estimated_cost_usd) filter(where u.success) estimated_cost_usd,count(u.estimated_cost_usd) filter(where u.success) priced_samples
    from usage u join auth.users au on au.id=u.user_id group by u.user_id,au.email order by estimated_cost_usd desc nulls last
  ), unit_costs as (
    select sum(u.estimated_cost_usd) filter(where u.success and u.entitlement_bucket='story')/nullif(sum(u.entitlement_amount) filter(where u.success and u.entitlement_bucket='story'),0) story_unit,
      sum(u.estimated_cost_usd) filter(where u.success and u.entitlement_bucket='image')/nullif(sum(u.entitlement_amount) filter(where u.success and u.entitlement_bucket='image'),0) image_unit from usage u
  ), plan_rows as (
    select bp.plan_key,bp.display_name,bp.monthly_price_cents,bp.story_units_limit,bp.image_units_limit,bp.max_story_pages,
      count(distinct u.user_id) observed_users,sum(u.estimated_cost_usd) filter(where u.success) observed_estimated_cost_usd,
      case when count(distinct u.user_id)>0 then sum(u.estimated_cost_usd) filter(where u.success)/count(distinct u.user_id) end avg_cost_per_observed_user_usd,
      bp.story_units_limit*uc.story_unit+bp.image_units_limit*uc.image_unit estimated_max_ai_cost_usd,
      (select count(*) from public.subscriptions s where s.plan_key=bp.plan_key and s.status in ('active','trialing')) active_test_subscriptions,
      (select count(*) from public.subscriptions s where s.plan_key=bp.plan_key and s.status in ('active','trialing'))*bp.monthly_price_cents/100.0 monthly_test_revenue_usd,
      (select count(*) from public.subscriptions s where s.plan_key=bp.plan_key and s.status in ('active','trialing'))*bp.monthly_price_cents/100.0-coalesce(sum(u.estimated_cost_usd) filter(where u.success),0) ai_gross_margin_estimate_usd,
      case when (select count(*) from public.subscriptions s where s.plan_key=bp.plan_key and s.status in ('active','trialing'))*bp.monthly_price_cents>0 then
        100*((select count(*) from public.subscriptions s where s.plan_key=bp.plan_key and s.status in ('active','trialing'))*bp.monthly_price_cents/100.0-coalesce(sum(u.estimated_cost_usd) filter(where u.success),0))/((select count(*) from public.subscriptions s where s.plan_key=bp.plan_key and s.status in ('active','trialing'))*bp.monthly_price_cents/100.0)
      end ai_gross_margin_estimate_pct
    from public.billing_plans bp cross join unit_costs uc left join usage u on u.effective_plan=bp.plan_key
    group by bp.plan_key,bp.display_name,bp.monthly_price_cents,bp.story_units_limit,bp.image_units_limit,bp.max_story_pages,uc.story_unit,uc.image_unit order by bp.sort_order
  )
  select jsonb_build_object(
    'range',p_range,'start',v_start,'generated_at',now(),'stripe_mode','TEST','cost_label','ESTIMATED','margin_label','AI GROSS MARGIN ESTIMATE',
    'overview',(select jsonb_build_object('requests',count(*),'successes',count(*) filter(where success),'failures',count(*) filter(where not success),'image_generations',coalesce(sum(image_count) filter(where success),0),'estimated_spend_usd',sum(estimated_cost_usd) filter(where success),'priced_samples',count(estimated_cost_usd) filter(where success),'unpriced_successes',count(*) filter(where success and estimated_cost_usd is null)) from usage),
    'operations',coalesce((select jsonb_agg(to_jsonb(operation_rows) order by operation) from operation_rows),'[]'::jsonb),
    'images',coalesce((select jsonb_agg(to_jsonb(image_rows) order by generation_kind) from image_rows),'[]'::jsonb),
    'story_sizes',(select jsonb_agg(to_jsonb(story_sizes) order by page_count) from story_sizes),
    'continuations',(select jsonb_agg(to_jsonb(continuation_rows) order by page_count) from continuation_rows),
    'characters',coalesce((select jsonb_agg(to_jsonb(character_rows) order by generation_kind) from character_rows),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(to_jsonb(user_rows)) from user_rows),'[]'::jsonb),
    'plans',(select jsonb_agg(to_jsonb(plan_rows) order by plan_key) from plan_rows),
    'pricing',(select jsonb_agg(jsonb_build_object('model',model,'image_size',image_size,'image_quality',image_quality,'input_usd_per_million',input_usd_per_million,'output_usd_per_million',output_usd_per_million,'image_usd_per_unit',image_usd_per_unit,'config_version',config_version,'effective_from',effective_from,'updated_at',updated_at) order by model,image_size nulls first) from public.ai_provider_pricing)
  ) into v_result;
  return v_result;
end;
$$;

alter table public.story_generation_segments enable row level security;
alter table public.ai_provider_pricing enable row level security;
revoke all on public.story_generation_segments,public.ai_provider_pricing from public,anon,authenticated;
revoke all on public.ai_usage_cost_estimates from public,anon,authenticated;
revoke all on function public.estimate_ai_usage_cost(text,timestamptz,bigint,bigint,integer,text,text) from public,anon,authenticated;
revoke all on function public.link_story_ai_usage(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_admin_ai_economics(text) from public,anon,authenticated;
grant execute on function public.link_story_ai_usage(uuid,uuid) to authenticated;
grant execute on function public.get_admin_ai_economics(text) to authenticated;

comment on table public.ai_provider_pricing is 'Server-only provider price configuration. NULL values mean cost is not configured; never invent or infer provider prices.';
comment on function public.get_admin_ai_economics(text) is 'Admin-only privacy-conscious AI economics snapshot; contains identifiers and email but no prompts, story text, or photos.';
