-- Final launch catalog, permanent purchased credits, and prospective 80/20 marketplace economics.
-- Stripe Price IDs remain null until the FisherCreations test catalog is configured.

alter table public.billing_plans
  add column if not exists can_personalize boolean not null default false,
  add column if not exists can_publish_free boolean not null default false,
  add column if not exists can_sell_paid boolean not null default false,
  add column if not exists can_buy_credit_packs boolean not null default false;

update public.billing_plans set
  display_name='MyStorybook AI Free', monthly_price_display='$0', monthly_price_cents=0,
  story_units_limit=0, image_units_limit=0, max_story_pages=6, stripe_price_id=null,
  can_personalize=false, can_publish_free=false, can_sell_paid=false, can_buy_credit_packs=false
where plan_key='free';
update public.billing_plans set
  display_name='MyStorybook AI Family', monthly_price_display='$12.99/month', monthly_price_cents=1299,
  story_units_limit=10, image_units_limit=100, max_story_pages=24,
  can_personalize=true, can_publish_free=true, can_sell_paid=false, can_buy_credit_packs=true
where plan_key='family';
update public.billing_plans set
  display_name='MyStorybook AI Creator', monthly_price_display='$24.99/month', monthly_price_cents=2499,
  story_units_limit=25, image_units_limit=250, max_story_pages=30,
  can_personalize=true, can_publish_free=true, can_sell_paid=true, can_buy_credit_packs=true
where plan_key='creator';

create table public.credit_products (
  product_key text primary key check (product_key in ('starter','credits_small','credits_medium','credits_large')),
  display_name text not null,
  price_display text not null,
  price_cents integer not null check (price_cents>0),
  stripe_price_id text unique,
  story_units integer not null check (story_units>=0),
  image_units integer not null check (image_units>=0),
  max_story_pages integer not null check (max_story_pages in (6,24,30)),
  requires_active_subscription boolean not null,
  once_per_account boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.credit_products(product_key,display_name,price_display,price_cents,story_units,image_units,max_story_pages,requires_active_subscription,once_per_account,sort_order) values
 ('starter','MyStorybook AI Starter','$2.99 one time',299,1,10,6,false,true,0),
 ('credits_small','Small credit pack','$4.99',499,3,30,24,true,false,10),
 ('credits_medium','Medium credit pack','$9.99',999,6,75,24,true,false,20),
 ('credits_large','Large credit pack','$19.99',1999,12,160,24,true,false,30)
on conflict(product_key) do update set display_name=excluded.display_name,price_display=excluded.price_display,
 price_cents=excluded.price_cents,story_units=excluded.story_units,image_units=excluded.image_units,
 max_story_pages=excluded.max_story_pages,requires_active_subscription=excluded.requires_active_subscription,
 once_per_account=excluded.once_per_account,sort_order=excluded.sort_order;

create table public.credit_checkout_requests (
 id uuid primary key default gen_random_uuid(), request_id uuid not null, user_id uuid not null references public.profiles(id) on delete cascade,
 product_key text not null references public.credit_products(product_key), stripe_checkout_session_id text unique,
 status text not null default 'pending' check(status in ('pending','completed','failed','expired')),
 expires_at timestamptz not null default now()+interval '30 minutes', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,request_id)
);
create unique index credit_checkout_pending_idx on public.credit_checkout_requests(user_id,product_key) where status='pending';

create table public.purchased_credit_grants (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 product_key text not null references public.credit_products(product_key), stripe_checkout_session_id text not null unique,
 stripe_payment_intent_id text unique, stripe_charge_id text,
 purchased_story_units integer not null, purchased_image_units integer not null,
 remaining_story_units integer not null check(remaining_story_units>=0), remaining_image_units integer not null check(remaining_image_units>=0),
 gross_amount_cents integer not null check(gross_amount_cents>0), currency text not null default 'usd' check(currency='usd'),
 status text not null default 'active' check(status in ('active','refunded','chargeback','fraud_warning')),
 unrecovered_story_units integer not null default 0, unrecovered_image_units integer not null default 0,
 purchased_at timestamptz not null default now(), reversed_at timestamptz, reversal_reason text
);
create unique index starter_once_per_account_idx on public.purchased_credit_grants(user_id) where product_key='starter';
create unique index purchased_credit_charge_idx on public.purchased_credit_grants(stripe_charge_id) where stripe_charge_id is not null;
create index purchased_credit_spend_idx on public.purchased_credit_grants(user_id,purchased_at,id) where status='active';

create table public.purchased_credit_reservations (
 reservation_id uuid not null references public.entitlement_usage(id) on delete cascade,
 grant_id uuid not null references public.purchased_credit_grants(id), bucket text not null check(bucket in ('story','image')),
 amount integer not null check(amount>0), status text not null default 'reserved' check(status in ('reserved','consumed','released')),
 finalized_at timestamptz, primary key(reservation_id,grant_id,bucket)
);

alter table public.credit_products enable row level security;
alter table public.credit_checkout_requests enable row level security;
alter table public.purchased_credit_grants enable row level security;
alter table public.purchased_credit_reservations enable row level security;
revoke all on public.credit_products,public.credit_checkout_requests,public.purchased_credit_grants,public.purchased_credit_reservations from public,anon,authenticated;
grant select on public.purchased_credit_grants to authenticated;
create policy "Users read purchased credits" on public.purchased_credit_grants for select to authenticated using(auth.uid()=user_id);

alter table public.entitlement_usage drop constraint entitlement_usage_source_check;
alter table public.entitlement_usage add constraint entitlement_usage_source_check
 check(source in ('free','subscription','override','staff_test','promotion','purchased','mixed'));
alter table public.entitlement_usage add column monthly_amount integer not null default 0 check(monthly_amount>=0),
 add column purchased_amount integer not null default 0 check(purchased_amount>=0);
update public.entitlement_usage set monthly_amount=amount where source in ('subscription','override','free');

create or replace function public.get_billing_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'plans',coalesce((select jsonb_agg(jsonb_build_object('plan_key',bp.plan_key,'display_name',bp.display_name,'price_display',bp.monthly_price_display,'story_units',bp.story_units_limit,'image_units',bp.image_units_limit,'max_story_pages',bp.max_story_pages,'can_personalize',bp.can_personalize,'can_publish_free',bp.can_publish_free,'can_sell_paid',bp.can_sell_paid,'can_buy_credit_packs',bp.can_buy_credit_packs) order by bp.sort_order) from public.billing_plans bp where bp.active and bp.plan_key in ('free','family','creator')),'[]'::jsonb),
  'products',coalesce((select jsonb_agg(jsonb_build_object('product_key',cp.product_key,'display_name',cp.display_name,'price_display',cp.price_display,'story_units',cp.story_units,'image_units',cp.image_units,'max_story_pages',cp.max_story_pages,'requires_active_subscription',cp.requires_active_subscription,'once_per_account',cp.once_per_account,'available',cp.stripe_price_id is not null) order by cp.sort_order) from public.credit_products cp where cp.active),'[]'::jsonb));
$$;
revoke all on function public.get_billing_catalog() from public,anon,authenticated;
grant execute on function public.get_billing_catalog() to anon,authenticated;

create or replace function public.claim_credit_checkout(p_product_key text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_product public.credit_products;v_id uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into v_product from public.credit_products where product_key=p_product_key and active and stripe_price_id is not null;
 if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if v_product.once_per_account and exists(select 1 from public.purchased_credit_grants where user_id=v_user and product_key=p_product_key) then raise exception 'ALREADY_PURCHASED'; end if;
 if v_product.requires_active_subscription and not exists(select 1 from public.subscriptions where user_id=v_user and plan_key in ('family','creator') and status in ('active','trialing') and current_period_end>now()) then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
 update public.credit_checkout_requests set status='expired',updated_at=now() where user_id=v_user and status='pending' and expires_at<=now();
 insert into public.credit_checkout_requests(request_id,user_id,product_key) values(p_request_id,v_user,p_product_key) returning id into v_id;
 return v_id;
exception when unique_violation then raise exception 'CHECKOUT_IN_PROGRESS';end;$$;

create or replace function public.complete_credit_checkout_request(p_id uuid,p_session_id text,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 update public.credit_checkout_requests set stripe_checkout_session_id=case when p_success then p_session_id else stripe_checkout_session_id end,status=case when p_success then 'completed' else 'failed' end,updated_at=now() where id=p_id;end;$$;

create or replace function public.record_credit_purchase(p_checkout_session_id text,p_payment_intent_id text,p_charge_id text,p_user_id uuid,p_product_key text,p_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_product public.credit_products;v_id uuid;v_risk public.stripe_payment_risk_events;
begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into v_product from public.credit_products where product_key=p_product_key and active;
 if not found or p_payment_intent_id is null or p_amount_cents<>v_product.price_cents or lower(p_currency)<>'usd' then raise exception 'PURCHASE_INVALID'; end if;
 if not exists(select 1 from public.credit_checkout_requests where user_id=p_user_id and product_key=p_product_key and stripe_checkout_session_id=p_checkout_session_id) then raise exception 'CHECKOUT_CLAIM_INVALID'; end if;
 insert into public.purchased_credit_grants(user_id,product_key,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,purchased_story_units,purchased_image_units,remaining_story_units,remaining_image_units,gross_amount_cents,currency)
 values(p_user_id,p_product_key,p_checkout_session_id,p_payment_intent_id,p_charge_id,v_product.story_units,v_product.image_units,v_product.story_units,v_product.image_units,p_amount_cents,'usd')
 on conflict(stripe_checkout_session_id) do update set stripe_charge_id=coalesce(public.purchased_credit_grants.stripe_charge_id,excluded.stripe_charge_id) returning id into v_id;
 select * into v_risk from public.stripe_payment_risk_events where stripe_payment_intent_id=p_payment_intent_id or (p_charge_id is not null and stripe_charge_id=p_charge_id) order by created_at desc limit 1;
 if found then perform public.reverse_credit_purchase(p_payment_intent_id,p_charge_id,v_risk.risk_kind);end if;
 return v_id;end;$$;

create or replace function public.reverse_credit_purchase(p_payment_intent_id text,p_charge_id text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_grant public.purchased_credit_grants;v_status text:=case when p_reason='chargeback' then 'chargeback' when p_reason='fraud_warning' then 'fraud_warning' else 'refunded' end;
begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into v_grant from public.purchased_credit_grants where (p_payment_intent_id is not null and stripe_payment_intent_id=p_payment_intent_id) or (p_charge_id is not null and stripe_charge_id=p_charge_id) for update;
 if not found or v_grant.status<>'active' then return; end if;
 update public.purchased_credit_grants set status=v_status,
  unrecovered_story_units=purchased_story_units-remaining_story_units,
  unrecovered_image_units=purchased_image_units-remaining_image_units,
  remaining_story_units=0,remaining_image_units=0,reversed_at=now(),reversal_reason=p_reason where id=v_grant.id;
end;$$;

revoke all on function public.claim_credit_checkout(text,uuid),public.complete_credit_checkout_request(uuid,text,boolean),public.record_credit_purchase(text,text,text,uuid,text,integer,text),public.reverse_credit_purchase(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_credit_checkout(text,uuid) to authenticated;
grant execute on function public.complete_credit_checkout_request(uuid,text,boolean),public.record_credit_purchase(text,text,text,uuid,text,integer,text),public.reverse_credit_purchase(text,text,text) to service_role;

create or replace function public.has_billing_feature(p_user_id uuid,p_feature text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(
  select 1 from public.subscriptions s join public.billing_plans bp on bp.plan_key=s.plan_key and bp.active
  where s.user_id=p_user_id and s.status in ('active','trialing') and s.current_period_end>now()
   and case p_feature when 'publish_free' then bp.can_publish_free when 'sell_paid' then bp.can_sell_paid when 'personalize' then bp.can_personalize when 'buy_credits' then bp.can_buy_credit_packs else false end
 );
$$;
revoke all on function public.has_billing_feature(uuid,text) from public,anon,authenticated;
grant execute on function public.has_billing_feature(uuid,text) to authenticated,service_role;

drop policy if exists "Owners share their stories" on public.community_stories;
create policy "Owners share their stories" on public.community_stories for insert to authenticated with check(
 auth.uid()=user_id and status='published' and featured=false and public.has_billing_feature(auth.uid(),'publish_free')
 and exists(select 1 from public.stories s where s.id=story_id and s.user_id=auth.uid())
);

create or replace function public.enforce_paid_listing_feature()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.marketplace_sales_enabled and not public.has_billing_feature(new.user_id,'sell_paid') then raise exception 'CREATOR_PLAN_REQUIRED';end if;return new;
end;$$;
create or replace function public.enforce_author_personalization_feature()
returns trigger language plpgsql security definer set search_path='' as $$
begin if new.enabled and not public.has_billing_feature(new.author_user_id,'personalize') then raise exception 'PERSONALIZATION_PLAN_REQUIRED';end if;return new;end;$$;
create or replace function public.enforce_buyer_personalization_feature()
returns trigger language plpgsql security definer set search_path='' as $$
begin if not public.has_billing_feature(new.buyer_user_id,'personalize') then raise exception 'PERSONALIZATION_PLAN_REQUIRED';end if;return new;end;$$;
create trigger require_paid_listing_feature before insert or update on public.community_stories for each row execute function public.enforce_paid_listing_feature();
create trigger require_author_personalization_feature before insert or update on public.marketplace_personalization_settings for each row execute function public.enforce_author_personalization_feature();
create trigger require_buyer_personalization_feature before insert on public.marketplace_personalized_editions for each row execute function public.enforce_buyer_personalization_feature();

alter table public.marketplace_settings add column author_share_bps integer not null default 8000 check(author_share_bps between 0 and 10000);
alter table public.marketplace_purchases add column processing_fee_cents integer not null default 0 check(processing_fee_cents>=0),
 add column tax_cents integer not null default 0 check(tax_cents>=0), add column author_share_bps integer not null default 8000 check(author_share_bps between 0 and 10000);

create or replace function public.get_marketplace_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin if not public.is_admin() then raise exception 'ADMIN_REQUIRED';end if;
 return (select jsonb_build_object('author_share_bps',ms.author_share_bps,'updated_at',ms.updated_at) from public.marketplace_settings ms where ms.id=true);end;$$;
create or replace function public.update_marketplace_author_share(p_author_share_bps integer)
returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.profiles where id=auth.uid() and role='owner') then raise exception 'OWNER_REQUIRED';end if;
 if p_author_share_bps not between 0 and 10000 then raise exception 'VALUE_INVALID';end if;
 update public.marketplace_settings set author_share_bps=p_author_share_bps,updated_at=now(),updated_by=auth.uid() where id=true;end;$$;
revoke all on function public.update_marketplace_author_share(integer) from public,anon,authenticated;
grant execute on function public.update_marketplace_author_share(integer) to authenticated;

create or replace function public.record_marketplace_purchase(
 p_checkout_session_id text,p_payment_intent_id text,p_charge_id text,p_buyer_user_id uuid,p_listing_id uuid,
 p_amount_cents integer,p_currency text,p_processing_fee_cents integer,p_tax_cents integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_share public.community_stories;v_purchase uuid;v_bps integer;v_earnings integer;v_risk public.stripe_payment_risk_events;
begin if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_payment_intent_id is null or p_processing_fee_cents<0 or p_tax_cents<0 then raise exception 'PAYMENT_INVALID';end if;
 select * into v_share from public.community_stories where id=p_listing_id and marketplace_enabled=true for update;
 if not found or v_share.user_id=p_buyer_user_id or p_amount_cents<>v_share.price_cents or lower(p_currency)<>v_share.currency then raise exception 'PURCHASE_INVALID';end if;
 if not exists(select 1 from public.marketplace_checkout_requests where community_story_id=p_listing_id and buyer_user_id=p_buyer_user_id and stripe_checkout_session_id=p_checkout_session_id) then raise exception 'CHECKOUT_CLAIM_INVALID';end if;
 select author_share_bps into v_bps from public.marketplace_settings where id=true;
 v_earnings:=floor(greatest(p_amount_cents-p_processing_fee_cents-p_tax_cents,0)*v_bps/10000.0)::integer;
 insert into public.marketplace_purchases(community_story_id,story_id,buyer_user_id,author_user_id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,gross_amount_cents,currency,processing_fee_cents,tax_cents,author_share_bps)
 values(v_share.id,v_share.story_id,p_buyer_user_id,v_share.user_id,p_checkout_session_id,p_payment_intent_id,p_charge_id,p_amount_cents,lower(p_currency),p_processing_fee_cents,p_tax_cents,v_bps)
 on conflict(stripe_checkout_session_id) do update set stripe_payment_intent_id=coalesce(public.marketplace_purchases.stripe_payment_intent_id,excluded.stripe_payment_intent_id),stripe_charge_id=coalesce(public.marketplace_purchases.stripe_charge_id,excluded.stripe_charge_id) returning id into v_purchase;
 insert into public.marketplace_author_earnings(purchase_id,author_user_id,amount_cents,currency) values(v_purchase,v_share.user_id,v_earnings,v_share.currency) on conflict(purchase_id) do nothing;
 select * into v_risk from public.stripe_payment_risk_events where stripe_payment_intent_id=p_payment_intent_id or (p_charge_id is not null and stripe_charge_id=p_charge_id) order by created_at desc limit 1;
 if found then update public.marketplace_purchases set status=case v_risk.risk_kind when 'chargeback' then 'chargeback' when 'fraud_warning' then 'fraud_warning' else 'refunded' end,revoked_at=coalesce(revoked_at,now()) where id=v_purchase;update public.marketplace_author_earnings set status='reversed',reversed_at=coalesce(reversed_at,now()),reversal_reason=v_risk.risk_kind where purchase_id=v_purchase and status<>'reversed';end if;
 return v_purchase;end;$$;

revoke all on function public.record_marketplace_purchase(text,text,text,uuid,uuid,integer,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_marketplace_purchase(text,text,text,uuid,uuid,integer,text,integer,integer) to service_role;

comment on table public.credit_products is 'Server-authoritative one-time Stripe catalog. Null Stripe Price IDs keep checkout disabled.';
comment on table public.purchased_credit_grants is 'Non-expiring purchased balances. Reversals remove unspent units and preserve consumed-unit debt for review.';
comment on column public.marketplace_settings.author_share_bps is 'Prospective author share after Stripe processing fees and excluding tax; historical earnings are unchanged.';
