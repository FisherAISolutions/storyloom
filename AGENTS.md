# AGENTS.md

## Project context

MyStorybook AI (formerly Story Loom Kids) is a user-owned React/Vite application backed by Supabase and OpenAI. Preserve the existing UI, prompts, art styles, workflows, and generated-output behavior unless a task explicitly requests a change.

Start with `README.md` for local setup, environment variables, migrations, and deployment.
At the beginning of future development sessions, also read `DEVELOPMENT_PROGRESS.md` and `FEATURE_ROADMAP.md` so completed work and approval boundaries are not rediscovered or repeated.

## Architecture and security

- Supabase Auth is the identity boundary.
- Supabase PostgreSQL RLS and private Storage policies protect user-owned data. Client-side ownership filters are defense in depth, not authorization.
- OpenAI calls remain server-side in the `story-ai` Supabase Edge Function.
- Never expose or commit OpenAI keys, Supabase service-role credentials, or other server secrets.
- Store durable private media as Supabase Storage paths, not signed URLs or temporary provider URLs.
- Do not introduce Base44 packages, APIs, configuration, assets, or deployment dependencies.
- Stripe subscriptions use hosted Checkout, Customer Portal, verified webhooks, and server-authoritative Supabase entitlement reservations. Never create client-trusted subscription or entitlement state.

## Key files

- `src/`: frontend application source.
- `src/lib/supabase.js`: lazy browser Supabase client.
- `src/services/`: authenticated CRUD, Storage, and AI service boundaries.
- `supabase/migrations/`: database schema, RLS, policies, and supporting functions.
- `supabase/functions/story-ai/`: authenticated OpenAI orchestration and generated-image persistence.
- `.env.local`: local-only public frontend configuration; never commit secrets.

## Working guidance

- Check Git status before making changes. Never overwrite, discard, reset, or delete uncommitted work.
- Keep changes focused on the request and preserve project conventions.
- Preserve existing working functionality and reuse existing code, services, components, and infrastructure.
- Prioritize useful implementation over lengthy planning. Work in manageable, verifiable milestones.
- Avoid repeated searches, repository-wide audits, tests, lint runs, and production builds.
- Maintain ownership checks in both service intent and authoritative RLS/Storage policies.
- Keep AI usage and future entitlement decisions server-authoritative.
- Do not change prompts, models, story lengths, generation sequencing, or image behavior unless explicitly requested.
- Preserve unrelated user changes in a dirty worktree.
- Run focused tests for changed functionality. Run broader regression and security tests when shared systems are affected.
- Run lint and a production build once near the end of an implementation milestone when appropriate.
- Never skip essential authentication, authorization, payment, privacy, database-integrity, or security checks.
- Never use paid APIs for testing without explicit permission.
- Never deploy, push, modify production, run production migrations, or change secrets without explicit permission.
- Keep responses and milestone progress reports concise.
- Stop at approval boundaries defined by the current master development instructions.
- Staging is optional, not a mandatory release gate. Use it when risk or uncertainty justifies it; do not repeat completed staging work without new evidence.
- Before any production migration, push, or deployment, present the exact planned changes and obtain explicit approval.
- Do not repeat completed work unless a verified problem requires it.
- Keep `.supabase-staging-validation/` ignored, untracked, and out of commits.
- Update `FEATURE_ROADMAP.md` and `DEVELOPMENT_PROGRESS.md` at milestone boundaries, not after every small change.
