import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

const service = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
const allowed = () => (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((v) => v.trim());
function headers(request: Request) { const origin = request.headers.get('Origin') || allowed()[0]; if (!allowed().includes(origin)) throw new Error('Origin not allowed'); return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', Vary: 'Origin' }; }
function response(data: unknown, status: number, cors: HeadersInit) { return new Response(JSON.stringify(data), { status, headers: cors }); }
async function signed(path: string | null) { if (!path) return null; const { data } = await service.storage.from('story-images').createSignedUrl(path, 900); return data?.signedUrl || null; }
async function viewer(request: Request) { const authorization=request.headers.get('Authorization'); if(!authorization?.startsWith('Bearer ')) return null; const client=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_ANON_KEY')||'',{auth:{persistSession:false}}); const {data}=await client.auth.getUser(authorization.slice(7)); return data.user?.id||null; }

Deno.serve(async (request) => {
  let cors: HeadersInit = {};
  try {
    cors = headers(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, cors);
    const body = await request.json().catch(() => ({}));
    if (body.action === 'list') {
      const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 24);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const { data, error } = await service.from('community_stories').select('public_slug,display_author_name,shared_at,featured,marketplace_enabled,price_cents,currency,marketplace_description,user_id,stories!inner(title,art_style,page_count,cover_image_path)').eq('status', 'published').order('featured', { ascending: false }).order('shared_at', { ascending: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return response({ data: await Promise.all((data || []).map(async (row: any) => { const {data:author}=await service.from('author_profiles').select('public_slug,display_name').eq('user_id',row.user_id).maybeSingle(); return { slug: row.public_slug, title: row.stories.title, art_style: row.stories.art_style, page_count: row.stories.page_count, attribution: author?.display_name||row.display_author_name||'Shared by a MyStorybook AI creator', author_slug: author?.public_slug||null, cover_url: await signed(row.stories.cover_image_path), featured: row.featured, is_paid: row.marketplace_enabled, price_cents: row.marketplace_enabled?row.price_cents:null, currency: row.currency, description: row.marketplace_description }; }))) }, 200, cors);
    }
    if (body.action === 'get' && typeof body.slug === 'string' && /^[a-f0-9]{24}$/.test(body.slug)) {
      const { data: share, error } = await service.from('community_stories').select('id,story_id,user_id,public_slug,display_author_name,marketplace_enabled,marketplace_description,price_cents,currency,preview_page_count,stories!inner(title,summary,art_style,page_count,cover_image_path)').eq('public_slug', body.slug).eq('status', 'published').maybeSingle();
      if (error) throw error;
      if (!share) return response({ error: 'Not found' }, 404, cors);
      const userId=await viewer(request); let fullAccess=!share.marketplace_enabled||userId===share.user_id;
      if(!fullAccess&&userId){ const {data:purchase}=await service.from('marketplace_purchases').select('id').eq('community_story_id',share.id).eq('buyer_user_id',userId).eq('status','active').maybeSingle(); fullAccess=Boolean(purchase); }
      let pageQuery=service.from('story_pages').select('page_number,text,image_path').eq('story_id', share.story_id).order('page_number');
      if(!fullAccess) pageQuery=pageQuery.limit(share.preview_page_count);
      const { data: pages } = await pageQuery;
      const {data:author}=await service.from('author_profiles').select('public_slug,display_name').eq('user_id',share.user_id).maybeSingle();
      return response({ data: { slug: share.public_slug, title: (share as any).stories.title, summary: (share as any).stories.summary, description: share.marketplace_description, art_style: (share as any).stories.art_style, page_count: (share as any).stories.page_count, attribution: author?.display_name||share.display_author_name||'Shared by a MyStorybook AI creator', author_slug: author?.public_slug||null, cover_url: await signed((share as any).stories.cover_image_path), is_paid: share.marketplace_enabled, price_cents: share.marketplace_enabled?share.price_cents:null, currency: share.currency, has_full_access: fullAccess, preview_page_count: share.preview_page_count, pages: await Promise.all((pages || []).map(async (page) => ({ page_number: page.page_number, text: page.text, image_url: await signed(page.image_path) }))) } }, 200, cors);
    }
    if(body.action==='author'&&typeof body.slug==='string'&&/^[a-z0-9][a-z0-9-]{2,47}$/.test(body.slug)){ const {data:author,error}=await service.from('author_profiles').select('user_id,public_slug,display_name,biography').eq('public_slug',body.slug).maybeSingle(); if(error)throw error;if(!author)return response({error:'Not found'},404,cors); const {data:listings}=await service.from('community_stories').select('public_slug,featured,marketplace_enabled,price_cents,currency,stories!inner(title,art_style,page_count,cover_image_path)').eq('user_id',author.user_id).eq('status','published').order('shared_at',{ascending:false}); return response({data:{slug:author.public_slug,display_name:author.display_name,biography:author.biography,books:await Promise.all((listings||[]).map(async(row:any)=>({slug:row.public_slug,title:row.stories.title,art_style:row.stories.art_style,page_count:row.stories.page_count,cover_url:await signed(row.stories.cover_image_path),featured:row.featured,is_paid:row.marketplace_enabled,price_cents:row.marketplace_enabled?row.price_cents:null,currency:row.currency}))) }},200,cors); }
    return response({ error: 'Invalid request' }, 400, cors);
  } catch { return response({ error: 'Community stories are temporarily unavailable.' }, 500, cors); }
});
