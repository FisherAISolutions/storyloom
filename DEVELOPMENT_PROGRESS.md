# MyStoryBookAI Development Progress

> Update this document at the end of each milestone, not after every small code change. Record only verified results and distinguish local implementation from production deployment.

## Current milestone

Multi-provider image generation is implemented locally on `codex/multi-provider-images`; its database migration and `story-ai` Edge Function are deployed and verified on staging only. A frontend staging preview and Owner UI smoke test remain pending. The live production release remains unchanged.

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

## Known bugs and blockers

- No remaining database blocker was found in focused staging validation.
- No outstanding Admin Control Center deployment blocker is known.
- This release proceeded under an explicit no-backup risk waiver; recoverable logical backup capability remains an operational gap to address before higher-risk or customer-data migrations.
- Stripe account mode and recent webhook delivery success still require confirmation in the Stripe Dashboard.
- The Starter plan does not currently have a checkout price mapping.
- Later roadmap features remain unimplemented unless explicitly marked complete in `FEATURE_ROADMAP.md`.
- Migration `20260819000000_multi_provider_image_generation.sql` is applied to staging but not production.
- Cloudflare credentials are configured only in staging; no provider call has been made.
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
4. Do not repeat the completed multi-provider staging rollout unless new evidence requires it; production rollout starts disabled in OpenAI Only mode.

Rollback plan: take a fresh logical production backup before migrations; keep the new frontend undeployed until database checks pass; use a reviewed forward corrective migration for database defects rather than destructive rollback; if the frontend release fails, redeploy the preceding Vercel commit. Do not bootstrap an Owner until the database checks pass.

## Next recommended task

Identify and explicitly activate the intended staging Owner account, configure a Vercel preview with staging-only Supabase environment variables, and verify Owner controls without generation. Perform a real low-cost request only after explicit approval. Keep production OpenAI Only until validation passes.
