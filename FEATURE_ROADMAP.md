# MyStoryBookAI Feature Roadmap

Legend: `[x]` means implemented and verified at the appropriate recorded level. An unchecked item may be unimplemented, partially implemented, locally implemented but not deployed, or awaiting verification.

## A. Existing AI Book Creation

- [x] Supabase authentication.
- [x] Character creation.
- [x] Character image generation.
- [x] Character Bibles.
- [x] Story World Bibles.
- [x] AI story generation.
- [x] Page illustration generation.
- [x] Repaint.
- [x] Book editing.
- [x] Story continuation.
- [x] Cover generation.
- [x] PDF export.
- [ ] Character consistency testing — Automated contract coverage exists; end-to-end visual consistency needs verification.
- [ ] Mobile responsiveness — Needs verification across supported devices.

## B. Admin Control Center

- [ ] Secure Owner bootstrap — Schema and execution grants verified in staging; production activation pending.
- [ ] Staff roles and permissions — Focused staging authorization tests passed; production deployment pending.
- [ ] Protected admin dashboard — Implemented locally; not deployed.
- [ ] User search by email — Implemented locally; not deployed.
- [ ] Role management — Focused staging privilege-escalation tests passed; production deployment pending.
- [ ] Complimentary credit grants — Idempotency and authorization passed in staging; production deployment pending.
- [ ] Owner/Admin AI testing access — Staff entitlement flow passed in staging; production deployment pending.
- [ ] Tester allowances — Allowance consumption and monthly-limit enforcement passed in staging; production deployment pending.
- [ ] AI usage and spending limits — Runtime limit and simultaneous-reservation tests passed in staging; production deployment pending.
- [ ] Admin activity logs — RLS, direct-write denial, and administrative action logging passed in staging; production deployment pending.
- [ ] Subscription and billing visibility — Basic local visibility implemented; live verification pending.
- [ ] Future marketplace and affiliate management — Planned.

## C. Subscriptions and Payments

- [ ] Stripe integration verification — Code paths reviewed; Stripe Dashboard mode and webhook delivery verification remain.
- [ ] Stripe test-mode checkout — Partially implemented; Family and Creator mappings exist, live end-to-end status needs verification.
- [x] Subscription plans.
- [x] Customer billing portal.
- [ ] Credit purchases — Not implemented as a paid standalone purchase flow.
- [x] Webhook verification and idempotency.
- [x] Subscription entitlement synchronization.
- [ ] Payment and refund handling — Needs end-to-end verification and documented refund behavior.
- [ ] Production billing readiness — Needs Stripe Dashboard and live-mode readiness review.

## D. Affiliate Program

- [ ] Affiliate enrollment.
- [ ] Affiliate approval.
- [ ] Referral links.
- [ ] Referral tracking.
- [ ] Conversion attribution.
- [ ] Affiliate dashboard.
- [ ] Commission calculation.
- [ ] Refund and chargeback adjustments.
- [ ] Anti-fraud protections.
- [ ] Admin affiliate management.
- [ ] Manual payout tracking.
- [ ] Future automated payouts.

## E. Digital Book Marketplace

- [ ] Safe public publishing — Community sharing exists, but a commercial marketplace publishing workflow does not.
- [ ] Marketplace browsing.
- [ ] Search and categories.
- [ ] Individual book product pages.
- [ ] Stable shareable book URLs.
- [ ] Book descriptions and metadata.
- [ ] Preview pages.
- [ ] Digital checkout.
- [ ] Buyer library.
- [ ] Seller earnings.
- [ ] Moderation and reporting — Community moderation exists; marketplace moderation is not implemented.
- [ ] SEO and social sharing.
- [ ] Related books.
- [ ] Future verified buyer reviews.

## F. Author Storefronts

- [ ] Public author profiles.
- [ ] Unique storefront URLs.
- [ ] Author logos and banners.
- [ ] Author biographies.
- [ ] Social media links.
- [ ] Published book catalogs.
- [ ] Featured books.
- [ ] Collections and categories.
- [ ] Author management dashboard.
- [ ] Sales and earnings analytics.
- [ ] Shareable storefronts.
- [ ] Future author followers.
- [ ] Future new-book notifications.
- [ ] Premium storefront customization.

## G. Seller Payments

- [ ] Stripe Connect evaluation.
- [ ] Seller onboarding.
- [ ] Payout eligibility.
- [ ] Seller balances.
- [ ] Platform commissions.
- [ ] Refund adjustments.
- [ ] Payout history.
- [ ] Admin financial reporting.

## H. Print-on-Demand

- [ ] Lulu Print API evaluation.
- [ ] Bookvault evaluation.
- [ ] Print provider selection.
- [ ] Print-ready PDF validation.
- [ ] Cover and trim specifications.
- [ ] Printing price estimates.
- [ ] Shipping estimates.
- [ ] Physical book checkout.
- [ ] Print order submission.
- [ ] Order status tracking.
- [ ] Refund and cancellation handling.
- [ ] Physical sample testing.

## I. Personalized Marketplace Books

- [ ] Author-enabled personalization.
- [ ] Buyer personalization workflow.
- [ ] Private child character information.
- [ ] Personalized illustration generation.
- [ ] Personalized buyer copies.
- [ ] AI cost accounting.
- [ ] Personalized digital checkout.
- [ ] Personalized physical book ordering.
- [ ] Privacy and publishing protections.

## J. Creator & Business Tools

- [ ] Creator & Business subscription — Existing Creator plan is not the complete business-tool offering.
- [ ] Bulk book generation.
- [ ] Commercial creation workflows.
- [ ] Team permissions.
- [ ] Advanced exports.
- [ ] Business analytics.
- [ ] Shared projects.
- [ ] Branding options.

## K. Platform Quality and Launch

- [x] Security and RLS verification — Existing production ownership and isolation controls were verified; new migrations require their own staging checks.
- [ ] Privacy protections for children — Core private ownership protections exist; marketplace-specific privacy review remains.
- [ ] Error handling — Existing handling is implemented; full launch-level verification remains.
- [x] AI cost monitoring.
- [ ] Mobile testing.
- [ ] Accessibility.
- [ ] Marketplace content moderation.
- [ ] Production deployment checks — Admin rollout preflight passed; deployment is paused at the backup gate.
- [ ] Backup and recovery planning — Current production dump attempt failed because Docker/Podman is unavailable; a verified recovery point is required before migration.
- [ ] End-to-end purchase testing — Needs verification for the current Stripe configuration.
- [ ] Launch readiness.

## Roadmap maintenance rules

1. Mark a checkbox `[x]` only when the feature is implemented and verified at the appropriate level.
2. Do not mark a feature complete merely because a file, database table, or UI placeholder exists.
3. Distinguish local implementation from production deployment when relevant.
4. Keep partially implemented features unchecked with a brief status note.
5. Add newly approved feature ideas to the appropriate category.
6. Avoid duplicate roadmap entries.
7. When a feature is completed, update its checkbox and record the milestone in `DEVELOPMENT_PROGRESS.md`.
8. Do not erase completed history unnecessarily.
9. Keep the checklist readable and concise.
10. Do not repeatedly inspect the entire repository merely to update checkboxes.
