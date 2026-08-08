# Story Loom Kids Security Test Plan

## Purpose

This plan proves that User A, User B, and an anonymous client cannot cross Story Loom's authentication, database, Storage, Edge Function, AI ownership, session, or cache boundaries. Run it against a non-production Supabase project first. If production verification is required, use dedicated ordinary test accounts and records whose names begin with `Phase 8`; never use the service-role key in this harness.

Record each result as one of:

- **STATICALLY VERIFIED** — source, migration, or build inspection proves the control exists.
- **AUTOMATED VERIFIED** — a repeatable test executed and passed.
- **MANUALLY REQUIRED** — inbox/OAuth interaction, production configuration, or two normal credentials are required.

## Safe test identities

Create two confirmed, ordinary email/password accounts through the normal signup flow:

- User A: dedicated security-test account, expected profile role `user`.
- User B: a different dedicated security-test account, expected profile role `user`.
- Anonymous: the public Supabase client with no session.

Do not put passwords in source control. Export these only in the shell that runs the harness:

```powershell
$env:SECURITY_TEST_USER_A_EMAIL = '<user-a-test-email>'
$env:SECURITY_TEST_USER_A_PASSWORD = '<user-a-test-password>'
$env:SECURITY_TEST_USER_B_EMAIL = '<user-b-test-email>'
$env:SECURITY_TEST_USER_B_PASSWORD = '<user-b-test-password>'
node --env-file=.env.local scripts/security/two-user-isolation.mjs
```

The harness uses only the public project key and the two normal sessions. It creates isolated `Phase 8` records and private one-pixel test objects, exercises denial paths, and removes its records and objects in `finally`. Do not run it while either test account is being used for unrelated work.

Before the live run, apply `20260808000000_harden_private_paths.sql` to the chosen environment and verify the deployed `story-ai` source matches the repository. The harness intentionally fails if those controls are absent. The linked project's CLI migration history is currently empty even though the application schema exists, so do **not** blindly run `supabase db push`: reconcile/repair the existing migration history or apply the reviewed hardening migration deliberately through the Dashboard SQL editor first.

## Authentication and profiles

| Test | Expected result | Evidence |
| --- | --- | --- |
| Anonymous reads `profiles` | 401/permission denial | Automated anonymous probe |
| A reads A profile; B reads B profile | One own row, role `user` | Two-user harness |
| A reads B or B reads A | Empty result, never the foreign row | Two-user harness |
| Normal user updates `profiles.role` | Permission denial | Two-user harness |
| Normal user inserts arbitrary/admin profile | Permission denial | Two-user harness |
| `user_metadata.role=admin` | App remains `user`; profile is authoritative | Static unit contract; manually inspect a test session if desired |
| Raw REST/SQL-style mutation | No exposed RPC; table grant/RLS denial | Static migration review and two-user harness |
| Initial load/reload/refresh/expired token | Protected routes show auth loading or login, never private content | Manual browser test |
| Password recovery | Recovery session can update password; no previous-user data appears | Manual inbox/browser test |

## Database isolation

For each resource created by User A, use both application services where applicable and direct Supabase queries from User B.

### Child characters

- A can create/read/update its character.
- B list/get by forged UUID returns no row.
- B update/delete affects no row; A can still read it afterward.
- B cannot create a story whose primary `child_character_id` is A's UUID.
- Anonymous access is denied.

### Stories

- A can create/read/update its story.
- B cannot list/get/update/delete it or change `cover_image_path`, `page_count`, `translations`, or `secondary_characters`.
- B cannot attach A's primary character because the composite foreign key requires `(user_id, child_character_id)` to share an owner.
- Missing and foreign UUIDs produce the same non-enumerating application result.

### Story pages

- B cannot read/update/delete A's page.
- B cannot insert a page with A's `story_id` because both RLS and the `(user_id, story_id)` composite foreign key reject it.
- Page ordering and uniqueness remain enforced independently of authorization.

### Secondary-character JSON

Attempt each of these as User B and require a database failure:

- A's saved-character UUID.
- Non-UUID `character_id`.
- Extra keys.
- Both `character_id` and `quick_description`.
- Empty `quick_description`.
- Non-object array member.

After every failed write, confirm B's valid control story is unchanged and readable.

### AI usage

- Anonymous and authenticated browser clients cannot select or insert `ai_usage`.
- The Edge Function can log only after it derives `userId` from a verified JWT.
- A usage row with a story must satisfy the same-owner composite foreign key.

## Storage isolation

Test `character-photos`, `character-images`, and `story-images`. For an A-owned canonical object, B must be unable to list, download, create a signed URL, overwrite/upsert, or delete it. Anonymous list must expose no object and anonymous download/signing must fail.

Explicitly attempt and reject:

```text
{userA_UUID}/...
{userB_UUID}/../escape.png
{userB_UUID}/{resource_UUID}/../portrait.png
{userB_UUID}//{resource_UUID}/portrait.png
missing-prefix/{resource_UUID}/portrait.png
```

After every B delete/overwrite attempt, download as A to prove the original still exists. Confirm all buckets are private and bucket MIME/size limits match the migrations.

## Signed URLs, sessions, and caches

- Database rows contain canonical object paths only; attempts to persist HTTPS/signed URLs fail database constraints.
- Signed URL lifetime defaults to five minutes and is capped at one hour.
- Logout clears `signedUrlCache` and the TanStack Query cache.
- A→B session replacement clears the old identity, private URL cache, and query cache synchronously before remote verification; protected routes return to their loading boundary.
- Manually switch A→B in one browser profile and confirm no A title, image, character, or story flashes. Inspect network requests to ensure no A signed URL is reused.
- Repeat for reload, refresh-token event, expired/revoked session, and password recovery.

## Edge Function and AI ownership

Automated safe probes must show 401 for no token and an invalid token. A disallowed CORS origin must receive 403 without an `Access-Control-Allow-Origin` header.

As User B, invoke each operation with User A's ID:

- `analyze-character`
- `generate-character-image`
- `generate-page-image`
- `suggest-continuation`
- `continue-story`
- `translate-story`
- `generate-cover`

Each must fail at `ownedCharacter` or `ownedStory`, before `assertAiEntitlement` and before any OpenAI call. Review Edge logs/provider usage during the run to confirm no provider request or charge was produced. Do not call `generate-story` merely to test authorization; it has no pre-existing owned resource and would intentionally invoke the provider for an authenticated user.

`assertAiEntitlement()` must remain server-side, receive the authenticated server-derived user ID, and execute before every provider boundary. It is currently allow-all pending the dedicated Stripe phase; browser subscription metadata is never consulted.

## Secrets, CORS, queries, and errors

- Search `src/` and `dist/` for `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `api.openai.com`, bearer tokens, and real secret values. Expect zero frontend matches; the Phase 8 build scan met this condition.
- Service-role use is limited to `ai_usage` insertion. All resource reads/downloads/uploads use the caller-scoped client and RLS first.
- `ALLOWED_ORIGINS` must list exact local/preview/production origins. Do not use `*`; remove obsolete preview origins.
- Supabase/PostgREST query builders carry all user strings. No raw SQL is assembled from request input.
- User errors contain stable codes/messages only. Confirm responses contain no SQL, stack, provider body, key, token, prompt, photo, or unnecessary private path.

## Validation commands

```powershell
npm test
npm run lint
npm run build
npm run typecheck
git diff --check
supabase migration list
```

For Edge source validation, run `deno check supabase/functions/story-ai/index.ts` when Deno is installed, or serve the function through a local Supabase stack. Finally, inspect the deployed migration/policy/function versions before declaring production readiness.

## Completion gate

Production isolation is approved only when:

1. All static and repository tests pass, except any separately documented pre-existing typecheck limitation.
2. The hardening migration and matching Edge Function are deployed.
3. The ordinary two-user harness passes completely.
4. Manual browser session-switch/recovery tests show no stale data flash.
5. Edge/provider logs prove all cross-user AI attacks stopped before provider spend.
