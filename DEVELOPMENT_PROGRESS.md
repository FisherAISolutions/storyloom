# MyStoryBookAI Development Progress

> Update this document at the end of each milestone, not after every small code change. Record only verified results and distinguish local implementation from production deployment.

## Current milestone

Phase 1 — Secure Admin Control Center and staff AI testing access. Production database migrations and initial Owner activation are complete; the verified frontend release is ready to deploy.

## Git state

- Branch: `codex/admin-control-center`
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

## Work in progress

- Migrations `20260818000000` and `20260818010000` are applied and verified in staging and production.
- The Admin Control Center frontend is verified locally but not yet deployed.

## Known bugs and blockers

- No remaining database blocker was found in focused staging validation.
- Frontend deployment and production UI smoke testing remain outstanding.
- This release proceeded under an explicit no-backup risk waiver; recoverable logical backup capability remains an operational gap to address before higher-risk or customer-data migrations.
- Stripe account mode and recent webhook delivery success still require confirmation in the Stripe Dashboard.
- The Starter plan does not currently have a checkout price mapping.
- Later roadmap features remain unimplemented unless explicitly marked complete in `FEATURE_ROADMAP.md`.

## Architectural decisions

- Supabase Auth is the identity boundary; PostgreSQL RLS and private Storage policies remain authoritative.
- Staff roles are separate from future affiliate, author, and seller status.
- Owner/Admin/Tester AI access uses server-side, audited, cost-capped entitlement reservations rather than fake Stripe subscriptions.
- Promotional credits are server-authoritative, audited, idempotent, and separate from paid subscription state.
- OpenAI calls remain in the authenticated `story-ai` Edge Function.
- Stripe billing remains based on hosted Checkout/Portal, verified webhooks, and server-authoritative entitlement synchronization.

## Required configuration and deployment steps

1. Push the approved branch and allow Vercel to deploy the frontend. The currently deployed `story-ai` already uses the entitlement RPC, so no Edge Function change is required.
2. Verify `/admin`, Owner access, regular-user route denial, and core public/authenticated routes without invoking paid AI generation.
3. Add a verified backup/recovery mechanism before future higher-risk migrations.
4. Confirm Stripe mode, price mappings, and webhook deliveries separately before billing changes.

Rollback plan: take a fresh logical production backup before migrations; keep the new frontend undeployed until database checks pass; use a reviewed forward corrective migration for database defects rather than destructive rollback; if the frontend release fails, redeploy the preceding Vercel commit. Do not bootstrap an Owner until the database checks pass.

## Next recommended task

Deploy the approved frontend and complete focused production smoke testing. Do not begin later roadmap phases first.
