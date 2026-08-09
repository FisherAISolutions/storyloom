# AI Economics and Usage Analytics

## Purpose and status

Story Loom records privacy-conscious provider usage so provisional Stripe test prices and quotas can eventually be calibrated from evidence. The dashboard at `/admin/ai-economics` is read-only and admin-only. Stripe remains **TEST MODE**, plan limits remain **PROVISIONAL**, and every displayed provider cost is labeled **ESTIMATED**.

Provider price fields ship as `NULL`. This is deliberate: Phase 11 does not invent OpenAI prices. Until reviewed prices are entered, request counts, token counts, image counts, reliability, classifications, and sample sizes remain useful while dollar totals display “Not configured.”

## Trusted data sources

- `ai_usage`: one backend-written event per AI request, including user, operation, story/resource identifiers where applicable, model, success, provider token/image usage when returned, timestamp, generation classification, page count, failure stage, and request correlation ID.
- `entitlement_usage`: server-authoritative reservation, unit amount, quota bucket, plan, and consumed/released status.
- `story_generation_segments`: server-written continuation page ranges used to distinguish continuation illustrations from initial page illustrations. Browser clients cannot write provenance.
- `ai_provider_pricing`: versioned server-only model price configuration.
- `billing_plans`, `subscriptions`, and `stripe_customers`: authoritative test-plan and subscription context. Browser metadata and Checkout redirects are never analytics authority.
- `profiles.role`: the sole admin authorization source.

No analytics record stores full prompts, story/page text, child photos, provider response bodies, or generated media URLs.

## Correlation and classification

The Edge Function generates a UUID before entitlement reservation. The same ID becomes `entitlement_usage.request_id` and `ai_usage.request_id`; `ai_usage.reservation_id` additionally references the exact reservation. Initial story text is linked to the newly created owned story through `link_story_ai_usage`, which verifies both the authenticated story owner and a successful, unlinked `generate-story` event.

Image generation kinds are separate:

- `character_portrait`
- `initial_page_illustration`
- `continuation_illustration`
- `repaint`
- `custom_cover`

Character analysis, initial story, continuation text, continuation suggestion, and translation also have distinct kinds. Failed events are categorized as validation, entitlement, provider, storage/database, or unknown. Entitlement denials are not successful provider spend.

## Provider pricing configuration

`ai_provider_pricing` is server-only and effective-dated. Current model identifiers are seeded without rates:

- `gpt-5.6-sol`
- `gpt-image-2`, `1024x1024`, `medium`

After independently reviewing current official OpenAI pricing, update the applicable row through a trusted SQL/admin workflow. Do not expose an editable browser form and do not put rates in React.

```sql
update public.ai_provider_pricing
set input_usd_per_million = REVIEWED_INPUT_RATE,
    output_usd_per_million = REVIEWED_OUTPUT_RATE,
    config_version = 'reviewed-YYYY-MM-DD',
    updated_at = now()
where model = 'gpt-5.6-sol'
  and image_size is null;

update public.ai_provider_pricing
set image_usd_per_unit = REVIEWED_IMAGE_RATE,
    config_version = 'reviewed-YYYY-MM-DD',
    updated_at = now()
where model = 'gpt-image-2'
  and image_size = '1024x1024'
  and image_quality = 'medium';
```

For a future price change, insert a new row with a new `effective_from` and version rather than rewriting historical pricing. Never paste secret keys into this table.

## Estimated cost calculation

For the effective model-price row at the event timestamp:

```text
estimated cost =
  input_tokens / 1,000,000 × configured input rate
  + output_tokens / 1,000,000 × configured output rate
  + image_count × configured image-unit rate
```

The estimate is `NULL` when a required rate or measurable provider quantity is unavailable. Provider token/image usage is recorded only when OpenAI returns it; missing counts are never fabricated. Vision input is represented by provider-reported input tokens when available. These figures are operational estimates, not invoices or accounting truth.

## Book, continuation, and character metrics

**Initial book cost** combines a successful linked `initial_story` event with successful `initial_page_illustration` events for that story. It excludes later repaints, covers, translations, and continuations. Results are grouped into 6, 10, 15, 24, and 30 pages with sample counts.

**Lifetime story cost** can be derived from all events sharing `story_id`, but it is intentionally not mixed into initial-book averages. A later drill-down may expose this aggregate without story content.

Continuation text is grouped into 3, 5, and 10 pages. Successful continuation illustrations are joined through the server-recorded parent request. Retries of an already illustrated page are classified as repaints rather than new continuation illustrations.

Character analysis and portrait costs remain separate. `resource_id` allows a combined initial-character view without storing names or photos.

Translation, repaint, and cover operations remain separate because their repetition patterns and economics differ materially.

## Plan economics

The report shows current provisional plan price and quota configuration, observed users and estimated provider usage, active Stripe test subscriptions, and:

- estimated average AI cost per observed user;
- estimated maximum AI cost under quota using observed cost per story/image entitlement unit;
- test-mode monthly subscription revenue;
- **AI GROSS MARGIN ESTIMATE** dollars and percentage.

The margin estimate is not net profit. It excludes Stripe processing fees, hosting, taxes, support, refunds, chargebacks, and every other business expense. When pricing or samples are missing, capacity and margin estimates remain unavailable rather than defaulting to zero-cost AI.

## Authorization and privacy

`get_admin_ai_economics` checks `auth.uid()` against `profiles.role = 'admin'` inside a `SECURITY DEFINER` function with an empty `search_path`. Execute is granted explicitly to authenticated users so the function can return a stable `ADMIN_REQUIRED` denial; normal users still cannot read any source table/view. Frontend route hiding is secondary UX only.

The per-user table includes UUID/email and aggregate request/cost totals only. It exposes no child or story content. Normal Billing continues to show quota use/reset dates and never provider dollars.

## Time ranges, samples, and retention

Supported filters are current month, last 7 days, last 30 days, and all time. Empty groups retain their expected page/continuation rows with zero samples. One-observation averages always display their sample count.

Retain `ai_usage`, entitlement correlation, and pricing history for at least 24 months while plan economics are being calibrated. Review retention annually against privacy policy and operational needs. Do not automatically delete historical samples in Phase 11. If deletion is later required, preserve anonymized aggregate statistics and price-version provenance.

## Calibration gate

### Deployment baseline (August 9, 2026)

The first deployed all-time admin snapshot contained 59 historical `ai_usage` rows: 56 successes, 3 failures, and 46 successful image generations. All 56 successes are currently unpriced because reviewed provider rates are intentionally absent. Historical rows predate Phase 11 classification/correlation, so initial-book, continuation, and image-kind sample groups correctly begin at zero; the raw request/image totals remain visible. New requests populate the richer fields prospectively rather than fabricating a backfill.

Do not change plan prices or quotas until:

1. reviewed provider prices are configured with effective dates;
2. each initial story length has a meaningful number of completed samples;
3. continuation, portrait, repaint, cover, and translation samples cover normal retry/failure behavior;
4. at least several billing periods show per-plan usage distribution, not only averages;
5. provider estimates are reconciled against actual OpenAI billing exports;
6. Stripe fees and non-AI operating costs are modeled separately.

The current dashboard is ready to gather this evidence. Current data is not yet sufficient to finalize commercial pricing.
