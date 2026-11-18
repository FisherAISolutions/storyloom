import { BillingError, response, safeFailure, service, verifyStripeSignature } from '../_shared/billing.ts';

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
  const recorded = await service.rpc('record_affiliate_conversion', { p_user_id: userId, p_stripe_invoice_id: invoice.id, p_stripe_charge_id: chargeId, p_gross_amount_cents: invoice.amount_paid, p_currency: invoice.currency.toLowerCase() });
  if (recorded.error) throw new BillingError('DATABASE', 'Affiliate commission could not be recorded.', 500);
}

async function reverseCommission(charge: any, reason: string, fullReversal: boolean) {
  const chargeId = typeof charge?.id === 'string' ? charge.id : null;
  const invoiceId = typeof charge?.invoice === 'string' ? charge.invoice : charge?.invoice?.id || null;
  if (!chargeId && !invoiceId) return;
  const reversed = await service.rpc('reverse_affiliate_commission', { p_stripe_invoice_id: invoiceId, p_stripe_charge_id: chargeId, p_refunded_amount_cents: Number.isInteger(charge?.amount_refunded) ? charge.amount_refunded : 0, p_reason: reason, p_full_reversal: fullReversal });
  if (reversed.error) throw new BillingError('DATABASE', 'Affiliate commission reversal failed.', 500);
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
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object; const userId = session?.client_reference_id || session?.metadata?.supabase_user_id; const customerId = typeof session?.customer === 'string' ? session.customer : session?.customer?.id;
      if (userId && customerId) { const saved = await service.from('stripe_customers').upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' }); if (saved.error) throw new BillingError('DATABASE', 'Customer mapping failed.', 500); }
      // Checkout completion is reconciliation only. Entitlement comes from a valid subscription event.
    } else if (subscriptionEvents.has(event.type)) await syncSubscription(event.data?.object);
    else if (event.type === 'invoice.paid') await recordPaidInvoice(event.data?.object);
    else if (event.type === 'charge.refunded') await reverseCommission(event.data?.object, 'refund', false);
    else if (event.type === 'charge.dispute.created') { const dispute = event.data?.object; await reverseCommission({ id: typeof dispute?.charge === 'string' ? dispute.charge : dispute?.charge?.id }, 'chargeback', true); }
    await service.rpc('complete_stripe_webhook_event', { p_event_id: event.id, p_success: true, p_error: null });
    return response({ received: true }, 200);
  } catch (caught) {
    const error = safeFailure(caught); await service.rpc('complete_stripe_webhook_event', { p_event_id: event.id, p_success: false, p_error: error.code });
    return response({ error: { code: error.code, message: error.message } }, error.status);
  }
});
