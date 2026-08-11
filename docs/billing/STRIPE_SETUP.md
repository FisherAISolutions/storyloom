# Stripe Test-Mode Setup

MyStorybook AI is implemented for Stripe-hosted Checkout, Customer Portal, signed webhooks, and server-authoritative Supabase entitlements. Begin in Stripe test mode only.

## Phase 10B/10C verification status (August 9, 2026)

- **IMPLEMENTED:** hosted Checkout and Customer Portal, raw-body signed webhooks, server-authoritative subscription synchronization, transactional AI reservations, and authenticated billing summaries.
- **TEST-MODE VERIFIED:** the linked Supabase project has the billing migrations and all four permanent Edge Functions deployed. A normal user completed Family Checkout with Stripe's test card, the signed webhook activated Family limits, a duplicate Checkout event was replayed twice without changing the entitlement, the Customer Portal opened for the mapped customer, and cancellation returned the account to Free limits. Phase 10C additionally passed 80 ordinary-user/anonymous isolation assertions, a provider-blocked out-of-credit request, one live metered cover, and deployed reservation concurrency/release checks.
- **NOT YET VERIFIED:** live repaint and portrait generation were not repeated because their identical one-image-unit server contracts were verified without unnecessary provider spend. Production/live-mode billing remains deliberately unconfigured.
- **PROVISIONAL:** all prices and quotas below are test economics. Stripe live mode is not enabled.

## 1. Create test products and recurring prices

In Stripe test mode, create monthly recurring Prices for `family` and `creator`. Then map their `price_...` identifiers in trusted SQL (Price IDs are identifiers, not secrets, but the browser never chooses them):

```sql
update public.billing_plans set stripe_price_id = 'price_TEST_FAMILY' where plan_key = 'family';
update public.billing_plans set stripe_price_id = 'price_TEST_CREATOR' where plan_key = 'creator';
```

Keep the database display text synchronized with the Stripe Dashboard. Seeded prices and quotas are provisional.

The Phase 10B test account uses these explicitly provisional test-mode objects:

| Plan key | Test product | Monthly test price | Test Price ID |
| --- | --- | ---: | --- |
| `free` | none | $0 | none |
| `family` | MyStorybook AI Family (Provisional Test) | $12 | `price_1U2LvcHEiMUagmivI9mPEREH` |
| `creator` | MyStorybook AI Creator (Provisional Test) | $24 | `price_1U2LvdHEiMUagmivD6tjJMkF` |

The non-secret identifiers are mapped by `20260809010000_stripe_test_price_mapping.sql`; the browser still submits only a `plan_key`. Replace this migration's test identifiers as part of a deliberate live launch rather than treating them as production configuration.

## 2. Required server-only secrets

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://your-test-app.example
ALLOWED_ORIGINS=https://your-test-app.example
```

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. `OPENAI_API_KEY` remains required by `story-ai`. Never create `VITE_STRIPE_SECRET_KEY`, `VITE_STRIPE_WEBHOOK_SECRET`, or any browser service-role variable. Live Stripe keys are rejected unless the server-only `STRIPE_LIVE_MODE=enabled` switch is deliberately set during a later production launch.

For the Phase 10B local browser test, `APP_URL` is `http://127.0.0.1:5173` and both `http://127.0.0.1:5173` and `http://localhost:5173` are allowed origins. Use the same hostname for sign-in and Checkout: browser storage is origin-scoped, so switching between `localhost` and `127.0.0.1` on return requires signing in again even though the Stripe subscription and webhook synchronization succeeded.

Set test secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_REPLACE STRIPE_WEBHOOK_SECRET=whsec_REPLACE APP_URL=https://your-test-app.example ALLOWED_ORIGINS=https://your-test-app.example
```

## 3. Apply and deploy

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy story-ai
supabase functions deploy billing-checkout
supabase functions deploy billing-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

The webhook intentionally does not use a Supabase user JWT; it authenticates Stripe using the raw request body and `Stripe-Signature`. Checkout and Portal require authenticated Supabase JWTs.

## 4. Configure the webhook

Create a test-mode webhook endpoint targeting:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`

Checkout completion reconciles the Customer mapping only. Subscription events and valid subscription statuses grant access. The event table claims each Stripe event once; failed events are marked retryable for a later delivery.

Stripe recommends subscription webhooks because subscription activity is asynchronous and requires raw-body signature verification. It also recommends monitoring invoice payment events operationally. This implementation derives access conservatively from subscription status changes; add alerting/reconciliation for `invoice.payment_failed` before live mode if business dunning policy requires immediate UI messaging.

## 5. Test flow

1. Sign into a test MyStorybook AI user.
2. Open `/pricing`, choose a paid test plan, and complete hosted Checkout with Stripe test card `4242 4242 4242 4242`, a future expiry, any CVC, and any postal code.
3. Confirm `/billing/success` initially treats the redirect as UX only and refreshes the authoritative summary.
4. Confirm the webhook event succeeds and `subscriptions` contains the correct Supabase UUID, Price, status, and period.
5. Confirm `/billing` shows the paid plan and Stripe period.
6. Generate within the test allowance and verify consumed ledger rows.
7. Exhaust a disposable test user's allowance and verify OpenAI is not called after `ENTITLEMENT_LIMIT`.
8. Open Customer Portal, change/cancel the test subscription, and verify webhook-driven UI state.

For local forwarding, Stripe CLI can forward test events to a locally served webhook and prints a temporary `whsec_...`. Remote Supabase test-mode webhook setup is usually clearer because it exercises the deployed Deno function and secrets.

## 6. Reconciliation and production checklist

If sync fails, inspect Stripe Workbench delivery attempts and the safe `stripe_webhook_events.last_error` code, correct the Price/customer mapping, then retry the event from Stripe. Do not edit browser metadata or mark a subscription active manually. Time-bounded `entitlement_overrides` are available only for audited server-side testing.

Before production:

- Calibrate all quotas from real `ai_usage` economics.
- Create live Products/Prices and update server-side mappings.
- Configure and test a separate live webhook secret.
- Review tax, cancellation, dunning, refund, and customer-support policy.
- Add invoice failure monitoring if required by that policy.
- Repeat two-user billing-table isolation and concurrent-spend tests after any material authorization or entitlement migration.
- Deliberately set live secrets and `STRIPE_LIVE_MODE=enabled`; never reuse test secrets.

Phase 10B/10C mutated only the linked Supabase project and Stripe test account as documented above. Phase 10C's temporary acceptance function, one-time secret, fixture story/image, override, ledger fixtures, and ephemeral users were removed after the checks. It did not enable or modify Stripe live mode.
