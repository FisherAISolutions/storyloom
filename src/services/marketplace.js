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
export async function getBuyerLibrary() { await requireAuthenticatedUser(); return invoke('community-public', { action: 'library' }); }
export async function getDashboard() { await requireAuthenticatedUser(); const { data, error } = await getSupabaseClient().rpc('get_author_marketplace_dashboard'); if (error) throw toServiceError(error, 'Author dashboard'); return data; }
export async function getFinancialDashboard() { await requireAuthenticatedUser(); const { data, error } = await getSupabaseClient().rpc('get_seller_financial_dashboard'); if (error) throw toServiceError(error, 'Author earnings'); return data; }
export async function sellerConnect(action) { await requireAuthenticatedUser(); return invoke('seller-connect', { action }); }
export async function acceptSellerTerms(version) { await requireAuthenticatedUser(); const { error } = await getSupabaseClient().rpc('accept_policy', { p_policy_key: 'marketplace_seller', p_policy_version: version, p_context: 'seller_onboarding' }); if (error) throw toServiceError(error, 'Seller terms'); }
export async function saveProfile({ slug, displayName, biography }) { const user=await requireAuthenticatedUser(); const { error }=await getSupabaseClient().from('author_profiles').upsert({ user_id:user.id, public_slug:slug, display_name:displayName, biography:biography||null, updated_at:new Date().toISOString() }); if(error)throw toServiceError(error,'Author profile'); }
export async function configureListing(storyId, enabled, priceCents, description, previewPageCount=2) { await requireAuthenticatedUser(); const {data,error}=await getSupabaseClient().rpc('configure_marketplace_listing',{p_story_id:storyId,p_enabled:enabled,p_price_cents:priceCents,p_description:description,p_preview_page_count:previewPageCount}); if(error)throw toServiceError(error,'Marketplace listing'); return data; }
export async function createCheckout(slug) { await requireAuthenticatedUser(); return invoke('marketplace-checkout',{slug,request_id:crypto.randomUUID()}); }
export async function configurePersonalization(storyId, { enabled, storyCharacterId, allowName, allowAppearance, allowClothing }) { await requireAuthenticatedUser(); const {error}=await getSupabaseClient().rpc('configure_marketplace_personalization',{p_story_id:storyId,p_enabled:enabled,p_story_character_id:storyCharacterId,p_allow_name:allowName,p_allow_appearance:allowAppearance,p_allow_clothing:allowClothing}); if(error)throw toServiceError(error,'Personalization settings'); }
export async function createPersonalizedEdition(slug, buyerCharacterId, requestId) { await requireAuthenticatedUser(); const {data,error}=await getSupabaseClient().rpc('create_marketplace_personalized_edition',{p_slug:slug,p_buyer_character_id:buyerCharacterId,p_request_id:requestId,p_confirmed:true}); if(error)throw toServiceError(error,'Personalized edition'); return data; }
export async function completePersonalizedEdition(storyId) { await requireAuthenticatedUser(); const {error}=await getSupabaseClient().rpc('complete_marketplace_personalized_edition',{p_story_id:storyId}); if(error)throw toServiceError(error,'Personalized edition completion'); }
export async function getPersonalizedEditions() { await requireAuthenticatedUser(); const {data,error}=await getSupabaseClient().rpc('get_personalized_editions'); if(error)throw toServiceError(error,'Personalized editions'); return data||[]; }
