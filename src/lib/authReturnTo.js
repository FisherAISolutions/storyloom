// Shared by the Supabase auth pages and callback flow. Keep the redirect
// validation in one place because it is security-sensitive and easy to drift.

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but can normalize to a protocol-relative URL
// when assigned to location.href. Require exactly one leading slash and no
// backslashes.
export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";

    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}
