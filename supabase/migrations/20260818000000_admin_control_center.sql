-- Secure staff roles, audited admin operations, complimentary credits, and
-- cost-capped staff AI testing. Seller and affiliate status remain separate.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'moderator', 'support', 'tester', 'user'));

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (length(btrim(action)) between 1 and 100),
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create table public.admin_ai_test_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  monthly_spend_limit_cents integer not null check (monthly_spend_limit_cents between 0 and 100000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.admin_ai_test_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  reservation_id uuid not null unique references public.entitlement_usage(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  estimated_cost_cents integer not null check (estimated_cost_cents >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (period_end > period_start)
);

create table public.promotional_credit_grants (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  story_units integer not null default 0 check (story_units between 0 and 1000),
  image_units integer not null default 0 check (image_units between 0 and 10000),
  remaining_story_units integer not null check (remaining_story_units between 0 and 1000),
  remaining_image_units integer not null check (remaining_image_units between 0 and 10000),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  expires_at timestamptz not null,
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  check (story_units > 0 or image_units > 0),
  check (remaining_story_units <= story_units and remaining_image_units <= image_units)
);

create table public.promotional_credit_reservations (
  reservation_id uuid primary key references public.entitlement_usage(id) on delete cascade,
  grant_id uuid not null references public.promotional_credit_grants(id) on delete restrict,
  bucket text not null check (bucket in ('story', 'image')),
  amount integer not null check (amount > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index admin_audit_created_idx on public.admin_audit_log(created_at desc);
create index admin_audit_target_idx on public.admin_audit_log(target_user_id, created_at desc);
create index admin_ai_test_usage_period_idx on public.admin_ai_test_usage(user_id, period_start, period_end, status);
create index promotional_credit_user_idx on public.promotional_credit_grants(user_id, expires_at) where revoked_at is null;

alter table public.admin_audit_log enable row level security;
alter table public.admin_ai_test_limits enable row level security;
alter table public.admin_ai_test_usage enable row level security;
alter table public.promotional_credit_grants enable row level security;
alter table public.promotional_credit_reservations enable row level security;
revoke all on public.admin_audit_log, public.admin_ai_test_limits, public.admin_ai_test_usage,
  public.promotional_credit_grants, public.promotional_credit_reservations from public, anon, authenticated;

alter table public.entitlement_usage drop constraint entitlement_usage_source_check;
alter table public.entitlement_usage add constraint entitlement_usage_source_check
  check (source in ('free', 'subscription', 'override', 'staff_test', 'promotion'));

insert into public.billing_plans
  (plan_key, display_name, monthly_price_display, monthly_price_cents, stripe_price_id,
   story_units_limit, image_units_limit, max_story_pages, sort_order, active)
values
  ('staff_test', 'Internal staff testing', '$0', 0, null, 2147483647, 2147483647, 30, -3, true),
  ('complimentary', 'Complimentary credits', '$0', 0, null, 2147483647, 2147483647, 30, -2, true)
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  monthly_price_display = excluded.monthly_price_display,
  monthly_price_cents = 0,
  stripe_price_id = null,
  story_units_limit = excluded.story_units_limit,
  image_units_limit = excluded.image_units_limit,
  max_story_pages = 30,
  sort_order = excluded.sort_order,
  active = true;

create or replace function public.get_public_billing_plans()
returns table(plan_key text, display_name text, monthly_price_display text, story_units_limit integer, image_units_limit integer, max_story_pages integer, sort_order integer)
language sql security definer set search_path = '' stable as $$
  select bp.plan_key, bp.display_name, bp.monthly_price_display, bp.story_units_limit,
         bp.image_units_limit, bp.max_story_pages, bp.sort_order
  from public.billing_plans bp
  where bp.active and bp.plan_key not in ('unpaid', 'staff_test', 'complimentary')
  order by bp.sort_order
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('owner', 'admin', 'moderator')
  )
$$;

create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role from public.profiles p where p.id = (select auth.uid())), 'user')
$$;

-- Extend the known legacy economics guard to Owner without duplicating the
-- existing reporting query. Fail closed if that guard ever changes upstream.
do $owner_economics$
declare v_definition text; v_updated text;
begin
  v_definition := pg_get_functiondef('public.get_admin_ai_economics_base(text)'::regprocedure);
  v_updated := replace(v_definition, 'p.role=''admin''', 'p.role in (''owner'',''admin'')');
  if v_updated = v_definition then raise exception 'ADMIN_ECONOMICS_GUARD_NOT_FOUND'; end if;
  execute v_updated;
end;
$owner_economics$;

revoke all on function public.current_staff_role() from public, anon, authenticated;
grant execute on function public.current_staff_role() to authenticated;

create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and new.role <> 'owner'
     and not exists (select 1 from public.profiles p where p.role = 'owner' and p.id <> old.id) then
    raise exception 'LAST_OWNER_REQUIRED';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_last_owner
before update of role on public.profiles
for each row execute function public.protect_last_owner();
revoke all on function public.protect_last_owner() from public, anon, authenticated;

create or replace function public.assign_initial_owner(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'TARGET_USER_NOT_FOUND';
  end if;
  if exists (select 1 from public.profiles p where p.role = 'owner') then
    raise exception 'OWNER_ALREADY_EXISTS';
  end if;
  update public.profiles set role = 'owner' where id = p_user_id;
  if not found then raise exception 'TARGET_PROFILE_NOT_FOUND'; end if;
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values (null, 'initial_owner_assigned', p_user_id, jsonb_build_object('method', 'sql_editor_bootstrap'));
end;
$$;
revoke all on function public.assign_initial_owner(uuid) from public, anon, authenticated;
grant execute on function public.assign_initial_owner(uuid) to service_role;

create or replace function public.admin_set_user_role(p_target_user_id uuid, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_actor_role text; v_old_role text;
begin
  select p.role into v_actor_role from public.profiles p where p.id = v_actor;
  select p.role into v_old_role from public.profiles p where p.id = p_target_user_id for update;
  if v_old_role is null then raise exception 'TARGET_USER_NOT_FOUND'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if p_role not in ('admin', 'moderator', 'support', 'tester', 'user') then raise exception 'ROLE_NOT_ASSIGNABLE'; end if;
  if v_actor_role = 'owner' then null;
  elsif v_actor_role = 'admin' and p_role in ('moderator', 'support', 'tester', 'user') and v_old_role not in ('owner', 'admin') then null;
  else raise exception 'ADMIN_REQUIRED';
  end if;
  update public.profiles set role = p_role where id = p_target_user_id;
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values (v_actor, 'user_role_changed', p_target_user_id,
    jsonb_build_object('from', v_old_role, 'to', p_role, 'reason', btrim(p_reason)));
end;
$$;

create or replace function public.admin_grant_complimentary_credits(
  p_target_user_id uuid, p_story_units integer, p_image_units integer,
  p_expires_at timestamptz, p_reason text, p_request_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_role text; v_id uuid;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_role not in ('owner', 'admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then raise exception 'TARGET_USER_NOT_FOUND'; end if;
  if coalesce(p_story_units, 0) < 0 or coalesce(p_image_units, 0) < 0
     or (coalesce(p_story_units, 0) = 0 and coalesce(p_image_units, 0) = 0)
     or p_story_units > 1000 or p_image_units > 10000 then raise exception 'CREDIT_AMOUNT_INVALID'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '1 year' then raise exception 'EXPIRY_INVALID'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  select g.id into v_id from public.promotional_credit_grants g
  where g.request_id = p_request_id and g.granted_by = v_actor;
  if v_id is not null then return v_id; end if;
  insert into public.promotional_credit_grants(request_id, user_id, story_units, image_units,
    remaining_story_units, remaining_image_units, reason, expires_at, granted_by)
  values (p_request_id, p_target_user_id, p_story_units, p_image_units, p_story_units, p_image_units,
    btrim(p_reason), p_expires_at, v_actor)
  on conflict (request_id) do nothing returning id into v_id;
  if v_id is null then
    select g.id into v_id from public.promotional_credit_grants g
    where g.request_id = p_request_id and g.granted_by = v_actor;
    if v_id is null then raise exception 'REQUEST_ID_REUSED'; end if;
    return v_id;
  end if;
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values (v_actor, 'complimentary_credits_granted', p_target_user_id,
    jsonb_build_object('grant_id', v_id, 'story_units', p_story_units, 'image_units', p_image_units,
      'expires_at', p_expires_at, 'reason', btrim(p_reason)));
  return v_id;
end;
$$;

create or replace function public.admin_revoke_complimentary_credits(p_grant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_role text; v_target uuid;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_role not in ('owner', 'admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  update public.promotional_credit_grants
  set revoked_at = now(), revoked_by = v_actor, revoke_reason = btrim(p_reason),
      remaining_story_units = 0, remaining_image_units = 0
  where id = p_grant_id and revoked_at is null returning user_id into v_target;
  if v_target is null then raise exception 'GRANT_NOT_FOUND'; end if;
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values (v_actor, 'complimentary_credits_revoked', v_target,
    jsonb_build_object('grant_id', p_grant_id, 'reason', btrim(p_reason)));
end;
$$;

create or replace function public.admin_set_ai_test_limit(
  p_target_user_id uuid, p_enabled boolean, p_monthly_spend_limit_cents integer, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_role text; v_target_role text;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;
  select p.role into v_target_role from public.profiles p where p.id = p_target_user_id;
  if v_role not in ('owner', 'admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if v_target_role not in ('owner', 'admin', 'tester') then raise exception 'TEST_ROLE_REQUIRED'; end if;
  if v_role = 'admin' and v_target_role in ('owner', 'admin') then raise exception 'OWNER_REQUIRED'; end if;
  if p_monthly_spend_limit_cents < 0 or p_monthly_spend_limit_cents > 100000 then raise exception 'LIMIT_INVALID'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  insert into public.admin_ai_test_limits(user_id, enabled, monthly_spend_limit_cents, updated_by)
  values (p_target_user_id, p_enabled, p_monthly_spend_limit_cents, v_actor)
  on conflict (user_id) do update set enabled = excluded.enabled,
    monthly_spend_limit_cents = excluded.monthly_spend_limit_cents,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.admin_audit_log(actor_id, action, target_user_id, details)
  values (v_actor, 'ai_test_limit_changed', p_target_user_id,
    jsonb_build_object('enabled', p_enabled, 'monthly_spend_limit_cents', p_monthly_spend_limit_cents,
      'reason', btrim(p_reason)));
end;
$$;

create or replace function public.get_admin_control_center(p_search text default '')
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare v_actor uuid := auth.uid(); v_role text; v_search text := left(btrim(coalesce(p_search, '')), 120);
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_role not in ('owner', 'admin') then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'actor_role', v_role,
    'overview', jsonb_build_object(
      'total_users', (select count(*) from auth.users),
      'active_subscriptions', (select count(*) from public.subscriptions where status in ('active', 'trialing') and current_period_end > now()),
      'ai_generations_30d', (select count(*) from public.ai_usage where created_at >= now() - interval '30 days'),
      'ai_failures_30d', (select count(*) from public.ai_usage where created_at >= now() - interval '30 days' and not success),
      'estimated_ai_cost_30d', (select sum(estimated_cost_usd) from public.ai_usage_cost_estimates where created_at >= now() - interval '30 days'),
      'estimated_monthly_revenue_cents', (select coalesce(sum(bp.monthly_price_cents), 0) from public.subscriptions s join public.billing_plans bp on bp.plan_key = s.plan_key where s.status in ('active', 'trialing') and s.current_period_end > now())
    ),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'created_at', u.created_at, 'role', p.role,
        'subscription_status', s.status, 'plan_key', s.plan_key,
        'promo_story_units', coalesce(g.story_units, 0), 'promo_image_units', coalesce(g.image_units, 0),
        'test_enabled', coalesce(l.enabled, p.role in ('owner', 'admin', 'tester')),
        'test_limit_cents', coalesce(l.monthly_spend_limit_cents, case when p.role = 'tester' then 300 when p.role in ('owner', 'admin') then 1000 else 0 end)
      ) order by u.created_at desc)
      from (
        select * from auth.users au
        where v_search = '' or position(lower(v_search) in lower(coalesce(au.email, ''))) > 0
        order by au.created_at desc limit 100
      ) u join public.profiles p on p.id = u.id
      left join lateral (select status, plan_key from public.subscriptions x where x.user_id = u.id order by updated_at desc limit 1) s on true
      left join lateral (select sum(remaining_story_units) story_units, sum(remaining_image_units) image_units from public.promotional_credit_grants x where x.user_id = u.id and x.revoked_at is null and x.expires_at > now()) g on true
      left join public.admin_ai_test_limits l on l.user_id = u.id
    ), '[]'::jsonb),
    'credit_grants', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from (
      select cg.id, cg.user_id, u.email, cg.remaining_story_units, cg.remaining_image_units,
        cg.reason, cg.expires_at, cg.created_at
      from public.promotional_credit_grants cg
      join auth.users u on u.id = cg.user_id
      where cg.revoked_at is null and cg.expires_at > now()
      order by cg.created_at desc limit 100
    ) g), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id, actor_id, action, target_user_id, details, created_at from public.admin_audit_log order by created_at desc limit 50) a), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text, text),
  public.admin_grant_complimentary_credits(uuid, integer, integer, timestamptz, text, uuid),
  public.admin_revoke_complimentary_credits(uuid, text),
  public.admin_set_ai_test_limit(uuid, boolean, integer, text),
  public.get_admin_control_center(text) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, text, text),
  public.admin_grant_complimentary_credits(uuid, integer, integer, timestamptz, text, uuid),
  public.admin_revoke_complimentary_credits(uuid, text),
  public.admin_set_ai_test_limit(uuid, boolean, integer, text),
  public.get_admin_control_center(text) to authenticated;

alter function public.reserve_ai_entitlement(uuid, uuid, text, uuid, integer, integer)
  rename to reserve_ai_entitlement_customer;

create or replace function public.reserve_ai_entitlement(
  p_user_id uuid, p_request_id uuid, p_operation text, p_story_id uuid default null,
  p_requested_page_count integer default null, p_requested_image_count integer default null
)
returns table(reservation_id uuid, plan_key text, bucket text, amount integer, remaining integer, period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_role text; v_enabled boolean; v_limit integer; v_estimate integer; v_used bigint;
  v_start timestamptz := date_trunc('month', now()); v_end timestamptz;
  v_bucket text; v_amount integer; v_reservation uuid; v_grant public.promotional_credit_grants%rowtype;
begin
  if p_user_id is null or p_request_id is null then raise exception 'ENTITLEMENT_INVALID'; end if;
  v_end := v_start + interval '1 month';
  select p.role into v_role from public.profiles p where p.id = p_user_id;
  if v_role in ('owner', 'admin', 'tester') then
    select coalesce(l.enabled, true), coalesce(l.monthly_spend_limit_cents,
      case when v_role = 'tester' then 300 else 1000 end)
      into v_enabled, v_limit from public.admin_ai_test_limits l where l.user_id = p_user_id;
    if not found then v_enabled := true; v_limit := case when v_role = 'tester' then 300 else 1000 end; end if;
    if v_enabled then
      if p_operation = 'generate-story' then
        v_bucket := 'story'; v_amount := public.story_unit_cost(p_requested_page_count);
        v_estimate := greatest(coalesce(p_requested_page_count, 0), 6) * 3;
      elsif p_operation = 'continue-story' then
        v_bucket := 'story'; v_amount := public.continuation_story_unit_cost(p_requested_page_count);
        if p_story_id is null or not exists(select 1 from public.stories s where s.id = p_story_id and s.user_id = p_user_id and s.page_count + p_requested_page_count <= 30) then raise exception 'ENTITLEMENT_LIMIT'; end if;
        v_estimate := greatest(coalesce(p_requested_page_count, 0), 3) * 3;
      elsif p_operation in ('generate-character-image', 'generate-page-image', 'generate-page-image-initial', 'generate-page-image-repaint', 'generate-cover') then
        v_bucket := 'image'; v_amount := greatest(coalesce(p_requested_image_count, 1), 1); v_estimate := v_amount * 25;
      elsif p_operation in ('analyze-character', 'suggest-continuation', 'translate-story') then
        v_bucket := 'lightweight'; v_amount := 0; v_estimate := 5;
      else raise exception 'ENTITLEMENT_OPERATION'; end if;
      if v_amount is null or coalesce(p_requested_page_count, 0) > 30 then raise exception 'ENTITLEMENT_LIMIT'; end if;
      perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
      select coalesce(sum(estimated_cost_cents), 0) into v_used from public.admin_ai_test_usage
      where user_id = p_user_id and period_start = v_start and period_end = v_end and status in ('reserved', 'consumed');
      if v_used + v_estimate > v_limit then raise exception 'ENTITLEMENT_LIMIT'; end if;
      insert into public.entitlement_usage(request_id, user_id, operation, bucket, amount, story_id,
        requested_page_count, requested_image_count, billing_period_start, billing_period_end, plan_key, source)
      values (p_request_id, p_user_id, p_operation, v_bucket, v_amount, p_story_id,
        p_requested_page_count, p_requested_image_count, v_start, v_end, 'staff_test', 'staff_test')
      returning id into v_reservation;
      insert into public.admin_ai_test_usage(request_id, reservation_id, user_id, operation,
        estimated_cost_cents, period_start, period_end)
      values (p_request_id, v_reservation, p_user_id, p_operation, v_estimate, v_start, v_end);
      return query select v_reservation, 'staff_test'::text, v_bucket, v_amount,
        (v_limit - v_used - v_estimate)::integer, v_start, v_end;
      return;
    end if;
  end if;

  begin
    return query select * from public.reserve_ai_entitlement_customer(p_user_id, p_request_id,
      p_operation, p_story_id, p_requested_page_count, p_requested_image_count);
    return;
  exception when raise_exception then
    if sqlerrm <> 'ENTITLEMENT_LIMIT' then raise; end if;
  end;

  if p_operation = 'generate-story' then v_bucket := 'story'; v_amount := public.story_unit_cost(p_requested_page_count);
  elsif p_operation = 'continue-story' then v_bucket := 'story'; v_amount := public.continuation_story_unit_cost(p_requested_page_count);
  elsif p_operation in ('generate-character-image', 'generate-page-image', 'generate-page-image-initial', 'generate-page-image-repaint', 'generate-cover') then v_bucket := 'image'; v_amount := greatest(coalesce(p_requested_image_count, 1), 1);
  else raise exception 'ENTITLEMENT_LIMIT'; end if;
  if v_amount is null then raise exception 'ENTITLEMENT_LIMIT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_grant from public.promotional_credit_grants g
  where g.user_id = p_user_id and g.revoked_at is null and g.expires_at > now()
    and case when v_bucket = 'story' then g.remaining_story_units >= v_amount else g.remaining_image_units >= v_amount end
  order by g.expires_at, g.created_at for update skip locked limit 1;
  if v_grant.id is null then raise exception 'ENTITLEMENT_LIMIT'; end if;
  update public.promotional_credit_grants set
    remaining_story_units = remaining_story_units - case when v_bucket = 'story' then v_amount else 0 end,
    remaining_image_units = remaining_image_units - case when v_bucket = 'image' then v_amount else 0 end
  where id = v_grant.id;
  insert into public.entitlement_usage(request_id, user_id, operation, bucket, amount, story_id,
    requested_page_count, requested_image_count, billing_period_start, billing_period_end, plan_key, source)
  values (p_request_id, p_user_id, p_operation, v_bucket, v_amount, p_story_id,
    p_requested_page_count, p_requested_image_count, v_start, v_end, 'complimentary', 'promotion')
  returning id into v_reservation;
  insert into public.promotional_credit_reservations(reservation_id, grant_id, bucket, amount)
  values (v_reservation, v_grant.id, v_bucket, v_amount);
  return query select v_reservation, 'complimentary'::text, v_bucket, v_amount,
    case when v_bucket = 'story' then v_grant.remaining_story_units - v_amount else v_grant.remaining_image_units - v_amount end,
    v_start, v_end;
end;
$$;

create or replace function public.finalize_ai_entitlement(p_reservation_id uuid, p_provider_request_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.entitlement_usage set status = 'consumed', provider_request_id = p_provider_request_id, finalized_at = now()
  where id = p_reservation_id and status = 'reserved';
  update public.admin_ai_test_usage set status = 'consumed', finalized_at = now()
  where reservation_id = p_reservation_id and status = 'reserved';
  update public.promotional_credit_reservations set status = 'consumed', finalized_at = now()
  where reservation_id = p_reservation_id and status = 'reserved';
end;
$$;

create or replace function public.release_ai_entitlement(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_promo public.promotional_credit_reservations%rowtype;
begin
  update public.entitlement_usage set status = 'released', finalized_at = now()
  where id = p_reservation_id and status = 'reserved';
  update public.admin_ai_test_usage set status = 'released', finalized_at = now()
  where reservation_id = p_reservation_id and status = 'reserved';
  select * into v_promo from public.promotional_credit_reservations
  where reservation_id = p_reservation_id and status = 'reserved' for update;
  if found then
    update public.promotional_credit_grants set
      remaining_story_units = remaining_story_units + case when v_promo.bucket = 'story' then v_promo.amount else 0 end,
      remaining_image_units = remaining_image_units + case when v_promo.bucket = 'image' then v_promo.amount else 0 end
    where id = v_promo.grant_id and revoked_at is null;
    update public.promotional_credit_reservations set status = 'released', finalized_at = now()
    where reservation_id = p_reservation_id;
  end if;
end;
$$;

revoke all on function public.reserve_ai_entitlement_customer(uuid, uuid, text, uuid, integer, integer),
  public.reserve_ai_entitlement(uuid, uuid, text, uuid, integer, integer),
  public.finalize_ai_entitlement(uuid, text), public.release_ai_entitlement(uuid)
  from public, anon, authenticated;

comment on table public.admin_audit_log is 'Immutable server-written record of privileged administrative actions.';
comment on table public.admin_ai_test_usage is 'Concurrency-safe estimated cost reservations for staff AI testing; provider usage remains recorded in ai_usage.';
comment on function public.assign_initial_owner(uuid) is 'One-time SQL Editor/service-role bootstrap. Never callable by authenticated browser users.';
