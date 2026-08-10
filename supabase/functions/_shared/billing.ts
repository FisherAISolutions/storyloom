import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
export const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
export const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export class BillingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function cors(request: Request) {
  const origin = request.headers.get('Origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((v) => v.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new BillingError('PERMISSION_DENIED', 'This origin is not allowed.', 403);
  return { 'Access-Control-Allow-Origin': origin || allowed[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

export function response(body: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function appUrl() {
  const configured = Deno.env.get('APP_URL')?.trim();
  if (!configured) throw new BillingError('BILLING_CONFIG', 'Billing is not configured for this environment.', 503);
  let parsed: URL;
  try { parsed = new URL(configured); } catch { throw new BillingError('BILLING_CONFIG', 'Billing is not configured for this environment.', 503); }
  const isLocalTest = STRIPE_KEY.startsWith('sk_test_') && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.origin !== configured.replace(/\/$/, '') || (parsed.protocol !== 'https:' && !isLocalTest)) {
    throw new BillingError('BILLING_CONFIG', 'Billing is not configured for this environment.', 503);
  }
  return parsed.origin;
}

export async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new BillingError('AUTH_REQUIRED', 'Authentication is required.', 401);
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new BillingError('AUTH_REQUIRED', 'Authentication is required.', 401);
  return data.user;
}

export async function stripe(path: string, fields: Record<string, string>) {
  if (!STRIPE_KEY.startsWith('sk_test_') && Deno.env.get('STRIPE_LIVE_MODE') !== 'enabled') throw new BillingError('BILLING_CONFIG', 'Stripe test mode is not configured.', 503);
  const body = new URLSearchParams(); Object.entries(fields).forEach(([key, value]) => body.set(key, value));
  const result = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const payload = await result.json();
  if (!result.ok) { console.error('Stripe API request failed', path, payload?.error?.type); throw new BillingError('STRIPE_API', 'The billing request could not be completed.', 502); }
  return payload;
}

export async function customerFor(user: { id: string; email?: string }) {
  const existing = await service.from('stripe_customers').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (existing.error) throw new BillingError('DATABASE', 'Billing details could not be loaded.', 500);
  if (existing.data) return existing.data.stripe_customer_id;
  const customer = await stripe('customers', { ...(user.email ? { email: user.email } : {}), 'metadata[supabase_user_id]': user.id });
  const inserted = await service.from('stripe_customers').insert({ user_id: user.id, stripe_customer_id: customer.id }).select('stripe_customer_id').single();
  if (!inserted.error) return inserted.data.stripe_customer_id;
  const raced = await service.from('stripe_customers').select('stripe_customer_id').eq('user_id', user.id).single();
  if (raced.error) throw new BillingError('DATABASE', 'Billing details could not be saved.', 500);
  return raced.data.stripe_customer_id;
}

export function safeFailure(caught: unknown) {
  if (caught instanceof BillingError) return caught;
  console.error('Billing function failed', caught instanceof Error ? caught.message : 'unknown');
  return new BillingError('BILLING_ERROR', 'The billing request could not be completed.', 500);
}

export async function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1]; const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  const expected = Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    let difference = 0; for (let index = 0; index < expected.length; index += 1) difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
    return difference === 0;
  });
}
