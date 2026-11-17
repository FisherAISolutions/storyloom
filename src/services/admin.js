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
