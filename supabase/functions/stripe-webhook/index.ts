import { BillingError, response, safeFailure, service, stripeGet, stripeV2, verifyStripeSignature } from '../_shared/billing.ts';

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const subscriptionEvents = new Set(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed']);
const allowedStatuses = new Set(['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused']);

function timestamp(value: unknown) { return typeof value === 'number' ? new Date(value * 1000).toISOString() : null; }

async function userForCustomer(customerId: string, metadataUserId?: string) {
  const mapped = await service.from('stripe_customers').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
  if (mapped.error) throw new BillingError('DATABASE', 'Customer mapping failed.', 500);
  if (mapped.data) return mapped.data.user_id;
  if (metadataUserId) {
    const saved = await service.from('stripe_customers').insert({ user_id: metadataUserId, stripe_customer_id: customerId });
    if (!saved.error) return metadataUserId;
  }
  throw new BillingError('CUSTOMER_UNMAPPED', 'Stripe customer is not mapped.', 409);
}

async function syncSubscription(subscription: any) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId || !allowedStatuses.has(subscription.status)) throw new BillingError('STRIPE_EVENT_INVALID', 'Subscription payload is invalid.');
  const item = subscription.items?.data?.[0]; const priceId = typeof item?.price === 'string' ? item.price : item?.price?.id;
  const planLookup = await service.from('billing_plans').select('plan_key').eq('stripe_price_id', priceId).maybeSingle();
  if (planLookup.error || !planLookup.data) throw new BillingError('PLAN_UNMAPPED', 'Stripe price is not mapped to a plan.', 409);
  const userId = await userForCustomer(customerId, subscription.metadata?.supabase_user_id);
  const periodStart = timestamp(subscription.current_period_start ?? item?.current_period_start); const periodEnd = timestamp(subscription.current_period_end ?? item?.current_period_end);
  const payload = { user_id: userId, stripe_subscription_id: subscription.id, stripe_customer_id: customerId, stripe_price_id: priceId, plan_key: planLookup.data.plan_key, status: subscription.status, current_period_start: periodStart, current_period_end: periodEnd, cancel_at_period_end: Boolean(subscription.cancel_at_period_end), trial_end: timestamp(subscription.trial_end) };
  const saved = await service.from('subscriptions').upsert(payload, { onConflict: 'stripe_subscription_id' });
  if (saved.error) throw new BillingError('DATABASE', 'Subscription sync failed.', 500);
}

async function recordPaidInvoice(invoice: any) {
  if (!invoice?.id || !Number.isInteger(invoice.amount_paid) || invoice.amount_paid <= 0 || typeof invoice.currency !== 'string') return;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) throw new BillingError('STRIPE_EVENT_INVALID', 'Invoice customer is missing.');
  const userId = await userForCustomer(customerId);
  const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id || null;
  const priceId = objectId(invoice?.lines?.data?.[0]?.pricing?.price_details?.price || invoice?.lines?.data?.[0]?.price);
  if (!priceId) return;
  const plan = await service.from('billing_plans').select('plan_key').eq('stripe_price_id', priceId).in('plan_key', ['family','creator']).maybeSingle();
  if (plan.error) throw new BillingError('DATABASE', 'Invoice plan lookup failed.', 500);
  if (!plan.data) return;
  const taxCents = Array.isArray(invoice.total_tax_amounts) ? invoice.total_tax_amounts.reduce((sum: number, row: any) => sum + (Number.isInteger(row?.amount) ? row.amount : 0), 0) : 0;
  const recorded = await service.rpc('record_affiliate_subscription_commission', { p_user_id: userId, p_stripe_invoice_id: invoice.id, p_stripe_charge_id: chargeId, p_gross_amount_cents: invoice.amount_paid, p_tax_amount_cents: taxCents, p_currency: invoice.currency.toLowerCase() });
  if (recorded.error) throw new BillingError('DATABASE', 'Affiliate commission could not be recorded.', 500);
  const referral = await service.rpc('qualify_customer_referral', { p_referred_user_id: userId, p_invoice_id: invoice.id, p_charge_id: chargeId });
  if (referral.error) throw new BillingError('DATABASE', 'Customer referral could not be recorded.', 500);
}

function objectId(value: any) { return typeof value === 'string' ? value : typeof value?.id === 'string' ? value.id : null; }

async function resolveCharge(chargeLike: any) {
  const chargeId = objectId(chargeLike);
  if (!chargeId) return null;
  if (typeof chargeLike === 'object' && chargeLike && objectId(chargeLike.payment_intent)) return chargeLike;
  return stripeGet(`charges/${encodeURIComponent(chargeId)}`);
}

async function paymentIdentifiersForSession(session: any) {
  const paymentIntentId = objectId(session?.payment_intent);
  if (!paymentIntentId) return { paymentIntentId: null, chargeId: null };
  const embedded = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const paymentIntent = embedded && objectId(embedded.latest_charge)
    ? embedded : await stripeGet(`payment_intents/${encodeURIComponent(paymentIntentId)}`);
  return { paymentIntentId, chargeId: objectId(paymentIntent?.latest_charge) };
}

async function paymentCosts(chargeId: string | null, session: any) {
  let processingFeeCents = 0;
  if (chargeId) {
    const charge = await stripeGet(`charges/${encodeURIComponent(chargeId)}`);
    const balanceId = objectId(charge?.balance_transaction);
    if (balanceId) {
      const balance = await stripeGet(`balance_transactions/${encodeURIComponent(balanceId)}`);
      if (Number.isInteger(balance?.fee) && balance.fee >= 0) processingFeeCents = balance.fee;
    }
  }
  const taxCents = Number.isInteger(session?.total_details?.amount_tax) ? session.total_details.amount_tax : 0;
  return { processingFeeCents, taxCents };
}

async function recordMarketplacePurchase(session: any) {
  const metadata = session?.metadata || {};
  if (metadata.purchase_type !== 'marketplace_book') return false;
  if (session.payment_status !== 'paid') return false;
  const buyerId = metadata.buyer_user_id || session.client_reference_id;
  const listingId = metadata.community_story_id;
  if (!session.id || !buyerId || !listingId || !Number.isInteger(session.amount_total) || session.amount_total <= 0 || typeof session.currency !== 'string') throw new BillingError('STRIPE_EVENT_INVALID', 'Marketplace checkout payload is invalid.', 409);
  const { paymentIntentId, chargeId } = await paymentIdentifiersForSession(session);
  if (!paymentIntentId) throw new BillingError('STRIPE_EVENT_INVALID', 'Marketplace payment identifier is missing.', 409);
  const costs = await paymentCosts(chargeId, session);
  const recorded = await service.rpc('record_marketplace_purchase', { p_checkout_session_id: session.id, p_payment_intent_id: paymentIntentId, p_charge_id: chargeId, p_buyer_user_id: buyerId, p_listing_id: listingId, p_amount_cents: session.amount_total, p_currency: session.currency, p_processing_fee_cents: costs.processingFeeCents, p_tax_cents: costs.taxCents });
  if (recorded.error) throw new BillingError('DATABASE', 'Marketplace purchase could not be recorded.', 500);
  if (metadata.checkout_claim_id) await service.rpc('complete_marketplace_checkout_request', { p_id: metadata.checkout_claim_id, p_session_id: session.id, p_success: true });
  return true;
}

async function recordCreditPurchase(session: any) {
  const metadata=session?.metadata||{};
  if(metadata.purchase_type!=='ai_credits')return false;
  if(session.payment_status!=='paid')return false;
  const userId=metadata.user_id||session.client_reference_id;const productKey=metadata.product_key;
  if(!session.id||!userId||!productKey||!Number.isInteger(session.amount_total)||session.amount_total<=0||typeof session.currency!=='string')throw new BillingError('STRIPE_EVENT_INVALID','Credit checkout payload is invalid.',409);
  const {paymentIntentId,chargeId}=await paymentIdentifiersForSession(session);if(!paymentIntentId)throw new BillingError('STRIPE_EVENT_INVALID','Credit payment identifier is missing.',409);
  const recorded=await service.rpc('record_credit_purchase',{p_checkout_session_id:session.id,p_payment_intent_id:paymentIntentId,p_charge_id:chargeId,p_user_id:userId,p_product_key:productKey,p_amount_cents:session.amount_total,p_currency:session.currency});
  if(recorded.error)throw new BillingError('DATABASE','Purchased credits could not be recorded.',500);
  if(metadata.checkout_claim_id)await service.rpc('complete_credit_checkout_request',{p_id:metadata.checkout_claim_id,p_session_id:session.id,p_success:true});
  return true;
}

async function failCreditCheckout(session:any){if(session?.metadata?.purchase_type!=='ai_credits')return;const claimId=session.metadata.checkout_claim_id;if(!claimId)return;const failed=await service.rpc('complete_credit_checkout_request',{p_id:claimId,p_session_id:session.id||'',p_success:false});if(failed.error)throw new BillingError('DATABASE','Credit checkout failure could not be recorded.',500);}

async function failMarketplaceCheckout(session: any) {
  if (session?.metadata?.purchase_type !== 'marketplace_book') return;
  const claimId = session.metadata.checkout_claim_id;
  if (!claimId) return;
  const failed = await service.rpc('complete_marketplace_checkout_request', { p_id: claimId, p_session_id: session.id || '', p_success: false });
  if (failed.error) throw new BillingError('DATABASE', 'Marketplace checkout failure could not be recorded.', 500);
}

async function recordPaymentRisk(eventId: string, chargeLike: any, reason: 'refund'|'chargeback'|'fraud_warning', fullReversal: boolean) {
  const charge = await resolveCharge(chargeLike);
  const chargeId = objectId(charge);
  const paymentIntentId = objectId(charge?.payment_intent);
  if (!chargeId && !paymentIntentId) throw new BillingError('STRIPE_EVENT_INVALID', 'Payment risk identifier is missing.', 409);
  const recorded = await service.rpc('record_stripe_payment_risk', {
    p_stripe_event_id: eventId, p_payment_intent_id: paymentIntentId, p_charge_id: chargeId,
    p_reason: reason, p_refunded_amount_cents: Number.isInteger(charge?.amount_refunded) ? charge.amount_refunded : 0,
    p_full_reversal: fullReversal,
  });
  if (recorded.error) throw new BillingError('DATABASE', 'Payment risk event could not be recorded.', 500);
  const reversedCredits=await service.rpc('reverse_credit_purchase',{p_payment_intent_id:paymentIntentId,p_charge_id:chargeId,p_reason:reason});
  if(reversedCredits.error)throw new BillingError('DATABASE','Purchased credit reversal could not be recorded.',500);
  const reversedReferral=await service.rpc('reverse_customer_referral_rewards',{p_invoice_id:null,p_charge_id:chargeId,p_reason:reason});
  if(reversedReferral.error)throw new BillingError('DATABASE','Customer referral reversal could not be recorded.',500);
}

async function syncFailedInvoice(invoice: any) {
  const subscriptionId = objectId(invoice?.subscription || invoice?.parent?.subscription_details?.subscription);
  if (!subscriptionId) return;
  const subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  await syncSubscription(subscription);
}

async function syncSellerAccount(account: any) {
  const accountId = objectId(account); if (!accountId) return;
  const capability = account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status || (account?.capabilities?.transfers === 'active' ? 'active' : account?.capabilities?.transfers === 'pending' ? 'pending' : 'inactive');
  const requirements = account?.requirements?.currently_due || account?.requirements?.past_due || [];
  const status = capability === 'active' && requirements.length === 0 ? 'eligible' : account?.requirements?.disabled_reason ? 'restricted' : 'onboarding';
  const saved = await service.from('seller_accounts').update({ status, transfers_capability_status: capability, requirements_due: requirements, disabled_reason: account?.requirements?.disabled_reason || null, details_submitted: Boolean(account?.details_submitted || status === 'eligible'), onboarding_completed_at: status === 'eligible' ? new Date().toISOString() : null, last_stripe_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('stripe_connected_account_id', accountId);
  if (saved.error) throw new BillingError('DATABASE', 'Seller account sync failed.', 500);
}

async function syncTransfer(transfer: any, reversed = false) {
  const payoutId = transfer?.metadata?.payout_id; if (!payoutId || !transfer?.id) return;
  const saved = await service.from('financial_payouts').update({ status: reversed ? 'reversed' : 'transferred', stripe_transfer_id: transfer.id, updated_at: new Date().toISOString(), ...(reversed ? { failure_code: 'transfer_reversed' } : {}) }).eq('id', payoutId).in('status', reversed ? ['approved','processing','transferred'] : ['approved','processing','transferred']);
  if (saved.error) throw new BillingError('DATABASE', 'Transfer status sync failed.', 500);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return response({ error: { code: 'VALIDATION', message: 'Only POST requests are supported.' } }, 405);
  const raw = await request.text();
  if (!await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), webhookSecret)) return response({ error: { code: 'SIGNATURE_INVALID', message: 'Webhook signature is invalid.' } }, 400);
  let event: any; try { event = JSON.parse(raw); } catch { return response({ error: { code: 'VALIDATION', message: 'Webhook body is invalid.' } }, 400); }
  const claim = await service.rpc('claim_stripe_webhook_event', { p_event_id: event.id, p_event_type: event.type });
  if (claim.error) return response({ error: { code: 'DATABASE', message: 'Webhook event could not be claimed.' } }, 500);
  if (!claim.data) return response({ received: true, duplicate: true }, 200);
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data?.object; const userId = session?.client_reference_id || session?.metadata?.supabase_user_id; const customerId = typeof session?.customer === 'string' ? session.customer : session?.customer?.id;
      if (userId && customerId) { const saved = await service.from('stripe_customers').upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' }); if (saved.error) throw new BillingError('DATABASE', 'Customer mapping failed.', 500); }
      await recordMarketplacePurchase(session);
      await recordCreditPurchase(session);
      // Checkout completion is reconciliation only for subscriptions. Subscription entitlement still comes only from a valid subscription event.
    } else if (event.type === 'checkout.session.async_payment_failed') { await failMarketplaceCheckout(event.data?.object); await failCreditCheckout(event.data?.object); }
    else if (subscriptionEvents.has(event.type)) await syncSubscription(event.data?.object);
    else if (event.type === 'invoice.paid') await recordPaidInvoice(event.data?.object);
    else if (event.type === 'invoice.payment_failed') await syncFailedInvoice(event.data?.object);
    else if (event.type === 'account.updated') await syncSellerAccount(event.data?.object);
    else if (event.type === 'v2.core.account.updated') { const id=objectId(event.data?.object);if(id)await syncSellerAccount(await stripeV2(`core/accounts/${encodeURIComponent(id)}`)); }
    else if (event.type === 'transfer.created') await syncTransfer(event.data?.object,false);
    else if (event.type === 'transfer.reversed') await syncTransfer(event.data?.object,true);
    else if (event.type === 'charge.refunded') await recordPaymentRisk(event.id,event.data?.object,'refund',false);
    else if (event.type === 'charge.dispute.created') await recordPaymentRisk(event.id,event.data?.object?.charge,'chargeback',true);
    else if (event.type === 'radar.early_fraud_warning.created') await recordPaymentRisk(event.id,event.data?.object?.charge,'fraud_warning',true);
    await service.rpc('complete_stripe_webhook_event', { p_event_id: event.id, p_success: true, p_error: null });
    return response({ received: true }, 200);
  } catch (caught) {
    const error = safeFailure(caught); await service.rpc('complete_stripe_webhook_event', { p_event_id: event.id, p_success: false, p_error: error.code });
    return response({ error: { code: error.code, message: error.message } }, error.status);
  }
});
