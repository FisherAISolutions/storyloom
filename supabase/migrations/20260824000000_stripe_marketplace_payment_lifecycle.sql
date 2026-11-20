-- Trusted Stripe payment identifiers and out-of-order risk events.
-- No browser role can write financial or risk state.

alter table public.marketplace_purchases
  drop constraint marketplace_purchases_status_check,
  add constraint marketplace_purchases_status_check
    check (status in ('active','refunded','chargeback','fraud_warning'));

create unique index marketplace_purchase_charge_unique_idx
  on public.marketplace_purchases(stripe_charge_id)
  where stripe_charge_id is not null;

create table public.stripe_payment_risk_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  risk_kind text not null check (risk_kind in ('refund','chargeback','fraud_warning')),
  refunded_amount_cents integer not null default 0 check (refunded_amount_cents >= 0),
  full_reversal boolean not null default false,
  created_at timestamptz not null default now(),
  check (stripe_payment_intent_id is not null or stripe_charge_id is not null)
);

create index stripe_payment_risk_intent_idx on public.stripe_payment_risk_events(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index stripe_payment_risk_charge_idx on public.stripe_payment_risk_events(stripe_charge_id)
  where stripe_charge_id is not null;

alter table public.stripe_payment_risk_events enable row level security;
revoke all on public.stripe_payment_risk_events from public,anon,authenticated;

create or replace function public.record_marketplace_purchase(
  p_checkout_session_id text,p_payment_intent_id text,p_charge_id text,p_buyer_user_id uuid,
  p_listing_id uuid,p_amount_cents integer,p_currency text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_share public.community_stories; v_purchase uuid; v_risk public.stripe_payment_risk_events;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_payment_intent_id is null then raise exception 'PAYMENT_INTENT_REQUIRED'; end if;
  select * into v_share from public.community_stories
    where id=p_listing_id and marketplace_enabled=true for update;
  if not found or v_share.user_id=p_buyer_user_id or p_amount_cents<>v_share.price_cents
    or lower(p_currency)<>v_share.currency then raise exception 'PURCHASE_INVALID'; end if;
  if not exists(
    select 1 from public.marketplace_checkout_requests mcr
    where mcr.community_story_id=p_listing_id and mcr.buyer_user_id=p_buyer_user_id
      and mcr.stripe_checkout_session_id=p_checkout_session_id
  ) then raise exception 'CHECKOUT_CLAIM_INVALID'; end if;

  insert into public.marketplace_purchases(
    community_story_id,story_id,buyer_user_id,author_user_id,stripe_checkout_session_id,
    stripe_payment_intent_id,stripe_charge_id,gross_amount_cents,currency
  ) values(
    v_share.id,v_share.story_id,p_buyer_user_id,v_share.user_id,p_checkout_session_id,
    p_payment_intent_id,p_charge_id,p_amount_cents,lower(p_currency)
  )
  on conflict(stripe_checkout_session_id) do update set
    stripe_payment_intent_id=coalesce(public.marketplace_purchases.stripe_payment_intent_id,excluded.stripe_payment_intent_id),
    stripe_charge_id=coalesce(public.marketplace_purchases.stripe_charge_id,excluded.stripe_charge_id)
  returning id into v_purchase;

  insert into public.marketplace_author_earnings(purchase_id,author_user_id,amount_cents,currency)
    values(v_purchase,v_share.user_id,v_share.author_earnings_cents,v_share.currency)
    on conflict(purchase_id) do nothing;

  select spre.* into v_risk from public.stripe_payment_risk_events spre
  where (spre.stripe_payment_intent_id=p_payment_intent_id)
     or (p_charge_id is not null and spre.stripe_charge_id=p_charge_id)
  order by case spre.risk_kind when 'chargeback' then 3 when 'fraud_warning' then 2 else 1 end desc,
           spre.created_at desc limit 1;
  if found then
    update public.marketplace_purchases set
      status=case v_risk.risk_kind when 'chargeback' then 'chargeback' when 'fraud_warning' then 'fraud_warning' else 'refunded' end,
      revoked_at=coalesce(revoked_at,now()) where id=v_purchase;
    update public.marketplace_author_earnings set status='reversed',reversed_at=coalesce(reversed_at,now()),
      reversal_reason=v_risk.risk_kind where purchase_id=v_purchase and status<>'reversed';
  else
    update public.marketplace_personalized_editions set qualifying_purchase_id=v_purchase
      where community_story_id=v_share.id and buyer_user_id=p_buyer_user_id and requires_active_purchase;
  end if;
  return v_purchase;
end; $$;

create or replace function public.record_stripe_payment_risk(
  p_stripe_event_id text,p_payment_intent_id text,p_charge_id text,p_reason text,
  p_refunded_amount_cents integer default 0,p_full_reversal boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare v_purchase_ids uuid[]; v_status text; v_commission public.affiliate_commissions;
  v_reversed integer; v_event public.stripe_payment_risk_events;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_stripe_event_id is null or p_reason not in ('refund','chargeback','fraud_warning')
    or (p_payment_intent_id is null and p_charge_id is null) then raise exception 'PAYMENT_RISK_INVALID'; end if;

  insert into public.stripe_payment_risk_events(
    stripe_event_id,stripe_payment_intent_id,stripe_charge_id,risk_kind,refunded_amount_cents,full_reversal
  ) values(
    p_stripe_event_id,p_payment_intent_id,p_charge_id,p_reason,greatest(coalesce(p_refunded_amount_cents,0),0),p_full_reversal
  ) on conflict(stripe_event_id) do update set stripe_event_id=excluded.stripe_event_id
  returning * into v_event;

  p_payment_intent_id:=v_event.stripe_payment_intent_id;
  p_charge_id:=v_event.stripe_charge_id;
  p_reason:=v_event.risk_kind;
  p_refunded_amount_cents:=v_event.refunded_amount_cents;
  p_full_reversal:=v_event.full_reversal;

  select array_agg(mp.id) into v_purchase_ids from public.marketplace_purchases mp
  where (p_payment_intent_id is not null and mp.stripe_payment_intent_id=p_payment_intent_id)
     or (p_charge_id is not null and mp.stripe_charge_id=p_charge_id);
  if coalesce(array_length(v_purchase_ids,1),0)>1 then raise exception 'PAYMENT_IDENTIFIER_CONFLICT'; end if;
  if coalesce(array_length(v_purchase_ids,1),0)=1 then
    v_status:=case p_reason when 'chargeback' then 'chargeback' when 'fraud_warning' then 'fraud_warning' else 'refunded' end;
    update public.marketplace_purchases set status=v_status,revoked_at=coalesce(revoked_at,now())
      where id=v_purchase_ids[1] and status<>'chargeback';
    update public.marketplace_author_earnings set status='reversed',reversed_at=coalesce(reversed_at,now()),reversal_reason=p_reason
      where purchase_id=v_purchase_ids[1] and status<>'reversed';
  end if;

  if p_charge_id is not null then
    select * into v_commission from public.affiliate_commissions c where c.stripe_charge_id=p_charge_id for update;
    if found then
      v_reversed:=case when p_full_reversal then v_commission.commission_amount_cents
        else least(v_commission.commission_amount_cents,
          floor(greatest(coalesce(p_refunded_amount_cents,0),0)*v_commission.commission_bps/10000.0)::integer) end;
      update public.affiliate_commissions set reversed_amount_cents=greatest(reversed_amount_cents,v_reversed),
        status=case when greatest(reversed_amount_cents,v_reversed)>=commission_amount_cents then 'reversed' else 'partially_reversed' end,
        reversed_at=coalesce(reversed_at,now()),reversal_reason=p_reason where id=v_commission.id;
    end if;
  end if;
end; $$;

create or replace function public.record_affiliate_conversion(
  p_user_id uuid,p_stripe_invoice_id text,p_stripe_charge_id text,p_gross_amount_cents integer,p_currency text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ref public.affiliate_referrals%rowtype; v_aff public.affiliate_accounts%rowtype;
  v_id uuid; v_risk public.stripe_payment_risk_events; v_reversed integer;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_gross_amount_cents<=0 or p_currency !~ '^[a-z]{3}$' then return null; end if;
  select * into v_ref from public.affiliate_referrals r where r.referred_user_id=p_user_id and r.status<>'disqualified' for update;
  if not found then return null; end if;
  select * into v_aff from public.affiliate_accounts a where a.id=v_ref.affiliate_id and a.status='approved';
  if not found then return null; end if;
  insert into public.affiliate_commissions(affiliate_id,referral_id,referred_user_id,stripe_invoice_id,stripe_charge_id,currency,gross_amount_cents,commission_bps,commission_amount_cents)
  values(v_aff.id,v_ref.id,p_user_id,p_stripe_invoice_id,p_stripe_charge_id,lower(p_currency),p_gross_amount_cents,v_aff.commission_bps,floor(p_gross_amount_cents*v_aff.commission_bps/10000.0)::integer)
  on conflict(stripe_invoice_id) do update set stripe_charge_id=coalesce(affiliate_commissions.stripe_charge_id,excluded.stripe_charge_id)
  returning id into v_id;
  update public.affiliate_referrals set status='converted',converted_at=coalesce(converted_at,now()) where id=v_ref.id;

  if p_stripe_charge_id is not null then
    select * into v_risk from public.stripe_payment_risk_events spre where spre.stripe_charge_id=p_stripe_charge_id
      order by case spre.risk_kind when 'chargeback' then 3 when 'fraud_warning' then 2 else 1 end desc,spre.created_at desc limit 1;
    if found then
      select case when v_risk.full_reversal then c.commission_amount_cents else least(c.commission_amount_cents,
        floor(v_risk.refunded_amount_cents*c.commission_bps/10000.0)::integer) end into v_reversed
        from public.affiliate_commissions c where c.id=v_id;
      update public.affiliate_commissions set reversed_amount_cents=greatest(reversed_amount_cents,v_reversed),
        status=case when greatest(reversed_amount_cents,v_reversed)>=commission_amount_cents then 'reversed' else 'partially_reversed' end,
        reversed_at=coalesce(reversed_at,now()),reversal_reason=v_risk.risk_kind where id=v_id;
    end if;
  end if;
  return v_id;
end; $$;

revoke all on function public.record_stripe_payment_risk(text,text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_stripe_payment_risk(text,text,text,text,integer,boolean) to service_role;

comment on table public.stripe_payment_risk_events is 'Verified webhook risk identifiers. Preserves out-of-order refunds, disputes, and fraud warnings without client authority.';
