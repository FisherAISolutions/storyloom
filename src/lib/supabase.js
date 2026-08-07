import { createClient } from '@supabase/supabase-js';
import { ServiceError } from '@/services/errors';

let client;

function readBrowserConfig() {
  const env = import.meta.env || {};
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [];

  if (!url) missing.push('VITE_SUPABASE_URL');
  if (!publishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (missing.length) {
    throw new ServiceError(
      'CONFIGURATION',
      `Supabase is not configured. Add ${missing.join(' and ')} to .env.local.`,
    );
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new ServiceError('CONFIGURATION', 'VITE_SUPABASE_URL must be a valid HTTP(S) URL.');
  }

  return { url, publishableKey };
}

/**
 * Lazily returns the single browser Supabase client.
 *
 * Lazy initialization keeps the still-active Base44 runtime usable before
 * Supabase environment variables are configured. The SDK's browser defaults
 * persist and refresh sessions; Phase 4 will subscribe to auth state changes.
 */
export function getSupabaseClient() {
  if (!client) {
    const { url, publishableKey } = readBrowserConfig();
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}
