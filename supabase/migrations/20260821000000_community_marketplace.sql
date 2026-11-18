-- Extend the existing Community Shelf with optional digital sales. Private story
-- rows and Storage objects remain authoritative; public delivery stays in the
-- community-public Edge Function.

create table public.author_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  biography text check (biography is null or char_length(biography) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_stories
  add column marketplace_enabled boolean not null default false,
  add column marketplace_sales_enabled boolean not null default false,
  add column marketplace_seller_unlisted boolean not null default false,
  add column marketplace_description text check (marketplace_description is null or char_length(marketplace_description) <= 2000),
  add column price_cents integer check (price_cents is null or price_cents between 699 and 5000),
  add column currency text not null default 'usd' check (currency = 'usd'),
  add column preview_page_count integer not null default 2 check (preview_page_count between 1 and 6),
  add column author_earnings_cents integer check (author_earnings_cents is null or author_earnings_cents >= 0);

alter table public.community_stories add constraint community_marketplace_price_check check (
  (marketplace_enabled = false and marketplace_sales_enabled = false and price_cents is null and author_earnings_cents is null)
  or (marketplace_enabled = true and price_cents is not null and author_earnings_cents between 0 and price_cents)
);

create table public.marketplace_settings (
  id boolean primary key default true check (id),
  default_author_earnings_cents integer not null default 500 check (default_author_earnings_cents between 0 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.marketplace_settings(id) values(true);

create table public.marketplace_checkout_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  community_story_id uuid not null references public.community_stories(id) on delete cascade,
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_checkout_session_id text unique,
  status text not null default 'pending' check (status in ('pending','completed','expired','failed')),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_user_id, request_id)
);
create unique index marketplace_one_pending_checkout_idx on public.marketplace_checkout_requests(community_story_id,buyer_user_id) where status='pending';

create table public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  community_story_id uuid not null references public.community_stories(id),
  story_id uuid not null references public.stories(id),
  buyer_user_id uuid not null references public.profiles(id),
  author_user_id uuid not null references public.profiles(id),
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  gross_amount_cents integer not null check (gross_amount_cents > 0),
  currency text not null check (currency = 'usd'),
  status text not null default 'active' check (status in ('active','refunded','chargeback')),
  purchased_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (buyer_user_id <> author_user_id)
);
create index marketplace_buyer_library_idx on public.marketplace_purchases(buyer_user_id,purchased_at desc) where status='active';
create index marketplace_author_sales_idx on public.marketplace_purchases(author_user_id,purchased_at desc);

create table public.marketplace_author_earnings (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.marketplace_purchases(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending','available','reversed')),
  available_at timestamptz not null default (now() + interval '30 days'),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now()
);
create index marketplace_author_earnings_idx on public.marketplace_author_earnings(author_user_id,created_at desc);

create or replace function public.protect_community_marketplace_fields()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if current_setting('app.marketplace_config',true) is distinct from 'allowed' then
    new.marketplace_enabled:=old.marketplace_enabled;
    new.marketplace_sales_enabled:=old.marketplace_sales_enabled;
    new.marketplace_seller_unlisted:=old.marketplace_seller_unlisted;
    new.marketplace_description:=old.marketplace_description;
    new.price_cents:=old.price_cents;
    new.currency:=old.currency;
    new.preview_page_count:=old.preview_page_count;
    new.author_earnings_cents:=old.author_earnings_cents;
  end if;
  if old.marketplace_enabled and new.status is distinct from old.status then
    if new.status='published' then new.marketplace_seller_unlisted:=false;
    elsif not public.is_admin() and auth.uid()=old.user_id then new.marketplace_seller_unlisted:=true;
    else new.marketplace_seller_unlisted:=false;
    end if;
  end if;
  return new;
end; $$;
create trigger protect_community_marketplace_fields before update on public.community_stories for each row execute function public.protect_community_marketplace_fields();

alter table public.author_profiles enable row level security;
alter table public.marketplace_settings enable row level security;
alter table public.marketplace_checkout_requests enable row level security;
alter table public.marketplace_purchases enable row level security;
alter table public.marketplace_author_earnings enable row level security;
revoke all on public.author_profiles,public.marketplace_settings,public.marketplace_checkout_requests,public.marketplace_purchases,public.marketplace_author_earnings from public,anon,authenticated;
grant select,insert,update on public.author_profiles to authenticated;
grant select on public.marketplace_purchases,public.marketplace_author_earnings to authenticated;

create policy "Authors manage their profile" on public.author_profiles for all to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Buyers read their purchases" on public.marketplace_purchases for select to authenticated
  using ((select auth.uid())=buyer_user_id or (select auth.uid())=author_user_id);
create policy "Authors read their earnings" on public.marketplace_author_earnings for select to authenticated
  using ((select auth.uid())=author_user_id);

create or replace function public.configure_marketplace_listing(p_story_id uuid,p_enabled boolean,p_price_cents integer default null,p_description text default null,p_preview_page_count integer default 2)
returns public.community_stories language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_share public.community_stories; v_pages integer; v_earnings integer; v_has_sales boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select cs.* into v_share from public.community_stories cs where cs.story_id=p_story_id and cs.user_id=v_user for update;
  if not found then raise exception 'STORY_NOT_PUBLISHED'; end if;
  select s.page_count into v_pages from public.stories s where s.id=v_share.story_id and s.user_id=v_user;
  if v_share.status <> 'published' then raise exception 'STORY_NOT_PUBLISHED'; end if;
  if p_enabled then
    if v_pages < 4 then raise exception 'STORY_NOT_ELIGIBLE'; end if;
    if not exists(select 1 from public.author_profiles ap where ap.user_id=v_user) then raise exception 'AUTHOR_PROFILE_REQUIRED'; end if;
    if p_price_cents is null or p_price_cents not between 699 and 5000 then raise exception 'PRICE_INVALID'; end if;
    select least(p_price_cents,ms.default_author_earnings_cents) into v_earnings from public.marketplace_settings ms where ms.id=true;
  else
    select exists(select 1 from public.marketplace_purchases mp where mp.community_story_id=v_share.id and mp.status='active') into v_has_sales;
  end if;
  perform set_config('app.marketplace_config','allowed',true);
  update public.community_stories set marketplace_enabled=case when p_enabled then true when v_has_sales then true else false end,marketplace_sales_enabled=p_enabled,marketplace_description=case when p_enabled then nullif(trim(p_description),'') when v_has_sales then marketplace_description else null end,price_cents=case when p_enabled then p_price_cents when v_has_sales then price_cents else null end,preview_page_count=case when p_enabled then p_preview_page_count when v_has_sales then preview_page_count else 2 end,author_earnings_cents=case when p_enabled then v_earnings when v_has_sales then author_earnings_cents else null end where id=v_share.id returning * into v_share;
  return v_share;
end; $$;

create or replace function public.claim_marketplace_checkout(p_slug text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_share public.community_stories; v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.marketplace_checkout_requests set status='expired',updated_at=now() where buyer_user_id=v_user and status='pending' and expires_at<=now();
  select * into v_share from public.community_stories where public_slug=p_slug and status='published' and marketplace_enabled=true and marketplace_sales_enabled=true;
  if not found then raise exception 'LISTING_UNAVAILABLE'; end if;
  if v_share.user_id=v_user then raise exception 'SELF_PURCHASE'; end if;
  if exists(select 1 from public.marketplace_purchases mp where mp.community_story_id=v_share.id and mp.buyer_user_id=v_user and mp.status='active') then raise exception 'ALREADY_PURCHASED'; end if;
  insert into public.marketplace_checkout_requests(request_id,community_story_id,buyer_user_id) values(p_request_id,v_share.id,v_user) returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'CHECKOUT_IN_PROGRESS';
end; $$;

create or replace function public.complete_marketplace_checkout_request(p_id uuid,p_session_id text,p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  update public.marketplace_checkout_requests set stripe_checkout_session_id=case when p_success then p_session_id else stripe_checkout_session_id end,status=case when p_success then 'completed' else 'failed' end,updated_at=now() where id=p_id;
end; $$;

create or replace function public.record_marketplace_purchase(p_checkout_session_id text,p_payment_intent_id text,p_charge_id text,p_buyer_user_id uuid,p_listing_id uuid,p_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_share public.community_stories; v_purchase uuid;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_share from public.community_stories where id=p_listing_id and status='published' and marketplace_enabled=true for update;
  if not found or v_share.user_id=p_buyer_user_id or p_amount_cents<>v_share.price_cents or lower(p_currency)<>v_share.currency then raise exception 'PURCHASE_INVALID'; end if;
  insert into public.marketplace_purchases(community_story_id,story_id,buyer_user_id,author_user_id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,gross_amount_cents,currency)
  values(v_share.id,v_share.story_id,p_buyer_user_id,v_share.user_id,p_checkout_session_id,p_payment_intent_id,p_charge_id,p_amount_cents,lower(p_currency))
  on conflict(stripe_checkout_session_id) do update set stripe_charge_id=coalesce(public.marketplace_purchases.stripe_charge_id,excluded.stripe_charge_id) returning id into v_purchase;
  insert into public.marketplace_author_earnings(purchase_id,author_user_id,amount_cents,currency) values(v_purchase,v_share.user_id,v_share.author_earnings_cents,v_share.currency) on conflict(purchase_id) do nothing;
  return v_purchase;
end; $$;

create or replace function public.reverse_marketplace_purchase(p_payment_intent_id text,p_charge_id text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_purchase uuid; v_status text:=case when p_reason='chargeback' then 'chargeback' else 'refunded' end;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  update public.marketplace_purchases set status=v_status,revoked_at=now() where status='active' and ((p_payment_intent_id is not null and stripe_payment_intent_id=p_payment_intent_id) or (p_charge_id is not null and stripe_charge_id=p_charge_id)) returning id into v_purchase;
  if v_purchase is not null then update public.marketplace_author_earnings set status='reversed',reversed_at=now(),reversal_reason=p_reason where purchase_id=v_purchase and status<>'reversed'; end if;
end; $$;

create or replace function public.get_author_marketplace_dashboard()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'profile',(select to_jsonb(ap) - 'user_id' from public.author_profiles ap where ap.user_id=auth.uid()),
    'listings',coalesce((select jsonb_agg(jsonb_build_object('story_id',cs.story_id,'slug',cs.public_slug,'title',s.title,'status',cs.status,'enabled',cs.marketplace_sales_enabled,'is_paid',cs.marketplace_enabled,'price_cents',cs.price_cents,'description',cs.marketplace_description,'preview_page_count',cs.preview_page_count,'author_earnings_cents',cs.author_earnings_cents)) from public.community_stories cs join public.stories s on s.id=cs.story_id where cs.user_id=auth.uid()),'[]'::jsonb),
    'sales',coalesce((select count(*) from public.marketplace_purchases mp where mp.author_user_id=auth.uid() and mp.status='active'),0),
    'pending_earnings_cents',coalesce((select sum(me.amount_cents) from public.marketplace_author_earnings me where me.author_user_id=auth.uid() and me.status in ('pending','available')),0)
  );
$$;

create or replace function public.update_marketplace_settings(p_default_author_earnings_cents integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  if p_default_author_earnings_cents not between 0 and 5000 then raise exception 'VALUE_INVALID'; end if;
  update public.marketplace_settings set default_author_earnings_cents=p_default_author_earnings_cents,updated_at=now(),updated_by=auth.uid() where id=true;
end; $$;

create or replace function public.get_marketplace_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='owner') then raise exception 'OWNER_REQUIRED'; end if;
  return (select jsonb_build_object('default_author_earnings_cents',ms.default_author_earnings_cents,'updated_at',ms.updated_at) from public.marketplace_settings ms where ms.id=true);
end; $$;

revoke all on function public.configure_marketplace_listing(uuid,boolean,integer,text,integer),public.claim_marketplace_checkout(text,uuid),public.complete_marketplace_checkout_request(uuid,text,boolean),public.record_marketplace_purchase(text,text,text,uuid,uuid,integer,text),public.reverse_marketplace_purchase(text,text,text),public.get_author_marketplace_dashboard(),public.update_marketplace_settings(integer),public.get_marketplace_settings() from public,anon,authenticated;
grant execute on function public.configure_marketplace_listing(uuid,boolean,integer,text,integer),public.claim_marketplace_checkout(text,uuid),public.get_author_marketplace_dashboard() to authenticated;
grant execute on function public.complete_marketplace_checkout_request(uuid,text,boolean),public.record_marketplace_purchase(text,text,text,uuid,uuid,integer,text),public.reverse_marketplace_purchase(text,text,text) to service_role;
grant execute on function public.update_marketplace_settings(integer),public.get_marketplace_settings() to authenticated;

comment on table public.marketplace_purchases is 'Server-authoritative digital book access granted only by verified Stripe webhooks.';
comment on table public.marketplace_author_earnings is 'Author earnings ledger, separate from affiliate commissions. No payout authority is implemented.';
