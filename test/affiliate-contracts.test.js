import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260820000000_affiliate_referral_program.sql');
const lifecycleMigration = read('supabase/migrations/20260824000000_stripe_marketplace_payment_lifecycle.sql');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const checkout = read('supabase/functions/billing-checkout/index.ts');
const publicFunction = read('supabase/functions/affiliate-public/index.ts');
const service = read('src/services/affiliates.js');

test('affiliate financial tables are RLS protected and browser writes are revoked', () => {
  for (const table of ['affiliate_accounts','affiliate_clicks','affiliate_referrals','affiliate_commissions']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.affiliate_accounts,public\.affiliate_clicks,public\.affiliate_referrals,public\.affiliate_commissions from public,anon,authenticated/);
  assert.doesNotMatch(service, /\.from\(['"]affiliate_(accounts|clicks|referrals|commissions)/);
});

test('affiliate approval and commission rates are Owner-controlled and audited', () => {
  assert.match(migration, /p\.role='owner'[\s\S]+OWNER_REQUIRED/);
  assert.match(migration, /p_commission_bps not between 0 and 5000/);
  assert.match(migration, /affiliate_reviewed/);
  assert.doesNotMatch(migration, /grant execute on function public\.admin_review_affiliate[\s\S]+to anon/);
});

test('first-touch attribution rejects self-referrals and requires an approved affiliate', () => {
  assert.match(migration, /a\.status='approved'/);
  assert.match(migration, /SELF_REFERRAL_DENIED/);
  assert.match(migration, /referred_user_id uuid not null unique/);
  assert.match(migration, /clicked_at>=now\(\)-interval '30 days'/);
});

test('public click tracking stores only a salted visitor hash and deduplicates bursts', () => {
  assert.match(publicFunction, /AFFILIATE_CLICK_SALT/);
  assert.match(publicFunction, /HMAC/);
  assert.match(publicFunction, /visitor_hash/);
  assert.doesNotMatch(publicFunction, /insert\(\{[^}]*\b(ip|user_agent)\b/);
  assert.match(publicFunction, /60 \* 60_000/);
});

test('Stripe creates and reverses commissions through idempotent webhook processing', () => {
  assert.match(webhook, /claim_stripe_webhook_event/);
  assert.match(webhook, /event\.type === 'invoice\.paid'/);
  assert.match(webhook, /record_affiliate_conversion/);
  assert.match(webhook, /event\.type === 'charge\.refunded'/);
  assert.match(webhook, /event\.type === 'charge\.dispute\.created'/);
  assert.match(webhook, /record_stripe_payment_risk/);
  assert.match(lifecycleMigration, /create or replace function public\.record_affiliate_conversion/);
  assert.match(lifecycleMigration, /stripe_payment_risk_events/);
  assert.match(migration, /stripe_invoice_id text not null unique/);
  assert.match(migration, /auth\.role\(\)<>'service_role'/);
});

test('Checkout derives referral attribution from the authenticated user, not request input', () => {
  assert.match(checkout, /affiliate_referrals/);
  assert.match(checkout, /referred_user_id', user\.id/);
  assert.doesNotMatch(checkout, /body\.(affiliate|referral)/);
  assert.match(checkout, /Object\.keys\(body\).*key !== 'plan_key'/);
});

test('no automated payout path exists', () => {
  assert.doesNotMatch(migration, /stripe_connect|transfer_id|payout_id|automatic_payout/i);
  assert.doesNotMatch(webhook, /transfers|payouts/);
});

