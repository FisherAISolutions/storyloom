# AGENTS.md

## Project Context

Story Loom Kids is a React/Vite application actively being migrated off Base44. The live Base44 application remains the behavioral reference, while this repository is the migration workspace. Preserve the existing UI, prompts, art styles, workflows, and user experience unless a compatibility change is required.

There is no production customer data to migrate. New Supabase accounts and application data will be created.

Start with `README.md` for the currently checked-in local setup. Read `docs/migration/README.md` and `docs/migration/PARITY_CHECKLIST.md` before migration work.

## Migration Architecture

- Frontend: existing React, Vite, React Router, styling, and UI components.
- Backend: Supabase Auth, PostgreSQL, Storage, Row Level Security, and Edge Functions for trusted server-side work.
- AI: OpenAI text, vision, and image generation/editing, called only from trusted server-side code.

## Migration Rules

- Do not add new Base44 SDK, API, auth, storage, integration, CLI, or Vite-plugin dependencies.
- Keep changes incremental and migration-safe; do not refactor unrelated code or redesign working UI.
- Reuse existing components and preserve prompts and behavior whenever possible.
- Do not delete Base44 schema/reference files until replacements are implemented and verified.
- Client-side Supabase access must use the public/anon key and remain protected by Auth and RLS.
- Never expose the OpenAI API key or Supabase service-role key in browser code, Vite variables, logs, or committed files.
- Run OpenAI calls and privileged operations in Supabase Edge Functions or another trusted server environment.
- Do not weaken or bypass RLS for convenience.
- Do not attempt to migrate Base44 users, passwords, IDs, stories, or database records.

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: legacy Base44 SDK client awaiting replacement.
- `src/lib/storyStudio.js`: legacy Base44 AI integration and prompt source; preserve prompt behavior.
- `base44/`: legacy schemas/config retained as migration references.
- `docs/migration/`: dependency inventory, migration plan, and parity checklist.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Prefer existing SDK/client and component boundaries when introducing Supabase replacements.
- Do not add new Base44 integration paths or use Base44 as the destination for new work.
- Until a capability is migrated, its legacy implementation may remain temporarily to keep the repository coherent.
- Run the relevant checks from `package.json` before finishing code changes.
