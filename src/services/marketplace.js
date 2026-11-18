import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { ServiceError, toServiceError } from '@/services/errors';

async function invoke(name, body) {
  const { data, error } = await getSupabaseClient().functions.invoke(name, { body });
  if (error) { let details; try { details = await error.context?.json(); } catch {} throw new ServiceError(details?.error?.code || 'MARKETPLACE_ERROR', details?.error?.message || 'The marketplace request could not be completed.'); }
  if (!data?.data) throw new ServiceError('MARKETPLACE_ERROR', 'The marketplace returned an invalid response.');
  return data.data;
}

export async function getAuthor(slug) { return invoke('community-public', { action: 'author', slug }); }
export async function getDashboard() { await requireAuthenticatedUser(); const { data, error } = await getSupabaseClient().rpc('get_author_marketplace_dashboard'); if (error) throw toServiceError(error, 'Author dashboard'); return data; }
export async function saveProfile({ slug, displayName, biography }) { const user=await requireAuthenticatedUser(); const { error }=await getSupabaseClient().from('author_profiles').upsert({ user_id:user.id, public_slug:slug, display_name:displayName, biography:biography||null, updated_at:new Date().toISOString() }); if(error)throw toServiceError(error,'Author profile'); }
export async function configureListing(storyId, enabled, priceCents, description, previewPageCount=2) { await requireAuthenticatedUser(); const {data,error}=await getSupabaseClient().rpc('configure_marketplace_listing',{p_story_id:storyId,p_enabled:enabled,p_price_cents:priceCents,p_description:description,p_preview_page_count:previewPageCount}); if(error)throw toServiceError(error,'Marketplace listing'); return data; }
export async function createCheckout(slug) { await requireAuthenticatedUser(); return invoke('marketplace-checkout',{slug,request_id:crypto.randomUUID()}); }
