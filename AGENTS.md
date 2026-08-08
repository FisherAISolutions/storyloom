# AGENTS.md

## Project context

Story Loom Kids is a user-owned React/Vite application backed by Supabase and OpenAI. Preserve the existing UI, prompts, art styles, workflows, and generated-output behavior unless a task explicitly requests a change.

Start with `README.md` for local setup, environment variables, migrations, and deployment.

## Architecture and security

- Supabase Auth is the identity boundary.
- Supabase PostgreSQL RLS and private Storage policies protect user-owned data. Client-side ownership filters are defense in depth, not authorization.
- OpenAI calls remain server-side in the `story-ai` Supabase Edge Function.
- Never expose or commit OpenAI keys, Supabase service-role credentials, or other server secrets.
- Store durable private media as Supabase Storage paths, not signed URLs or temporary provider URLs.
- Do not introduce Base44 packages, APIs, configuration, assets, or deployment dependencies.
- Stripe subscriptions are planned but not implemented. Do not create client-trusted subscription or entitlement state; preserve the server-side entitlement boundary for the dedicated billing phase.

## Key files

- `src/`: frontend application source.
- `src/lib/supabase.js`: lazy browser Supabase client.
- `src/services/`: authenticated CRUD, Storage, and AI service boundaries.
- `supabase/migrations/`: database schema, RLS, policies, and supporting functions.
- `supabase/functions/story-ai/`: authenticated OpenAI orchestration and generated-image persistence.
- `.env.local`: local-only public frontend configuration; never commit secrets.

## Working guidance

- Keep changes focused on the request and preserve project conventions.
- Maintain ownership checks in both service intent and authoritative RLS/Storage policies.
- Keep AI usage and future entitlement decisions server-authoritative.
- Do not change prompts, models, story lengths, generation sequencing, or image behavior unless explicitly requested.
- Preserve unrelated user changes in a dirty worktree.
- Run the relevant scripts from `package.json` before finishing code changes.
