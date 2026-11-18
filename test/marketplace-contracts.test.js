import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20260821000000_community_marketplace.sql');
const publicFn=read('supabase/functions/community-public/index.ts');
const checkout=read('supabase/functions/marketplace-checkout/index.ts');
const webhook=read('supabase/functions/stripe-webhook/index.ts');

test('marketplace extends Community Shelf without replacing free publishing',()=>{
  assert.match(migration,/alter table public\.community_stories/);
  assert.match(migration,/marketplace_enabled boolean not null default false/);
  assert.match(publicFn,/fullAccess=!share\.marketplace_enabled/);
});

test('paid full-book delivery requires ownership or an active webhook-granted purchase',()=>{
  assert.match(publicFn,/buyer_user_id.*status','active'/s);
  assert.match(publicFn,/pageQuery=pageQuery\.limit\(share\.preview_page_count\)/);
  assert.doesNotMatch(publicFn,/from\('marketplace_purchases'\)\.insert/);
  assert.match(webhook,/record_marketplace_purchase/);
});

test('listing configuration is owner-bound and protected from direct field edits',()=>{
  assert.match(migration,/cs\.user_id=v_user/);
  assert.match(migration,/protect_community_marketplace_fields/);
  assert.match(migration,/AUTHOR_PROFILE_REQUIRED/);
  assert.match(migration,/SELF_PURCHASE/);
});

test('Checkout is authenticated, server-priced, capability-bounded, and idempotent',()=>{
  assert.ok(checkout.indexOf('await authenticate(request)') < checkout.indexOf("stripe('checkout/sessions'"));
  assert.match(checkout,/price_cents/);
  assert.doesNotMatch(checkout,/body\.(price|amount|currency|author)/);
  assert.match(checkout,/Idempotency|marketplace:\$\{user\.id\}/);
  assert.match(migration,/marketplace_one_pending_checkout_idx/);
});

test('author earnings remain separate from affiliate commissions and payouts are disabled',()=>{
  assert.match(migration,/create table public\.marketplace_author_earnings/);
  assert.match(migration,/default_author_earnings_cents integer not null default 500/);
  assert.doesNotMatch(migration,/stripe_connect|transfer_id|payout_id|automatic_payout/i);
  assert.match(webhook,/reverse_marketplace_purchase/);
  assert.match(webhook,/reverseAffiliate|reverseCommission/);
});

test('financial writes are service-only and buyer access is revoked on refunds or chargebacks',()=>{
  assert.match(migration,/revoke all on public\.author_profiles,public\.marketplace_settings,public\.marketplace_checkout_requests,public\.marketplace_purchases,public\.marketplace_author_earnings/);
  assert.match(migration,/auth\.role\(\)<>'service_role'/);
  assert.match(migration,/status=v_status,revoked_at=now\(\)/);
  assert.match(migration,/status='reversed'/);
});
