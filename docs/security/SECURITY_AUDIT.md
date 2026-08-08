# Story Loom Kids Security Audit

Audit date: 2026-08-07  
Scope: authentication, profiles, user-owned database rows, private Storage, signed URLs, session/cache transitions, `story-ai`, AI usage, secrets, CORS, migrations, validation, and error behavior.

## Executive result

The repository has a strong least-privilege design: ordinary browser clients receive only a publishable key, every application table has RLS, owner filters are duplicated in services, same-owner composite foreign keys prevent relationship forgery, Storage is private, AI resource checks use the caller's JWT, and the service role is confined to authoritative usage logging.

Anonymous live verification passed. Full two-user runtime proof is **MANUALLY REQUIRED** because two confirmed ordinary test-account credentials were not available. The new hardening migration is source-controlled but was not pushed automatically. Production readiness is therefore conditional on deploying it and completing the ordinary-user harness and browser transition checks in `SECURITY_TEST_PLAN.md`.

## Verification status

### Automated verified

- Deployed anonymous REST reads for `profiles`, `child_characters`, `stories`, `story_pages`, and `ai_usage` returned 401.
- Anonymous listing of all three private buckets returned zero objects.
- Anonymous and invalid-JWT `story-ai` calls returned 401.
- A disallowed-origin preflight returned 403 without an allow-origin response header.
- The production build completed, and exact frontend scans found zero `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or `api.openai.com` identifiers and no credential-like literal.
- Repository contracts cover RLS/grants, profile role protection, composite ownership, secondary JSON shape/ownership, canonical Storage paths, signed URL/cache clearing, Edge authentication/ownership ordering, entitlement ordering, secret separation, CORS, safe errors, and server input limits.

### Statically verified

- Profiles: own-row select only; no authenticated insert/update/delete grant or policy. `handle_new_user()` always writes role `user` and ignores metadata.
- Characters/stories: owner-scoped RLS for all CRUD; services derive `user_id` from `auth.getUser()` and reject caller ownership overrides.
- Story pages: policies require both matching `user_id` and an owned parent; composite FK makes forged `(user_id, story_id)` impossible.
- Primary and secondary saved characters must share the story owner. Secondary JSON accepts exactly one of a valid owned `character_id` or non-empty `quick_description`.
- `ai_usage`: RLS enabled, no browser grants/policies, same-owner story FK, service-role insert only after authentication.
- Edge authentication derives the user from `auth.getUser(token)` and ignores browser owner/role/subscription fields.
- All story/character AI operations load the resource through a caller-scoped RLS client before provider calls.
- `assertAiEntitlement()` is server-side and precedes provider calls. It remains intentionally allow-all until Stripe is implemented.
- Service role appears only in the Edge Function and is used only for `ai_usage`; resource reads and Storage operations use the caller client.
- OpenAI key and API origin are absent from browser source. The key is read only with `Deno.env` in server code.
- CORS uses an exact configured-origin allowlist and has no wildcard fallback.
- Queries use Supabase/PostgREST builders; no user-controlled raw SQL construction was found.
- Stable application errors omit provider bodies, SQL, stack traces, credentials, and photo bytes.

### Manually required

- Execute the two-user harness with two confirmed normal accounts.
- Inspect provider/Edge logs during forged AI calls to prove zero OpenAI spend.
- Verify A→B browser switching, reload, refresh, expiry/revocation, and password recovery without stale UI.
- Confirm deployed RLS/policies/functions match source after applying the new migration.
- Reconcile the linked project's empty CLI migration history before using `supabase db push`; its dry run currently proposes all three migrations, including the already-existing foundation.
- Verify production `ALLOWED_ORIGINS`, Auth Site URL/redirect allowlists, Google provider configuration if enabled, and log retention/access.

## Findings

### P0 — exploitable exposure

None found.

### P1 — serious weakness

#### P1-1: previous identity remained rendered during a direct user replacement

Before the fix, a new session event started remote `getUser()` and profile resolution while the previous React identity could remain authenticated. Caches were cleared only after verification completed. A direct A→B replacement could therefore briefly render A's already-loaded state.

**Fixed:** `AuthContext` now detects a different session subject and synchronously clears the signed-URL cache, TanStack Query cache, user, authenticated flag, and auth-checked state before the first asynchronous verification. Protected routes return to their loading boundary.

### P2 — hardening

#### P2-1: owner-prefix Storage policies accepted noncanonical names

The original policies checked only the first folder segment. They did not explicitly forbid dot segments, double separators, or names outside Story Loom's resource layouts.

**Fixed in migration:** `is_storyloom_storage_path()` now recognizes only canonical per-bucket paths, all four Storage policies call it, and database media columns use matching constraints. Browser path validation additionally rejects empty, dot, backslash, and control-character segments. The hosted Storage gateway canonicalizes doubled slashes before policy evaluation; the live harness now accepts that case only when the returned object path is the exact single-slash canonical path inside the same authenticated user's namespace.

#### P2-2: database media columns could hold external or signed URLs

RLS prevented cross-user reads, but writable media fields had no schema constraint requiring canonical object paths.

**Fixed in migration:** validated check constraints now reject signed/external URLs and cross-owner/noncanonical paths for original photos, portraits, story pages, and covers.

#### P2-3: uploaded photo MIME could be asserted without matching bytes

Bucket MIME/size limits and the Edge Function checked declared MIME and size, but not the source image signature.

**Fixed:** browser upload and Edge download paths now enforce positive size, the 10 MiB limit, and matching JPEG/PNG/WebP magic bytes before upload/provider processing.

#### P2-4: trigger functions retained default direct execute privileges

Trigger functions are not normal RPC entry points, and the elevated profile bootstrap used an empty `search_path`, but least privilege favors removing default API-role execute grants.

**Fixed in migration:** direct execute is revoked from `public`, `anon`, and `authenticated` for all four trigger functions. The canonical-path helper is granted only to `authenticated` for policy/constraint evaluation.

#### P2-5: AI rate limiting is per isolate, not distributed

The in-memory minute window is a useful local throttle but can reset on cold starts and does not provide an authoritative cross-instance quota.

**Remaining:** acceptable as interim defense, not sufficient for billing or abuse control. Replace or supplement it with server-authoritative quota state during the dedicated entitlement/Stripe phase. Do not trust browser state.

#### P2-6: linked production migration history is not reconciled

`supabase migration list` showed the three local versions with no corresponding remote-history entries, and `supabase db push --dry-run` proposed the foundation, repair, and new hardening migrations. The live application indicates the foundation objects exist, so an unreviewed push could conflict rather than safely applying only Phase 8.

**Remaining:** repair/reconcile migration history or deliberately apply the reviewed hardening SQL through the Dashboard, then confirm the local/remote histories agree. No remote mutation was performed during this audit.

### P3 — improvements

- Production dependency advisories remain a separate dependency-hardening task.
- Browser upload validation does not decode dimensions; signature, MIME, and size are enforced, and malformed provider input fails safely. Dimension limits can be added during media hardening if product requirements establish bounds.
- The current error contract intentionally collapses invisible and missing resources in browser services. Edge ownership failures use the same unavailable response, preventing enumeration.

## Resource-by-resource conclusion

| Boundary | Conclusion |
| --- | --- |
| Profiles | Strong static design; anonymous live denial passed; two-user mutation/read proof pending harness |
| Child characters | Owner RLS and same-owner reference constraint verified statically; live A/B proof pending |
| Stories | Owner RLS and canonical media references verified statically; live A/B proof pending |
| Story pages | Parent-owner RLS plus composite FK verified statically; live A/B proof pending |
| Secondary characters | Strict shape and same-owner trigger verified statically; malformed/foreign runtime proof pending |
| Storage | Anonymous live isolation passed; canonical-policy migration added; live A/B proof pending deployment |
| Signed URLs/cache | Five-minute transient cache and logout/user-change clearing verified; browser switch proof pending |
| Edge/AI ownership | Authentication and ownership-before-provider ordering verified; live cross-user/provider-log proof pending |
| AI usage | No browser grants/policies and service-only insert verified |
| Secrets | No privileged browser references found; production bundle scan required after final build |

## Production decision

The repository is ready for the remaining verification work, but user isolation should not yet be labeled fully production-proven. Apply the hardening migration, deploy the matching Edge source, pass the normal two-user harness, and complete manual session-transition/provider-log checks. After those gates pass, the architecture is suitable for dependency hardening and then the dedicated Stripe phase.
