# Stripe sandbox catalog migration plan

## Scope

Copy the six MyStorybook AI test products from billing account `acct_1S5NhuHEiMUagmiv` to the Connect-enabled sandbox `acct_1S5NiGH8FszCF9JP` without changing production, Supabase, customer records, subscriptions, or financial rules.

The expected catalog is:

- Family monthly subscription
- Creator monthly subscription
- Starter one-time purchase
- Small credit pack
- Medium credit pack
- Large credit pack

## Automated workflow

1. Authenticate source and target through separate Stripe CLI profiles or separate least-privilege restricted test keys. The migration must stop unless the source and target account IDs exactly match the IDs above and both environments are non-live.
2. Export only the six expected products and every attached Price into a local, secret-free manifest. Capture product name, description, images, metadata, tax code, statement descriptor, unit label, active state, and Price currency, amount, recurring interval, tax behavior, lookup key, metadata, and active state.
3. Validate the manifest against the application catalog keys and amounts in `20260825000000_launch_pricing_credit_packs.sql`. Stop on missing, duplicate, or unexpected products or Prices.
4. Run a dry-run against the target. Match previously copied objects by migration metadata (`source_account_id`, `source_product_id`, and `source_price_id`) so reruns are idempotent.
5. Create products first, then their Prices. Stripe object IDs cannot be preserved across accounts, so write a secret-free source-to-target ID mapping file and verify every copied field.
6. Require a final count of six products and six application Prices, a field-by-field comparison, and successful retrieval using the target account before accepting the migration.
7. In a separately approved release, replace the six Supabase test Price mappings with the new target Price IDs. Keep the existing plan keys, credit quantities, page limits, purchase rules, affiliate logic, referral rewards, and entitlement logic unchanged.
8. Configure target-only webhook destinations and signing secrets before test checkout. Existing customers and subscriptions are account-scoped and cannot be copied; create fresh synthetic test customers and subscriptions in the target sandbox.

## Safety controls

- Default to dry-run; require an explicit `--apply` switch for object creation.
- Never print or persist API keys, webhook secrets, customer data, or subscription data.
- Use Stripe idempotency keys derived from the source object ID and migration version.
- Never archive or update source objects.
- Never overwrite a target product that lacks the expected migration metadata.
- Do not create payments, Checkout Sessions, connected-account transfers, or payouts.
- Preserve separate charges and transfers. Author transfers remain 80% of eligible net proceeds after the 30-day hold; affiliate commissions, referral rewards, and existing customer billing remain separate ledger flows.

## Activation boundary

Catalog copying alone does not activate billing. Test checkout remains blocked until the target Price mapping, target webhook destinations, target signing secrets, and sandbox Supabase secrets are approved and configured together.
