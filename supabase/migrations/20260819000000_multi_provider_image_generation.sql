-- Server-authoritative image-provider policy, quotas, health events, and idempotency.
create table public.image_provider_settings (
  provider_key text primary key check (provider_key in ('policy','openai','cloudflare')),
  enabled boolean not null default false,
  priority integer not null default 100 check (priority between 1 and 1000),
  model_key text,
  selection_mode text check (selection_mode is null or selection_mode in ('openai_only','free_first','manual')),
  allow_paid_fallback boolean not null default false,
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit between 0 and 100000),
  daily_spend_limit_usd numeric(10,4) check (daily_spend_limit_usd is null or daily_spend_limit_usd between 0 and 10000),
  daily_neuron_limit numeric(14,2) check (daily_neuron_limit is null or daily_neuron_limit between 0 and 10000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.image_provider_settings(provider_key,enabled,priority,model_key,selection_mode,allow_paid_fallback,daily_request_limit,daily_spend_limit_usd,daily_neuron_limit) values
  ('policy',true,1,null,'openai_only',false,null,null,null),
  ('openai',true,100,'gpt-image-2',null,false,null,null,null),
  ('cloudflare',false,10,'@cf/black-forest-labs/flux-2-klein-4b',null,false,1000,0,10000);

create table public.image_provider_daily_usage (
  provider_key text not null references public.image_provider_settings(provider_key),
  usage_date date not null,
  request_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  estimated_neurons numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key(provider_key,usage_date)
);

create table public.image_provider_events (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  provider_key text not null,
  model_key text not null,
  outcome text not null check (outcome in ('success','failure','quota_exhausted','rejected')),
  estimated_cost_usd numeric(12,6),
  estimated_neurons numeric(14,2),
  failure_reason text,
  created_at timestamptz not null default now()
);
create index image_provider_events_created_idx on public.image_provider_events(created_at desc);

create table public.image_generation_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  provider_key text,
  model_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.image_provider_settings enable row level security;
alter table public.image_provider_daily_usage enable row level security;
alter table public.image_provider_events enable row level security;
alter table public.image_generation_requests enable row level security;
revoke all on public.image_provider_settings, public.image_provider_daily_usage, public.image_provider_events, public.image_generation_requests from public,anon,authenticated;

create or replace function public.admin_get_image_provider_settings()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select jsonb_build_object(
    'settings',coalesce((select jsonb_agg(to_jsonb(s) order by s.priority) from public.image_provider_settings s),'[]'::jsonb),
    'daily_usage',coalesce((select jsonb_agg(to_jsonb(u) order by u.usage_date desc,u.provider_key) from public.image_provider_daily_usage u where u.usage_date>=current_date-7),'[]'::jsonb),
    'recent_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.image_provider_events order by created_at desc limit 25) e),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.admin_update_image_provider_setting(
  p_provider_key text,p_enabled boolean,p_priority integer,p_model_key text,p_selection_mode text,
  p_allow_paid_fallback boolean,p_daily_request_limit integer,p_daily_spend_limit_usd numeric,p_daily_neuron_limit numeric,p_reason text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if p_provider_key not in ('policy','openai','cloudflare') or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'VALIDATION'; end if;
  if p_provider_key='policy' and p_selection_mode not in ('openai_only','free_first','manual') then raise exception 'VALIDATION'; end if;
  if p_provider_key<>'policy' and (p_model_key is null or not (
    (p_provider_key='openai' and p_model_key='gpt-image-2') or
    (p_provider_key='cloudflare' and p_model_key in ('@cf/black-forest-labs/flux-1-schnell','@cf/black-forest-labs/flux-2-klein-4b','@cf/black-forest-labs/flux-2-klein-9b','@cf/leonardo/lucid-origin','@cf/leonardo/phoenix-1.0'))
  )) then raise exception 'VALIDATION'; end if;
  update public.image_provider_settings set enabled=p_enabled,priority=p_priority,model_key=p_model_key,
    selection_mode=case when p_provider_key='policy' then p_selection_mode else null end,
    allow_paid_fallback=p_allow_paid_fallback,daily_request_limit=p_daily_request_limit,
    daily_spend_limit_usd=p_daily_spend_limit_usd,daily_neuron_limit=p_daily_neuron_limit,updated_at=now(),updated_by=v_actor where provider_key=p_provider_key;
  insert into public.admin_audit_log(actor_id,action,details)
  values(v_actor,'image_provider_setting_updated',jsonb_build_object('provider',p_provider_key,'reason',trim(p_reason),'enabled',p_enabled,'model',p_model_key,'mode',p_selection_mode,'paid_fallback',p_allow_paid_fallback));
end; $$;

create or replace function public.record_image_provider_event(
  p_request_id uuid,p_provider_key text,p_model_key text,p_outcome text,
  p_estimated_cost_usd numeric default 0,p_estimated_neurons numeric default 0,p_failure_reason text default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  insert into public.image_provider_events(request_id,provider_key,model_key,outcome,estimated_cost_usd,estimated_neurons,failure_reason)
  values(p_request_id,p_provider_key,p_model_key,p_outcome,p_estimated_cost_usd,p_estimated_neurons,left(p_failure_reason,200));
  insert into public.image_provider_daily_usage(provider_key,usage_date,request_count,success_count,failure_count,estimated_cost_usd,estimated_neurons)
  values(p_provider_key,(now() at time zone 'utc')::date,1,(p_outcome='success')::integer,(p_outcome<>'success')::integer,
    case when p_outcome='success' then coalesce(p_estimated_cost_usd,0) else 0 end,
    case when p_outcome='success' then coalesce(p_estimated_neurons,0) else 0 end)
  on conflict(provider_key,usage_date) do update set request_count=image_provider_daily_usage.request_count+1,
    success_count=image_provider_daily_usage.success_count+excluded.success_count,
    failure_count=image_provider_daily_usage.failure_count+excluded.failure_count,
    estimated_cost_usd=image_provider_daily_usage.estimated_cost_usd+excluded.estimated_cost_usd,
    estimated_neurons=image_provider_daily_usage.estimated_neurons+excluded.estimated_neurons,updated_at=now();
end; $$;

revoke all on function public.admin_get_image_provider_settings() from public,anon,authenticated;
revoke all on function public.admin_update_image_provider_setting(text,boolean,integer,text,text,boolean,integer,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.admin_get_image_provider_settings() to authenticated;
grant execute on function public.admin_update_image_provider_setting(text,boolean,integer,text,text,boolean,integer,numeric,numeric,text) to authenticated;
revoke all on function public.record_image_provider_event(uuid,text,text,text,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.record_image_provider_event(uuid,text,text,text,numeric,numeric,text) to service_role;

comment on table public.image_provider_settings is 'Owner-controlled server-authoritative image provider policy. API credentials remain Supabase secrets.';
comment on table public.image_generation_requests is 'Service-role-only idempotency claims preventing concurrent duplicate image generation.';
