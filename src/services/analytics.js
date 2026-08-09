import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

const RANGES = new Set(['7d', '30d', 'month', 'all']);

export async function getAiEconomics(range = '30d') {
  if (!RANGES.has(range)) throw new ServiceError('VALIDATION', 'Choose a supported reporting range.');
  const { data, error } = await getSupabaseClient().rpc('get_admin_ai_economics', { p_range: range });
  if (error) throw new ServiceError(error.message?.includes('ADMIN_REQUIRED') ? 'PERMISSION_DENIED' : 'ANALYTICS_ERROR', error.message?.includes('ADMIN_REQUIRED') ? 'Administrator access is required.' : 'AI economics could not be loaded.');
  return data;
}
