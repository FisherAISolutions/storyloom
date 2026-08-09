import { BillingError, authenticate, cors, response, safeFailure, service, stripe } from '../_shared/billing.ts';

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = cors(request); if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new BillingError('VALIDATION', 'Only POST requests are supported.', 405);
    const user = await authenticate(request); const customer = await service.from('stripe_customers').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (customer.error) throw new BillingError('DATABASE', 'Billing details could not be loaded.', 500);
    if (!customer.data) throw new BillingError('NO_BILLING_ACCOUNT', 'No subscription billing account exists yet.', 404);
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'; const session = await stripe('billing_portal/sessions', { customer: customer.data.stripe_customer_id, return_url: `${appUrl}/billing` });
    return response({ data: { url: session.url } }, 200, headers);
  } catch (caught) { const error = safeFailure(caught); return response({ error: { code: error.code, message: error.message } }, error.status, headers); }
});
