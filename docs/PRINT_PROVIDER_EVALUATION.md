# Print-on-Demand Provider Evaluation

Verified against official provider documentation on November 19, 2026. Prices are intentionally omitted because production and shipping costs require a current quote for the exact specification and destination.

## Shared prepress requirements

- Use single-page interior PDFs rather than reader spreads.
- Validate every illustration at the effective printed size; the working target is 300 PPI.
- Keep text and important content inside a safe area and extend edge-to-edge artwork through bleed.
- Generate the cover from the provider's exact template after trim, binding, paper, and page count are final. The cover must combine back, spine, and front; a front-cover image alone is not a print cover.
- Do not mark an export provider-ready until the provider validates both files. Order a physical sample before customer fulfillment.

## Lulu Direct

Official Lulu guidance requires 0.125-inch bleed, a single-page interior, 300 PPI images, embedded fonts, no printer marks, and a one-piece back/spine/front cover sized from its generated template. Lulu's cover spine varies with page count and product specification.

Integration evaluation still needs:

- API sandbox credentials and confirmed authentication flow.
- Current product identifiers for eligible full-colour children's books.
- Cost and shipping quote endpoints, destination coverage, tax/duty behavior, idempotency behavior, order cancellation window, webhook/polling status model, and retry limits.
- Exact minimum pages for each candidate hardcover/paperback product.

Official references:

- https://help.lulu.com/en/support/solutions/articles/64000255519
- https://help.lulu.com/en/support/solutions/articles/64000255584
- https://developers.lulu.com/

## Bookvault

Bookvault documents 3 mm bleed for standard full-bleed pages, 300 DPI images, a combined cover spread, and provider-generated sizing templates. Its API supports custom integrations; official documentation specifically identifies transient titles for personalized books. Webhooks cover created, acknowledged, sent-to-print, printed, and shipped states and use an HMAC-SHA256 signature over the raw body with retry delivery.

Integration evaluation still needs:

- A Bookvault account/API key stored only as a server secret.
- Confirmation of transient-title availability, file-upload lifecycle, quote endpoints, supported US production locations, shipping methods, taxes/duties, cancellation/reprint policies, and current per-order fees.
- Exact product/template selection for paperback versus case-bound output.

Official references:

- https://help.bookvault.app/api-setup
- https://api.bookvault.app/documentation/webhook-responses
- https://help.bookvault.app/what-is-bleed-and-why-do-i-need-it
- https://help.bookvault.app/guide-downloading-bookvault-templates

## Other provider candidates

Gelato, Printful, and Blurb may be evaluated only if their current APIs support book-specific products, exact wrap-cover templates, per-destination quoting, signed status callbacks, and one-off personalized files. General merchandise printing is not enough. No provider should be selected from marketing claims alone.

## Selection criteria

1. Full-colour children's-book quality and physical sample results.
2. Personalized/transient file support without exposing private source assets.
3. Exact quote availability before customer payment.
4. Reliable idempotent ordering and signed status events.
5. US and international production/shipping coverage.
6. Cancellation, refund, reprint, and loss/damage policies.
7. Platform cash-flow timing: when production and shipping charges are collected versus Stripe availability.
8. Data-processing terms for recipient shipping information and deletion/retention controls.

The provider decision remains open. The application must continue treating all locally calculated totals as estimates until a provider quote is captured and confirmed.
