import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

const STORAGE_KEY = 'mystorybook_affiliate_referral';

async function rpc(name, input = {}) {
  const { data, error } = await getSupabaseClient().rpc(name, input);
  if (error) throw new ServiceError('AFFILIATE_ERROR', 'The affiliate request could not be completed.');
  return data;
}

export async function trackReferral(referralCode, landingPath = '/') {
  const { data, error } = await getSupabaseClient().functions.invoke('affiliate-public', { body: { referral_code: referralCode, landing_path: landingPath } });
  if (error || !data?.data?.accepted) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: referralCode.toLowerCase(), clickId: data.data.click_id, savedAt: Date.now() }));
  return true;
}

export async function claimPendingReferral() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { localStorage.removeItem(STORAGE_KEY); return false; }
  if (!saved?.code || !saved?.savedAt || Date.now() - saved.savedAt > 30 * 24 * 60 * 60_000) { localStorage.removeItem(STORAGE_KEY); return false; }
  const claimed = await rpc('claim_affiliate_referral', { p_referral_code: saved.code, p_click_id: saved.clickId || null });
  localStorage.removeItem(STORAGE_KEY);
  return Boolean(claimed);
}

export const enroll = (displayName) => rpc('enroll_affiliate', { p_display_name: displayName });
export const getDashboard = () => rpc('get_affiliate_dashboard');
export const adminList = () => rpc('admin_get_affiliates');
export const adminReview = (affiliateId, status, commissionBps, reason) => rpc('admin_review_affiliate', { p_affiliate_id: affiliateId, p_status: status, p_commission_bps: commissionBps, p_reason: reason });

