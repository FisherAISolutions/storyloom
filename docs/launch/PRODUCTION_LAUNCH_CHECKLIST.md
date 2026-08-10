# Story Loom Kids production launch checklist

## Automated / verified

- [x] Base44 is absent from the runtime and build configuration.
- [x] Public homepage, pricing, privacy, terms, and support routes exist; private app routes remain authenticated.
- [x] Same-origin `returnTo` validation rejects external, protocol-relative, and backslash redirects.
- [x] Billing entitlement is based on signed Stripe webhook subscription state, never Checkout redirect state.
- [x] Billing `APP_URL` is required and production URLs must be HTTPS; missing configuration fails closed.
- [x] Initial story lengths remain 6, 10, 15, 24, and 30; continuation lengths remain 3, 5, and 10.
- [x] Character creation, story generation/editing, repaint, cover, translation, continuation, Library, and private PDF export remain wired in production code.
- [x] Vercel SPA rewrite supports direct navigation to application routes.
- [x] `.env.local` and other `.env*` files except `.env.example` are ignored.
- [x] Browser configuration contains only public Supabase values and the public support address.
- [x] Unit/contract tests, lint, production build, Edge syntax checks, dependency audit, diff check, and bundle secret scan results are recorded in the Phase 12 report.

## Owner action required

- [ ] Choose and connect the final HTTPS production domain.
- [ ] Set frontend `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPPORT_EMAIL` as documented in `PRODUCTION_ENVIRONMENT.md`.
- [ ] Replace the Support-page placeholder by supplying a monitored support email.
- [ ] Have the Privacy Policy and Terms reviewed for the owner's legal entity, location, target markets, refund rules, governing law, and children's-privacy obligations. Add the verified business identity where required.
- [ ] Set Supabase Auth Site URL and exact production callback/reset redirect URLs.
- [ ] Decide whether Google sign-in will launch; if yes, configure and test the production provider callback, otherwise hide/disable that button before launch.
- [ ] Confirm all three Storage buckets remain private and current owner-only policies are active.
- [ ] Set production `OPENAI_API_KEY`, `APP_URL`, and `ALLOWED_ORIGINS`; preserve the tested OpenAI model defaults.
- [ ] Deploy `story-ai`, `billing-checkout`, `billing-portal`, and `stripe-webhook` from the reviewed repository state.
- [ ] Run `supabase migration list` and `supabase db push --dry-run`; confirm all seven existing migrations match and no push is pending. Never paste or rerun old migrations manually.
- [ ] Configure reviewed provider rates in `ai_provider_pricing` when available; until then, treat cost/margin analytics as unpriced.
- [ ] Review `PRICING_RECOMMENDATION.md` and approve final prices and quotas. The repository's Stripe prices must not be changed without this approval.
- [ ] Complete every step in `STRIPE_LIVE_CUTOVER.md`.

## Final live verification

- [ ] Complete `SMOKE_TEST.md` on the final production deployment.
- [ ] Confirm one real Family subscription, signed webhook synchronization, paid entitlement, Portal return, and logout/login persistence.
- [ ] Confirm production emails use the production domain and password reset succeeds.
- [ ] Confirm no production URL redirects to localhost or `127.0.0.1`.
- [ ] Confirm production frontend and function logs expose no secrets, provider responses, SQL errors, or private cross-user content.
- [ ] Confirm a second ordinary user cannot read or mutate the first user's records or private Storage objects.

## Post-launch

- [ ] Monitor Stripe webhook failures, Edge Function errors, entitlement-limit errors, and support messages daily during launch week.
- [ ] Add reviewed OpenAI pricing and compare estimates with actual provider invoices before changing quotas.
- [ ] Review conversion, generation completion, subscription cancellation, and cost per completed book after enough real samples exist.
- [ ] Reassess the documented moderate React Router advisories during the planned router upgrade; they are not a current launch blocker.
- [ ] Schedule broader TypeScript cleanup and bundle-size optimization separately; neither should delay launch.
