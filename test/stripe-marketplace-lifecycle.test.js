import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20260824000000_stripe_marketplace_payment_lifecycle.sql');
const personalization=read('supabase/migrations/20260822000000_marketplace_personalization.sql');
const webhook=read('supabase/functions/stripe-webhook/index.ts');
const checkout=read('supabase/functions/marketplace-checkout/index.ts');
const shared=read('supabase/functions/_shared/billing.ts');

test('verified Charge and PaymentIntent identifiers are persisted server-side',()=>{
  assert.match(migration,/marketplace_purchase_charge_unique_idx/);
  assert.match(migration,/PAYMENT_INTENT_REQUIRED/);
  assert.match(migration,/stripe_payment_intent_id=coalesce/);
  assert.match(migration,/stripe_charge_id=coalesce/);
  assert.match(webhook,/payment_intents\/\$\{encodeURIComponent\(paymentIntentId\)\}/);
  assert.match(webhook,/latest_charge/);
  assert.doesNotMatch(checkout,/payment_intent|charge_id/);
});

test('charge-only disputes resolve the trusted Charge object before exact revocation',()=>{
  assert.match(webhook,/charges\/\$\{encodeURIComponent\(chargeId\)\}/);
  assert.match(webhook,/charge\.dispute\.created/);
  assert.match(webhook,/recordPaymentRisk\(event\.id,event\.data\?\.object\?\.charge,'chargeback',true\)/);
  assert.match(migration,/PAYMENT_IDENTIFIER_CONFLICT/);
  assert.match(migration,/mp\.stripe_payment_intent_id=p_payment_intent_id/);
  assert.match(migration,/mp\.stripe_charge_id=p_charge_id/);
});

test('risk events revoke only the matched purchase and dependent edition access',()=>{
  assert.match(migration,/where id=v_purchase_ids\[1\]/);
  assert.match(migration,/marketplace_author_earnings set status='reversed'/);
  assert.match(personalization,/mp\.id=mpe\.qualifying_purchase_id[\s\S]*mp\.status='active'/);
  assert.doesNotMatch(migration,/delete from public\.marketplace_personalized_editions/);
});

test('out-of-order and duplicate risks remain authoritative and idempotent',()=>{
  assert.match(migration,/stripe_event_id text not null unique/);
  assert.match(migration,/on conflict\(stripe_event_id\) do update set stripe_event_id=excluded\.stripe_event_id/);
  assert.match(migration,/select spre\.\* into v_risk from public\.stripe_payment_risk_events/);
  assert.match(migration,/status=case v_risk\.risk_kind/);
  assert.match(webhook,/claim_stripe_webhook_event/);
  assert.match(webhook,/duplicate: true/);
});

test('asynchronous Checkout grants only paid marketplace sessions',()=>{
  assert.match(webhook,/checkout\.session\.async_payment_succeeded/);
  assert.match(webhook,/checkout\.session\.async_payment_failed/);
  assert.match(webhook,/if \(session\.payment_status !== 'paid'\) return false/);
  assert.match(webhook,/failMarketplaceCheckout/);
  assert.doesNotMatch(checkout,/payment_method_types/);
});

test('failed invoices resync authoritative subscriptions and fraud warnings target exact payments',()=>{
  assert.match(webhook,/invoice\.payment_failed/);
  assert.match(webhook,/subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}/);
  assert.match(webhook,/await syncSubscription\(subscription\)/);
  assert.match(webhook,/radar\.early_fraud_warning\.created/);
  assert.match(webhook,/'fraud_warning',true/);
  assert.match(migration,/risk_kind in \('refund','chargeback','fraud_warning'\)/);
});

test('risk and financial state remain service-only while checkout remains authenticated',()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on public\.stripe_payment_risk_events from public,anon,authenticated/);
  assert.match(migration,/auth\.role\(\)<>'service_role'/);
  assert.ok(checkout.indexOf('await authenticate(request)') < checkout.indexOf("stripe('checkout/sessions'"));
  assert.match(shared,/export async function stripeGet/);
  assert.doesNotMatch(shared,/console\.log\([^\n]*STRIPE_KEY/);
});

test('affiliate commissions consult out-of-order risk without changing subscription authority',()=>{
  assert.match(migration,/create or replace function public\.record_affiliate_conversion/);
  assert.match(migration,/spre\.stripe_charge_id=p_stripe_charge_id/);
  assert.match(migration,/reversed_amount_cents=greatest/);
  assert.doesNotMatch(webhook,/invoice\.payment_failed[\s\S]{0,120}record_affiliate_conversion/);
});
