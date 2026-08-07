# Story Loom Kids Migration

## Purpose and scope

This repository is the migration copy of Story Loom Kids. The original live Base44 application remains untouched and is the behavioral reference. There are no production customers or records to transfer; Supabase will start with fresh users and data. Migration work must preserve the existing interface, workflows, prompts, art styles, story behavior, and generated-output intent.

Phase 1 established the audit and documentation. Phase 2 added the source-controlled Supabase backend foundation. Phase 3 adds a lazy browser client and schema-aligned service layer while the application continues to run on Base44.

## Current architecture

- React 18 and Vite 6 frontend with React Router routes for home, creation, characters, library, and story editing.
- `@base44/vite-plugin` supplies Base44 development proxying and platform helpers.
- A browser-side `@base44/sdk` client handles authentication, entity CRUD, uploads, LLM calls, and image generation.
- Base44 entities are `User`, `Story`, `StoryPage`, and `ChildCharacter`; their JSONC definitions are retained under `base44/entities/`.
- AI prompts and orchestration live in `src/lib/storyStudio.js`; Base44 Core integrations execute text/vision and image requests.
- Uploaded and generated media are persisted as external URL strings on entity records.
- PDF generation is browser-side with jsPDF and fetches all images by URL.

## Target architecture

- Preserve the React/Vite/React Router frontend and existing UI components.
- Use Supabase Auth for email/password, email verification, Google OAuth, password recovery, logout, and session persistence.
- Use Supabase PostgreSQL for stories, ordered story pages, child characters, translations, and ownership metadata.
- Use Supabase Storage for original photos, character portraits, story-page images, covers, and copied template/static assets.
- Enforce per-user access with RLS on every user-owned table and storage policy.
- Use Supabase Edge Functions for trusted OpenAI text generation, vision analysis, and image generation/editing. OpenAI and service-role secrets never enter the Vite bundle.
- Return controlled storage paths or signed/public URLs appropriate to the bucket policy; do not depend on temporary third-party generation URLs.

## Base44 dependency inventory

### Packages and build integration

| Location | Dependency | Current role | Planned replacement |
| --- | --- | --- | --- |
| `package.json`, `package-lock.json` | `@base44/sdk` 0.8.41 | Browser client, auth, CRUD, integrations | `@supabase/supabase-js` plus typed local service modules |
| `package.json`, `package-lock.json` | `@base44/vite-plugin` 1.0.30 | Proxying, navigation/analytics/edit helpers | Remove after all runtime dependencies are replaced; standard Vite config |
| `vite.config.js` | Base44 Vite plugin and `BASE44_LEGACY_SDK_IMPORTS` | Build/dev platform integration | Standard React Vite plugin only |
| `base44/config.jsonc` | Base44 site commands | Platform build configuration | Retain during migration, then remove after independent deploy is verified |
| `base44/entities/*.jsonc` | Four entity definitions | Legacy schema reference | Supabase SQL migrations and generated/database types |

### Client construction, URLs, environment, and tokens

| Location | Dependency | Notes / replacement |
| --- | --- | --- |
| `src/api/base44Client.js` | `createClient` from `@base44/sdk` | Replace with Supabase client and separate server-function API wrapper. Current client uses `requiresAuth: false` and empty `serverUrl` plus app parameters. |
| `src/lib/AuthContext.jsx` | `createAxiosClient` internal SDK import | Calls `/api/apps/public/prod/public-settings/by-id/{appId}` before `base44.auth.me()`. Replace platform-app gating with Supabase session initialization and auth-state subscription. |
| `src/lib/app-params.js` | Base44 URL/localStorage bootstrap | Reads query parameters `app_id`, `access_token`, `from_url`, `functions_version`, `app_base_url`, and `clear_access_token`; persists `base44_<snake_case>` keys; removes `base44_access_token` and `token`. Replace with Supabase-managed sessions and validated redirect handling. |
| Environment | `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION`, `VITE_BASE44_APP_BASE_URL`, `BASE44_LEGACY_SDK_IMPORTS` | Documented or referenced legacy variables. No `.env*` file is checked in. Replace with public Supabase URL/anon key only; server secrets belong in Edge Function secrets. |
| `src/pages/OAuthConsent.jsx` | `/api/apps/{appId}/mcp/consent-info` and `/api/apps/{appId}/mcp/authorize-grant` | Base44 MCP authorization flow, indirectly dependent on `appParams` token/cookie semantics. Decide whether this platform-only route is out of scope or needs a separate replacement before removal. It is not currently routed by `src/App.jsx`. |
| `README.md` | Base44 CLI, dashboard, hosted backend URLs/workflow | Update in a later implementation phase when the independent local/deploy workflow exists. |

No hard-coded deployed Base44 API origin was found; runtime API calls use relative `/api` paths. `index.html` references `https://base44.com/logo_v2.svg`.

### Authentication calls and consumers

- `src/lib/AuthContext.jsx`: `auth.me`, `auth.logout`, `auth.redirectToLogin`; also Base44 public-settings gating.
- `src/pages/Login.jsx`: `auth.loginViaEmailPassword`, Google `auth.loginWithProvider`.
- `src/pages/Register.jsx`: `auth.register`, `auth.verifyOtp`, `auth.setToken`, `auth.resendOtp`, Google `auth.loginWithProvider`.
- `src/pages/ForgotPassword.jsx`: `auth.resetPasswordRequest`, deliberately always renders a success state to avoid account enumeration.
- `src/pages/ResetPassword.jsx`: `auth.resetPassword` using a `token` query parameter.
- `src/lib/PageNotFound.jsx`: indirect role-aware `auth.me` call for an admin-only note.
- `src/App.jsx`, `src/components/ProtectedRoute.jsx`, `src/components/UserNotRegisteredError.jsx`, `src/components/Layout.jsx`: consume or participate in the Base44-shaped authentication/app-access flow indirectly. `ProtectedRoute` exists but is not wired into the current route tree; `AuthenticatedApp` globally handles platform auth errors instead.
- `src/lib/authReturnTo.js`, auth pages, and OAuth consent preserve validated return paths and must retain open-redirect protections.

Auth pages exist in source but are not registered as routes in `src/App.jsx`; the Base44 platform/plugin may currently own or inject those paths. This needs explicit Supabase routing during the auth phase.

### Entity CRUD inventory

| Entity | Operations and locations | Replacement |
| --- | --- | --- |
| `Story` | Create and finalize in `src/pages/CreateStory.jsx`; get/update translations, cover, and status in `src/pages/StoryEditor.jsx`; list newest-first in `src/pages/Library.jsx`; update cover in `src/components/CoverCreator.jsx`; update `page_count` in `src/components/ContinueStoryModal.jsx` | User-owned `stories` table with RLS and transactional/server-assisted orchestration where appropriate |
| `StoryPage` | Sequential create in `CreateStory.jsx`; filter by `story_id`, client sort by `page_number`, update text/image in `StoryEditor.jsx`; append sequential pages in `ContinueStoryModal.jsx` | User-owned `story_pages` table, foreign key/cascade policy, uniqueness on `(story_id,page_number)`, deterministic ordering |
| `ChildCharacter` | Newest-first list, upload-derived create in `Characters.jsx`; list for reuse in `CreateStory.jsx`; get primary/secondary saved characters in `storyStudio.js` | User-owned `child_characters` table plus private Storage objects and RLS |
| `User` | Role read through `auth.me()` in `PageNotFound.jsx`; schema declares `admin`/`user` | Supabase profile/role strategy or JWT claim with explicit authorization policy |

No entity delete calls were found. Story deletion and character update/delete are not currently supported in the checked-in UI.

### Integrations, uploads, and AI calls

- Upload: `Characters.jsx` calls `Core.UploadFile`, then stores the returned `file_url` as `ChildCharacter.photo_url`.
- `InvokeLLM` calls in `storyStudio.js`:
  1. structured initial story generation;
  2. structured continuation suggestion;
  3. structured continuation-page generation;
  4. ordered translation generation;
  5. photo vision analysis via `file_urls`.
- `GenerateImage` calls:
  1. story-page illustration in `storyStudio.js`;
  2. child portrait with optional `existing_image_urls` in `storyStudio.js`;
  3. editable custom cover generation in `CoverCreator.jsx`.
- Replace every AI call with authenticated Edge Functions invoking OpenAI. Preserve the prompt strings and response shapes, validate structured output, authorize referenced rows/storage objects, rate-limit costly operations, and persist generated image bytes into Supabase Storage before saving a database reference.

### URL-based image persistence and static assets

- Database URL fields: `Story.cover_image_url`, `StoryPage.image_url`, `ChildCharacter.photo_url`, and `ChildCharacter.character_image_url`.
- Runtime consumers: story editor display/regeneration, library covers, character gallery, cover creator, PDF fetch/export, and AI vision/image reference inputs.
- Initial story creation sets the first generated page image as the cover. Regenerating page 1 also synchronizes the story cover; a later custom cover can intentionally diverge.
- `src/lib/templates.js` contains nine `media.base44.com` template thumbnails; `src/pages/Home.jsx` contains one `media.base44.com` hero image.
- `src/components/ui/image.jsx` explicitly recognizes `media.base44.com` as a Wix media host and transforms such URLs. Preserve the component until assets are copied and its non-Base44 behavior is assessed.
- `index.html` uses a Base44-hosted favicon.
- PDF generation fetches image URLs from the browser and therefore requires durable URLs and compatible CORS responses.

### Indirect route/component dependencies

- Direct route pages using Base44: Create Story, Characters, Library, and Story Editor.
- Home indirectly depends on Base44-hosted static media and templates used through links/cards.
- Story Editor indirectly depends on `storyStudio.js`, Cover Creator, Continue Story Modal, Language Picker, PDF generation, and the URL-aware Image component.
- Create Story indirectly depends on `storyStudio.js`, Character Slots, templates, art-style prompt definitions, and the Image component.
- The whole routed application depends on `AuthContext` and Base44 public-settings/auth initialization.
- Page Not Found independently checks Base44 auth/role.
- Login, Register, Forgot Password, Reset Password, OAuth Consent, and Protected Route contain Base44 behavior but are not mounted in the checked-in route table.

## Migration phases

1. **Audit and guardrails (this phase):** inventory Base44, update agent guidance, record parity/security requirements, and validate the unchanged app.
2. **Supabase foundation/schema:** add Supabase client/config, SQL schema, ownership columns, constraints, RLS/storage policies, and fresh-data development setup while retaining legacy references.
3. **Authentication:** explicitly route auth pages; implement email signup/verification, login, Google OAuth, logout, reset, session persistence, and protected routes.
4. **Data and storage:** replace entity CRUD and upload flows; copy bundled/static Base44 media into project-controlled storage; retain stable compatibility boundaries.
5. **OpenAI Edge Functions:** replace structured text, translation, vision, and image calls; preserve prompts/output semantics and securely persist results.
6. **Workflow parity and hardening:** verify story creation/editor/continuation/cover/PDF behavior, error handling, authorization, ordering, atomicity, quotas, and cleanup.
7. **Base44 removal:** remove SDK/plugin/config, URL/token conventions, platform-only routes/assets/docs, and dependencies only after parity checks pass.

## Behavioral parity requirements

The detailed executable checklist is in `PARITY_CHECKLIST.md`. High-risk parity areas are exact page counts and ordering, character consistency, existing prompt/art-style wording, first-page/cover synchronization, custom-cover divergence, per-page translation invalidation, continuation page numbering, newest-first library order, and browser PDF image loading.

## Security invariants

- OpenAI keys and Supabase service-role credentials exist only in trusted server secrets.
- The browser receives only the Supabase project URL and public/anon key.
- Every user-owned row and Storage object is protected by Auth and least-privilege RLS/storage policies.
- Edge Functions derive user identity from a verified Supabase JWT and re-check ownership; they never trust a browser-supplied owner ID or arbitrary storage URL.
- Password recovery and signup responses avoid account enumeration; redirect destinations remain same-origin/allowlisted.
- Uploads enforce type/size limits and private child-photo handling. Generated assets must be copied from temporary provider URLs into controlled storage.
- Logs and errors must not expose photos, prompts containing sensitive child details, access tokens, or secrets.
- Costly AI endpoints require authentication, input validation, rate/cost controls, and idempotency/retry consideration.

## Final zero-Base44 acceptance criteria

- No Base44 packages, imports, Vite plugins, CLI/config requirements, API URLs, environment variables, localStorage/token conventions, or platform-only auth calls remain.
- No runtime asset references `base44.com` or `media.base44.com`; required images are project-controlled and verified.
- The `base44/` reference directory is removed only after equivalent Supabase migrations/policies are implemented and verified.
- All application routes and every checklist item pass against fresh Supabase data.
- RLS/storage isolation is tested with at least two users and anonymous access; privileged keys are absent from built assets.
- OpenAI calls execute only server-side and all generated images are durably persisted.
- Build, lint, typecheck, tests (if added), and production smoke tests pass without Base44 services.

## Phase 1 findings and risks

- Auth source pages are not present in the route table; their current reachability likely depends on platform behavior.
- `OAuthConsent.jsx` is Base44-platform-specific and needs an explicit product decision before removal.
- Story creation and continuation perform many sequential remote operations without transaction/resume cleanup, so partial stories/pages can remain after failure.
- Errors are frequently swallowed, making failed generation or persistence hard to diagnose.
- AI response schemas request exact page counts but code does not validate the returned length before persisting.
- Page ordering is enforced only by client sorting, and PDF generation mutates the passed pages array with in-place `sort()`.
- URL-only media records rely on durability and CORS outside the database; child photos require a private-storage design.
- Story records duplicate the first saved character in `child_character_id` and `secondary_characters`; character resolution deduplicates it. Preserve or intentionally normalize this behavior.
- No deletion UI exists, despite deletion appearing in the requested parity checklist.

## Phase 2 foundation

The destination backend is defined by `supabase/migrations/20260807000000_storyloom_foundation.sql`, with setup and verification instructions in `SUPABASE_SETUP.md`. It creates fresh Supabase-owned UUID data, private storage, strict RLS, same-owner relational constraints, safe profile creation, and trusted-backend-only AI usage accounting. No React runtime path is switched in this phase.

## Phase 3 data-access foundation

The browser client, authenticated ownership model, CRUD service APIs, private Storage helpers, temporary signed-URL strategy, and service error contract are documented in `DATA_ACCESS.md`. These modules are not wired into React yet, so Base44 remains the active runtime. Phase 4 will migrate authentication and clear private URL cache state on logout/user changes.

## Phase 1 validation

Validation attempted on 2026-08-06:

- `npx skills add base44/skills`: stalled without output and was stopped; no repository changes resulted.
- `npm install`: stalled without output and was stopped rather than changing dependency versions or registry configuration.
- `npm run build`: could not start because `vite` is unavailable (`'vite' is not recognized`).
- `npm run lint`: could not start because `eslint` is unavailable (`'eslint' is not recognized`).
- `npm run typecheck`: could not start because `tsc` is unavailable (`'tsc' is not recognized`).
- No test script is configured in `package.json`.

These are environment/dependency-installation blockers, not observed application check failures. Repeat all checks after a successful dependency install.
