-- Commercial marketplace, affiliate, referral, and payout foundation.
-- Every money-moving or reward-issuing feature defaults OFF. This migration
-- records eligibility and auditable balances but never initiates a transfer.

alter table public.marketplace_settings
  add column if not exists paid_selling_enabled boolean not null default false,
  add column if not exists author_payouts_enabled boolean not null default false,
  add column if not exists author_share_bps integer not null default 8000 check (author_share_bps between 0 and 10000),
  add column if not exists payout_minimum_cents integer not null default 2500 check (payout_minimum_cents between 100 and 100000),
  add column if not exists earnings_hold_days integer not null default 30 check (earnings_hold_days between 0 and 180);

create table public.growth_program_settings (
  id boolean primary key default true check (id),
  affiliate_commissions_enabled boolean not null default false,
  customer_referrals_enabled boolean not null default false,
  affiliate_payouts_enabled boolean not null default false,
  affiliate_default_commission_bps integer not null default 1500 check (affiliate_default_commission_bps between 0 and 5000),
  affiliate_attribution_days integer not null default 30 check (affiliate_attribution_days between 1 and 180),
  affiliate_recurring_months integer not null default 12 check (affiliate_recurring_months between 1 and 36),
  affiliate_hold_days integer not null default 30 check (affiliate_hold_days between 0 and 180),
  payout_minimum_cents integer not null default 2500 check (payout_minimum_cents between 100 and 100000),
  referrer_story_units integer not null default 2 check (referrer_story_units between 0 and 100),
  referrer_image_units integer not null default 15 check (referrer_image_units between 0 and 1000),
  referred_story_units integer not null default 1 check (referred_story_units between 0 and 100),
  referred_image_units integer not null default 5 check (referred_image_units between 0 and 1000),
  referral_hold_days integer not null default 30 check (referral_hold_days between 0 and 180),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.growth_program_settings(id) values(true) on conflict(id) do nothing;

alter table public.affiliate_accounts
  alter column commission_bps set default 1500,
  add column if not exists application_note text check (application_note is null or char_length(application_note)<=2000),
  add column if not exists suspended_at timestamptz,
  add column if not exists accepted_terms_version text,
  add column if not exists accepted_terms_at timestamptz;

alter table public.affiliate_commissions
  add column if not exists tax_amount_cents integer not null default 0 check (tax_amount_cents>=0),
  add column if not exists eligible_amount_cents integer not null default 0 check (eligible_amount_cents>=0),
  add column if not exists subscription_month_number integer check (subscription_month_number between 1 and 120),
  add column if not exists available_at timestamptz,
  add column if not exists paid_amount_cents integer not null default 0 check (paid_amount_cents>=0),
  add column if not exists payout_item_id uuid;
update public.affiliate_commissions set eligible_amount_cents=gross_amount_cents-tax_amount_cents,
  available_at=coalesce(available_at,earned_at+interval '30 days') where available_at is null or eligible_amount_cents=0;

alter table public.marketplace_author_earnings
  add column if not exists gross_amount_cents integer not null default 0 check (gross_amount_cents>=0),
  add column if not exists processing_fee_cents integer not null default 0 check (processing_fee_cents>=0),
  add column if not exists tax_amount_cents integer not null default 0 check (tax_amount_cents>=0),
  add column if not exists eligible_net_cents integer not null default 0 check (eligible_net_cents>=0),
  add column if not exists author_share_bps integer not null default 8000 check (author_share_bps between 0 and 10000),
  add column if not exists platform_amount_cents integer not null default 0 check (platform_amount_cents>=0),
  add column if not exists reversed_amount_cents integer not null default 0 check (reversed_amount_cents>=0),
  add column if not exists paid_amount_cents integer not null default 0 check (paid_amount_cents>=0),
  add column if not exists payout_item_id uuid;
update public.marketplace_author_earnings e set
  gross_amount_cents=p.gross_amount_cents,processing_fee_cents=p.processing_fee_cents,tax_amount_cents=p.tax_cents,
  eligible_net_cents=greatest(p.gross_amount_cents-p.processing_fee_cents-p.tax_cents,0),author_share_bps=p.author_share_bps,
  platform_amount_cents=greatest(p.gross_amount_cents-p.processing_fee_cents-p.tax_cents-e.amount_cents,0)
from public.marketplace_purchases p where p.id=e.purchase_id and e.gross_amount_cents=0;

create table public.seller_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_connected_account_id text unique check (stripe_connected_account_id is null or stripe_connected_account_id ~ '^acct_[A-Za-z0-9]+$'),
  status text not null default 'not_started' check (status in ('not_started','onboarding','restricted','eligible','suspended','closed')),
  dashboard_type text not null default 'express' check (dashboard_type='express'),
  fees_collector text not null default 'application' check (fees_collector='application'),
  losses_collector text not null default 'application' check (losses_collector='application'),
  transfers_capability_status text not null default 'inactive' check (transfers_capability_status in ('inactive','pending','active','restricted')),
  details_submitted boolean not null default false,
  requirements_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  onboarding_completed_at timestamptz,
  terms_version text,
  terms_accepted_at timestamptz,
  last_stripe_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_payouts (
  id uuid primary key default gen_random_uuid(),
  beneficiary_type text not null check (beneficiary_type in ('author','affiliate')),
  beneficiary_user_id uuid not null references public.profiles(id) on delete restrict,
  currency text not null default 'usd' check (currency='usd'),
  amount_cents integer not null check (amount_cents>0),
  status text not null default 'draft' check (status in ('draft','approved','processing','transferred','paid','failed','canceled','reversed')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  idempotency_key uuid not null unique,
  stripe_connected_account_id text,
  stripe_transfer_id text unique,
  stripe_payout_id text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end>period_start)
);

create table public.financial_payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.financial_payouts(id) on delete cascade,
  source_type text not null check (source_type in ('author_earning','affiliate_commission','adjustment')),
  source_id uuid not null,
  amount_cents integer not null,
  created_at timestamptz not null default now(),
  unique(source_type,source_id)
);
alter table public.marketplace_author_earnings add constraint marketplace_author_earnings_payout_fk foreign key(payout_item_id) references public.financial_payout_items(id) on delete set null;
alter table public.affiliate_commissions add constraint affiliate_commissions_payout_fk foreign key(payout_item_id) references public.financial_payout_items(id) on delete set null;

create table public.customer_referral_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  referral_code text not null unique default lower(encode(extensions.gen_random_bytes(8),'hex')) check (referral_code ~ '^[a-z0-9]{8,24}$'),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);
create table public.customer_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'signed_up' check (status in ('signed_up','pending','qualified','rewarded','disqualified','reversed')),
  qualifying_invoice_id text unique,
  qualifying_charge_id text,
  qualified_at timestamptz,
  reward_available_at timestamptz,
  disqualification_reason text,
  created_at timestamptz not null default now(),
  check(referrer_user_id<>referred_user_id)
);
create table public.customer_referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.customer_referrals(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(id) on delete restrict,
  beneficiary_role text not null check (beneficiary_role in ('referrer','referred')),
  story_units integer not null check (story_units>=0),
  image_units integer not null check (image_units>=0),
  status text not null default 'pending' check (status in ('pending','available','granted','reversed','debt')),
  available_at timestamptz not null,
  promotional_grant_id uuid references public.promotional_credit_grants(id) on delete set null,
  granted_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(referral_id,beneficiary_role)
);

create table public.policy_versions (
  policy_key text not null,
  version text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(policy_key,version)
);
create table public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_key text not null,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_context text not null check (char_length(acceptance_context) between 1 and 80),
  foreign key(policy_key,policy_version) references public.policy_versions(policy_key,version) on delete restrict,
  unique(user_id,policy_key,policy_version)
);
insert into public.policy_versions(policy_key,version,title,status) values
 ('marketplace_seller','2026-11-draft','Marketplace Seller Terms','draft'),
 ('affiliate','2026-11-draft','Affiliate Program Terms','draft'),
 ('customer_referral','2026-11-draft','Customer Referral Rules','draft')
on conflict do nothing;

create table public.financial_admin_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject_type text not null check (subject_type in ('seller','affiliate','referral','purchase','payout')),
  subject_id text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_by uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index seller_accounts_status_idx on public.seller_accounts(status,updated_at desc);
create index financial_payouts_beneficiary_idx on public.financial_payouts(beneficiary_type,beneficiary_user_id,status,created_at desc);
create index customer_referrals_referrer_idx on public.customer_referrals(referrer_user_id,status,created_at desc);
create index customer_referral_rewards_user_idx on public.customer_referral_rewards(beneficiary_user_id,status,available_at);
create index financial_admin_flags_status_idx on public.financial_admin_flags(status,severity,created_at desc);

alter table public.growth_program_settings enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.financial_payouts enable row level security;
alter table public.financial_payout_items enable row level security;
alter table public.customer_referral_accounts enable row level security;
alter table public.customer_referrals enable row level security;
alter table public.customer_referral_rewards enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.financial_admin_flags enable row level security;
revoke all on public.growth_program_settings,public.seller_accounts,public.financial_payouts,public.financial_payout_items,
 public.customer_referral_accounts,public.customer_referrals,public.customer_referral_rewards,public.policy_versions,
 public.policy_acceptances,public.financial_admin_flags from public,anon,authenticated;

create or replace function public.get_seller_financial_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 return jsonb_build_object(
  'seller',(select to_jsonb(s) from public.seller_accounts s where s.user_id=v_user),
  'seller_terms_version',(select version from public.policy_versions where policy_key='marketplace_seller' and status='active'),
  'seller_terms_accepted',exists(select 1 from public.policy_acceptances a join public.policy_versions v on v.policy_key=a.policy_key and v.version=a.policy_version where a.user_id=v_user and a.policy_key='marketplace_seller' and v.status='active'),
  'summary',(select jsonb_build_object('sales',count(*),'gross_cents',coalesce(sum(e.gross_amount_cents),0),'fees_cents',coalesce(sum(e.processing_fee_cents),0),'tax_cents',coalesce(sum(e.tax_amount_cents),0),'pending_cents',coalesce(sum(e.amount_cents-e.reversed_amount_cents-e.paid_amount_cents) filter(where e.status='pending'),0),'available_cents',coalesce(sum(e.amount_cents-e.reversed_amount_cents-e.paid_amount_cents) filter(where e.status='available'),0),'paid_cents',coalesce(sum(e.paid_amount_cents),0),'refunds_cents',coalesce(sum(e.reversed_amount_cents),0)) from public.marketplace_author_earnings e where e.author_user_id=v_user),
  'by_book',coalesce((select jsonb_agg(x order by x.gross_cents desc) from (select p.story_id,s.title,count(*) sales,sum(e.gross_amount_cents) gross_cents,sum(e.amount_cents-e.reversed_amount_cents) earnings_cents from public.marketplace_author_earnings e join public.marketplace_purchases p on p.id=e.purchase_id join public.stories s on s.id=p.story_id where e.author_user_id=v_user group by p.story_id,s.title)x),'[]'::jsonb),
  'payouts',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.financial_payouts p where p.beneficiary_type='author' and p.beneficiary_user_id=v_user),'[]'::jsonb)
 );
end;$$;

create or replace function public.get_customer_referral_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_account public.customer_referral_accounts;v_version text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if not (select customer_referrals_enabled from public.growth_program_settings where id=true) then return jsonb_build_object('enabled',false);end if;
 select version into v_version from public.policy_versions where policy_key='customer_referral' and status='active';
 if v_version is null then return jsonb_build_object('enabled',false,'legal_review_required',true);end if;
 if not exists(select 1 from public.policy_acceptances where user_id=v_user and policy_key='customer_referral' and policy_version=v_version) then return jsonb_build_object('enabled',true,'terms_required',true,'terms_version',v_version);end if;
 insert into public.customer_referral_accounts(user_id) values(v_user) on conflict(user_id) do nothing;
 select * into v_account from public.customer_referral_accounts where user_id=v_user;
 return jsonb_build_object('enabled',true,'referral_code',v_account.referral_code,'status',v_account.status,
  'successful_referrals',(select count(*) from public.customer_referrals r where r.referrer_user_id=v_user and r.status in ('qualified','rewarded')),
  'pending_rewards',(select count(*) from public.customer_referral_rewards rr where rr.beneficiary_user_id=v_user and rr.status in ('pending','available')),
  'earned_story_units',coalesce((select sum(rr.story_units) from public.customer_referral_rewards rr where rr.beneficiary_user_id=v_user and rr.status='granted'),0),
  'earned_image_units',coalesce((select sum(rr.image_units) from public.customer_referral_rewards rr where rr.beneficiary_user_id=v_user and rr.status='granted'),0),
  'rewards',coalesce((select jsonb_agg(to_jsonb(rr) order by rr.created_at desc) from public.customer_referral_rewards rr where rr.beneficiary_user_id=v_user),'[]'::jsonb));
end;$$;

create or replace function public.apply_affiliate(p_display_name text,p_application_note text,p_accept_terms boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_version text;v_row public.affiliate_accounts;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;if not p_accept_terms then raise exception 'TERMS_REQUIRED';end if;
 if char_length(btrim(coalesce(p_display_name,''))) not between 1 and 80 or char_length(btrim(coalesce(p_application_note,''))) not between 20 and 2000 then raise exception 'VALIDATION';end if;
 select version into v_version from public.policy_versions where policy_key='affiliate' and status='active';if v_version is null then raise exception 'PROGRAM_NOT_ACTIVE';end if;
 insert into public.policy_acceptances(user_id,policy_key,policy_version,acceptance_context) values(v_user,'affiliate',v_version,'affiliate_application') on conflict do nothing;
 insert into public.affiliate_accounts(user_id,display_name,application_note,accepted_terms_version,accepted_terms_at) values(v_user,btrim(p_display_name),btrim(p_application_note),v_version,now())
 on conflict(user_id) do update set display_name=excluded.display_name,application_note=excluded.application_note,accepted_terms_version=excluded.accepted_terms_version,accepted_terms_at=excluded.accepted_terms_at returning * into v_row;
 return jsonb_build_object('id',v_row.id,'referral_code',v_row.referral_code,'display_name',v_row.display_name,'status',v_row.status,'commission_bps',v_row.commission_bps);
end;$$;

create or replace function public.claim_customer_referral(p_referral_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_referrer uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if exists(select 1 from public.affiliate_referrals where referred_user_id=v_user) then return false;end if;
 select a.user_id into v_referrer from public.customer_referral_accounts a where a.referral_code=lower(btrim(p_referral_code)) and a.status='active';
 if v_referrer is null then return false;end if;if v_referrer=v_user then raise exception 'SELF_REFERRAL_DENIED';end if;
 insert into public.customer_referrals(referrer_user_id,referred_user_id) values(v_referrer,v_user) on conflict(referred_user_id) do nothing;
 return found;
end;$$;

create or replace function public.claim_affiliate_referral(p_referral_code text,p_click_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_affiliate public.affiliate_accounts;v_days integer;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;
 if exists(select 1 from public.affiliate_referrals where referred_user_id=v_user) or exists(select 1 from public.customer_referrals where referred_user_id=v_user) then return false;end if;
 select affiliate_attribution_days into v_days from public.growth_program_settings where id=true;
 select * into v_affiliate from public.affiliate_accounts a where a.referral_code=lower(btrim(p_referral_code)) and a.status='approved';
 if not found then return false;end if;if v_affiliate.user_id=v_user then raise exception 'SELF_REFERRAL_DENIED';end if;
 if p_click_id is not null and not exists(select 1 from public.affiliate_clicks c where c.id=p_click_id and c.affiliate_id=v_affiliate.id and c.clicked_at>=now()-make_interval(days=>v_days)) then raise exception 'REFERRAL_INVALID';end if;
 insert into public.affiliate_referrals(affiliate_id,referred_user_id,click_id) values(v_affiliate.id,v_user,p_click_id) on conflict(referred_user_id) do nothing;
 return found;
end;$$;

create or replace function public.record_affiliate_subscription_commission(p_user_id uuid,p_stripe_invoice_id text,p_stripe_charge_id text,p_gross_amount_cents integer,p_tax_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_ref public.affiliate_referrals;v_aff public.affiliate_accounts;v_settings public.growth_program_settings;v_month integer;v_eligible integer;v_id uuid;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into v_settings from public.growth_program_settings where id=true;
 if not v_settings.affiliate_commissions_enabled or p_gross_amount_cents<=0 or p_tax_amount_cents<0 or p_currency!~'^[a-z]{3}$' then return null;end if;
 select * into v_ref from public.affiliate_referrals r where r.referred_user_id=p_user_id and r.status<>'disqualified' for update;
 if not found or exists(select 1 from public.customer_referrals where referred_user_id=p_user_id) then return null;end if;
 select * into v_aff from public.affiliate_accounts a where a.id=v_ref.affiliate_id and a.status='approved';if not found then return null;end if;
 select count(*)+1 into v_month from public.affiliate_commissions where referral_id=v_ref.id and status<>'reversed';
 if v_month>v_settings.affiliate_recurring_months then return null;end if;
 v_eligible:=greatest(p_gross_amount_cents-p_tax_amount_cents,0);
 insert into public.affiliate_commissions(affiliate_id,referral_id,referred_user_id,stripe_invoice_id,stripe_charge_id,currency,gross_amount_cents,tax_amount_cents,eligible_amount_cents,commission_bps,commission_amount_cents,subscription_month_number,available_at)
 values(v_aff.id,v_ref.id,p_user_id,p_stripe_invoice_id,p_stripe_charge_id,lower(p_currency),p_gross_amount_cents,p_tax_amount_cents,v_eligible,v_aff.commission_bps,floor(v_eligible*v_aff.commission_bps/10000.0)::integer,v_month,now()+make_interval(days=>v_settings.affiliate_hold_days))
 on conflict(stripe_invoice_id) do update set stripe_charge_id=coalesce(public.affiliate_commissions.stripe_charge_id,excluded.stripe_charge_id) returning id into v_id;
 update public.affiliate_referrals set status='converted',converted_at=coalesce(converted_at,now()) where id=v_ref.id;return v_id;
end;$$;

create or replace function public.qualify_customer_referral(p_referred_user_id uuid,p_invoice_id text,p_charge_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_ref public.customer_referrals;v_settings public.growth_program_settings;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into v_settings from public.growth_program_settings where id=true;
 if not v_settings.customer_referrals_enabled then return null;end if;
 if exists(select 1 from public.affiliate_referrals where referred_user_id=p_referred_user_id) then return null;end if;
 select * into v_ref from public.customer_referrals where referred_user_id=p_referred_user_id and status in ('signed_up','pending') for update;
 if not found then return null;end if;
 update public.customer_referrals set status='qualified',qualifying_invoice_id=p_invoice_id,qualifying_charge_id=p_charge_id,qualified_at=now(),reward_available_at=now()+make_interval(days=>v_settings.referral_hold_days) where id=v_ref.id;
 insert into public.customer_referral_rewards(referral_id,beneficiary_user_id,beneficiary_role,story_units,image_units,available_at) values
  (v_ref.id,v_ref.referrer_user_id,'referrer',v_settings.referrer_story_units,v_settings.referrer_image_units,now()+make_interval(days=>v_settings.referral_hold_days)),
  (v_ref.id,v_ref.referred_user_id,'referred',v_settings.referred_story_units,v_settings.referred_image_units,now()+make_interval(days=>v_settings.referral_hold_days))
 on conflict(referral_id,beneficiary_role) do nothing;
 return v_ref.id;
end;$$;

create or replace function public.grant_due_customer_referral_rewards(p_limit integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare v_row public.customer_referral_rewards;v_count integer:=0;v_grant uuid;v_actor uuid;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if not (select customer_referrals_enabled from public.growth_program_settings where id=true) then return 0;end if;
 select id into v_actor from public.profiles where role='owner' order by created_at limit 1;if v_actor is null then raise exception 'OWNER_REQUIRED';end if;
 for v_row in select * from public.customer_referral_rewards where status in ('pending','available') and available_at<=now() order by available_at for update skip locked limit least(greatest(p_limit,1),500) loop
  insert into public.promotional_credit_grants(request_id,user_id,story_units,image_units,remaining_story_units,remaining_image_units,reason,expires_at,granted_by)
  values(v_row.id,v_row.beneficiary_user_id,v_row.story_units,v_row.image_units,v_row.story_units,v_row.image_units,'customer_referral_reward',now()+interval '10 years',v_actor)
  on conflict(request_id) do update set request_id=excluded.request_id returning id into v_grant;
  update public.customer_referral_rewards set status='granted',promotional_grant_id=v_grant,granted_at=coalesce(granted_at,now()) where id=v_row.id;
  v_count:=v_count+1;
 end loop;return v_count;
end;$$;

create or replace function public.reverse_customer_referral_rewards(p_invoice_id text,p_charge_id text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_ref public.customer_referrals;v_reward public.customer_referral_rewards;v_consumed boolean;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 select * into v_ref from public.customer_referrals where (p_invoice_id is not null and qualifying_invoice_id=p_invoice_id) or (p_charge_id is not null and qualifying_charge_id=p_charge_id) for update;
 if not found then return;end if;
 for v_reward in select * from public.customer_referral_rewards where referral_id=v_ref.id for update loop
  v_consumed:=false;
  if v_reward.promotional_grant_id is not null then
   select (remaining_story_units<story_units or remaining_image_units<image_units) into v_consumed from public.promotional_credit_grants where id=v_reward.promotional_grant_id;
   update public.promotional_credit_grants set remaining_story_units=0,remaining_image_units=0,revoked_at=coalesce(revoked_at,now()),revoke_reason=left(p_reason,500) where id=v_reward.promotional_grant_id;
  end if;
  update public.customer_referral_rewards set status=case when v_consumed then 'debt' else 'reversed' end,reversed_at=coalesce(reversed_at,now()) where id=v_reward.id and status not in ('reversed','debt');
 end loop;
 update public.customer_referrals set status='reversed',disqualification_reason=left(p_reason,500) where id=v_ref.id;
end;$$;

create or replace function public.get_affiliate_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_aff public.affiliate_accounts;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED';end if;select * into v_aff from public.affiliate_accounts where user_id=v_user;if not found then return null;end if;
 return jsonb_build_object('account',jsonb_build_object('id',v_aff.id,'referral_code',v_aff.referral_code,'display_name',v_aff.display_name,'status',v_aff.status,'commission_bps',v_aff.commission_bps),
 'clicks',(select count(*) from public.affiliate_clicks where affiliate_id=v_aff.id),'signups',(select count(*) from public.affiliate_referrals where affiliate_id=v_aff.id),'conversions',(select count(*) from public.affiliate_referrals where affiliate_id=v_aff.id and status='converted'),
 'conversion_rate',case when (select count(*) from public.affiliate_clicks where affiliate_id=v_aff.id)=0 then 0 else round((select count(*) from public.affiliate_referrals where affiliate_id=v_aff.id and status='converted')::numeric*100/(select count(*) from public.affiliate_clicks where affiliate_id=v_aff.id),2) end,
 'pending_earnings_cents',coalesce((select sum(commission_amount_cents-reversed_amount_cents-paid_amount_cents) from public.affiliate_commissions where affiliate_id=v_aff.id and status in ('pending','partially_reversed')),0),
 'available_earnings_cents',coalesce((select sum(commission_amount_cents-reversed_amount_cents-paid_amount_cents) from public.affiliate_commissions where affiliate_id=v_aff.id and status='approved'),0),
 'paid_earnings_cents',coalesce((select sum(paid_amount_cents) from public.affiliate_commissions where affiliate_id=v_aff.id),0),
 'commissions',coalesce((select jsonb_agg(to_jsonb(c) order by earned_at desc) from public.affiliate_commissions c where affiliate_id=v_aff.id),'[]'::jsonb),
 'payouts',coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc) from public.financial_payouts p where p.beneficiary_type='affiliate' and p.beneficiary_user_id=v_user),'[]'::jsonb));
end;$$;

create or replace function public.accept_policy(p_policy_key text,p_policy_version text,p_context text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.policy_versions where policy_key=p_policy_key and version=p_policy_version and status='active') then raise exception 'POLICY_NOT_ACTIVE';end if;
 insert into public.policy_acceptances(user_id,policy_key,policy_version,acceptance_context) values(auth.uid(),p_policy_key,p_policy_version,left(btrim(p_context),80)) on conflict do nothing;
end;$$;

create or replace function public.admin_get_financial_operations()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.current_staff_role() not in ('owner','admin') then raise exception 'ADMIN_REQUIRED';end if;
 return jsonb_build_object('settings',(select to_jsonb(s) from public.growth_program_settings s where id=true),'marketplace_settings',(select to_jsonb(m) from public.marketplace_settings m where id=true),
  'sellers',coalesce((select jsonb_agg(to_jsonb(s) order by s.updated_at desc) from public.seller_accounts s),'[]'::jsonb),
  'payouts',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.financial_payouts p),'[]'::jsonb),
  'flags',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from public.financial_admin_flags f where f.status in ('open','reviewing')),'[]'::jsonb));
end;$$;

create or replace function public.admin_update_commercial_settings(p_settings jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.profiles where id=v_actor and role='owner') then raise exception 'OWNER_REQUIRED';end if;
 if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
 if coalesce((p_settings->>'paid_selling_enabled')::boolean,false) and not exists(select 1 from public.policy_versions where policy_key='marketplace_seller' and status='active') then raise exception 'SELLER_POLICY_NOT_ACTIVE';end if;
 if coalesce((p_settings->>'affiliate_commissions_enabled')::boolean,false) and not exists(select 1 from public.policy_versions where policy_key='affiliate' and status='active') then raise exception 'AFFILIATE_POLICY_NOT_ACTIVE';end if;
 if coalesce((p_settings->>'customer_referrals_enabled')::boolean,false) and not exists(select 1 from public.policy_versions where policy_key='customer_referral' and status='active') then raise exception 'REFERRAL_POLICY_NOT_ACTIVE';end if;
 update public.growth_program_settings set affiliate_commissions_enabled=coalesce((p_settings->>'affiliate_commissions_enabled')::boolean,affiliate_commissions_enabled),customer_referrals_enabled=coalesce((p_settings->>'customer_referrals_enabled')::boolean,customer_referrals_enabled),affiliate_payouts_enabled=coalesce((p_settings->>'affiliate_payouts_enabled')::boolean,affiliate_payouts_enabled),affiliate_default_commission_bps=coalesce((p_settings->>'affiliate_default_commission_bps')::integer,affiliate_default_commission_bps),affiliate_attribution_days=coalesce((p_settings->>'affiliate_attribution_days')::integer,affiliate_attribution_days),affiliate_recurring_months=coalesce((p_settings->>'affiliate_recurring_months')::integer,affiliate_recurring_months),affiliate_hold_days=coalesce((p_settings->>'affiliate_hold_days')::integer,affiliate_hold_days),payout_minimum_cents=coalesce((p_settings->>'payout_minimum_cents')::integer,payout_minimum_cents),referral_hold_days=coalesce((p_settings->>'referral_hold_days')::integer,referral_hold_days),updated_at=now(),updated_by=v_actor where id=true;
 update public.marketplace_settings set paid_selling_enabled=coalesce((p_settings->>'paid_selling_enabled')::boolean,paid_selling_enabled),author_payouts_enabled=coalesce((p_settings->>'author_payouts_enabled')::boolean,author_payouts_enabled),payout_minimum_cents=coalesce((p_settings->>'author_payout_minimum_cents')::integer,payout_minimum_cents),earnings_hold_days=coalesce((p_settings->>'author_hold_days')::integer,earnings_hold_days),updated_at=now(),updated_by=v_actor where id=true;
 insert into public.admin_audit_log(actor_id,action,details) values(v_actor,'commercial_settings_updated',jsonb_build_object('changes',p_settings,'reason',btrim(p_reason)));
end;$$;

create or replace function public.admin_activate_policy(p_policy_key text,p_policy_version text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.profiles where id=v_actor and role='owner') then raise exception 'OWNER_REQUIRED';end if;
 if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
 update public.policy_versions set status='retired' where policy_key=p_policy_key and status='active';
 update public.policy_versions set status='active',effective_at=now() where policy_key=p_policy_key and version=p_policy_version and status='draft';if not found then raise exception 'POLICY_NOT_FOUND';end if;
 insert into public.admin_audit_log(actor_id,action,details) values(v_actor,'policy_activated',jsonb_build_object('policy_key',p_policy_key,'version',p_policy_version,'reason',btrim(p_reason)));
end;$$;

create or replace function public.admin_prepare_financial_payout(p_beneficiary_type text,p_beneficiary_user_id uuid,p_period_end timestamptz,p_request_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_amount integer;v_minimum integer;v_item uuid;v_row record;
begin
 if not exists(select 1 from public.profiles where id=v_actor and role='owner') then raise exception 'OWNER_REQUIRED';end if;
 if p_beneficiary_type not in ('author','affiliate') or p_period_end>now() or p_request_id is null or char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'VALIDATION';end if;
 update public.marketplace_author_earnings set status='available' where status='pending' and available_at<=now();
 update public.affiliate_commissions set status='approved',updated_at=now() where status in ('pending','partially_reversed') and available_at<=now() and commission_amount_cents>reversed_amount_cents;
 if p_beneficiary_type='author' then
  select payout_minimum_cents into v_minimum from public.marketplace_settings where id=true and author_payouts_enabled;
  if v_minimum is null or not exists(select 1 from public.seller_accounts where user_id=p_beneficiary_user_id and status='eligible' and transfers_capability_status='active') then raise exception 'PAYOUT_DISABLED';end if;
  select coalesce(sum(amount_cents-reversed_amount_cents-paid_amount_cents),0) into v_amount from public.marketplace_author_earnings where author_user_id=p_beneficiary_user_id and status='available' and available_at<=p_period_end and payout_item_id is null;
 else
  select payout_minimum_cents into v_minimum from public.growth_program_settings where id=true and affiliate_payouts_enabled;
  if v_minimum is null or not exists(select 1 from public.affiliate_accounts where user_id=p_beneficiary_user_id and status='approved') then raise exception 'PAYOUT_DISABLED';end if;
  select coalesce(sum(commission_amount_cents-reversed_amount_cents-paid_amount_cents),0) into v_amount from public.affiliate_commissions c join public.affiliate_accounts a on a.id=c.affiliate_id where a.user_id=p_beneficiary_user_id and c.status='approved' and c.available_at<=p_period_end and c.payout_item_id is null;
 end if;
 if v_amount<v_minimum then raise exception 'PAYOUT_MINIMUM';end if;
 insert into public.financial_payouts(beneficiary_type,beneficiary_user_id,amount_cents,period_start,period_end,idempotency_key) values(p_beneficiary_type,p_beneficiary_user_id,v_amount,'1970-01-01',p_period_end,p_request_id) returning id into v_id;
 if p_beneficiary_type='author' then
  for v_row in select id,amount_cents-reversed_amount_cents-paid_amount_cents amount from public.marketplace_author_earnings where author_user_id=p_beneficiary_user_id and status='available' and available_at<=p_period_end and payout_item_id is null for update loop
   insert into public.financial_payout_items(payout_id,source_type,source_id,amount_cents) values(v_id,'author_earning',v_row.id,v_row.amount) returning id into v_item;update public.marketplace_author_earnings set payout_item_id=v_item where id=v_row.id;
  end loop;
 else
  for v_row in select c.id,c.commission_amount_cents-c.reversed_amount_cents-c.paid_amount_cents amount from public.affiliate_commissions c join public.affiliate_accounts a on a.id=c.affiliate_id where a.user_id=p_beneficiary_user_id and c.status='approved' and c.available_at<=p_period_end and c.payout_item_id is null for update of c loop
   insert into public.financial_payout_items(payout_id,source_type,source_id,amount_cents) values(v_id,'affiliate_commission',v_row.id,v_row.amount) returning id into v_item;update public.affiliate_commissions set payout_item_id=v_item where id=v_row.id;
  end loop;
 end if;
 insert into public.admin_audit_log(actor_id,target_user_id,action,details) values(v_actor,p_beneficiary_user_id,'financial_payout_prepared',jsonb_build_object('payout_id',v_id,'type',p_beneficiary_type,'amount_cents',v_amount,'reason',btrim(p_reason)));return v_id;
end;$$;

create or replace function public.record_financial_transfer_status(p_payout_id uuid,p_transfer_id text,p_reversed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_payout public.financial_payouts;
begin
 if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED';end if;
 if p_payout_id is null or p_transfer_id is null or p_transfer_id!~'^tr_[A-Za-z0-9]+$' then raise exception 'VALIDATION';end if;
 select * into v_payout from public.financial_payouts where id=p_payout_id for update;
 if not found or v_payout.beneficiary_type<>'author' then raise exception 'PAYOUT_NOT_FOUND';end if;
 if p_reversed then
  update public.financial_payouts set status='reversed',stripe_transfer_id=p_transfer_id,failure_code='transfer_reversed',updated_at=now() where id=p_payout_id;
  update public.marketplace_author_earnings e set paid_amount_cents=greatest(e.paid_amount_cents-i.amount_cents,0)
   from public.financial_payout_items i where i.payout_id=p_payout_id and i.source_type='author_earning' and i.source_id=e.id;
  insert into public.financial_admin_flags(user_id,subject_type,subject_id,severity,reason)
   values(v_payout.beneficiary_user_id,'payout',p_payout_id::text,'high','Stripe transfer was reversed; review seller balance before retrying.');
 else
  update public.financial_payouts set status='transferred',stripe_transfer_id=p_transfer_id,updated_at=now() where id=p_payout_id and status in ('approved','processing','transferred');
  update public.marketplace_author_earnings e set paid_amount_cents=greatest(e.paid_amount_cents,i.amount_cents)
   from public.financial_payout_items i where i.payout_id=p_payout_id and i.source_type='author_earning' and i.source_id=e.id;
 end if;
end;$$;

create or replace function public.admin_review_financial_payout(p_payout_id uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.profiles where id=v_actor and role='owner') then raise exception 'OWNER_REQUIRED';end if;if char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED';end if;
 update public.financial_payouts set status=case when p_approve then 'approved' else 'canceled' end,reviewed_by=v_actor,reviewed_at=now(),updated_at=now() where id=p_payout_id and status='draft';if not found then raise exception 'PAYOUT_NOT_REVIEWABLE';end if;
 if not p_approve then update public.marketplace_author_earnings e set payout_item_id=null from public.financial_payout_items i where i.payout_id=p_payout_id and i.source_type='author_earning' and i.source_id=e.id;update public.affiliate_commissions c set payout_item_id=null from public.financial_payout_items i where i.payout_id=p_payout_id and i.source_type='affiliate_commission' and i.source_id=c.id;delete from public.financial_payout_items where payout_id=p_payout_id;end if;
 insert into public.admin_audit_log(actor_id,action,details) values(v_actor,'financial_payout_reviewed',jsonb_build_object('payout_id',p_payout_id,'approved',p_approve,'reason',btrim(p_reason)));
end;$$;

create or replace function public.enforce_commercial_activation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.marketplace_sales_enabled and not (select paid_selling_enabled from public.marketplace_settings where id=true) then raise exception 'PAID_MARKETPLACE_DISABLED';end if;
 if new.marketplace_sales_enabled and not exists(select 1 from public.seller_accounts s where s.user_id=new.user_id and s.status='eligible' and s.transfers_capability_status='active' and s.terms_accepted_at is not null) then raise exception 'SELLER_ONBOARDING_REQUIRED';end if;
 return new;
end;$$;
drop trigger if exists enforce_commercial_activation on public.community_stories;
create trigger enforce_commercial_activation before insert or update of marketplace_sales_enabled on public.community_stories for each row execute function public.enforce_commercial_activation();

revoke all on function public.get_seller_financial_dashboard(),public.get_customer_referral_dashboard(),public.apply_affiliate(text,text,boolean),public.claim_customer_referral(text),public.claim_affiliate_referral(text,uuid),public.record_affiliate_subscription_commission(uuid,text,text,integer,integer,text),public.qualify_customer_referral(uuid,text,text),public.grant_due_customer_referral_rewards(integer),public.reverse_customer_referral_rewards(text,text,text),public.record_financial_transfer_status(uuid,text,boolean),public.get_affiliate_dashboard(),public.accept_policy(text,text,text),public.admin_get_financial_operations(),public.admin_update_commercial_settings(jsonb,text),public.admin_activate_policy(text,text,text),public.admin_prepare_financial_payout(text,uuid,timestamptz,uuid,text),public.admin_review_financial_payout(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.get_seller_financial_dashboard(),public.get_customer_referral_dashboard(),public.apply_affiliate(text,text,boolean),public.claim_customer_referral(text),public.claim_affiliate_referral(text,uuid),public.get_affiliate_dashboard(),public.accept_policy(text,text,text) to authenticated;
grant execute on function public.admin_get_financial_operations(),public.admin_update_commercial_settings(jsonb,text),public.admin_activate_policy(text,text,text),public.admin_prepare_financial_payout(text,uuid,timestamptz,uuid,text),public.admin_review_financial_payout(uuid,boolean,text) to authenticated;
grant execute on function public.record_affiliate_subscription_commission(uuid,text,text,integer,integer,text),public.qualify_customer_referral(uuid,text,text),public.grant_due_customer_referral_rewards(integer),public.reverse_customer_referral_rewards(text,text,text),public.record_financial_transfer_status(uuid,text,boolean) to service_role;

comment on table public.financial_payouts is 'Internal payout instruction ledger. Stripe transfers and bank payouts are distinct; automatic execution defaults disabled.';
comment on table public.seller_accounts is 'Stripe Connect recipient onboarding state. No bank data is stored in MyStoryBookAI.';
comment on table public.customer_referral_rewards is 'Auditable customer referral rewards, separate from purchased credits and granted only by service-role processing.';
