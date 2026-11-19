-- Provider-neutral print quoting and fulfillment ledger.
-- No provider credentials, shipping addresses, payment authority, or automatic submission are introduced.

create table public.print_product_specs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null check (provider_key ~ '^[a-z0-9_-]{2,40}$'),
  provider_product_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  trim_width_microns integer not null check (trim_width_microns > 0),
  trim_height_microns integer not null check (trim_height_microns > 0),
  binding text not null check (binding in ('paperback','hardcover','saddle_stitch','spiral')),
  minimum_pages integer not null check (minimum_pages > 0),
  maximum_pages integer not null check (maximum_pages >= minimum_pages),
  specifications jsonb not null default '{}'::jsonb check (jsonb_typeof(specifications)='object'),
  active boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_key,provider_product_id),
  check (not active or verified_at is not null)
);

create table public.print_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  story_id uuid not null,
  product_spec_id uuid not null references public.print_product_specs(id),
  provider_key text not null,
  provider_quote_id text,
  quantity integer not null check (quantity between 1 and 100),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  printing_cents integer not null check (printing_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  stripe_fee_cents integer not null check (stripe_fee_cents >= 0),
  tax_cents integer not null check (tax_cents >= 0),
  platform_margin_cents integer not null check (platform_margin_cents >= 0),
  author_royalty_cents integer not null check (author_royalty_cents >= 0),
  total_cents integer generated always as (printing_cents+shipping_cents+stripe_fee_cents+tax_cents+platform_margin_cents+author_royalty_cents) stored,
  is_estimate boolean not null default true,
  quote_snapshot jsonb not null check (jsonb_typeof(quote_snapshot)='object'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(buyer_user_id,request_id),
  constraint print_quotes_story_owner_fk foreign key (buyer_user_id,story_id)
    references public.stories(user_id,id) on delete cascade
);

create table public.print_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.profiles(id) on delete restrict,
  story_id uuid not null,
  quote_id uuid not null unique references public.print_quotes(id) on delete restrict,
  payment_reference text not null unique,
  provider_key text not null,
  provider_order_id text unique,
  provider_fulfillment_id text,
  quantity integer not null check (quantity between 1 and 100),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  total_cents integer not null check (total_cents >= 0),
  payment_status text not null check (payment_status in ('paid','refunded','partially_refunded','disputed')),
  fulfillment_status text not null default 'fulfillment_authorized' check (fulfillment_status in ('fulfillment_authorized','submitted','in_production','printed','shipped','delivered','cancel_requested','cancelled','failed','reprint_requested','refunded')),
  tracking_number text,
  tracking_url text,
  carrier text,
  last_error_code text,
  last_error_message text,
  submitted_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_orders_story_owner_fk foreign key (buyer_user_id,story_id)
    references public.stories(user_id,id) on delete restrict
);

create table public.print_order_events (
  id uuid primary key default gen_random_uuid(),
  print_order_id uuid not null references public.print_orders(id) on delete cascade,
  provider_event_id text unique,
  from_status text,
  to_status text not null,
  event_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object'),
  created_at timestamptz not null default now()
);

create index print_quotes_buyer_created_idx on public.print_quotes(buyer_user_id,created_at desc);
create index print_orders_buyer_created_idx on public.print_orders(buyer_user_id,created_at desc);
create index print_order_events_order_created_idx on public.print_order_events(print_order_id,created_at);

create trigger print_product_specs_set_updated_at before update on public.print_product_specs for each row execute function public.set_updated_at();
create trigger print_orders_set_updated_at before update on public.print_orders for each row execute function public.set_updated_at();

alter table public.print_product_specs enable row level security;
alter table public.print_quotes enable row level security;
alter table public.print_orders enable row level security;
alter table public.print_order_events enable row level security;
revoke all on public.print_product_specs,public.print_quotes,public.print_orders,public.print_order_events from public,anon,authenticated;
grant select on public.print_quotes,public.print_orders,public.print_order_events to authenticated;

create policy "Buyers read own print quotes" on public.print_quotes for select to authenticated
using ((select auth.uid())=buyer_user_id);
create policy "Buyers read own print orders" on public.print_orders for select to authenticated
using ((select auth.uid())=buyer_user_id);
create policy "Buyers read own print order events" on public.print_order_events for select to authenticated
using (exists(select 1 from public.print_orders po where po.id=print_order_id and po.buyer_user_id=(select auth.uid())));

create or replace function public.record_paid_print_order(
  p_quote_id uuid,p_buyer_user_id uuid,p_payment_reference text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_quote public.print_quotes; v_order_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select pq.* into v_quote from public.print_quotes pq where pq.id=p_quote_id and pq.buyer_user_id=p_buyer_user_id and pq.expires_at>now() and not pq.is_estimate for update;
  if not found then raise exception 'CONFIRMED_QUOTE_REQUIRED'; end if;
  insert into public.print_orders(buyer_user_id,story_id,quote_id,payment_reference,provider_key,quantity,currency,total_cents,payment_status,fulfillment_status)
  values(v_quote.buyer_user_id,v_quote.story_id,v_quote.id,p_payment_reference,v_quote.provider_key,v_quote.quantity,v_quote.currency,v_quote.total_cents,'paid','fulfillment_authorized')
  on conflict(payment_reference) do update set payment_reference=excluded.payment_reference
  returning id into v_order_id;
  insert into public.print_order_events(print_order_id,to_status,event_type,safe_metadata)
  values(v_order_id,'fulfillment_authorized','payment_confirmed',jsonb_build_object('quote_id',v_quote.id)) on conflict do nothing;
  return v_order_id;
end; $$;

create or replace function public.transition_print_order(
  p_order_id uuid,p_to_status text,p_provider_event_id text default null,p_provider_order_id text default null,
  p_tracking_number text default null,p_tracking_url text default null,p_carrier text default null,p_safe_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_order public.print_orders; v_allowed boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_provider_event_id is not null and exists(select 1 from public.print_order_events where provider_event_id=p_provider_event_id) then return; end if;
  select po.* into v_order from public.print_orders po where po.id=p_order_id for update;
  if not found then raise exception 'PRINT_ORDER_NOT_FOUND'; end if;
  v_allowed:=case v_order.fulfillment_status
    when 'fulfillment_authorized' then p_to_status in ('submitted','cancelled','refunded')
    when 'submitted' then p_to_status in ('in_production','failed','cancel_requested')
    when 'in_production' then p_to_status in ('printed','failed','reprint_requested')
    when 'printed' then p_to_status in ('shipped','reprint_requested')
    when 'shipped' then p_to_status in ('delivered','reprint_requested')
    when 'failed' then p_to_status in ('fulfillment_authorized','refunded')
    when 'cancel_requested' then p_to_status in ('cancelled','in_production')
    when 'reprint_requested' then p_to_status in ('in_production','refunded')
    else false end;
  if not v_allowed then raise exception 'INVALID_PRINT_ORDER_TRANSITION'; end if;
  if p_to_status='submitted' and (v_order.payment_status<>'paid' or p_provider_order_id is null) then raise exception 'PAID_PROVIDER_ORDER_REQUIRED'; end if;
  update public.print_orders set fulfillment_status=p_to_status,
    payment_status=case when p_to_status='refunded' then 'refunded' else payment_status end,
    provider_order_id=coalesce(p_provider_order_id,provider_order_id),tracking_number=coalesce(p_tracking_number,tracking_number),
    tracking_url=coalesce(p_tracking_url,tracking_url),carrier=coalesce(p_carrier,carrier),
    submitted_at=case when p_to_status='submitted' then now() else submitted_at end,
    shipped_at=case when p_to_status='shipped' then now() else shipped_at end
  where id=p_order_id;
  insert into public.print_order_events(print_order_id,provider_event_id,from_status,to_status,event_type,safe_metadata)
  values(p_order_id,p_provider_event_id,v_order.fulfillment_status,p_to_status,'status_transition',coalesce(p_safe_metadata,'{}'::jsonb));
end; $$;

revoke all on function public.record_paid_print_order(uuid,uuid,text),public.transition_print_order(uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_paid_print_order(uuid,uuid,text),public.transition_print_order(uuid,text,text,text,text,text,text,jsonb) to service_role;

comment on table public.print_product_specs is 'Provider products must be verified before activation; no provider or price is assumed.';
comment on table public.print_quotes is 'Immutable server-created cost snapshots. Estimates cannot authorize payment or fulfillment.';
comment on table public.print_orders is 'Created only after confirmed payment; provider submission requires explicit fulfillment authorization.';
