-- Forward-only correction for subscription period aliases in the customer
-- entitlement allocator. Rules, locking, credit ordering, and grants are unchanged.

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
 select eo.plan_key,eo.period_start as period_start,eo.period_end as period_end into v_selected from public.entitlement_overrides eo join public.billing_plans bp on bp.plan_key=eo.plan_key and bp.active where eo.user_id=p_user_id and now()>=eo.period_start and now()<eo.period_end;
 if not found then select s.plan_key,s.current_period_start as period_start,s.current_period_end as period_end into v_selected from public.subscriptions s join public.billing_plans bp on bp.plan_key=s.plan_key and bp.active where s.user_id=p_user_id and s.status in ('active','trialing') and s.current_period_start<=now() and s.current_period_end>now() order by s.current_period_end desc limit 1;end if;
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

revoke all on function public.reserve_ai_entitlement_customer(uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated;

