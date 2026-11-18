import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { ANON_KEY, BillingError, SUPABASE_URL, appUrl, authenticate, cors, customerFor, response, safeFailure, service, stripe } from '../_shared/billing.ts';

const slugPattern = /^[a-f0-9]{24}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  let headers: HeadersInit = {};
  let claimId: string | null = null;
  try {
    headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new BillingError('VALIDATION', 'Only POST requests are supported.', 405);
    const user = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    if (!slugPattern.test(body?.slug || '') || !uuidPattern.test(body?.request_id || '') || Object.keys(body).some((key) => !['slug','request_id'].includes(key))) throw new BillingError('VALIDATION', 'Choose an available book.', 400);

    const authorization = request.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const claimed = await userClient.rpc('claim_marketplace_checkout', { p_slug: body.slug, p_request_id: body.request_id });
    if (claimed.error || !claimed.data) throw new BillingError('CHECKOUT_UNAVAILABLE', 'This book cannot be purchased right now.', 409);
    claimId = claimed.data;

    const listing = await service.from('community_stories').select('id,user_id,public_slug,price_cents,currency,stories!inner(title)').eq('public_slug', body.slug).eq('status', 'published').eq('marketplace_enabled', true).maybeSingle();
    if (listing.error || !listing.data) throw new BillingError('LISTING_UNAVAILABLE', 'This book is no longer available.', 409);
    const customer = await customerFor(user);
    const origin = appUrl();
    const title = (listing.data as any).stories.title;
    const session = await stripe('checkout/sessions', {
      mode: 'payment', customer,
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': listing.data.currency,
      'line_items[0][price_data][unit_amount]': String(listing.data.price_cents),
      'line_items[0][price_data][product_data][name]': `Digital storybook: ${title}`,
      'line_items[0][quantity]': '1',
      client_reference_id: user.id,
      'metadata[purchase_type]': 'marketplace_book',
      'metadata[buyer_user_id]': user.id,
      'metadata[community_story_id]': listing.data.id,
      'metadata[checkout_claim_id]': claimId,
      success_url: `${origin}/community/${listing.data.public_slug}?purchase=success`,
      cancel_url: `${origin}/community/${listing.data.public_slug}?purchase=cancelled`,
    }, `marketplace:${user.id}:${body.request_id}`);
    await service.from('marketplace_checkout_requests').update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', claimId);
    return response({ data: { url: session.url } }, 200, headers);
  } catch (caught) {
    if (claimId) await service.rpc('complete_marketplace_checkout_request', { p_id: claimId, p_session_id: '', p_success: false });
    const error = safeFailure(caught); return response({ error: { code: error.code, message: error.message } }, error.status, headers);
  }
});
