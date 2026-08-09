-- Story Loom Kids Phase 10: Stripe subscriptions and transactional AI entitlements.
-- Limits below are provisional test-mode values and must be calibrated from real economics.

create table public.billing_plans (
  plan_key text primary key check (plan_key ~ '^[a-z0-9_-]+$'),
  display_name text not null,
  monthly_price_display text not null,
  stripe_price_id text unique,
  billing_interval text not null default 'month' check (billing_interval in ('month')),
  story_units_limit integer not null check (story_units_limit >= 0),
  image_units_limit integer not null check (image_units_limit >= 0),
  max_story_pages integer not null check (max_story_pages in (6, 10, 15, 24, 30)),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_customer_id text not null,
  stripe_price_id text,
  plan_key text references public.billing_plans(plan_key),
  status text not null check (status in ('active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stripe_subscription_id)
);

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz,
  success boolean not null default false,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.entitlement_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_key text not null references public.billing_plans(plan_key),
  period_start timestamptz not null,
  period_end timestamptz not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);

create table public.entitlement_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  bucket text not null check (bucket in ('story','image','lightweight')),
  amount integer not null check (amount >= 0),
  story_id uuid,
  requested_page_count integer,
  requested_image_count integer,
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  plan_key text not null references public.billing_plans(plan_key),
  source text not null check (source in ('free','subscription','override')),
  status text not null default 'reserved' check (status in ('reserved','consumed','released')),
  provider_request_id text,
  reserved_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint entitlement_usage_story_same_owner_fk
    foreign key (user_id, story_id) references public.stories(user_id, id) on delete set null (story_id),
  check (billing_period_end > billing_period_start)
);

create index subscriptions_user_status_idx on public.subscriptions(user_id, status, current_period_end desc);
create index entitlement_usage_period_idx on public.entitlement_usage(user_id, billing_period_start, billing_period_end, bucket, status);
create index entitlement_usage_story_idx on public.entitlement_usage(story_id) where story_id is not null;

create trigger billing_plans_set_updated_at before update on public.billing_plans
for each row execute function public.set_updated_at();
create trigger stripe_customers_set_updated_at before update on public.stripe_customers
for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();
create trigger entitlement_overrides_set_updated_at before update on public.entitlement_overrides
for each row execute function public.set_updated_at();

insert into public.billing_plans
  (plan_key, display_name, monthly_price_display, stripe_price_id, story_units_limit, image_units_limit, max_story_pages, sort_order)
values
  ('free', 'Story Loom Free', '$0', null, 1, 10, 6, 0),
  ('family', 'Story Loom Family', '$12/month', null, 10, 60, 24, 10),
  ('creator', 'Story Loom Creator', '$24/month', null, 25, 160, 30, 20);

create or replace function public.story_unit_cost(page_count integer)
returns integer language sql immutable strict set search_path = '' as $$
  select case page_count when 6 then 1 when 10 then 2 when 15 then 3 when 24 then 4 when 30 then 5 else null end
$$;

create or replace function public.continuation_story_unit_cost(page_count integer)
returns integer language sql immutable strict set search_path = '' as $$
  select case page_count when 3 then 1 when 5 then 1 when 10 then 2 else null end
$$;

create or replace function public.reserve_ai_entitlement(
  p_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_story_id uuid default null,
  p_requested_page_count integer default null,
  p_requested_image_count integer default null
)
returns table(reservation_id uuid, plan_key text, bucket text, amount integer, remaining integer, period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.billing_plans%rowtype;
  v_selected record;
  v_source text := 'free';
  v_start timestamptz;
  v_end timestamptz;
  v_bucket text;
  v_amount integer;
  v_limit integer;
  v_used bigint;
  v_reservation uuid;
begin
  if p_user_id is null or p_request_id is null then raise exception 'ENTITLEMENT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select eo.plan_key, eo.period_start, eo.period_end
    into v_selected
  from public.entitlement_overrides eo
  join public.billing_plans bp on bp.plan_key = eo.plan_key and bp.active
  where eo.user_id = p_user_id and now() >= eo.period_start and now() < eo.period_end;

  if found then
    select * into v_plan from public.billing_plans where billing_plans.plan_key = v_selected.plan_key;
    v_start := v_selected.period_start; v_end := v_selected.period_end; v_source := 'override';
  else
    select s.plan_key, s.current_period_start, s.current_period_end
      into v_selected
    from public.subscriptions s
    join public.billing_plans bp on bp.plan_key = s.plan_key and bp.active
    where s.user_id = p_user_id
      and s.status in ('active','trialing')
      and s.current_period_start <= now() and s.current_period_end > now()
    order by s.current_period_end desc limit 1;
    if found then
      select * into v_plan from public.billing_plans where billing_plans.plan_key = v_selected.plan_key;
      v_start := v_selected.current_period_start; v_end := v_selected.current_period_end; v_source := 'subscription';
    else
      select * into v_plan from public.billing_plans where billing_plans.plan_key = 'free' and active;
      v_start := date_trunc('month', now()); v_end := v_start + interval '1 month';
    end if;
  end if;
  if v_plan.plan_key is null then raise exception 'ENTITLEMENT_CONFIG'; end if;

  if p_operation = 'generate-story' then
    v_bucket := 'story'; v_amount := public.story_unit_cost(p_requested_page_count);
    if v_amount is null or p_requested_page_count > v_plan.max_story_pages then raise exception 'ENTITLEMENT_LIMIT'; end if;
  elsif p_operation = 'continue-story' then
    v_bucket := 'story'; v_amount := public.continuation_story_unit_cost(p_requested_page_count);
    if v_amount is null or p_story_id is null or not exists (
      select 1 from public.stories s where s.id=p_story_id and s.user_id=p_user_id and s.page_count+p_requested_page_count<=v_plan.max_story_pages
    ) then raise exception 'ENTITLEMENT_LIMIT'; end if;
  elsif p_operation in ('generate-character-image','generate-page-image','generate-page-image-initial','generate-page-image-repaint','generate-cover') then
    v_bucket := 'image'; v_amount := greatest(coalesce(p_requested_image_count, 1), 1);
    if p_operation like 'generate-page-image%' and (p_requested_page_count is null or p_requested_page_count>v_plan.max_story_pages) then raise exception 'ENTITLEMENT_LIMIT'; end if;
  elsif p_operation in ('analyze-character','suggest-continuation','translate-story') then
    v_bucket := 'lightweight'; v_amount := 0;
  else raise exception 'ENTITLEMENT_OPERATION';
  end if;

  v_limit := case v_bucket when 'story' then v_plan.story_units_limit when 'image' then v_plan.image_units_limit else 2147483647 end;
  select coalesce(sum(eu.amount), 0) into v_used from public.entitlement_usage eu
  where eu.user_id = p_user_id and eu.bucket = v_bucket
    and eu.billing_period_start = v_start and eu.billing_period_end = v_end
    and eu.status in ('reserved','consumed');
  if v_used + v_amount > v_limit then raise exception 'ENTITLEMENT_LIMIT'; end if;

  insert into public.entitlement_usage(request_id,user_id,operation,bucket,amount,story_id,requested_page_count,requested_image_count,billing_period_start,billing_period_end,plan_key,source)
  values(p_request_id,p_user_id,p_operation,v_bucket,v_amount,p_story_id,p_requested_page_count,p_requested_image_count,v_start,v_end,v_plan.plan_key,v_source)
  on conflict(request_id) do nothing returning id into v_reservation;
  if v_reservation is null then raise exception 'ENTITLEMENT_DUPLICATE'; end if;
  return query select v_reservation,v_plan.plan_key,v_bucket,v_amount,(v_limit-v_used-v_amount)::integer,v_start,v_end;
end;
$$;

create or replace function public.finalize_ai_entitlement(p_reservation_id uuid, p_provider_request_id text default null)
returns void language sql security definer set search_path = '' as $$
  update public.entitlement_usage set status='consumed', provider_request_id=p_provider_request_id, finalized_at=now()
  where id=p_reservation_id and status='reserved'
$$;

create or replace function public.release_ai_entitlement(p_reservation_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.entitlement_usage set status='released', finalized_at=now()
  where id=p_reservation_id and status='reserved'
$$;

create or replace function public.get_billing_summary()
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare v_user uuid := auth.uid(); v_plan public.billing_plans%rowtype; v_selected record; v_start timestamptz; v_end timestamptz; v_status text := 'free'; v_cancel boolean := false; v_story bigint; v_image bigint; v_manage boolean := false;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select eo.plan_key,eo.period_start as current_period_start,eo.period_end as current_period_end,'override'::text as status,false as cancel_at_period_end
    into v_selected from public.entitlement_overrides eo where eo.user_id=v_user and now()>=eo.period_start and now()<eo.period_end;
  if not found then select s.plan_key,s.current_period_start,s.current_period_end,s.status,s.cancel_at_period_end
    into v_selected from public.subscriptions s join public.billing_plans bp on bp.plan_key=s.plan_key
    where s.user_id=v_user and s.status in ('active','trialing') and s.current_period_end>now() order by s.current_period_end desc limit 1; end if;
  if found then
    select * into v_plan from public.billing_plans where plan_key=v_selected.plan_key;
    v_start:=v_selected.current_period_start; v_end:=v_selected.current_period_end; v_status:=v_selected.status; v_cancel:=v_selected.cancel_at_period_end;
  else
    select * into v_plan from public.billing_plans bp where bp.plan_key='free'; v_start:=date_trunc('month',now()); v_end:=v_start+interval '1 month';
    select s.status,s.cancel_at_period_end into v_status,v_cancel from public.subscriptions s where s.user_id=v_user order by s.updated_at desc limit 1;
    if not found then v_status:='free'; v_cancel:=false; end if;
  end if;
  select exists(select 1 from public.stripe_customers sc where sc.user_id=v_user) into v_manage;
  select coalesce(sum(amount) filter(where bucket='story' and status in ('reserved','consumed')),0), coalesce(sum(amount) filter(where bucket='image' and status in ('reserved','consumed')),0)
    into v_story,v_image from public.entitlement_usage where user_id=v_user and billing_period_start=v_start and billing_period_end=v_end;
  return jsonb_build_object('plan_key',v_plan.plan_key,'display_name',v_plan.display_name,'monthly_price_display',v_plan.monthly_price_display,'status',v_status,'cancel_at_period_end',v_cancel,'can_manage_billing',v_manage,'period_start',v_start,'period_end',v_end,'story_units_limit',v_plan.story_units_limit,'story_units_used',v_story,'story_units_remaining',greatest(v_plan.story_units_limit-v_story,0),'image_units_limit',v_plan.image_units_limit,'image_units_used',v_image,'image_units_remaining',greatest(v_plan.image_units_limit-v_image,0),'max_story_pages',v_plan.max_story_pages);
end;
$$;

create or replace function public.get_public_billing_plans()
returns table(plan_key text,display_name text,monthly_price_display text,story_units_limit integer,image_units_limit integer,max_story_pages integer,sort_order integer)
language sql security definer set search_path = '' stable as $$
  select bp.plan_key,bp.display_name,bp.monthly_price_display,bp.story_units_limit,bp.image_units_limit,bp.max_story_pages,bp.sort_order from public.billing_plans bp where bp.active order by bp.sort_order
$$;

create or replace function public.claim_stripe_webhook_event(p_event_id text,p_event_type text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_claimed text;
begin
  insert into public.stripe_webhook_events(stripe_event_id,event_type)
  values(p_event_id,p_event_type)
  on conflict(stripe_event_id) do update set event_type=excluded.event_type,processed_at=null,last_error=null
    where public.stripe_webhook_events.success=false and public.stripe_webhook_events.processed_at is not null
  returning stripe_event_id into v_claimed;
  return v_claimed is not null;
end;
$$;

create or replace function public.complete_stripe_webhook_event(p_event_id text,p_success boolean,p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.stripe_webhook_events set success=p_success,processed_at=now(),last_error=left(p_error,500) where stripe_event_id=p_event_id
$$;

alter table public.billing_plans enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.entitlement_overrides enable row level security;
alter table public.entitlement_usage enable row level security;
revoke all on public.billing_plans,public.stripe_customers,public.subscriptions,public.stripe_webhook_events,public.entitlement_overrides,public.entitlement_usage from public,anon,authenticated;
revoke all on function public.reserve_ai_entitlement(uuid,uuid,text,uuid,integer,integer),public.finalize_ai_entitlement(uuid,text),public.release_ai_entitlement(uuid) from public,anon,authenticated;
revoke all on function public.claim_stripe_webhook_event(text,text),public.complete_stripe_webhook_event(text,boolean,text) from public,anon,authenticated;
revoke all on function public.get_billing_summary() from public,anon,authenticated;
revoke all on function public.get_public_billing_plans() from public,anon,authenticated;
grant execute on function public.get_billing_summary() to authenticated;
grant execute on function public.get_public_billing_plans() to anon,authenticated;

comment on table public.entitlement_usage is 'Append-only authoritative reservation/consumption ledger; browser mutation is denied.';
comment on table public.billing_plans is 'Server-authoritative provisional test limits; recalibrate from measured AI economics before live billing.';
