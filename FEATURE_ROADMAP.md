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
- [ ] Interactive Storybook Reader — Locally implemented and Phase 2 hardened for owner, purchased, free, and authorized-preview books with responsive page turns, fullscreen, saved local progress, synchronized browser narration, resilient media loading, and backward-compatible optional narration/animation playback; production deployment and live device verification remain pending.
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
- [ ] Stripe test-mode checkout — Final Family/Creator subscription and Starter/credit-pack flows are implemented locally; test Price mapping and end-to-end production-project test-mode verification remain.
- [x] Subscription plans — Final Free, Family, and Creator allowances are server-authoritative; deployment remains pending.
- [x] Customer billing portal.
- [ ] Credit purchases — One-time Starter and three permanent pack flows, monthly-first allocation, idempotent fulfillment, and reversals are implemented locally; Stripe Price configuration and deployment remain.
- [x] Webhook verification and idempotency.
- [x] Subscription entitlement synchronization.
- [ ] Payment and refund handling — Trusted Charge/PaymentIntent matching, async Checkout, out-of-order/duplicate events, purchased-credit debt handling, and marketplace/affiliate reversals are implemented locally; deployment and test-mode webhook verification remain.
- [ ] Production billing readiness — Needs Stripe Dashboard and live-mode readiness review.

## D. Affiliate Program

- [x] Affiliate enrollment — Production backend and frontend released with authenticated enrollment.
- [x] Affiliate approval — Owner-only production review controls released.
- [x] Referral links.
- [x] Referral tracking — Salted click deduplication and first-touch attribution released.
- [x] Conversion attribution — Verified Stripe invoice webhook path released.
- [x] Affiliate dashboard.
- [x] Commission calculation — Rate snapshots and idempotent invoice keys released.
- [x] Refund and chargeback adjustments — Idempotent reversal handling released.
- [ ] Anti-fraud protections — Self-referral, first-touch, approval, attribution-window, and click-deduplication controls implemented locally; broader operational fraud review remains.
- [x] Admin affiliate management — Owner controls released in the Admin Control Center.
- [ ] Manual payout tracking — Not implemented; commissions are recorded but no payout ledger exists.
- [ ] Future automated payouts.

## E. Digital Book Marketplace

- [x] Existing Community Shelf and safe public publishing — Opt-in sharing, ownership checks, moderation, private Storage, and public viewing are deployed and verified.
- [ ] Marketplace browsing — Existing Community Shelf is reused; curved discovery, paid badges, prices, and responsive grids are populated and anonymously/API smoke-tested with marked staging fixtures. Production verification remains pending.
- [ ] Search and categories — Local title/author/theme/style search plus access and art-style filters are implemented; dedicated category taxonomy is not stored yet.
- [ ] Individual book product pages — Redesigned cover, description, author, theme, access state, protected preview, purchase/read actions, and future-option placeholders are implemented locally; deployment pending.
- [x] Stable shareable book URLs — Existing Community Shelf public slugs are reused.
- [ ] Book descriptions and metadata — Paid descriptions and price metadata are implemented locally; deployment pending.
- [ ] Preview pages — Preview-only delivery for unpaid viewers is implemented locally; deployment pending.
- [ ] Digital checkout — Authenticated server-priced Stripe Checkout with dynamic payment methods and paid-only async fulfillment is implemented locally; live configuration and verification pending.
- [ ] Buyer library — Durable database entitlements and a Purchased Books UI are implemented; authenticated staging confirmed that no access appears without a verified purchase. Paid test-mode purchase and production deployment remain pending.
- [ ] Seller earnings — Separate non-retroactive author earnings ledger, Owner default control, and seller summary are implemented locally; deployment pending and payouts disabled.
- [ ] Moderation and reporting — Existing Community moderation applies to listings; marketplace-specific reports remain.
- [ ] SEO and social sharing.
- [ ] Related books.
- [ ] Future verified buyer reviews.

## F. Author Storefronts

- [ ] Public author profiles — Polished profile hero and catalog presentation are implemented locally; deployment pending.
- [ ] Unique storefront URLs — Implemented locally under `/authors/:slug`; deployment pending.
- [ ] Author logos and banners.
- [ ] Author biographies — Implemented locally; deployment pending.
- [ ] Social media links.
- [ ] Published book catalogs — Responsive storefront grids and real featured-book presentation are implemented locally by reusing published Community stories; deployment pending.
- [ ] Featured books.
- [ ] Collections and categories.
- [ ] Author management dashboard — Profile, listing, sales, and pending-earnings controls implemented locally; deployment pending.
- [ ] Sales and earnings analytics — Initial totals implemented locally; detailed analytics remain.
- [ ] Shareable storefronts — Implemented locally; deployment pending.
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

- [ ] Lulu Print API evaluation — Official file requirements reviewed; sandbox products, quote/order API behavior, exact page minimums, and commercial terms still require verification.
- [ ] Bookvault evaluation — Official transient-title, file, webhook, bleed, and template requirements reviewed; sandbox quoting and US fulfillment still require verification.
- [ ] Print provider selection — Provider-neutral adapter is implemented locally; provider and physical sample remain undecided.
- [ ] Print-ready PDF validation — Local preflight/proof supports DPI, bleed dimensions, safe layout, missing images, page count, and explicit provider-template blockers; current 1024px art generally fails 300 PPI at large trim sizes.
- [ ] Cover and trim specifications — Configurable trim planning profiles exist; exact back/spine/front provider templates and spine calculation remain.
- [ ] Printing price estimates — Itemized quote calculations and immutable quote schema are implemented locally; no live provider price is used.
- [ ] Shipping estimates — Quote schema supports shipping snapshots; provider/destination integration remains.
- [ ] Physical book checkout — Customer preparation/status UI exists, but address collection, confirmed quote, and payment are intentionally disabled.
- [ ] Print order submission — Service-authoritative payment/authorization gates, provider adapter, bounded retry, and idempotency foundation are implemented; no live provider submission exists.
- [ ] Order status tracking — Buyer-readable status/event/tracking foundation is implemented locally; signed provider webhook integration remains.
- [ ] Refund and cancellation handling — Legal state transitions and refund/cancellation/reprint states are implemented locally; provider and Stripe orchestration remains.
- [ ] Physical sample testing.

## I. Personalized Marketplace Books

- [ ] Author-enabled personalization — Implemented locally with per-book opt-in, character selection, and field-level scope; deployment pending.
- [ ] Buyer personalization workflow — Implemented locally for saved Character Bibles with purchase enforcement and explicit confirmation; deployment pending.
- [ ] Private child character information — Buyer data and copies remain owner-scoped under entitlement-aware RLS/private Storage; refunds and disputes deny access while preserving recoverable private content. Staging validated; production deployment pending.
- [ ] Personalized illustration generation — Uses the existing entitlement-metered page generator and resumable missing-page flow; no paid live test performed.
- [ ] Personalized buyer copies — Private copies and Buyer Library/Interactive Reader integration are implemented; paid copies are linked to an active qualifying purchase and can be restored after legitimate repurchase. Staging migration validated; production deployment pending.
- [ ] AI cost accounting — Image-credit estimate and existing per-image entitlement reservations are implemented; final standalone personalization pricing is intentionally unresolved.
- [ ] Personalized digital checkout.
- [ ] Personalized physical book ordering.
- [ ] Privacy and publishing protections — Source images are never copied; author originals remain immutable; public APIs expose only safe offer metadata; revocation is enforced through story/page/continuity RLS and private Storage with short-lived URLs. Staging validated; production verification pending.

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
- [ ] End-to-end purchase testing — Non-payment entitlement and preview boundaries pass in staging; isolated Stripe sandbox credentials, webhook endpoint, and test-mode Checkout are still required.
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
