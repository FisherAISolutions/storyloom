export const INITIAL_AUTH_STATE = {
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authChecked: false,
};

export function toAppUser(authUser, role = 'user') {
  if (!authUser) return null;
  return {
    id: authUser.id,
    email: authUser.email || null,
    role: role === 'admin' ? 'admin' : 'user',
  };
}

export function didAuthenticatedUserChange(previousUserId, nextUserId) {
  return Boolean(previousUserId && previousUserId !== nextUserId);
}
