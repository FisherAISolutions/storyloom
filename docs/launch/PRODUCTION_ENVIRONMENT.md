# Production environment

Replace every example value before launch. Never commit the real values.

## Frontend host (public browser configuration)

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE
VITE_SUPPORT_EMAIL=support@YOUR_VERIFIED_DOMAIN
VITE_GOOGLE_AUTH_ENABLED=false
```

All `VITE_*` values are included in the browser bundle. The Supabase publishable key is intentionally public and is constrained by Auth, grants, and RLS. `VITE_SUPPORT_EMAIL` is displayed on the public Support page. Set `VITE_GOOGLE_AUTH_ENABLED=true` only after Google sign-in is configured and tested for the production Supabase project. Do not put OpenAI, Stripe secret, webhook secret, or Supabase service-role credentials in frontend variables.

## Supabase Edge Function secrets (server only)

Required:

```dotenv
OPENAI_API_KEY=REPLACE
STRIPE_SECRET_KEY=sk_live_REPLACE
STRIPE_WEBHOOK_SECRET=whsec_REPLACE
APP_URL=https://YOUR_PRODUCTION_DOMAIN
ALLOWED_ORIGINS=https://YOUR_PRODUCTION_DOMAIN
STRIPE_LIVE_MODE=enabled
```

`APP_URL` must be one exact origin with no path or trailing slash. Production billing requires HTTPS and fails closed when this value is absent or malformed. `ALLOWED_ORIGINS` is a comma-separated list of exact origins; do not use `*`. Add an intentional preview origin only while it is needed, and never let a preview deployment use live Stripe secrets.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Confirm they exist, but do not copy them into the frontend host. Optional server-only model overrides are `OPENAI_TEXT_MODEL`, `OPENAI_VISION_MODEL`, and `OPENAI_IMAGE_MODEL`; leave them unset to preserve the tested models.

During Stripe test mode, keep `STRIPE_LIVE_MODE` unset and use `sk_test_...`, the test webhook secret, test Price IDs, and a non-production test deployment. Never combine test and live identifiers.

## Supabase Auth URLs

- Site URL: `https://YOUR_PRODUCTION_DOMAIN`
- Exact production redirect routes: `https://YOUR_PRODUCTION_DOMAIN/auth/callback` and `https://YOUR_PRODUCTION_DOMAIN/reset-password`
- Keep local redirects only for deliberate local development.
- If Google sign-in is enabled, configure its provider credentials and the Supabase provider callback shown in the dashboard; test it on the production domain.

## Secret verification

After `npm run build`, scan `dist/` for the names and real values of all server secrets. The names `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` must not occur. Also inspect the frontend host's environment-variable list for accidental `VITE_` secret names.
