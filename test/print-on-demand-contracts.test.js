import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePrintPrice, canTransitionPrintOrder, effectiveDpi, PRINT_PROFILES } from '../src/lib/printRules.js';
import { PrintProviderAdapter, PrintProviderError, assertFulfillmentAuthorized, registerPrintProvider, submitAuthorizedPrintOrder, withPrintProviderRetry } from '../src/lib/printProviders.js';

const read=(path)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20260823000000_print_fulfillment_foundation.sql');
const pdf=read('src/lib/printProduction.js');
const app=read('src/App.jsx');

test('print validation calculates effective DPI at selected trim plus bleed',()=>{
  const dpi=effectiveDpi(2625,2625,PRINT_PROFILES['square-8-5']);
  assert.ok(dpi>299&&dpi<301);
  assert.equal(PRINT_PROFILES['square-8-5'].bleedIn,.125);
  assert.equal(PRINT_PROFILES['square-8-5'].targetDpi,300);
});

test('quote math itemizes every platform cost without hardcoded prices',()=>{
  const quote=calculatePrintPrice({printingCents:500,shippingCents:400,stripeFeeCents:75,taxCents:80,platformMarginCents:200,authorRoyaltyCents:100,currency:'usd'});
  assert.equal(quote.totalCents,1355);assert.equal(quote.isEstimate,true);
  assert.throws(()=>calculatePrintPrice({printingCents:-1}),/non-negative integer/);
});

test('order transitions reject invalid jumps and model cancellation, refund, and reprint paths',()=>{
  assert.equal(canTransitionPrintOrder('fulfillment_authorized','submitted'),true);
  assert.equal(canTransitionPrintOrder('fulfillment_authorized','shipped'),false);
  assert.equal(canTransitionPrintOrder('submitted','cancel_requested'),true);
  assert.equal(canTransitionPrintOrder('failed','refunded'),true);
  assert.equal(canTransitionPrintOrder('shipped','reprint_requested'),true);
});

test('provider submission requires payment, authorization, and idempotency',async()=>{
  assert.throws(()=>assertFulfillmentAuthorized({payment_status:'unpaid'}),/Confirmed payment/);
  assert.throws(()=>assertFulfillmentAuthorized({payment_status:'paid',fulfillment_status:'submitted',idempotency_key:'x'}),/not authorized/);
  class MockProvider extends PrintProviderAdapter{constructor(){super('mock');}async submitOrder(order,options){return {orderId:order.id,key:options.idempotencyKey};}}
  registerPrintProvider(new MockProvider());
  assert.deepEqual(await submitAuthorizedPrintOrder({id:'order-1',provider_key:'mock',payment_status:'paid',fulfillment_status:'fulfillment_authorized',idempotency_key:'same-key'}),{orderId:'order-1',key:'same-key'});
});

test('provider retries are bounded and retry only explicitly retryable failures',async()=>{
  let attempts=0;const result=await withPrintProviderRetry(async()=>{attempts+=1;if(attempts===1)throw new PrintProviderError('TEMPORARY','Try again',{retryable:true});return 'ok';});
  assert.equal(result,'ok');assert.equal(attempts,2);
  await assert.rejects(()=>withPrintProviderRetry(async()=>{throw new PrintProviderError('INVALID','No retry');}),/No retry/);
});

test('database fulfillment records are owner-readable but service-written',()=>{
  assert.match(migration,/alter table public\.print_orders enable row level security/);
  assert.match(migration,/Buyers read own print orders/);
  assert.match(migration,/revoke all on public\.print_product_specs,public\.print_quotes,public\.print_orders,public\.print_order_events/);
  assert.doesNotMatch(migration,/grant (insert|update|delete).*authenticated/);
  assert.match(migration,/auth\.role\(\)<>'service_role'/);
});

test('confirmed payment and confirmed quote are mandatory before fulfillment',()=>{
  assert.match(migration,/not pq\.is_estimate/);
  assert.match(migration,/CONFIRMED_QUOTE_REQUIRED/);
  assert.match(migration,/payment_status<>'paid'/);
  assert.match(migration,/PAID_PROVIDER_ORDER_REQUIRED/);
  assert.match(migration,/unique\(buyer_user_id,request_id\)/);
  assert.match(migration,/payment_reference text not null unique/);
  assert.match(migration,/provider_event_id text unique/);
  assert.match(migration,/p_to_status='refunded' then 'refunded'/);
});

test('print preparation remains owner-scoped and supports personalized owner copies',()=>{
  assert.match(app,/ProtectedRoute[\s\S]*\/story\/:id\/print/);
  assert.match(migration,/print_quotes_story_owner_fk/);
  assert.match(migration,/references public\.stories\(user_id,id\)/);
  assert.match(pdf,/download\(STORAGE_BUCKETS\.STORY_IMAGES,page\.image_path\)/);
  assert.doesNotMatch(pdf,/fetch\(/);
});

test('proof export is never falsely named provider-ready and requires wrap cover template',()=>{
  assert.match(pdf,/PRINT-PROOF-NOT-PROVIDER-READY/);
  assert.match(pdf,/WRAP_COVER_MISSING/);
  assert.match(pdf,/PROVIDER_TEMPLATE_REQUIRED/);
  assert.match(pdf,/printReady:issues\.every/);
});

test('existing screen PDF remains separate and unchanged by print proof workflow',()=>{
  const existing=read('src/lib/storyPdf.js');
  assert.match(existing,/format: 'a4'/);
  assert.match(existing,/pdf\.save/);
  assert.doesNotMatch(existing,/PRINT-PROOF/);
});
