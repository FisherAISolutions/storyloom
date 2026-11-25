import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=(path)=>readFileSync(resolve(root,path),'utf8');
const catalog=read('supabase/migrations/20260825000000_launch_pricing_credit_packs.sql');
const credits=read('supabase/migrations/20260825010000_credit_reservations_and_reliability.sql');
const periodFix=read('supabase/migrations/20260825020000_fix_entitlement_period_aliases.sql');
const amountFix=read('supabase/migrations/20260825030000_fix_entitlement_usage_amount_qualification.sql');
const webhook=read('supabase/functions/stripe-webhook/index.ts');
const ai=read('supabase/functions/story-ai/index.ts');
const checkout=read('supabase/functions/credit-checkout/index.ts');

test('credit products are server-priced, non-expiring, and Starter is limited once per account',()=>{
  for(const product of ['starter','credits_small','credits_medium','credits_large'])assert.match(catalog,new RegExp(`'${product}'`));
  assert.match(catalog,/starter_once_per_account_idx/);
  assert.match(catalog,/stripe_price_id text unique/);
  assert.match(catalog,/Non-expiring purchased balances/);
  assert.match(checkout,/claim_credit_checkout/);
  assert.doesNotMatch(checkout,/body\.(price|amount|stripe_price_id)/);
});

test('monthly allowances are consumed before permanent purchased credits and failures restore their source',()=>{
  assert.ok(credits.indexOf('v_monthly:=least')<credits.indexOf('for v_grant in select'));
  assert.match(credits,/purchased_credit_reservations/);
  assert.match(credits,/status='released'/);
  assert.match(credits,/remaining_story_units=remaining_story_units\+case/);
});

test('subscription periods are explicitly normalized while monthly credits remain ahead of purchased grants',()=>{
  assert.match(periodFix,/s\.current_period_start as period_start,s\.current_period_end as period_end/);
  assert.match(periodFix,/v_start:=v_selected\.period_start;v_end:=v_selected\.period_end/);
  assert.ok(periodFix.indexOf('v_monthly:=least')<periodFix.indexOf('for v_grant in select'));
  assert.match(periodFix,/purchased_credit_reservations/);
  assert.match(periodFix,/security definer set search_path=''/);
  assert.match(periodFix,/revoke all on function public\.reserve_ai_entitlement_customer/);
});

test('entitlement usage aggregate explicitly qualifies the amount output-variable conflict',()=>{
  assert.match(amountFix,/eu\.monthly_amount>0 then eu\.monthly_amount/);
  assert.match(amountFix,/then eu\.amount else 0/);
  assert.match(amountFix,/eu\.billing_period_start=v_start/);
  assert.match(amountFix,/security definer set search_path=''/);
  assert.match(amountFix,/revoke all on function public\.reserve_ai_entitlement_customer/);
});

test('refunds, disputes, async payments, duplicate events, and out-of-order risk are handled server-side',()=>{
  assert.match(catalog,/unrecovered_story_units=purchased_story_units-remaining_story_units/);
  assert.match(catalog,/stripe_payment_risk_events[\s\S]*reverse_credit_purchase/);
  for(const event of ['checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','charge.refunded','charge.dispute.created'])assert.match(webhook,new RegExp(event.replaceAll('.','\\.')));
  assert.match(webhook,/claim_stripe_webhook_event/);
  assert.match(webhook,/session\.payment_status!=='paid'/);
});

test('feature entitlements and marketplace economics remain authoritative',()=>{
  assert.match(catalog,/has_billing_feature/);
  assert.match(catalog,/CREATOR_PLAN_REQUIRED/);
  assert.match(catalog,/PERSONALIZATION_PLAN_REQUIRED/);
  assert.match(catalog,/author_share_bps integer not null default 8000/);
  assert.match(catalog,/greatest\(p_amount_cents-p_processing_fee_cents-p_tax_cents,0\)\*v_bps\/10000\.0/);
});

test('provider completion is durable before storage and can be reconciled without duplicate generation',()=>{
  assert.match(ai,/provider_completed/);
  assert.ok(ai.indexOf("finishImageGeneration(correlationId, 'provider_completed'")<ai.indexOf("uploadImage(client, 'story-images'"));
  assert.match(ai,/GENERATION_RECONCILIATION_REQUIRED/);
  assert.match(credits,/reconcile_provider_completed_generation/);
  assert.match(ai,/entitlement finalization is pending reconciliation|finalizeAiEntitlement/);
});

test('lightweight AI operations have disclosed durable deductions',()=>{
  assert.match(credits,/analyze-character'[\s\S]*v_bucket:='image'/);
  assert.match(credits,/suggest-continuation','translate-story'[\s\S]*v_bucket:='story'/);
});
