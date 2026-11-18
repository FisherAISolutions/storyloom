# MyStoryBookAI Development Progress

> Update this document at the end of each milestone, not after every small code change. Record only verified results and distinguish local implementation from production deployment.

## Current milestone

Phase 1 — Secure Admin Control Center and staff AI testing access. Staging schema validation passed, but functional validation found a blocking SQL ambiguity in the staff entitlement function.

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

## Work in progress

- Migration `20260818000000_admin_control_center.sql` is applied to staging but not production.
- The Admin Control Center frontend and staff testing access are not deployed.

## Known bugs and blockers

- **Release blocker:** `reserve_ai_entitlement` fails for staff/tester reservations because unqualified `period_start` and `period_end` references are ambiguous with its `RETURNS TABLE` output fields. The failing query must qualify columns through an alias such as `t.period_start` and `t.period_end`.
- Functional role, idempotency, allowance, release, concurrency, and legacy-customer validation must be rerun after a corrective migration is applied to staging.
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

1. Add a focused forward corrective migration for the ambiguous entitlement query; do not reset staging or edit its applied migration history.
2. Apply the correction to staging and rerun focused rollback-only authorization, idempotency, allowance, release, concurrency, and ordinary-customer tests.
3. Back up production and apply the original admin migration followed by the corrective migration only after explicit approval.
4. Identify the intended Supabase Auth user UUID and run the one-time `assign_initial_owner(uuid)` bootstrap only after explicit approval.
5. Deploy the frontend after database verification. The currently deployed `story-ai` already uses the entitlement RPC, so no Edge Function change is presently required.
6. Verify `/admin`, ordinary customer AI entitlements, and staff test limits in production without paid generation calls.
7. Confirm Stripe mode, price mappings, and webhook deliveries separately before billing changes.

Rollback plan: take a fresh logical production backup before migrations; keep the new frontend undeployed until database checks pass; use a reviewed forward corrective migration for database defects rather than destructive rollback; if the frontend release fails, redeploy the preceding Vercel commit. Do not bootstrap an Owner until the database checks pass.

## Next recommended task

Create the minimal corrective migration for the ambiguous staff-entitlement query, then rerun the focused staging validation. Do not begin production rollout or later roadmap phases until it passes.
