import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

const service = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

function headers(request: Request) {
  const origin = request.headers.get('Origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim()).filter(Boolean);
  if (origin && !allowed.includes(origin)) return null;
  return { 'Access-Control-Allow-Origin': origin || allowed[0], 'Access-Control-Allow-Headers': 'content-type,apikey,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
}

function reply(body: unknown, status: number, responseHeaders: HeadersInit) { return new Response(JSON.stringify(body), { status, headers: responseHeaders }); }

async function visitorHash(request: Request) {
  const salt = Deno.env.get('AFFILIATE_CLICK_SALT');
  if (!salt || salt.length < 32) throw new Error('Affiliate tracking is not configured.');
  const ip = (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || '').split(',')[0].trim();
  const agent = (request.headers.get('user-agent') || '').slice(0, 300);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ip}|${agent}`)));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  const responseHeaders = headers(request);
  if (!responseHeaders) return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders });
  if (request.method !== 'POST') return reply({ error: { code: 'VALIDATION', message: 'Only POST requests are supported.' } }, 405, responseHeaders);
  try {
    const body = await request.json();
    const code = typeof body?.referral_code === 'string' ? body.referral_code.trim().toLowerCase() : '';
    const landingPath = typeof body?.landing_path === 'string' && body.landing_path.startsWith('/') && !body.landing_path.includes('\\') ? body.landing_path.slice(0, 300) : '/';
    if (!/^[a-z0-9]{8,24}$/.test(code)) return reply({ error: { code: 'VALIDATION', message: 'Referral link is invalid.' } }, 400, responseHeaders);
    const affiliate = await service.from('affiliate_accounts').select('id').eq('referral_code', code).eq('status', 'approved').maybeSingle();
    if (affiliate.error) throw affiliate.error;
    if (!affiliate.data) return reply({ data: { accepted: false } }, 200, responseHeaders);
    const hash = await visitorHash(request);
    const recent = await service.from('affiliate_clicks').select('id').eq('affiliate_id', affiliate.data.id).eq('visitor_hash', hash).gte('clicked_at', new Date(Date.now() - 60 * 60_000).toISOString()).limit(1).maybeSingle();
    if (recent.error) throw recent.error;
    if (recent.data) return reply({ data: { accepted: true, click_id: recent.data.id } }, 200, responseHeaders);
    const inserted = await service.from('affiliate_clicks').insert({ affiliate_id: affiliate.data.id, visitor_hash: hash, landing_path: landingPath }).select('id').single();
    if (inserted.error) throw inserted.error;
    return reply({ data: { accepted: true, click_id: inserted.data.id } }, 200, responseHeaders);
  } catch {
    return reply({ error: { code: 'AFFILIATE_TRACKING', message: 'Referral tracking is temporarily unavailable.' } }, 503, responseHeaders);
  }
});

