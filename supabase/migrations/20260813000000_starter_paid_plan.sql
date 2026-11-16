-- Convert the public low tier to paid Starter while retaining `free` as its stable key.
-- `unpaid` is an internal, zero-generation fallback and is excluded from public plans.
insert into public.billing_plans
  (plan_key, display_name, monthly_price_display, monthly_price_cents, stripe_price_id, story_units_limit, image_units_limit, max_story_pages, sort_order, active)
values ('unpaid', 'No active plan', '$0', 0, null, 0, 0, 6, -1, true)
on conflict (plan_key) do update set
  display_name=excluded.display_name, monthly_price_display=excluded.monthly_price_display,
  monthly_price_cents=excluded.monthly_price_cents, stripe_price_id=null,
  story_units_limit=0, image_units_limit=0, max_story_pages=6, sort_order=-1, active=true;

update public.billing_plans
set display_name='MyStorybook AI Starter', monthly_price_display='$1', monthly_price_cents=100,
    stripe_price_id=null
where plan_key='free';

create or replace function public.reserve_ai_entitlement(
  p_user_id uuid, p_request_id uuid, p_operation text, p_story_id uuid default null,
  p_requested_page_count integer default null, p_requested_image_count integer default null
)
returns table(reservation_id uuid, plan_key text, bucket text, amount integer, remaining integer, period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.billing_plans%rowtype; v_selected record; v_source text := 'free';
  v_start timestamptz; v_end timestamptz; v_bucket text; v_amount integer;
  v_limit integer; v_used bigint; v_reservation uuid;
begin
  if p_user_id is null or p_request_id is null then raise exception 'ENTITLEMENT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select eo.plan_key,eo.period_start,eo.period_end into v_selected from public.entitlement_overrides eo
    join public.billing_plans bp on bp.plan_key=eo.plan_key and bp.active
    where eo.user_id=p_user_id and now()>=eo.period_start and now()<eo.period_end;
  if found then
    select * into v_plan from public.billing_plans where billing_plans.plan_key=v_selected.plan_key;
    v_start:=v_selected.period_start; v_end:=v_selected.period_end; v_source:='override';
  else
    select s.plan_key,s.current_period_start,s.current_period_end into v_selected from public.subscriptions s
      join public.billing_plans bp on bp.plan_key=s.plan_key and bp.active
      where s.user_id=p_user_id and s.status in ('active','trialing')
      and s.current_period_start<=now() and s.current_period_end>now()
      order by s.current_period_end desc limit 1;
    if found then
      select * into v_plan from public.billing_plans where billing_plans.plan_key=v_selected.plan_key;
      v_start:=v_selected.current_period_start; v_end:=v_selected.current_period_end; v_source:='subscription';
    else
      select * into v_plan from public.billing_plans where billing_plans.plan_key='unpaid' and active;
      v_start:=date_trunc('month',now()); v_end:=v_start+interval '1 month';
    end if;
  end if;
  if v_plan.plan_key is null then raise exception 'ENTITLEMENT_CONFIG'; end if;
  if p_operation='generate-story' then v_bucket:='story'; v_amount:=public.story_unit_cost(p_requested_page_count);
    if v_amount is null or p_requested_page_count>v_plan.max_story_pages then raise exception 'ENTITLEMENT_LIMIT'; end if;
  elsif p_operation='continue-story' then v_bucket:='story'; v_amount:=public.continuation_story_unit_cost(p_requested_page_count);
    if v_amount is null or p_story_id is null or not exists(select 1 from public.stories s where s.id=p_story_id and s.user_id=p_user_id and s.page_count+p_requested_page_count<=v_plan.max_story_pages) then raise exception 'ENTITLEMENT_LIMIT'; end if;
  elsif p_operation in ('generate-character-image','generate-page-image','generate-page-image-initial','generate-page-image-repaint','generate-cover') then
    v_bucket:='image'; v_amount:=greatest(coalesce(p_requested_image_count,1),1);
    if p_operation like 'generate-page-image%' and (p_requested_page_count is null or p_requested_page_count>v_plan.max_story_pages) then raise exception 'ENTITLEMENT_LIMIT'; end if;
  elsif p_operation in ('analyze-character','suggest-continuation','translate-story') then v_bucket:='lightweight'; v_amount:=0;
  else raise exception 'ENTITLEMENT_OPERATION'; end if;
  v_limit:=case v_bucket when 'story' then v_plan.story_units_limit when 'image' then v_plan.image_units_limit else 2147483647 end;
  select coalesce(sum(eu.amount),0) into v_used from public.entitlement_usage eu where eu.user_id=p_user_id and eu.bucket=v_bucket and eu.billing_period_start=v_start and eu.billing_period_end=v_end and eu.status in ('reserved','consumed');
  if v_used+v_amount>v_limit then raise exception 'ENTITLEMENT_LIMIT'; end if;
  insert into public.entitlement_usage(request_id,user_id,operation,bucket,amount,story_id,requested_page_count,requested_image_count,billing_period_start,billing_period_end,plan_key,source)
    values(p_request_id,p_user_id,p_operation,v_bucket,v_amount,p_story_id,p_requested_page_count,p_requested_image_count,v_start,v_end,v_plan.plan_key,v_source)
    on conflict(request_id) do nothing returning id into v_reservation;
  if v_reservation is null then raise exception 'ENTITLEMENT_DUPLICATE'; end if;
  return query select v_reservation,v_plan.plan_key,v_bucket,v_amount,(v_limit-v_used-v_amount)::integer,v_start,v_end;
end; $$;

create or replace function public.get_billing_summary()
returns jsonb language plpgsql security definer set search_path='' stable as $$
declare v_user uuid:=auth.uid(); v_plan public.billing_plans%rowtype; v_selected record; v_start timestamptz; v_end timestamptz; v_status text:='unsubscribed'; v_cancel boolean:=false; v_story bigint; v_image bigint; v_manage boolean:=false;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select eo.plan_key,eo.period_start current_period_start,eo.period_end current_period_end,'override'::text status,false cancel_at_period_end into v_selected from public.entitlement_overrides eo where eo.user_id=v_user and now()>=eo.period_start and now()<eo.period_end;
  if not found then select s.plan_key,s.current_period_start,s.current_period_end,s.status,s.cancel_at_period_end into v_selected from public.subscriptions s join public.billing_plans bp on bp.plan_key=s.plan_key where s.user_id=v_user and s.status in ('active','trialing') and s.current_period_end>now() order by s.current_period_end desc limit 1; end if;
  if found then select * into v_plan from public.billing_plans where plan_key=v_selected.plan_key; v_start:=v_selected.current_period_start; v_end:=v_selected.current_period_end; v_status:=v_selected.status; v_cancel:=v_selected.cancel_at_period_end;
  else select * into v_plan from public.billing_plans bp where bp.plan_key='unpaid'; v_start:=date_trunc('month',now()); v_end:=v_start+interval '1 month'; select s.status,s.cancel_at_period_end into v_status,v_cancel from public.subscriptions s where s.user_id=v_user order by s.updated_at desc limit 1; if not found then v_status:='unsubscribed'; v_cancel:=false; end if; end if;
  select exists(select 1 from public.stripe_customers sc where sc.user_id=v_user) into v_manage;
  select coalesce(sum(amount) filter(where bucket='story' and status in ('reserved','consumed')),0),coalesce(sum(amount) filter(where bucket='image' and status in ('reserved','consumed')),0) into v_story,v_image from public.entitlement_usage where user_id=v_user and billing_period_start=v_start and billing_period_end=v_end;
  return jsonb_build_object('plan_key',v_plan.plan_key,'display_name',v_plan.display_name,'monthly_price_display',v_plan.monthly_price_display,'status',v_status,'cancel_at_period_end',v_cancel,'can_manage_billing',v_manage,'period_start',v_start,'period_end',v_end,'story_units_limit',v_plan.story_units_limit,'story_units_used',v_story,'story_units_remaining',greatest(v_plan.story_units_limit-v_story,0),'image_units_limit',v_plan.image_units_limit,'image_units_used',v_image,'image_units_remaining',greatest(v_plan.image_units_limit-v_image,0),'max_story_pages',v_plan.max_story_pages);
end; $$;

create or replace function public.get_public_billing_plans()
returns table(plan_key text,display_name text,monthly_price_display text,story_units_limit integer,image_units_limit integer,max_story_pages integer,sort_order integer)
language sql security definer set search_path='' stable as $$
  select bp.plan_key,bp.display_name,bp.monthly_price_display,bp.story_units_limit,bp.image_units_limit,bp.max_story_pages,bp.sort_order from public.billing_plans bp where bp.active and bp.plan_key<>'unpaid' order by bp.sort_order
$$;

comment on column public.billing_plans.stripe_price_id is 'Server-side Stripe Price mapping. Starter remains unavailable for Checkout until its test/live $1 recurring Price ID is configured.';
