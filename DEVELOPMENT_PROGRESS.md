# MyStoryBookAI Development Progress

> Update this document at the end of each milestone, not after every small code change. Record only verified results and distinguish local implementation from production deployment.

## Current milestone

Phase 1 — Secure Admin Control Center and staff AI testing access. Implementation is committed locally and awaiting staging migration validation and deployment approval.

## Git state

- Branch: `codex/admin-control-center`
- Latest commit: `5afb4c2 feat: add secure admin control center`
- Baseline on `main`: `cac2571 fix: resolve Supabase JWT gateway blocking AI requests`

## Recently completed

- Preserved the Repaint/Supabase JWT gateway fix. Production `story-ai` was previously verified at version 26 with in-function user authentication retained.
- Implemented locally: staff roles, one-time Owner bootstrap, protected Admin Control Center, user search, constrained role management, audited/idempotent complimentary credits, cost-capped staff AI testing, and administrative audit records.
- Added focused authorization and service-contract tests.
- Milestone verification completed before commit: 84 tests passed, lint passed, and the production build passed. Final authorization/idempotency hardening also passed its focused tests and lint checks.
- Kept `.supabase-staging-validation/` ignored and outside Git.

## Work in progress

- Migration `20260818000000_admin_control_center.sql` exists locally but has not been applied to staging or production.
- The Admin Control Center frontend and staff testing access are not deployed.

## Known bugs and blockers

- Phase 1 cannot be considered production-ready until the new migration is validated on staging, including SQL execution, permissions, RLS, role escalation, entitlement concurrency, and legacy customer behavior.
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

1. Validate migration `20260818000000_admin_control_center.sql` on the staging Supabase project.
2. Review the staging authorization and entitlement results before approving production.
3. Back up production and apply the approved migration only after explicit permission.
4. Identify the intended Supabase Auth user UUID and run the one-time `assign_initial_owner(uuid)` bootstrap only after explicit approval.
5. Deploy the approved frontend changes and verify `/admin` with each permitted role.
6. Confirm Stripe mode, price mappings, and webhook deliveries separately before billing changes.

## Next recommended task

Perform a focused staging-only validation of the Phase 1 migration and Admin authorization boundaries. Do not continue into marketplace or affiliate development until Phase 1 is approved.
