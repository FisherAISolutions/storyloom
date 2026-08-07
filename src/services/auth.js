import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError, toServiceError } from '@/services/errors';

function normalizeEmail(email) {
  if (typeof email !== 'string' || !email.trim()) {
    throw new ServiceError('VALIDATION', 'Email is required.');
  }
  return email.trim().toLowerCase();
}

function requirePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new ServiceError('VALIDATION', 'Password must be at least 6 characters.');
  }
  return password;
}

function authFailure(error, fallback = 'Authentication could not be completed.') {
  if (error?.status === 429) {
    return new ServiceError('AUTH_FAILED', 'Too many attempts. Please wait and try again.');
  }
  return new ServiceError('AUTH_FAILED', fallback, { cause: error });
}

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

export async function signInWithPassword(email, password) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: normalizeEmail(email),
    password: requirePassword(password),
  });
  if (error) throw authFailure(error, 'Email or password is incorrect.');
  return data;
}

export async function signUpWithPassword(email, password, emailRedirectTo) {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: normalizeEmail(email),
    password: requirePassword(password),
    options: { emailRedirectTo },
  });
  if (error) throw authFailure(error, 'Account creation could not be completed.');
  return data;
}

export async function resendSignupConfirmation(email, emailRedirectTo) {
  const { error } = await getSupabaseClient().auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: { emailRedirectTo },
  });
  if (error) throw authFailure(error, 'The confirmation email could not be sent.');
}

export async function signInWithGoogle(redirectTo) {
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw authFailure(error, 'Google sign-in could not be started.');
  return data;
}

export async function requestPasswordReset(email, redirectTo) {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo,
  });
  if (error && error.status === 429) throw authFailure(error);
  // Preserve an account-enumeration-safe result for all other responses.
}

export async function updatePassword(password) {
  const { data, error } = await getSupabaseClient().auth.updateUser({
    password: requirePassword(password),
  });
  if (error) throw authFailure(error, 'Your password could not be updated. Request a new recovery link.');
  return data;
}
