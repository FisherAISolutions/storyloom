# Story Loom Kids

Story Loom Kids is a React application for creating personalized, illustrated children's stories. The browser uses Supabase for authentication and app data; trusted AI work runs through a Supabase Edge Function backed by OpenAI.

## Architecture

- React 18, Vite 6, and React Router provide the frontend.
- Supabase Auth manages user identity and sessions.
- Supabase PostgreSQL stores profiles, stories, pages, characters, and AI usage. Row Level Security enforces ownership.
- Private Supabase Storage buckets hold uploaded photos and generated character/story artwork.
- The `story-ai` Supabase Edge Function validates authenticated requests, checks ownership and the server-side entitlement hook, calls OpenAI, and persists generated images.
- OpenAI and Supabase service-role credentials never enter the browser bundle.

Stripe subscriptions are planned but are not implemented. Entitlements must remain server-authoritative when billing is added.

## Local setup

Requirements: Node.js with npm, a Supabase project, and the Supabase CLI for database/function deployment.

```bash
npm install
```

Copy `.env.example` to `.env.local` and provide the project's public browser values:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

Never place the service-role key or OpenAI API key in a `VITE_` variable.

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
supabase secrets set OPENAI_API_KEY=your-key ALLOWED_ORIGINS=https://your-app.example
supabase functions deploy story-ai
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
