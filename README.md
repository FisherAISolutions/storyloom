# MyStorybook AI

MyStorybook AI is a React application for creating personalized, illustrated children's stories. Its production domain is `https://mystorybookai.online`. The browser uses Supabase for authentication and app data; trusted AI work runs through a Supabase Edge Function backed by OpenAI.

## Architecture

- React 18, Vite 6, and React Router provide the frontend.
- Supabase Auth manages user identity and sessions.
- Supabase PostgreSQL stores profiles, stories, pages, characters, and AI usage. Row Level Security enforces ownership.
- Private Supabase Storage buckets hold uploaded photos and generated character/story artwork.
- The `story-ai` Supabase Edge Function validates authenticated requests, checks ownership and transactionally reserves server-authoritative subscription credits before calling OpenAI.
- OpenAI and Supabase service-role credentials never enter the browser bundle.

Stripe subscriptions use hosted Checkout, Customer Portal, signed webhook synchronization, and Supabase-backed usage reservations. Browser state and Checkout redirects are never authoritative. See `docs/billing/STRIPE_SETUP.md` and `docs/billing/ENTITLEMENTS.md`.

Admin AI economics are computed from trusted usage and entitlement records through an admin-only RPC. Provider prices are versioned server-side and intentionally unconfigured until reviewed; see `docs/analytics/AI_ECONOMICS.md`.

## Local setup

Requirements: Node.js with npm, a Supabase project, and the Supabase CLI for database/function deployment.

```bash
npm install
```

Copy `.env.example` to `.env.local` and provide the project's public browser values:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
VITE_SUPPORT_EMAIL=support@mystorybookai.online
VITE_GOOGLE_AUTH_ENABLED=false
```

Never place the service-role key or OpenAI API key in a `VITE_` variable.

Production deployment, Supabase owner actions, Stripe live cutover, and the final smoke test are collected in [`docs/launch/PRODUCTION_LAUNCH_CHECKLIST.md`](docs/launch/PRODUCTION_LAUNCH_CHECKLIST.md).

Start the frontend:

```bash
npm run dev
```

## Database and server function

Link the CLI to the intended Supabase project and apply source-controlled migrations:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

Configure server-only secrets and deploy the AI function:

```bash
supabase secrets set OPENAI_API_KEY=your-key ALLOWED_ORIGINS=https://mystorybookai.online
supabase functions deploy story-ai
supabase functions deploy billing-checkout
supabase functions deploy billing-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

Supabase supplies its hosted functions with project connection values. Do not commit secrets. See `docs/migration/OPENAI_SETUP.md` and `docs/migration/SUPABASE_SETUP.md` for detailed verification guidance.

## Checks and production build

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The production output is written to `dist/` and can be served by any static host with SPA route fallback configured to `index.html`.
