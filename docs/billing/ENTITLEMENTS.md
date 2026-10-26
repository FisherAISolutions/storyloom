# MyStorybook AI Entitlements

## Verification labels (August 9, 2026)

- **IMPLEMENTED:** the database functions, Edge gate, ledger, UI summaries, webhook synchronization, and conservative status rules described here exist in source and are deployed.
- **TEST-MODE VERIFIED:** `active` Family state granted 10 story/60 image units; the canceled subscription fell back to 1 story/10 image units; duplicate webhook delivery was harmless; Checkout and Portal resolved the authenticated user's server mapping. A live cover changed image remaining from 60 to 59 while story remaining stayed 10, producing exactly one consumed `generate-cover` reservation and one successful `ai_usage` image record. With one unit remaining, two concurrent deployed reservations produced one success and one `ENTITLEMENT_LIMIT`; release and repeated release both left the reservation `released` and restored availability. A separate exhausted override produced the actionable limit message, preserved editor state, wrote no consumed reservation, and logged only a failed/no-image usage attempt before the provider boundary.
- **NOT YET VERIFIED:** repaint and portrait were not invoked live because the deployed operation mapping and reservation contracts prove the same +1 image/+0 story behavior without two additional OpenAI calls.
- **PROVISIONAL:** prices, unit allowances, weights, and maximum-page limits are subject to later economics review.

## Authority and plan resolution

Entitlements follow this chain: verified Supabase user → Stripe Customer → verified Stripe webhook → `subscriptions` → transactional entitlement RPC → OpenAI. Checkout redirects and browser state never grant access.

The active plan is resolved server-side in this order:

1. A time-bounded, auditable `entitlement_overrides` row.
2. A webhook-maintained subscription with status `active` or `trialing` and a current Stripe billing period.
3. The internal zero-generation `unpaid` fallback.

`past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, and `paused` subscriptions receive no paid entitlement. They fall back to the internal `unpaid` plan with zero story and image generation units. Active or trialing Starter subscriptions use the stable internal `free` key and receive the original low-tier limits. This is intentionally conservative.

## Provisional credit model

The seeded limits are test placeholders, not final pricing economics:

| Plan | Story units | Image units | Maximum story |
| --- | ---: | ---: | ---: |
| Free | 1 | 10 | 6 pages |
| Family | 10 | 60 | 24 pages |
| Creator | 25 | 160 | 30 pages |

Story-generation weights are 6→1, 10→2, 15→3, 24→4, and 30→5 story units. Continuation text weights are 3→1, 5→1, and 10→2 story units. These functions live in the database and cannot be selected by React.

Initial and continuation requests are also bounded by the effective plan's `max_story_pages`. Page-image reservations receive the server-validated page number, so lower tiers cannot bypass their maximum by directly invoking the image action.

Each successful portrait, initial page illustration, repaint/reimagine, and custom cover consumes one image unit. Continuation text consumes its weighted story units; each continuation illustration separately consumes one image unit through `generate-page-image`. This operation-based model makes partial generation and expensive image retries visible without pretending every book costs the same.

For an initial 6-page story, the intentional accounting is **1 story unit and 6 image units** when all six page illustrations complete. The story reservation covers text/book complexity; images are separately visible provider operations, not hidden duplicate story charges. A continuation costs 1 story unit for 3 or 5 pages, or 2 for 10 pages, plus one image unit for each newly generated continuation illustration.

Character analysis, continuation suggestions, and translation currently reserve zero lightweight units. They still pass through the same ledger architecture, so abuse limits can be introduced later without changing the trust boundary.

## Reservation and failure behavior

`reserve_ai_entitlement` takes an advisory transaction lock derived from the authenticated user ID. It resolves the authoritative plan and period, sums both consumed and in-flight reservations, rejects an over-limit request, and appends a `reserved` ledger row in one transaction. This prevents concurrent requests from spending the same remaining allowance.

The Edge Function finalizes the reservation as `consumed` after the complete operation succeeds and releases it when the operation throws. The ledger is browser read/write denied. Provider usage continues to be recorded separately in `ai_usage`.

Accounting limitation: a provider can theoretically complete billable work immediately before a later Storage/database failure. The current operation-level release cannot prove whether Stripe/OpenAI charged in that narrow case. Reconcile such cases from `ai_usage` and provider logs; a future provider-request-ID integration can finalize at the precise billable boundary.

Page-image classification is server-derived: if the owned page already has an image path, the ledger records a repaint; otherwise it records an initial illustration. Both cost the same because both invoke GPT Image 2.

Phase 10C runtime evidence confirms the advisory lock prevents double-spend and that release is idempotent. The out-of-credit path rejects before the OpenAI call and leaves the editor's story and cover prompt in place. The temporary override and acceptance fixtures used for this proof were removed afterward.

## Tables and RLS

- `billing_plans`: authoritative plan configuration and Stripe Price mapping.
- `stripe_customers`: stable Supabase UUID ↔ Stripe Customer mapping.
- `subscriptions`: webhook-maintained status, price, plan, and billing period.
- `stripe_webhook_events`: retryable idempotency records.
- `entitlement_overrides`: minimal audited test/admin overrides.
- `entitlement_usage`: append-only reservation/consumption ledger.

All tables have RLS enabled and browser table privileges revoked. Browser-visible plan and usage summaries come only through narrow security-definer RPCs that omit Stripe identifiers. Mutation/reservation RPCs are not executable by browser roles.

## Status and launch policy

Only `active` and `trialing` subscriptions receive paid limits. A Checkout success page displays “Updating subscription…” until the webhook-maintained database state changes. Do not alter this to trust a Session ID or URL parameter.

Before live pricing, replace provisional limits using measured `ai_usage` economics, explicitly review free-tier abuse, decide whether lightweight operations need quotas, and test provider-success/storage-failure reconciliation.
