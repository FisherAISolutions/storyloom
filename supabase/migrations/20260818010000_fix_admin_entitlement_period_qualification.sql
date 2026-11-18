-- Forward-only correction for PL/pgSQL output-column ambiguity in the staff
-- testing allowance query introduced by 20260818000000.

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
      select coalesce(sum(t.estimated_cost_cents), 0) into v_used
      from public.admin_ai_test_usage t
      where t.user_id = p_user_id
        and t.period_start = v_start
        and t.period_end = v_end
        and t.status in ('reserved', 'consumed');
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

revoke all on function public.reserve_ai_entitlement(uuid, uuid, text, uuid, integer, integer)
  from public, anon, authenticated;
