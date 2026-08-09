import { BillingError, authenticate, cors, customerFor, response, safeFailure, service, stripe } from '../_shared/billing.ts';

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = cors(request); if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new BillingError('VALIDATION', 'Only POST requests are supported.', 405);
    const user = await authenticate(request); const body = await request.json();
    if (!body || typeof body.plan_key !== 'string' || Object.keys(body).some((key) => key !== 'plan_key')) throw new BillingError('VALIDATION', 'Choose a supported plan.');
    const plan = await service.from('billing_plans').select('plan_key,stripe_price_id').eq('plan_key', body.plan_key).eq('active', true).maybeSingle();
    if (plan.error) throw new BillingError('DATABASE', 'Plans could not be loaded.', 500);
    if (!plan.data || plan.data.plan_key === 'free' || !plan.data.stripe_price_id) throw new BillingError('PLAN_UNAVAILABLE', 'That subscription plan is not available.');
    const active = await service.from('subscriptions').select('id').eq('user_id', user.id).in('status', ['active','trialing']).limit(1);
    if (active.error) throw new BillingError('DATABASE', 'Subscription status could not be loaded.', 500);
    if (active.data?.length) throw new BillingError('USE_PORTAL', 'Manage your existing subscription from Billing.');
    const customer = await customerFor(user); const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    const session = await stripe('checkout/sessions', { mode: 'subscription', customer, 'line_items[0][price]': plan.data.stripe_price_id, 'line_items[0][quantity]': '1', client_reference_id: user.id, 'subscription_data[metadata][supabase_user_id]': user.id, 'subscription_data[metadata][plan_key]': plan.data.plan_key, success_url: `${appUrl}/billing/success`, cancel_url: `${appUrl}/pricing?checkout=cancelled` });
    return response({ data: { url: session.url } }, 200, headers);
  } catch (caught) { const error = safeFailure(caught); return response({ error: { code: error.code, message: error.message } }, error.status, headers); }
});
