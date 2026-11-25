import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { ServiceError } from '@/services/errors';

const STORAGE_KEY = 'mystorybook_customer_referral';

async function rpc(name, input = {}) {
  const { data, error } = await getSupabaseClient().rpc(name, input);
  if (error) throw new ServiceError('REFERRAL_ERROR', 'The referral request could not be completed.');
  return data;
}

export function rememberReferral(code) {
  if (!/^[a-z0-9]{8,24}$/.test(code || '')) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: code.toLowerCase(), savedAt: Date.now() }));
  return true;
}

export async function claimPendingReferral() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { localStorage.removeItem(STORAGE_KEY); return false; }
  if (!saved?.code || Date.now() - saved.savedAt > 30 * 24 * 60 * 60_000) { localStorage.removeItem(STORAGE_KEY); return false; }
  const claimed = await rpc('claim_customer_referral', { p_referral_code: saved.code });
  localStorage.removeItem(STORAGE_KEY);
  return Boolean(claimed);
}

export async function getDashboard() { await requireAuthenticatedUser(); return rpc('get_customer_referral_dashboard'); }
export async function acceptTerms(version) { await requireAuthenticatedUser(); await rpc('accept_policy', { p_policy_key: 'customer_referral', p_policy_version: version, p_context: 'customer_referral_dashboard' }); }
