# Stripe launch configuration

Checkout remains disabled until the FisherCreations **test-mode** Price IDs below are mapped in the database. Do not enable live mode or reuse webhook secrets between modes.

## Products and prices

| Product | Internal key | Stripe price | Recurrence | Required metadata |
| --- | --- | ---: | --- | --- |
| MyStorybook AI Family | `family` | $12.99 | Monthly | `plan_key=family`, `product_type=subscription` |
| MyStorybook AI Creator | `creator` | $24.99 | Monthly | `plan_key=creator`, `product_type=subscription` |
| MyStorybook AI Starter | `starter` | $2.99 | One time | `product_key=starter`, `product_type=ai_credits` |
| Small credit pack | `credits_small` | $4.99 | One time | `product_key=credits_small`, `product_type=ai_credits` |
| Medium credit pack | `credits_medium` | $9.99 | One time | `product_key=credits_medium`, `product_type=ai_credits` |
| Large credit pack | `credits_large` | $19.99 | One time | `product_key=credits_large`, `product_type=ai_credits` |

Metadata is documentation/operations context only. Checkout chooses trusted database Price IDs and writes authoritative Session metadata itself.

After creating test-mode Prices, map identifiers through reviewed SQL:

```sql
update public.billing_plans set stripe_price_id='price_TEST_FAMILY' where plan_key='family';
update public.billing_plans set stripe_price_id='price_TEST_CREATOR' where plan_key='creator';
update public.credit_products set stripe_price_id=case product_key
  when 'starter' then 'price_TEST_STARTER'
  when 'credits_small' then 'price_TEST_SMALL'
  when 'credits_medium' then 'price_TEST_MEDIUM'
  when 'credits_large' then 'price_TEST_LARGE'
end where product_key in ('starter','credits_small','credits_medium','credits_large');
```

## Server-only configuration

- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `APP_URL=https://mystorybookai.online`
- `ALLOWED_ORIGINS=https://mystorybookai.online,https://www.mystorybookai.online`
- Keep `STRIPE_LIVE_MODE` unset until a separately approved live cutover.

Required webhook events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `radar.early_fraud_warning.created`

Deploy the webhook without gateway JWT verification; it authenticates Stripe from the raw-body signature. Checkout/Portal functions keep in-function Supabase authentication. Configure Stripe Tax only after registrations, product tax codes, price tax behavior, and refund policy are approved; automatic tax is not enabled by this milestone.

Automatic author payouts remain disabled. Public paid marketplace activation still requires Connect account design/onboarding, payout eligibility, tax reporting decisions, support policy, and a manual settlement ledger/process.
