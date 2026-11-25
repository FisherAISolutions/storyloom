import { BillingError, appUrl, authenticate, cors, response, safeFailure, service, stripeRecipientState, stripeV2 } from '../_shared/billing.ts';

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new BillingError('VALIDATION', 'Only POST requests are supported.', 405);
    const user = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    if (!['status','start','dashboard'].includes(body?.action) || Object.keys(body).some((key) => key !== 'action')) throw new BillingError('VALIDATION', 'Choose a valid seller action.');
    const existing = await service.from('seller_accounts').select('*').eq('user_id', user.id).maybeSingle();
    if (existing.error) throw new BillingError('DATABASE', 'Seller status could not be loaded.', 500);
    if (body.action === 'status') return response({ data: existing.data }, 200, headers);
    if (Deno.env.get('STRIPE_CONNECT_TEST_MODE_ENABLED') !== 'enabled') throw new BillingError('CONNECT_DISABLED', 'Seller onboarding is not available yet.', 409);
    const accepted = await service.from('policy_acceptances').select('id,policy_version').eq('user_id', user.id).eq('policy_key', 'marketplace_seller').order('accepted_at', { ascending: false }).limit(1).maybeSingle();
    if (accepted.error || !accepted.data) throw new BillingError('TERMS_REQUIRED', 'Accept the current seller terms before onboarding.', 409);
    let accountId = existing.data?.stripe_connected_account_id as string | null;
    if (!accountId) {
      const country = (Deno.env.get('STRIPE_CONNECT_DEFAULT_COUNTRY') || 'US').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw new BillingError('CONNECT_CONFIG', 'Seller onboarding is not configured.', 503);
      const account = await stripeV2('core/accounts?include[]=configuration.recipient&include[]=requirements&include[]=identity&include[]=defaults', 'POST', {
        contact_email: user.email,
        identity: { country },
        dashboard: 'express',
        defaults: { responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        metadata: { supabase_user_id: user.id },
      }, `seller-account:${user.id}`);
      accountId = account.id;
      const state = stripeRecipientState(account);
      const saved = await service.from('seller_accounts').upsert({ user_id: user.id, stripe_connected_account_id: accountId, dashboard_type: 'express', fees_collector: 'application', losses_collector: 'application', status: state.status, transfers_capability_status: state.capability, requirements_due: state.requirements, disabled_reason: state.disabledReason, terms_version: accepted.data.policy_version, terms_accepted_at: new Date().toISOString(), last_stripe_sync_at: new Date().toISOString() });
      if (saved.error) throw new BillingError('DATABASE', 'Seller status could not be saved.', 500);
    }
    if (!accountId) throw new BillingError('CONNECT_ACCOUNT_MISSING', 'Seller onboarding could not be completed.', 502);
    const origin = appUrl();
    if (body.action === 'dashboard') {
      const link = await stripeV2('core/account_links', 'POST', { account: accountId, use_case: { type: 'account_dashboard', account_dashboard: { refresh_url: `${origin}/author?connect=dashboard-refresh` } } });
      return response({ data: { url: link.url } }, 200, headers);
    }
    const link = await stripeV2('core/account_links', 'POST', { account: accountId, use_case: { type: 'account_onboarding', account_onboarding: { configurations: ['recipient'], refresh_url: `${origin}/author?connect=refresh`, return_url: `${origin}/author?connect=return` } } });
    return response({ data: { url: link.url } }, 200, headers);
  } catch (caught) {
    const error = safeFailure(caught); return response({ error: { code: error.code, message: error.message } }, error.status, headers);
  }
});
