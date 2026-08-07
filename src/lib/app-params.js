// Temporary Base44 runtime configuration retained only for entity and AI calls.
// Supabase Auth is authoritative; no Base44 access token is read or persisted.
const isNode = typeof window === 'undefined';
const storage = isNode ? null : window.localStorage;

if (!isNode) {
  storage.removeItem('base44_access_token');
  storage.removeItem('token');
  const params = new URLSearchParams(window.location.search);
  const original = params.toString();
  for (const name of ['access_token', 'clear_access_token', 'from_url']) params.delete(name);
  if (params.toString() !== original) {
    const query = params.toString();
    window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
}

const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const getAppParamValue = (paramName, defaultValue) => {
  if (isNode) return defaultValue;
  const storageKey = `base44_${toSnakeCase(paramName)}`;
  const searchParam = new URLSearchParams(window.location.search).get(paramName);
  if (searchParam) {
    storage.setItem(storageKey, searchParam);
    return searchParam;
  }
  if (defaultValue) return defaultValue;
  return storage.getItem(storageKey);
};

export const appParams = {
  appId: getAppParamValue('app_id', import.meta.env.VITE_BASE44_APP_ID),
  functionsVersion: getAppParamValue('functions_version', import.meta.env.VITE_BASE44_FUNCTIONS_VERSION),
  appBaseUrl: getAppParamValue('app_base_url', import.meta.env.VITE_BASE44_APP_BASE_URL),
};
