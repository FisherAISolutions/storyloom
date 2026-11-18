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
- [ ] Multi-provider image generation — Production schema, Edge Function, frontend, and safe disabled defaults are deployed; real Cloudflare provider integration verification remains pending.
- [ ] Provider quota, health, and idempotency controls — Production controls are deployed with mocked/contract coverage; real-provider quota and runtime concurrency verification remain pending.

## B. Admin Control Center

- [x] Secure Owner bootstrap — Initial Owner activated and profile role verified in production.
- [x] Staff roles and permissions — Production authorization and regular-user denial verified.
- [x] Protected admin dashboard — Live Owner access verified in production.
- [ ] User search by email — Deployed; focused live search action still needs verification.
- [ ] Role management — Database RPCs are deployed and verified; frontend deployment pending.
- [ ] Complimentary credit grants — Database operations are deployed and verified; frontend deployment pending.
- [ ] Owner/Admin AI testing access — Production entitlement function and Owner role are active; non-paid smoke testing pending.
- [ ] Tester allowances — Production database support is deployed; live role assignment and smoke testing pending.
- [ ] AI usage and spending limits — Production function and service-role access verified; live smoke testing pending.
- [x] Admin activity logs — Initial Owner audit entry displayed live; RLS and direct-write denial verified.
- [x] Subscription and billing visibility — Account plan and subscription state displayed live.
- [ ] Future marketplace and affiliate management — Planned.
- [ ] Image provider administration — Production UI and Owner-only database controls are deployed; live Owner interaction and real-provider verification remain pending.

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
- [ ] Production deployment checks — Admin and multi-provider releases passed deployment, route, authorization, and safe-default smoke checks; repeat for every release.
- [ ] Backup and recovery planning — This additive release used an explicit no-backup waiver; verified recovery tooling remains required for future higher-risk migrations.
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
