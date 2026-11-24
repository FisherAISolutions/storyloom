-- Monthly-first credit allocation, permanent purchased balances, durable lightweight deductions,
-- and idempotent reservation reconciliation.

alter table public.image_generation_requests drop constraint image_generation_requests_status_check;
alter table public.image_generation_requests add constraint image_generation_requests_status_check
 check(status in ('processing','provider_completed','completed','failed'));

create or replace function public.reserve_ai_entitlement_customer(
 p_user_id uuid,p_request_id uuid,p_operation text,p_story_id uuid default null,
 p_requested_page_count integer default null,p_requested_image_count integer default null)
returns table(reservation_id uuid,plan_key text,bucket text,amount integer,remaining integer,period_start timestamptz,period_end timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_plan public.billing_plans%rowtype;v_selected record;v_start timestamptz:=date_trunc('month',now());v_end timestamptz:=v_start+interval '1 month';
 v_bucket text;v_amount integer;v_monthly_limit integer:=0;v_monthly_used integer:=0;v_monthly integer:=0;v_purchased integer:=0;
 v_max_pages integer:=6;v_reservation uuid;v_need integer;v_grant public.purchased_credit_grants;v_take integer;v_pack_remaining integer;
begin
 if p_user_id is null or p_request_id is null then raise exception 'ENTITLEMENT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if exists(select 1 from public.purchased_credit_grants where user_id=p_user_id and status<>'active' and (unrecovered_story_units>0 or unrecovered_image_units>0)) then raise exception 'CREDIT_BALANCE_REVIEW';end if;
 select eo.plan_key,eo.period_start,eo.period_end into v_selected from public.entitlement_overrides eo join public.billing_plans bp on bp.plan_key=eo.plan_key and bp.active where eo.user_id=p_user_id and now()>=eo.period_start and now()<eo.period_end;
 if not found then select s.plan_key,s.current_period_start,s.current_period_end into v_selected from public.subscriptions s join public.billing_plans bp on bp.plan_key=s.plan_key and bp.active where s.user_id=p_user_id and s.status in ('active','trialing') and s.current_period_start<=now() and s.current_period_end>now() order by s.current_period_end desc limit 1;end if;
 if found then select * into v_plan from public.billing_plans where billing_plans.plan_key=v_selected.plan_key;v_start:=v_selected.period_start;v_end:=v_selected.period_end;v_max_pages:=v_plan.max_story_pages;
 else select * into v_plan from public.billing_plans where billing_plans.plan_key='free';select coalesce(max(cp.max_story_pages),6) into v_max_pages from public.purchased_credit_grants pcg join public.credit_products cp on cp.product_key=pcg.product_key where pcg.user_id=p_user_id and pcg.status='active' and (pcg.remaining_story_units>0 or pcg.remaining_image_units>0);end if;
 if p_operation='generate-story' then v_bucket:='story';v_amount:=public.story_unit_cost(p_requested_page_count);
 elsif p_operation='continue-story' then v_bucket:='story';v_amount:=public.continuation_story_unit_cost(p_requested_page_count);if p_story_id is null or not exists(select 1 from public.stories where id=p_story_id and user_id=p_user_id and page_count+p_requested_page_count<=v_max_pages) then raise exception 'ENTITLEMENT_LIMIT';end if;
 elsif p_operation in ('generate-character-image','generate-page-image','generate-page-image-initial','generate-page-image-repaint','generate-cover','analyze-character') then v_bucket:='image';v_amount:=greatest(coalesce(p_requested_image_count,1),1);
 elsif p_operation in ('suggest-continuation','translate-story') then v_bucket:='story';v_amount:=1;
 else raise exception 'ENTITLEMENT_OPERATION';end if;
 if v_amount is null or coalesce(p_requested_page_count,0)>v_max_pages then raise exception 'ENTITLEMENT_LIMIT';end if;
 v_monthly_limit:=case v_bucket when 'story' then v_plan.story_units_limit else v_plan.image_units_limit end;
 select coalesce(sum(case when monthly_amount>0 then monthly_amount when source in ('subscription','override','free') then amount else 0 end),0) into v_monthly_used from public.entitlement_usage where user_id=p_user_id and bucket=v_bucket and billing_period_start=v_start and billing_period_end=v_end and status in ('reserved','consumed');
 v_monthly:=least(v_amount,greatest(v_monthly_limit-v_monthly_used,0));v_need:=v_amount-v_monthly;v_purchased:=v_need;
 insert into public.entitlement_usage(request_id,user_id,operation,bucket,amount,monthly_amount,purchased_amount,story_id,requested_page_count,requested_image_count,billing_period_start,billing_period_end,plan_key,source)
 values(p_request_id,p_user_id,p_operation,v_bucket,v_amount,v_monthly,v_purchased,p_story_id,p_requested_page_count,p_requested_image_count,v_start,v_end,case when v_selected.plan_key is null then 'free' else v_selected.plan_key end,case when v_purchased=0 then case when v_selected.plan_key is null then 'free' else 'subscription' end when v_monthly=0 then 'purchased' else 'mixed' end) returning id into v_reservation;
 for v_grant in select * from public.purchased_credit_grants where user_id=p_user_id and status='active' and case when v_bucket='story' then remaining_story_units>0 else remaining_image_units>0 end order by purchased_at,id for update loop
  exit when v_need=0;v_take:=least(v_need,case when v_bucket='story' then v_grant.remaining_story_units else v_grant.remaining_image_units end);
  update public.purchased_credit_grants set remaining_story_units=remaining_story_units-case when v_bucket='story' then v_take else 0 end,remaining_image_units=remaining_image_units-case when v_bucket='image' then v_take else 0 end where id=v_grant.id;
  insert into public.purchased_credit_reservations(reservation_id,grant_id,bucket,amount) values(v_reservation,v_grant.id,v_bucket,v_take);v_need:=v_need-v_take;
 end loop;
 if v_need>0 then raise exception 'ENTITLEMENT_LIMIT';end if;
 select coalesce(sum(case when v_bucket='story' then remaining_story_units else remaining_image_units end),0) into v_pack_remaining from public.purchased_credit_grants where user_id=p_user_id and status='active';
 return query select v_reservation,case when v_purchased>0 then 'purchased' else v_plan.plan_key end,v_bucket,v_amount,greatest(v_monthly_limit-v_monthly_used-v_monthly,0)+v_pack_remaining,v_start,v_end;
exception when unique_violation then raise exception 'ENTITLEMENT_DUPLICATE';end;$$;

create or replace function public.finalize_ai_entitlement(p_reservation_id uuid,p_provider_request_id text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_changed integer;
begin update public.entitlement_usage set status='consumed',provider_request_id=p_provider_request_id,finalized_at=now() where id=p_reservation_id and status='reserved';get diagnostics v_changed=row_count;
 if v_changed=0 and not exists(select 1 from public.entitlement_usage where id=p_reservation_id and status='consumed') then raise exception 'RESERVATION_NOT_FINALIZABLE';end if;
 update public.admin_ai_test_usage set status='consumed',finalized_at=now() where reservation_id=p_reservation_id and status='reserved';
 update public.promotional_credit_reservations set status='consumed',finalized_at=now() where reservation_id=p_reservation_id and status='reserved';
 update public.purchased_credit_reservations set status='consumed',finalized_at=now() where reservation_id=p_reservation_id and status='reserved';end;$$;

create or replace function public.release_ai_entitlement(p_reservation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_promo public.promotional_credit_reservations%rowtype;v_credit record;
begin update public.entitlement_usage set status='released',finalized_at=now() where id=p_reservation_id and status='reserved';
 update public.admin_ai_test_usage set status='released',finalized_at=now() where reservation_id=p_reservation_id and status='reserved';
 select * into v_promo from public.promotional_credit_reservations where reservation_id=p_reservation_id and status='reserved' for update;
 if found then update public.promotional_credit_grants set remaining_story_units=remaining_story_units+case when v_promo.bucket='story' then v_promo.amount else 0 end,remaining_image_units=remaining_image_units+case when v_promo.bucket='image' then v_promo.amount else 0 end where id=v_promo.grant_id and revoked_at is null;update public.promotional_credit_reservations set status='released',finalized_at=now() where reservation_id=p_reservation_id;end if;
 for v_credit in select * from public.purchased_credit_reservations where reservation_id=p_reservation_id and status='reserved' for update loop
  update public.purchased_credit_grants set remaining_story_units=remaining_story_units+case when v_credit.bucket='story' then v_credit.amount else 0 end,remaining_image_units=remaining_image_units+case when v_credit.bucket='image' then v_credit.amount else 0 end where id=v_credit.grant_id and status='active';
  update public.purchased_credit_reservations set status='released',finalized_at=now() where reservation_id=p_reservation_id and grant_id=v_credit.grant_id and bucket=v_credit.bucket;
 end loop;end;$$;

create or replace function public.get_billing_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_plan public.billing_plans%rowtype;v_selected record;v_start timestamptz:=date_trunc('month',now());v_end timestamptz:=v_start+interval '1 month';v_story bigint:=0;v_image bigint:=0;v_ps bigint:=0;v_pi bigint:=0;v_pack_max integer:=6;v_status text:='free';v_cancel boolean:=false;v_manage boolean:=false;v_starter boolean:=false;
begin if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 select s.plan_key,s.current_period_start,s.current_period_end,s.status,s.cancel_at_period_end into v_selected from public.subscriptions s join public.billing_plans bp on bp.plan_key=s.plan_key where s.user_id=v_user and s.status in ('active','trialing') and s.current_period_end>now() order by s.current_period_end desc limit 1;
 if found then select * into v_plan from public.billing_plans where plan_key=v_selected.plan_key;v_start:=v_selected.current_period_start;v_end:=v_selected.current_period_end;v_status:=v_selected.status;v_cancel:=v_selected.cancel_at_period_end;else select * into v_plan from public.billing_plans where plan_key='free';end if;
 select exists(select 1 from public.stripe_customers where user_id=v_user),exists(select 1 from public.purchased_credit_grants where user_id=v_user and product_key='starter') into v_manage,v_starter;
 select coalesce(sum(case when monthly_amount>0 then monthly_amount when source in ('subscription','override','free') then amount else 0 end) filter(where bucket='story' and status in ('reserved','consumed')),0),coalesce(sum(case when monthly_amount>0 then monthly_amount when source in ('subscription','override','free') then amount else 0 end) filter(where bucket='image' and status in ('reserved','consumed')),0) into v_story,v_image from public.entitlement_usage where user_id=v_user and billing_period_start=v_start and billing_period_end=v_end;
 select coalesce(sum(pcg.remaining_story_units),0),coalesce(sum(pcg.remaining_image_units),0),coalesce(max(cp.max_story_pages),6) into v_ps,v_pi,v_pack_max from public.purchased_credit_grants pcg join public.credit_products cp on cp.product_key=pcg.product_key where pcg.user_id=v_user and pcg.status='active';
 return jsonb_build_object('plan_key',v_plan.plan_key,'display_name',v_plan.display_name,'status',v_status,'cancel_at_period_end',v_cancel,'can_manage_billing',v_manage,'period_start',v_start,'period_end',v_end,'story_units_limit',v_plan.story_units_limit,'story_units_used',v_story,'story_units_remaining',greatest(v_plan.story_units_limit-v_story,0),'image_units_limit',v_plan.image_units_limit,'image_units_used',v_image,'image_units_remaining',greatest(v_plan.image_units_limit-v_image,0),'purchased_story_units',v_ps,'purchased_image_units',v_pi,'starter_purchased',v_starter,'max_story_pages',greatest(v_plan.max_story_pages,v_pack_max),'can_buy_credit_packs',v_plan.can_buy_credit_packs,'can_personalize',v_plan.can_personalize,'can_publish_free',v_plan.can_publish_free,'can_sell_paid',v_plan.can_sell_paid);
end;$$;

revoke all on function public.reserve_ai_entitlement_customer(uuid,uuid,text,uuid,integer,integer),public.finalize_ai_entitlement(uuid,text),public.release_ai_entitlement(uuid),public.get_billing_summary() from public,anon,authenticated;
grant execute on function public.get_billing_summary() to authenticated;

create or replace function public.reconcile_provider_completed_generation(p_request_id uuid,p_consume boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_usage uuid;v_status text;
begin
 if auth.role()<>'service_role' and not public.is_admin() then raise exception 'ADMIN_REQUIRED';end if;
 select eu.id,igr.status into v_usage,v_status from public.entitlement_usage eu join public.image_generation_requests igr on igr.request_id=eu.request_id where eu.request_id=p_request_id for update;
 if not found or v_status<>'provider_completed' then raise exception 'RECONCILIATION_NOT_REQUIRED';end if;
 if p_consume then perform public.finalize_ai_entitlement(v_usage,null);else perform public.release_ai_entitlement(v_usage);end if;
 update public.image_generation_requests set status='failed',updated_at=now() where request_id=p_request_id;
end;$$;
revoke all on function public.reconcile_provider_completed_generation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_provider_completed_generation(uuid,boolean) to authenticated,service_role;
comment on function public.reconcile_provider_completed_generation(uuid,boolean) is 'Owner/service-only reconciliation for provider-completed requests whose durable media persistence failed.';
