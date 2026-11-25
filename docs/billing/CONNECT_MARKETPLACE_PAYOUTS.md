# Marketplace seller and affiliate payout architecture

Status: implementation foundation only. Paid selling, commissions, referrals, transfers, and payouts default to disabled and require separate Owner activation.

## Stripe Connect recommendation

MyStoryBookAI operates the marketplace checkout, appears to buyers as the business handling payment support, and holds earnings for 30 days. The selected design is:

- Marketplace checkout remains on the MyStoryBookAI Stripe account.
- Charge pattern: separate charges and transfers, because earnings must be held before release.
- Connected-account dashboard: Express.
- Fee collection: MyStoryBookAI manages pricing.
- Negative balance liability: MyStoryBookAI.
- Recipient capability: Stripe balance transfers must be active before paid listing or transfer eligibility.
- Onboarding and bank details: Stripe-hosted; no bank data is collected or stored by MyStoryBookAI.

MyStoryBookAI is responsible for processing fees, refunds, disputes, transfer reversals, negative balances, marketplace customer support, and determining applicable tax collection. Authors remain responsible for accurate identity/tax information and their own income-tax obligations, subject to qualified legal and tax review.

The author ledger snapshots gross, tax, processing fee, eligible net, author share, and platform share in integer cents. Internal earnings, Stripe transfers, and connected-account bank payouts are separate lifecycle states.

Affiliate commissions are not assumed to use the seller Connect configuration. They remain in the payout-provider abstraction until the owner confirms the legally appropriate payout method and tax-information workflow.

## Manual Stripe requirements before test activation

1. Rotate the sandbox API key exposed during CLI diagnostics, review Workbench request logs, and use a least-privilege restricted key for Edge Functions.
2. Use the Connect-enabled FisherCreations onboarding sandbox (`acct_1S5NiGH8FszCF9JP`) for Connect testing. Accounts v2 recipient creation, hosted onboarding, and transfer-capability retrieval were verified there on November 25, 2026. Keep the original billing test account (`acct_1S5NhuHEiMUagmiv`) unchanged until the separately approved catalog migration is complete.
3. Confirm Accounts v2 recipient accounts with Express Dashboard access are available and that `stripe_balance.stripe_transfers` can become active after hosted onboarding.
4. On the existing **Your account** snapshot webhook endpoint, add `transfer.created` and `transfer.reversed`.
5. Add a **Connected accounts** snapshot destination to the same function URL for `account.updated`; store its independent signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET`.
6. Add an Accounts v2 thin-event destination to the same function URL for `v2.core.account.created`, `v2.core.account.updated`, `v2.core.account.closed`, `v2.core.account[requirements].updated`, `v2.core.account[configuration.recipient].updated`, and `v2.core.account[configuration.recipient].capability_status_updated`; store its signing secret as `STRIPE_THIN_WEBHOOK_SECRET`.
7. Configure a sandbox restricted key with only account, Account Links v2, transfer, Checkout, customer, subscription, refund/read, balance-transaction/read, and webhook-related permissions actually used.
8. Keep `STRIPE_CONNECT_TEST_MODE_ENABLED` unset until onboarding and transfer tests are approved.
9. Review Radar, dispute handling, negative-balance recovery, tax registrations, 1099/reporting requirements, and the platform merchant-of-record position with qualified advisers.
10. Review and activate the versioned seller, affiliate, and customer-referral policies before enabling their corresponding server-side switches.

Payout batches are Owner-prepared and Owner-approved. The code enforces the $25 threshold and 30-day hold, but a monthly processing day is an operating procedure; no automatic monthly payout scheduler is enabled.

Do not enable live transfers until test-mode onboarding, a $25 minimum, 30-day holding behavior, refunds, disputes, duplicate events, and transfer idempotency have been verified end to end.
