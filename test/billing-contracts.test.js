import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260809000000_stripe_billing_entitlements.sql');
const checkout = read('supabase/functions/billing-checkout/index.ts');
const portal = read('supabase/functions/billing-portal/index.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const shared = read('supabase/functions/_shared/billing.ts');
const edge = read('supabase/functions/story-ai/index.ts');

test('Checkout authenticates and maps plan keys instead of accepting prices', () => {
  assert.ok(checkout.indexOf('await authenticate(request)') < checkout.indexOf("stripe('checkout/sessions'"));
  assert.match(checkout, /typeof body\.plan_key !== 'string'/);
  assert.match(checkout, /Object\.keys\(body\)\.some\(\(key\) => key !== 'plan_key'\)/);
  assert.doesNotMatch(checkout, /body\.(price|price_id|stripe_price_id|customer)/);
  assert.match(checkout, /billing_plans/);
  assert.match(checkout, /\.in\('status', \['active','trialing'\]\)/);
  assert.match(checkout, /USE_PORTAL/);
});

test('Portal uses only the authenticated user customer mapping', () => {
  assert.match(portal, /await authenticate\(request\)/);
  assert.match(portal, /\.eq\('user_id', user\.id\)/);
  assert.doesNotMatch(portal, /request\.json|body\.|stripe_customer_id.*body/);
});

test('webhook requires raw-body signature and idempotent event claim', () => {
  assert.match(webhook, /const raw = await request\.text\(\)/);
  assert.match(webhook, /verifyStripeSignature\(raw, request\.headers\.get\('Stripe-Signature'\)/);
  assert.match(shared, /STRIPE_WEBHOOK_SECRET|verifyStripeSignature/);
  assert.match(webhook, /claim_stripe_webhook_event/);
  assert.match(migration, /on conflict\(stripe_event_id\)/);
  assert.match(webhook, /duplicate: true/);
});

test('subscription synchronization covers lifecycle without trusting checkout success', () => {
  for (const event of ['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed']) assert.match(webhook, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(webhook, /Checkout completion is reconciliation only/);
  assert.match(webhook, /status: subscription\.status/);
  assert.match(webhook, /stripe_price_id/);
});

test('plan and operation weights are configurable and cost-sensitive', () => {
  assert.match(migration, /when 6 then 1 when 10 then 2 when 15 then 3 when 24 then 4 when 30 then 5/);
  assert.match(migration, /when 3 then 1 when 5 then 1 when 10 then 2/);
  for (const operation of ['generate-character-image','generate-page-image-initial','generate-page-image-repaint','generate-cover']) assert.match(migration, new RegExp(operation));
  assert.match(edge, /existingPage\.data\?\.image_path \? 'generate-page-image-repaint' : 'generate-page-image-initial'/);
});

test('reservation is serialized, finalized on success, and released on failure', () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_used \+ v_amount > v_limit/);
  assert.match(migration, /status='consumed'/);
  assert.match(migration, /status='released'/);
  assert.ok(edge.indexOf('assertAiEntitlement') < edge.indexOf('structured(storyPrompt'));
  assert.ok(edge.indexOf('releaseAiEntitlement') < edge.indexOf('safeError(caught)'));
});

test('browser billing service exposes no Stripe authority or secrets', () => {
  const browser = [read('src/services/billing.js'),read('src/pages/Pricing.jsx'),read('src/pages/Billing.jsx')].join('\n');
  assert.doesNotMatch(browser, /STRIPE_SECRET|STRIPE_WEBHOOK|sk_test_|sk_live_|stripe_price_id|stripe_customer_id|stripe_subscription_id/);
  assert.match(browser, /get_billing_summary/);
  assert.match(browser, /billing-checkout/);
  assert.match(browser, /billing-portal/);
});
