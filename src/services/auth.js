import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError, toServiceError } from '@/services/errors';

/** Resolve identity from Supabase Auth on every service operation. */
export async function requireAuthenticatedUser() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (error.status === 401 || error.status === 403) {
      throw new ServiceError('AUTH_REQUIRED', 'Authentication is required.');
    }
    throw toServiceError(error, 'Authentication');
  }

  if (!data.user) {
    throw new ServiceError('AUTH_REQUIRED', 'Authentication is required.');
  }

  return data.user;
}
