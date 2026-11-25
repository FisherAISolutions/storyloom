import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=(path)=>readFileSync(resolve(root,path),'utf8');
const sql=read('supabase/migrations/20260826000000_marketplace_affiliate_payout_completion.sql');
const webhook=read('supabase/functions/stripe-webhook/index.ts');
const checkout=read('supabase/functions/marketplace-checkout/index.ts');
const connect=read('supabase/functions/seller-connect/index.ts');
const payout=read('supabase/functions/payout-transfer/index.ts');

test('commercial features default to independent server-side disabled controls',()=>{
  for(const setting of ['paid_selling_enabled','author_payouts_enabled','affiliate_commissions_enabled','customer_referrals_enabled','affiliate_payouts_enabled'])assert.match(sql,new RegExp(`${setting} boolean not null default false`));
  assert.match(checkout,/paid_selling_enabled/);
  assert.match(payout,/STRIPE_CONNECT_TEST_MODE_ENABLED/);
});

test('seller onboarding uses hosted Connect with eligibility and policy gates',()=>{
  assert.match(connect,/dashboard: 'express'/);
  assert.match(connect,/fees_collector: 'application'/);
  assert.match(connect,/losses_collector: 'application'/);
  assert.match(connect,/stripe_transfers/);
  assert.match(connect,/policy_acceptances/);
  assert.match(sql,/SELLER_ONBOARDING_REQUIRED/);
});

test('author economics snapshot 80 percent of net after fees and tax',()=>{
  assert.match(sql,/author_share_bps integer not null default 8000/);
  assert.match(sql,/eligible_net_cents/);
  assert.match(sql,/processing_fee_cents/);
  assert.match(sql,/tax_amount_cents/);
  assert.match(sql,/platform_amount_cents/);
  assert.match(sql,/unique\(source_type,source_id\)/);
});

test('affiliate commissions are recurring, tax-exclusive, bounded, and idempotent',()=>{
  assert.match(sql,/affiliate_default_commission_bps integer not null default 1500/);
  assert.match(sql,/affiliate_recurring_months integer not null default 12/);
  assert.match(sql,/v_eligible:=greatest\(p_gross_amount_cents-p_tax_amount_cents,0\)/);
  assert.match(sql,/on conflict\(stripe_invoice_id\)/);
  assert.match(webhook,/record_affiliate_subscription_commission/);
  assert.match(webhook,/\.in\('plan_key', \['family','creator'\]\)/);
});

test('customer referral rewards do not stack and consumed reversals create debt',()=>{
  assert.match(sql,/exists\(select 1 from public\.affiliate_referrals where referred_user_id=p_referred_user_id\)/);
  assert.match(sql,/referrer_story_units integer not null default 2/);
  assert.match(sql,/referrer_image_units integer not null default 15/);
  assert.match(sql,/referred_story_units integer not null default 1/);
  assert.match(sql,/referred_image_units integer not null default 5/);
  assert.match(sql,/case when v_consumed then 'debt' else 'reversed' end/);
  assert.match(webhook,/reverse_customer_referral_rewards/);
});

test('payout ledger keeps approval, transfer, and bank payout concepts separate',()=>{
  assert.match(sql,/status text not null default 'draft'/);
  assert.match(sql,/stripe_transfer_id text unique/);
  assert.match(sql,/stripe_payout_id text/);
  assert.match(sql,/idempotency_key uuid not null unique/);
  assert.match(payout,/author-payout:/);
  assert.doesNotMatch(payout,/stripe\(['"]payouts['"]/);
});

test('new financial tables are RLS protected with browser grants revoked',()=>{
  for(const table of ['growth_program_settings','seller_accounts','financial_payouts','financial_payout_items','customer_referral_accounts','customer_referrals','customer_referral_rewards','policy_acceptances','financial_admin_flags'])assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql,/revoke all on public\.growth_program_settings/);
  assert.match(sql,/SERVICE_ROLE_REQUIRED/);
  assert.match(sql,/OWNER_REQUIRED/);
});
