# MyStoryBookAI Development Progress

> Update this document at the end of each milestone, not after every small code change. Record only verified results and distinguish local implementation from production deployment.

## Current milestone

Phase 1 — Secure Admin Control Center and staff AI testing access. The corrective migration and focused staging validation have passed; production rollout awaits explicit approval.

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

## Work in progress

- Migrations `20260818000000` and `20260818010000` are applied to staging but not production.
- The Admin Control Center frontend and staff testing access are not deployed.

## Known bugs and blockers

- No remaining database blocker was found in focused staging validation.
- Production approval, backup, migration application, Owner activation, frontend deployment, and production smoke testing remain outstanding.
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

1. Create a fresh logical production backup and verify production target `lhpegfrbevtoppdlgrfa`.
2. Dry-run and confirm that exactly `20260818000000` followed by `20260818010000` are pending.
3. Apply those migrations in order and verify history, tables, RLS, grants, and the corrected function definition before continuing.
4. Identify the intended Supabase Auth user UUID and run the one-time `assign_initial_owner(uuid)` bootstrap only after separate explicit approval.
5. Push the approved branch and allow Vercel to deploy the frontend. The currently deployed `story-ai` already uses the entitlement RPC, so no Edge Function change is required.
6. Verify `/admin`, role boundaries, ordinary customer entitlements, and staff limits in production without invoking paid AI generation.
7. Confirm Stripe mode, price mappings, and webhook deliveries separately before billing changes.

Rollback plan: take a fresh logical production backup before migrations; keep the new frontend undeployed until database checks pass; use a reviewed forward corrective migration for database defects rather than destructive rollback; if the frontend release fails, redeploy the preceding Vercel commit. Do not bootstrap an Owner until the database checks pass.

## Next recommended task

Await explicit approval for the incremental production rollout of the two Admin Control Center migrations and frontend. Do not begin later roadmap phases first.
