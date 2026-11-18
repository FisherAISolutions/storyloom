-- Affiliate enrollment, first-touch referral attribution, and webhook-driven commissions.
-- Payouts are intentionally manual and out of scope.

create table public.affiliate_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null unique default lower(encode(extensions.gen_random_bytes(8),'hex'))
    check (referral_code ~ '^[a-z0-9]{8,24}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  commission_bps integer not null default 2000 check (commission_bps between 0 and 5000),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete cascade,
  visitor_hash text not null check (char_length(visitor_hash)=64),
  landing_path text not null default '/' check (char_length(landing_path) between 1 and 300),
  clicked_at timestamptz not null default now()
);

create table public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  click_id uuid references public.affiliate_clicks(id) on delete set null,
  status text not null default 'signed_up' check (status in ('signed_up','converted','disqualified')),
  attributed_at timestamptz not null default now(),
  converted_at timestamptz,
  check (converted_at is null or converted_at >= attributed_at)
);

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_accounts(id) on delete restrict,
  referral_id uuid not null references public.affiliate_referrals(id) on delete restrict,
  referred_user_id uuid not null references auth.users(id) on delete restrict,
  stripe_invoice_id text not null unique,
  stripe_charge_id text,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  gross_amount_cents integer not null check (gross_amount_cents > 0),
  commission_bps integer not null check (commission_bps between 0 and 5000),
  commission_amount_cents integer not null check (commission_amount_cents >= 0),
  reversed_amount_cents integer not null default 0 check (reversed_amount_cents >= 0 and reversed_amount_cents <= commission_amount_cents),
  status text not null default 'pending' check (status in ('pending','approved','partially_reversed','reversed')),
  earned_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affiliate_clicks_affiliate_date_idx on public.affiliate_clicks(affiliate_id,clicked_at desc);
create index affiliate_referrals_affiliate_status_idx on public.affiliate_referrals(affiliate_id,status,attributed_at desc);
create index affiliate_commissions_affiliate_status_idx on public.affiliate_commissions(affiliate_id,status,earned_at desc);
create index affiliate_commissions_charge_idx on public.affiliate_commissions(stripe_charge_id) where stripe_charge_id is not null;

create trigger affiliate_accounts_set_updated_at before update on public.affiliate_accounts
for each row execute function public.set_updated_at();
create trigger affiliate_commissions_set_updated_at before update on public.affiliate_commissions
for each row execute function public.set_updated_at();

alter table public.affiliate_accounts enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliate_accounts,public.affiliate_clicks,public.affiliate_referrals,public.affiliate_commissions from public,anon,authenticated;

create or replace function public.enroll_affiliate(p_display_name text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_user uuid:=auth.uid(); v_row public.affiliate_accounts%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_display_name,''))) not between 1 and 80 then raise exception 'VALIDATION'; end if;
  insert into public.affiliate_accounts(user_id,display_name) values(v_user,btrim(p_display_name))
  on conflict(user_id) do update set display_name=excluded.display_name
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'referral_code',v_row.referral_code,'display_name',v_row.display_name,'status',v_row.status,'commission_bps',v_row.commission_bps);
end; $$;

create or replace function public.claim_affiliate_referral(p_referral_code text,p_click_id uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_affiliate public.affiliate_accounts%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if exists(select 1 from public.affiliate_referrals r where r.referred_user_id=v_user) then return false; end if;
  select * into v_affiliate from public.affiliate_accounts a where a.referral_code=lower(btrim(p_referral_code)) and a.status='approved';
  if not found then return false; end if;
  if v_affiliate.user_id=v_user then raise exception 'SELF_REFERRAL_DENIED'; end if;
  if p_click_id is not null and not exists(select 1 from public.affiliate_clicks c where c.id=p_click_id and c.affiliate_id=v_affiliate.id and c.clicked_at>=now()-interval '30 days') then raise exception 'REFERRAL_INVALID'; end if;
  insert into public.affiliate_referrals(affiliate_id,referred_user_id,click_id) values(v_affiliate.id,v_user,p_click_id)
  on conflict(referred_user_id) do nothing;
  return found;
end; $$;

create or replace function public.get_affiliate_dashboard()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_affiliate public.affiliate_accounts%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_affiliate from public.affiliate_accounts a where a.user_id=v_user;
  if not found then return null; end if;
  return jsonb_build_object(
    'account',jsonb_build_object('id',v_affiliate.id,'referral_code',v_affiliate.referral_code,'display_name',v_affiliate.display_name,'status',v_affiliate.status,'commission_bps',v_affiliate.commission_bps),
    'clicks',(select count(*) from public.affiliate_clicks c where c.affiliate_id=v_affiliate.id),
    'signups',(select count(*) from public.affiliate_referrals r where r.affiliate_id=v_affiliate.id),
    'conversions',(select count(*) from public.affiliate_referrals r where r.affiliate_id=v_affiliate.id and r.status='converted'),
    'pending_earnings_cents',coalesce((select sum(c.commission_amount_cents-c.reversed_amount_cents) from public.affiliate_commissions c where c.affiliate_id=v_affiliate.id and c.status in ('pending','partially_reversed')),0),
    'approved_earnings_cents',coalesce((select sum(c.commission_amount_cents-c.reversed_amount_cents) from public.affiliate_commissions c where c.affiliate_id=v_affiliate.id and c.status='approved'),0),
    'commissions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'gross_amount_cents',c.gross_amount_cents,'commission_amount_cents',c.commission_amount_cents,'reversed_amount_cents',c.reversed_amount_cents,'currency',c.currency,'status',c.status,'earned_at',c.earned_at) order by c.earned_at desc) from public.affiliate_commissions c where c.affiliate_id=v_affiliate.id),'[]'::jsonb)
  );
end; $$;

create or replace function public.admin_get_affiliates()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.current_staff_role() not in ('owner','admin') then raise exception 'ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id,'email',u.email,'display_name',a.display_name,'referral_code',a.referral_code,'status',a.status,'commission_bps',a.commission_bps,'clicks',(select count(*) from public.affiliate_clicks c where c.affiliate_id=a.id),'signups',(select count(*) from public.affiliate_referrals r where r.affiliate_id=a.id),'conversions',(select count(*) from public.affiliate_referrals r where r.affiliate_id=a.id and r.status='converted'),'earnings_cents',coalesce((select sum(c.commission_amount_cents-c.reversed_amount_cents) from public.affiliate_commissions c where c.affiliate_id=a.id),0),'created_at',a.created_at) order by a.created_at desc) from public.affiliate_accounts a join auth.users u on u.id=a.user_id),'[]'::jsonb);
end; $$;

create or replace function public.admin_review_affiliate(p_affiliate_id uuid,p_status text,p_commission_bps integer,p_reason text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();
begin
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if p_status not in ('approved','rejected','suspended') or p_commission_bps not between 0 and 5000 or char_length(btrim(coalesce(p_reason,'')))<3 then raise exception 'VALIDATION'; end if;
  update public.affiliate_accounts set status=p_status,commission_bps=p_commission_bps,approved_by=case when p_status='approved' then v_actor else approved_by end,approved_at=case when p_status='approved' then now() else approved_at end where id=p_affiliate_id;
  if not found then raise exception 'AFFILIATE_NOT_FOUND'; end if;
  insert into public.admin_audit_log(actor_id,action,details) values(v_actor,'affiliate_reviewed',jsonb_build_object('affiliate_id',p_affiliate_id,'status',p_status,'commission_bps',p_commission_bps,'reason',btrim(p_reason)));
end; $$;

create or replace function public.record_affiliate_conversion(p_user_id uuid,p_stripe_invoice_id text,p_stripe_charge_id text,p_gross_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ref public.affiliate_referrals%rowtype; v_aff public.affiliate_accounts%rowtype; v_id uuid;
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
  return v_id;
end; $$;

create or replace function public.reverse_affiliate_commission(p_stripe_invoice_id text,p_stripe_charge_id text,p_refunded_amount_cents integer,p_reason text,p_full_reversal boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.affiliate_commissions%rowtype; v_reversed integer;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_row from public.affiliate_commissions c where (p_stripe_invoice_id is not null and c.stripe_invoice_id=p_stripe_invoice_id) or (p_stripe_charge_id is not null and c.stripe_charge_id=p_stripe_charge_id) for update;
  if not found then return; end if;
  v_reversed:=case when p_full_reversal then v_row.commission_amount_cents else least(v_row.commission_amount_cents,floor(greatest(p_refunded_amount_cents,0)*v_row.commission_bps/10000.0)::integer) end;
  update public.affiliate_commissions set reversed_amount_cents=v_reversed,status=case when v_reversed>=commission_amount_cents then 'reversed' else 'partially_reversed' end,reversed_at=now(),reversal_reason=left(p_reason,200) where id=v_row.id;
end; $$;

revoke all on function public.enroll_affiliate(text),public.claim_affiliate_referral(text,uuid),public.get_affiliate_dashboard(),public.admin_get_affiliates(),public.admin_review_affiliate(uuid,text,integer,text),public.record_affiliate_conversion(uuid,text,text,integer,text),public.reverse_affiliate_commission(text,text,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.enroll_affiliate(text),public.claim_affiliate_referral(text,uuid),public.get_affiliate_dashboard() to authenticated;
grant execute on function public.admin_get_affiliates(),public.admin_review_affiliate(uuid,text,integer,text) to authenticated;
grant execute on function public.record_affiliate_conversion(uuid,text,text,integer,text),public.reverse_affiliate_commission(text,text,integer,text,boolean) to service_role;

comment on table public.affiliate_commissions is 'Webhook-driven affiliate earnings ledger. No automatic payout authority is implemented.';
