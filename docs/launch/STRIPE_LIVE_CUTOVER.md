# Stripe live-mode cutover

Do this only after the production frontend, Supabase Auth URLs, Edge Functions, and support/legal information are ready. Keep the existing test configuration intact until the live verification succeeds.

- [ ] In Stripe Dashboard, switch to live mode.
- [ ] Set Stripe business branding and customer-facing links to MyStorybook AI and `https://mystorybookai.online`; verify the support mailbox exists before publishing it.
- [ ] Create the live **Family** recurring monthly product and price using the owner-approved launch price.
- [ ] Create the live **Creator** recurring monthly product and price using the owner-approved launch price.
- [ ] Record both live `price_...` IDs and verify the currency, amount, and monthly interval.
- [ ] Update the server-side `billing_plans.stripe_price_id` mappings for Starter (`free`), `family`, and `creator` through a reviewed new forward migration. Do not expose Price IDs to the browser and do not edit an applied migration.
- [ ] Obtain a restricted production Stripe secret key if its permissions cover Customers, Checkout Sessions, Billing Portal Sessions, Subscriptions, Products, and Prices; otherwise use the live secret key. Store it only as the Supabase `STRIPE_SECRET_KEY` secret.
- [ ] In Stripe live mode, create the webhook endpoint `https://PROJECT_REF.supabase.co/functions/v1/stripe-webhook`.
- [ ] Subscribe only to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, and `customer.subscription.resumed`.
- [ ] Reveal the live endpoint signing secret and store it only as Supabase `STRIPE_WEBHOOK_SECRET`.
- [ ] Configure the live Customer Portal: allow subscription cancellation and the plan changes the business intends to support; set business branding and customer-facing policy links.
- [ ] Set `APP_URL=https://mystorybookai.online`, `ALLOWED_ORIGINS=https://mystorybookai.online`, and `STRIPE_LIVE_MODE=enabled` as Supabase secrets.
- [ ] Deploy `billing-checkout`, `billing-portal`, and `stripe-webhook` after the live secrets and reviewed Price-ID migration are ready.
- [ ] Confirm the production frontend contains no test Price IDs or Stripe secrets. Confirm the two database mappings are live `price_...` IDs.
- [ ] Use one controlled real customer account to buy Family with a real payment method.
- [ ] In Stripe, confirm Checkout completed and required webhook events received HTTP 2xx responses.
- [ ] In MyStorybook AI Billing, confirm Family becomes active only after subscription webhook synchronization and the correct period/allowances appear.
- [ ] Open Customer Portal from Billing and confirm it returns to the production `/billing` route.
- [ ] If practical, schedule cancellation at period end. Confirm the app shows that state and retains paid entitlement until the period ends. Undo the scheduled cancellation if this is the retained launch account.
- [ ] Log out and back in; confirm paid entitlement persists from server state.
- [ ] Confirm no test-mode Customer, Subscription, Product, Price, key, or webhook secret is used by production.

Checkout redirect success is never proof of entitlement. The acceptance criterion is a valid Stripe subscription event synchronized by the signed webhook and reflected by `get_billing_summary()`.
