# MyStorybook AI entitlements

Supabase Auth, verified Stripe webhooks, and transactional PostgreSQL reservations are authoritative. Browser redirects and client state never grant plans or credits.

| Offer | Story units | Image units | Maximum book | Renewal |
| --- | ---: | ---: | ---: | --- |
| Free | 0 | 0 | 6 pages | None |
| Starter ($2.99) | 1 | 10 | 6 pages | One purchase/account; never expires |
| Family ($12.99) | 10 | 100 | 24 pages | Monthly |
| Creator ($24.99) | 25 | 250 | 30 pages | Monthly |
| Small pack ($4.99) | 3 | 30 | 24 pages | Never expires |
| Medium pack ($9.99) | 6 | 75 | 24 pages | Never expires |
| Large pack ($19.99) | 12 | 160 | 24 pages | Never expires |

Only active Family/Creator subscribers can buy packs. Existing purchased balances survive cancellation/downgrade and remain spendable at their snapshotted page limit. Monthly credits are consumed first, then purchased grants FIFO. Failed pre-provider operations restore their original source.

Story generation uses existing page-weight functions. Each portrait, page illustration, repaint, or cover costs one image unit. Photo analysis costs one image unit. Translation and continuation suggestions cost one story unit. Personalized editions separately reserve the buyer's image credits page by page.

Provider completion is recorded before Storage/database persistence. A provider-completed downstream failure retains its reservation and blocks same-request regeneration until an Owner/service reconciliation explicitly consumes or releases it. Canonical page paths are persisted inside `story-ai`; stable page request IDs make initial generation resumable without duplicate provider calls.

Purchased credit fulfillment requires a paid Checkout Session, exact trusted price/currency, an authenticated checkout claim, and an idempotent webhook. Refunds, disputes, and fraud warnings remove unspent credits. Already-consumed reversed credits become an account review debt that blocks further AI spending; credits are never recreated from a success redirect. Duplicate and out-of-order Stripe events remain idempotent through event, Session, PaymentIntent, and Charge identifiers.

Marketplace earnings snapshot the configured author basis-point share (initially 80%) on each purchase. The share is applied to gross price less Stripe processing fees and tax, using integer cents and deterministic floor rounding. Historical earnings are not recalculated. Affiliate ledgers remain separate and automatic author payouts remain disabled.
