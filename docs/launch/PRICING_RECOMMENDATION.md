# Conservative launch pricing and quotas

No Stripe price or entitlement value was changed in Phase 12. This recommendation requires owner approval and a new forward migration for quota changes.

## Important limitation

`ai_provider_pricing` does not yet contain reviewed provider rates. The Phase 11 dashboard therefore correctly reports successful operations as unpriced. The owner's approximate test observation—about $1.13 for roughly 18 images plus character generation and story text—is useful directional evidence, but it is not a substitute for provider-rate configuration and invoice reconciliation.

## Recommended launch offer

| Plan | Monthly price | Story units | Image units | Maximum initial story length |
|---|---:|---:|---:|---:|
| Free | $0 | 1 | 8 | 6 pages |
| Family | $14.99 | 10 | 60 | 15 pages |
| Creator | $29.99 | 25 | 150 | 30 pages |

Rationale:

- Free still supports one complete 6-page book plus a small amount of portrait/cover or retry activity, while reducing automated free-tier image exposure from the provisional 10-image allowance.
- Family retains enough image capacity for several complete books and editing, but a 15-page initial maximum reduces the chance that one accidental long generation consumes much of the monthly allowance. Continuations remain available within the server-authoritative plan ceiling.
- Creator preserves the 30-page premium option and high-volume use while adding price headroom and a slightly tighter image cap during the initial measurement period.

## Margin-risk call

The provisional **$12 Family / 60 images** offer does not look obviously loss-making from the single observed test, but the evidence is too limited to call it safe. The provisional **$24 Creator / 160 images** offer carries more meaningful concentration risk because a heavy user can consume substantially more image generation while infrastructure, Stripe fees, failed/retried operations, support, and taxes are not represented in the observed AI cost. Launching it unchanged is a business decision, not a technically verified margin conclusion.

Review after the first representative paid cohort:

1. enter dated, reviewed OpenAI rates in `ai_provider_pricing`;
2. reconcile dashboard estimates to actual provider invoices;
3. compare cost per completed book and per active subscriber by plan;
4. change future prices/quotas only through reviewed server-side mappings and a new migration.
