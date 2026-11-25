import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

async function rpc(name, input = {}) {
  const { data, error } = await getSupabaseClient().rpc(name, input);
  if (error) {
    const denied = /ADMIN_REQUIRED|OWNER_REQUIRED|ROLE_NOT_ASSIGNABLE|LAST_OWNER_REQUIRED/.test(error.message || '');
    throw new ServiceError(denied ? 'PERMISSION_DENIED' : 'ADMIN_ERROR', denied ? 'You do not have permission for that administrative action.' : 'The administrative action could not be completed.');
  }
  return data;
}

export const getControlCenter = (search = '') => rpc('get_admin_control_center', { p_search: search });
export const setUserRole = (userId, role, reason) => rpc('admin_set_user_role', { p_target_user_id: userId, p_role: role, p_reason: reason });
export const grantCredits = (userId, storyUnits, imageUnits, expiresAt, reason) => rpc('admin_grant_complimentary_credits', { p_target_user_id: userId, p_story_units: storyUnits, p_image_units: imageUnits, p_expires_at: expiresAt, p_reason: reason, p_request_id: crypto.randomUUID() });
export const revokeCredits = (grantId, reason) => rpc('admin_revoke_complimentary_credits', { p_grant_id: grantId, p_reason: reason });
export const setTestLimit = (userId, enabled, cents, reason) => rpc('admin_set_ai_test_limit', { p_target_user_id: userId, p_enabled: enabled, p_monthly_spend_limit_cents: cents, p_reason: reason });
export const getAffiliates = () => rpc('admin_get_affiliates');
export const reviewAffiliate = (affiliateId, status, commissionBps, reason) => rpc('admin_review_affiliate', { p_affiliate_id: affiliateId, p_status: status, p_commission_bps: commissionBps, p_reason: reason });
export const getImageProviders = () => rpc('admin_get_image_provider_settings');
export const updateImageProvider = (setting, reason) => rpc('admin_update_image_provider_setting', {
  p_provider_key: setting.provider_key, p_enabled: setting.enabled, p_priority: setting.priority,
  p_model_key: setting.model_key, p_selection_mode: setting.selection_mode,
  p_allow_paid_fallback: setting.allow_paid_fallback, p_daily_request_limit: setting.daily_request_limit,
  p_daily_spend_limit_usd: setting.daily_spend_limit_usd, p_reason: reason,
  p_daily_neuron_limit: setting.daily_neuron_limit,
});
export const getMarketplaceSettings = () => rpc('get_marketplace_settings');
export const updateMarketplaceSettings = (basisPoints) => rpc('update_marketplace_author_share', { p_author_share_bps: basisPoints });
export const getFinancialOperations = () => rpc('admin_get_financial_operations');
export const updateCommercialSettings = (settings, reason) => rpc('admin_update_commercial_settings', { p_settings: settings, p_reason: reason });
export const activatePolicy = (key, version, reason) => rpc('admin_activate_policy', { p_policy_key: key, p_policy_version: version, p_reason: reason });
