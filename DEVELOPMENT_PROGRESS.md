# MyStoryBookAI Development Progress

> Update this document at the end of each milestone, not after every small code change. Record only verified results and distinguish local implementation from production deployment.

## Current milestone

Marketplace Personalization is implemented locally on `codex/marketplace-personalization`, building on the completed marketplace and Interactive Reader branches. It remains undeployed and its forward migration has not been applied.

## Git state

- Production branch: `main`
- Deployed Admin release commit: `1efb31b`
- Admin implementation commit: `5afb4c2 feat: add secure admin control center`
- Documentation initialization commit: `1b49a23 docs: add project progress and feature roadmap`
- Baseline on `main`: `cac2571 fix: resolve Supabase JWT gateway blocking AI requests`

## Recently completed

- Preserved the Repaint/Supabase JWT gateway fix. Production `story-ai` was previously verified at version 26 with in-function user authentication retained.
- Implemented locally: staff roles, one-time Owner bootstrap, protected Admin Control Center, user search, constrained role management, audited/idempotent complimentary credits, cost-capped staff AI testing, and administrative audit records.
- Added focused authorization and service-contract tests.
- Milestone verification completed before commit: 84 tests passed, lint passed, and the production build passed. Final authorization/idempotency hardening also passed its focused tests and lint checks.
- Kept `.supabase-staging-validation/` ignored and outside Git.
- Applied migration `20260818000000` to staging project `wbrjyytwpnpxcwrvtnhv` only.
- Verified in staging that all five admin tables exist with RLS, authenticated users have no direct table writes, privileged RPC grants are scoped correctly, Owner bootstrap is denied to browser roles, the last-Owner trigger exists, internal plans are excluded from public plans, and migration history records version `20260818000000`.
- Verified failed behavioral tests rolled back completely: no synthetic users or promotional grants remain.
- Confirmed production migration history remains unchanged; version `20260818000000` is not applied in production.
- Added forward-only migration `20260818010000_fix_admin_entitlement_period_qualification.sql`, explicitly qualifying `admin_ai_test_usage` period columns.
- Applied both Admin Control Center migrations to staging and verified their migration history.
- Focused staging tests passed for Owner dashboard access, role escalation denial, audit-table write denial, complimentary-credit idempotency, Tester isolation, staff allowance consumption, monthly spending limits, last-Owner protection, and existing Family customer entitlements.
- A real two-session concurrency test passed: one 25-cent reservation succeeded and the simultaneous competing reservation was rejected with `ENTITLEMENT_LIMIT`.
- Verified all synthetic staging users, grants, and test-usage rows were removed or transactionally rolled back.
- Production preflight confirmed target `lhpegfrbevtoppdlgrfa`, prerequisite schema compatibility, no conflicting admin tables, no incompatible profile roles, and exactly migrations `20260818000000` and `20260818010000` pending.
- Production backup attempt stopped safely before migrations: Supabase CLI `db dump` requires Docker or Podman, and neither is installed or available on PATH. The resulting `schema.sql` is empty and is not a valid backup.
- The user explicitly accepted the no-backup risk for this additive release. Production target `lhpegfrbevtoppdlgrfa` was reconfirmed, both migration files matched their staging-tested SQL after line-ending normalization, and destructive-statement checks found no table/data deletion or content/Storage mutations.
- Applied production migrations `20260818000000_admin_control_center.sql` and `20260818010000_fix_admin_entitlement_period_qualification.sql` in order.
- Production read-only verification passed for migration history, five RLS-enabled admin tables, browser write denial, admin RPC grants, service-role AI entitlement execution, Owner-bootstrap restrictions, customer-entitlement delegation, qualified period references, last-Owner protection, internal-plan filtering, and intact stories/pages/characters tables.
- Confirmed no Owner account has been activated and no frontend or Edge Function deployment occurred.
- The user activated the intended existing account through `assign_initial_owner()` and verified `public.profiles.role = 'owner'`.
- Frontend release verification passed 67 focused admin, authentication, billing, RLS, Storage, story-generation, and Repaint contract tests.
- Production Vite build passed with the Admin Control Center bundle included.
- Fast-forwarded the verified release to `main` and pushed commit `1efb31b`; GitHub reported the Vercel production deployment successful.
- Verified `https://www.mystorybookai.online/admin` loads for the authenticated Owner with admin navigation, operational metrics, user management, staff testing controls, subscription visibility, and the initial Owner audit entry.
- Verified an existing regular-user identity receives `ADMIN_REQUIRED` from the production Admin Control Center RPC inside a read-only rolled-back transaction.
- No migration was reapplied, no Edge Function was redeployed, and no credits, roles, paid AI calls, Stripe actions, stories, or customer records were changed during smoke testing.

## Work in progress

- Implemented optional author-controlled personalization per published book, with existing listings defaulting off and customization limited to an approved story character and author-selected name, appearance, and clothing fields.
- Implemented an authenticated buyer workflow that requires active purchase entitlement for paid books, shows an image-credit estimate, requires explicit confirmation, and creates an idempotent private buyer-owned copy without copying source image paths.
- Personalized copies clone immutable Character Bible snapshots, World Bible locations/scenes, and appearance transitions; illustration generation uses the existing metered `generate-page-image` path and can resume missing pages without regenerating completed pages.
- Added personalized editions to the Buyer Library and existing owner-only Interactive Reader route. Original author attribution is retained. Focused marketplace/personalization, billing, security, continuity, and reader checks passed (59 tests); focused lint and the production build passed. No AI request was made.
- Completed local Interactive Reader Phase 2 hardening: serialized rapid navigation, synchronized cancellation/restart of narration, nearby authorized-image preloading, missing-media fallbacks, improved opening/closing/fullscreen behavior, browser voice selection, and reliable audio controls. Added backward-compatible optional page-media adapters for cached narration audio/timing metadata and visible-page-only animation with static fallback; no generation, pricing, schema, or paid API work was added.
- Completed the local Interactive Storybook Reader milestone on `codex/interactive-storybook-reader`: realistic hardcover/opening and page-turn presentation, desktop spreads, mobile pages, fullscreen bedtime mode, keyboard/swipe/button navigation, local reading-position resume, browser speech narration with sentence highlighting and automatic advancement, and accessible reduced-motion/fallback behavior. Owner books use authenticated RLS/Storage paths; marketplace readers receive only the existing server-authorized purchased/free/preview payload. Deployment remains pending.
- Completed the local marketplace visual-experience milestone: curved featured/new-book carousel with keyboard, swipe, responsive and reduced-motion support; searchable/filterable Community Shelf; redesigned access-aware book detail/preview experience; and polished author storefront catalogs. Existing entitlement, purchase, affiliate, earnings, and moderation paths are unchanged. Focused marketplace/community tests, lint, and the production build passed; deployment remains pending.
- Added a local forward-only Community Shelf marketplace migration with paid listings defaulting off, author profiles, checkout claims, buyer purchases, and author earnings kept separate from affiliate commissions.
- Added local preview-only public delivery for paid books, active-purchase full access, author storefronts/dashboard, and server-priced one-time Stripe Checkout.
- Added a Buyer Library backed by durable database purchase entitlements, plus retained buyer access when a seller unlists a book. Moderation, refunds, and chargebacks still revoke access.
- Added Owner-only Admin controls for the prospective default author earnings amount. Existing listing snapshots and recorded earnings are not changed retroactively.
- Extended the verified Stripe webhook path to grant purchases idempotently and revoke access/author earnings on refunds or chargebacks. Actual author payouts remain disabled.
- Applied affiliate migration `20260820000000`, marketplace migration `20260821000000`, and corrective migration `20260821010000` to staging only. Remote PostgreSQL lint reports no schema errors.
- Focused Community, marketplace, billing, affiliate, Admin, and security validation passed: 52 tests. Changed frontend files passed focused lint with no errors, and the production build passed.
- Applied production migration `20260820000000_affiliate_referral_program.sql`, configured a private `AFFILIATE_CLICK_SALT`, and deployed `affiliate-public`, `billing-checkout`, and `stripe-webhook`. Automated affiliate payouts remain disabled.
- Affiliate release validation passed 31 focused affiliate, billing, and security tests. The migration contains no destructive data operations and production dry-run selected only version `20260820000000`.
- Pushed affiliate production commit `46ee725`; Vercel succeeded, production schema lint passed, live affiliate/Admin bundles loaded, billing remained authentication-protected, and unsigned webhooks remained rejected.
- Migrations `20260818000000` and `20260818010000` are applied and verified in staging and production.
- The Admin Control Center frontend is deployed on production `main`.
- Added a local OpenAI/Cloudflare image-provider architecture, capability-aware routing, UTC daily request/neuron/spend caps, provider health/quota events, server-only configuration, and request idempotency.
- Added local Owner controls for OpenAI Only, Free First, and Manual Provider modes. Defaults remain OpenAI Only; Cloudflare is disabled and paid fallback is disabled.
- Official Cloudflare pricing indicates a 10,000-neuron free daily allocation resetting at 00:00 UTC. Estimated 1024px capacity is about 173 FLUX.1 Schnell (4-step), 95 FLUX.2 Klein 4B, 7 Klein 9B, or 3 Leonardo 20-step images per day.
- Applied migration `20260819000000_multi_provider_image_generation.sql` only to `storyloom-staging` (`wbrjyytwpnpxcwrvtnhv`) after an exact-hash comparison and one-migration dry run.
- Verified staging migration history, all four provider tables with RLS, zero authenticated table-write grants, anonymous RPC denial, authenticated admin RPC grants, service-role-only event recording, Owner/model guards, three existing public plans, and the existing `reserve_ai_entitlement` function.
- Verified safe defaults in staging: OpenAI Only, Cloudflare disabled, paid fallback disabled, and a 10,000-neuron Cloudflare ceiling. No image provider was called.
- Configured `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as staging-only Supabase secrets without committing plaintext credentials.
- Deployed staging `story-ai` version 1 with gateway `verify_jwt=false` while retaining mandatory in-function `auth.getUser(token)` authentication; an unauthenticated smoke request returned `401 AUTH_REQUIRED` before provider access.
- Applied only `20260819000000_multi_provider_image_generation.sql` to production project `lhpegfrbevtoppdlgrfa` and verified migration history, RLS, browser write denial, Owner-only controls, provider model guards, and service-role event logging.
- Verified production provider defaults: OpenAI Only, Cloudflare disabled, and paid fallback disabled.
- Deployed only the updated production `story-ai` Edge Function (version 28). Gateway JWT verification remains disabled by design, while mandatory in-function `auth.getUser(token)` authentication was verified with an unauthenticated `401 AUTH_REQUIRED` response.
- Fast-forwarded and pushed production `main` through commit `df99544`; GitHub/Vercel reported a successful production deployment.
- Verified the live home, `/admin`, and `/billing` routes return HTTP 200. The unchanged billing checkout function rejects unauthenticated access with HTTP 401. No image generation or Stripe payment was invoked.

## Known bugs and blockers

- No remaining database blocker was found in focused staging validation.
- No outstanding Admin Control Center deployment blocker is known.
- This release proceeded under an explicit no-backup risk waiver; recoverable logical backup capability remains an operational gap to address before higher-risk or customer-data migrations.
- Stripe account mode and recent webhook delivery success still require confirmation in the Stripe Dashboard.
- The Starter plan does not currently have a checkout price mapping.
- Later roadmap features remain unimplemented unless explicitly marked complete in `FEATURE_ROADMAP.md`.
- Cloudflare credentials are configured only in staging; production Cloudflare remains disabled and no provider call has been made.
- Cloudflare FLUX commercial output use is supported by BFL developer terms, subject to input consent/usage restrictions. Leonardo commercial terms still need legal/contract verification before enabling its models.
- Staging has no Owner profile, so Owner UI behavior cannot be smoke-tested until an intended staging account is explicitly assigned; database guards and grants are verified.
- The repository is not linked to a Vercel preview project and no Vercel CLI is installed; preview environment variables must be configured before a staging frontend can be safely deployed without pointing at production.

## Architectural decisions

- Supabase Auth is the identity boundary; PostgreSQL RLS and private Storage policies remain authoritative.
- Staff roles are separate from future affiliate, author, and seller status.
- Owner/Admin/Tester AI access uses server-side, audited, cost-capped entitlement reservations rather than fake Stripe subscriptions.
- Promotional credits are server-authoritative, audited, idempotent, and separate from paid subscription state.
- OpenAI calls remain in the authenticated `story-ai` Edge Function.
- Stripe billing remains based on hosted Checkout/Portal, verified webhooks, and server-authoritative entitlement synchronization.
- Staging is an optional risk-reduction tool rather than a mandatory development gate. Releases use focused safety checks, tests proportional to the change, and explicit approval before production migrations, pushes, or deployments.

## Required configuration and deployment steps

1. Add a verified backup/recovery mechanism before future higher-risk migrations.
2. Confirm Stripe mode, price mappings, and webhook deliveries separately before billing changes.
3. Before granting staff roles or promotional credits, use the deployed audited controls and preserve least privilege.
4. Keep production in OpenAI Only mode with Cloudflare and paid fallback disabled until a separately approved provider test and configuration change.

Rollback plan: take a fresh logical production backup before migrations; keep the new frontend undeployed until database checks pass; use a reviewed forward corrective migration for database defects rather than destructive rollback; if the frontend release fails, redeploy the preceding Vercel commit. Do not bootstrap an Owner until the database checks pass.

## Next recommended task

Review and validate `20260822000000_marketplace_personalization.sql` against a disposable or approved target before any release. Marketplace production deployment, Stripe readiness, and all paid AI testing remain separate approval boundaries.
