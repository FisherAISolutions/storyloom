export const INITIAL_AUTH_STATE = {
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authChecked: false,
};

export function toAppUser(authUser, role = 'user') {
  if (!authUser) return null;
  const allowedRoles = new Set(['owner', 'admin', 'moderator', 'support', 'tester', 'user']);
  return {
    id: authUser.id,
    email: authUser.email || null,
    role: allowedRoles.has(role) ? role : 'user',
  };
}

export function didAuthenticatedUserChange(previousUserId, nextUserId) {
  return Boolean(previousUserId && previousUserId !== nextUserId);
}
