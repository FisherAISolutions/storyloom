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

1. Activate Connect for the FisherCreations/MyStoryBookAI Stripe account in test mode and complete the platform profile.
2. Confirm Accounts v2 recipient accounts with Express Dashboard access are available.
3. Enable and test the Stripe balance transfers capability.
4. Add Connect webhook events: `v2.core.account.updated` (or `account.updated` for compatible account events), `transfer.created`, and `transfer.reversed`.
5. Configure test-mode restricted keys with only the account, account-link, transfer, Checkout, customer, subscription, and webhook permissions actually used.
6. Keep `STRIPE_CONNECT_TEST_MODE_ENABLED` unset until onboarding and transfer tests are approved.
7. Review Radar, dispute handling, negative-balance recovery, tax registrations, 1099/reporting requirements, and the platform merchant-of-record position with qualified advisers.
8. Review and activate the versioned seller, affiliate, and customer-referral policies before enabling their corresponding server-side switches.

Do not enable live transfers until test-mode onboarding, a $25 minimum, 30-day holding behavior, refunds, disputes, duplicate events, and transfer idempotency have been verified end to end.
