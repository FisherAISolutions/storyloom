import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { queryClientInstance } from '@/lib/query-client';
import { clearSignedUrlCache } from '@/services/storage';
import { didAuthenticatedUserChange, INITIAL_AUTH_STATE, toAppUser } from '@/lib/authState';

const AuthContext = createContext(null);

function clearUserScopedState() {
  clearSignedUrlCache();
  queryClientInstance.clear();
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(INITIAL_AUTH_STATE.user);
  const [isAuthenticated, setIsAuthenticated] = useState(INITIAL_AUTH_STATE.isAuthenticated);
  const [isLoadingAuth, setIsLoadingAuth] = useState(INITIAL_AUTH_STATE.isLoadingAuth);
  const [authChecked, setAuthChecked] = useState(INITIAL_AUTH_STATE.authChecked);
  const [authError, setAuthError] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => window.location.hash.includes('type=recovery'));
  const userIdRef = useRef(null);
  const revisionRef = useRef(0);

  const applySignedOut = useCallback(() => {
    if (userIdRef.current) clearUserScopedState();
    userIdRef.current = null;
    setUser(null);
    setIsAuthenticated(false);
    setIsPasswordRecovery(false);
    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, []);

  const resolveSession = useCallback(async (session, { loading = false } = {}) => {
    const revision = ++revisionRef.current;
    if (loading) setIsLoadingAuth(true);
    setAuthError(null);

    if (!session?.user) {
      applySignedOut();
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError || new Error('No authenticated user');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (revision !== revisionRef.current) return;
      if (didAuthenticatedUserChange(userIdRef.current, userData.user.id)) clearUserScopedState();
      userIdRef.current = userData.user.id;

      // Profile failures never grant privilege. Auth remains usable with the
      // least-privileged role while the error is available for diagnostics/UI.
      if (profileError) {
        setAuthError({ type: 'profile_unavailable', message: 'Your account profile could not be loaded.' });
      }

      setUser(toAppUser(userData.user, profile?.role));
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch {
      if (revision !== revisionRef.current) return;
      clearUserScopedState();
      userIdRef.current = null;
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Your session is no longer valid.' });
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [applySignedOut]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    const initialize = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (active) await resolveSession(data.session, { loading: true });
      } catch {
        if (!active) return;
        setAuthError({ type: 'auth_unavailable', message: 'Authentication could not be initialized.' });
        applySignedOut();
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') {
        ++revisionRef.current;
        applySignedOut();
        return;
      }

      // Supabase recommends keeping auth callbacks lightweight. Resolve the
      // verified user/profile after the callback returns.
      window.setTimeout(() => {
        if (active) void resolveSession(session);
      }, 0);
    });

    void initialize();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [applySignedOut, resolveSession]);

  const logout = useCallback(async () => {
    clearUserScopedState();
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) {
      setAuthError({ type: 'logout_failed', message: 'Could not log out. Please try again.' });
      throw error;
    }
    applySignedOut();
  }, [applySignedOut]);

  const checkUserAuth = useCallback(async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    await resolveSession(data.session, { loading: true });
  }, [resolveSession]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authChecked,
      authError,
      isPasswordRecovery,
      logout,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
