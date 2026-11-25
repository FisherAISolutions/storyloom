# Stripe sandbox catalog cutover

Status: catalog copied and verified on November 25, 2026. The steps below are prepared only; no Supabase mapping, secret, webhook, function, or commercial-feature change has been applied.

## Verified catalog

The source-to-target object mapping is recorded in `STRIPE_SANDBOX_PRICE_MAPPING.json`. All six target Prices are USD, test-mode, active, and retain the source tax behavior, metadata, and billing interval. Product names, descriptions, images, metadata, and supported presentation fields were compared with the source. Re-running `scripts/stripe/migrate-sandbox-catalog.ps1 -Apply` verified the existing objects without creating duplicates.

## Supabase mapping update (staging only)

Apply only after the staging Edge Functions use the target sandbox key and the target webhook destinations are ready. Do not run this against production.

```sql
begin;

update public.billing_plans
set stripe_price_id = case plan_key
  when 'family' then 'price_1Ufj9KH8FszCF9JP82pNs3s4'
  when 'creator' then 'price_1Ufj9MH8FszCF9JPMkzYw0kd'
  else stripe_price_id
end
where plan_key in ('family', 'creator');

update public.credit_products
set stripe_price_id = case product_key
  when 'starter' then 'price_1Ufj9IH8FszCF9JPG6vFXk5u'
  when 'credits_small' then 'price_1Ufj9PH8FszCF9JPVfrhDyqF'
  when 'credits_medium' then 'price_1Ufj9RH8FszCF9JPLokwoc22'
  when 'credits_large' then 'price_1Ufj9TH8FszCF9JPkqN9Frn2'
  else stripe_price_id
end
where product_key in ('starter', 'credits_small', 'credits_medium', 'credits_large');

do $$
begin
  if (select count(*) from public.billing_plans where plan_key in ('family','creator') and stripe_price_id like 'price_%') <> 2 then
    raise exception 'PLAN_PRICE_MAPPING_INCOMPLETE';
  end if;
  if (select count(*) from public.credit_products where product_key in ('starter','credits_small','credits_medium','credits_large') and stripe_price_id like 'price_%') <> 4 then
    raise exception 'CREDIT_PRICE_MAPPING_INCOMPLETE';
  end if;
end;
$$;

commit;
```

This changes only external Stripe identifiers. Story allowances, illustration credits, page limits, one-time-purchase restrictions, subscription requirements, affiliate rules, referral rewards, and entitlement functions remain unchanged.

## Webhook destinations

Point each destination to the staging `stripe-webhook` Edge Function and keep each signing secret separate.

1. **Your account snapshot destination** (`STRIPE_WEBHOOK_SECRET`):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
   - `radar.early_fraud_warning.created`
   - `transfer.created`
   - `transfer.reversed`
2. **Connected accounts snapshot destination** (`STRIPE_CONNECT_WEBHOOK_SECRET`): `account.updated`.
3. **Accounts v2 thin-event destination** (`STRIPE_THIN_WEBHOOK_SECRET`):
   - `v2.core.account.created`
   - `v2.core.account.updated`
   - `v2.core.account.closed`
   - `v2.core.account[requirements].updated`
   - `v2.core.account[configuration.recipient].updated`
   - `v2.core.account[configuration.recipient].capability_status_updated`

Verify signatures with the destination-specific secret. Do not reuse signing secrets from the original account.

## Customer and subscription reconciliation

Stripe customer and subscription IDs are account-scoped and cannot be copied. Read-only inspection found one Customer and no Subscriptions in the source account, and two Customers and one Subscription already in the target sandbox.

Before switching a staging Supabase environment to the target key:

1. Snapshot staging `stripe_customers` and `subscriptions` rows.
2. Identify rows whose Stripe IDs belong to `acct_1S5NhuHEiMUagmiv`; do not send those IDs to the target API.
3. For synthetic staging users, remove stale source-account customer mappings through an approved staging-only reconciliation so `customerFor` creates a new target Customer on the next checkout.
4. Do not copy source Subscription IDs. Create new target test subscriptions through Checkout and let verified target webhooks populate authoritative subscription rows.
5. Do not modify production customer or subscription mappings during this sandbox cutover.

## Preserved marketplace architecture

This catalog migration does not change Accounts v2 recipient onboarding, separate charges and transfers, the 80% author share of eligible net proceeds, the 30-day earnings hold, affiliate commissions, referral rewards, payout thresholds, or disabled-by-default commercial controls.
