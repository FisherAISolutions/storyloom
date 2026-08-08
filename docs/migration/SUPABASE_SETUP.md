# Supabase Backend Setup

This guide applies the source-controlled Story Loom Kids backend foundation to a fresh Supabase project. It does not import Base44 users, IDs, or records, and Phase 2 does not switch the React application to Supabase.

## 1. Create a fresh project

Create a new project in the Supabase Dashboard and choose the intended production region and a strong database password. Do not reuse Base44 credentials or add secrets to the repository. Record the project URL and publishable key in a local, ignored `.env.local` only when the frontend is wired in Phase 3.

Do not place the service-role key or OpenAI key in any `VITE_*` variable. Vite values are public browser configuration.

## 2. Apply the migration

The exact source of truth is:

```text
supabase/migrations/20260807000000_storyloom_foundation.sql
```

Choose one workflow:

- Local CLI: install the Supabase CLI, run `supabase start`, then `supabase db reset` from the repository root. This applies all local migrations to the local stack.
- Remote CLI, when intentionally ready: run `supabase login`, `supabase link --project-ref <project-ref>`, inspect with `supabase db diff` as appropriate, and run `supabase db push`. Linking and pushing are deliberate manual actions; no remote project is contacted by this phase.
- Dashboard: open the SQL editor for the fresh project, paste the migration file exactly, and run it once. Prefer the CLI for repeatability.

The migration is ordered as one atomic foundation: tables and constraints, indexes, reusable triggers, ownership validation, RLS policies, private buckets, and storage policies.

## 3. Auth configuration

In Authentication settings:

1. Set the Site URL to the canonical production frontend origin.
2. Add exact permitted redirect URLs for local development and production. Typical local URLs are `http://localhost:5173/**` and `http://127.0.0.1:5173/**`; do not use broad production wildcards.
3. Keep email/password signup enabled if matching the current app.
4. Decide whether email confirmation is mandatory. The current UI expects a six-digit verification code; Supabase email templates and the Phase 3 implementation must be configured and tested to preserve that experience. Local `config.toml` enables confirmation as the secure default.
5. Configure password-recovery redirects to the future explicit reset/callback route. Preserve the existing same-origin/allowlisted return-path protections.

### Phase 4 route configuration

The frontend now uses `/login`, `/register`, `/forgot-password`, `/reset-password`, and `/auth/callback`.

Configure the Dashboard with:

- **Site URL:** the canonical production origin, such as `https://<production-host>`.
- **Additional Redirect URLs:** `http://localhost:5173/**`, `http://127.0.0.1:5173/**`, intentionally supported preview origins, and `https://<production-host>/**`.
- Permit `<origin>/reset-password` for password recovery.
- Permit `<origin>/auth/callback` for email confirmation and the post-provider application return.

The configured project currently reports email auth enabled and automatic confirmation disabled. New users must therefore follow Supabase's email confirmation link; the former Base44 six-digit OTP protocol is no longer used.

### Google OAuth for Phase 4

Create OAuth credentials in Google Cloud for the intended environments. In Supabase Authentication > Providers, enable Google and enter its client ID and secret. Register the Supabase callback URL shown by the Dashboard with Google, conventionally `https://<project-ref>.supabase.co/auth/v1/callback`. Google returns to Supabase first; Supabase then redirects to the React `/auth/callback` route. Provider secrets stay in Supabase Auth configuration, never in Vite variables or source control.

The configured project currently reports Google disabled. Enable it before expecting the visible Google buttons to complete sign-in.

## Future Stripe compatibility

Stripe is intentionally deferred. The stable `auth.users.id`/`profiles.id` identity and server-only `ai_usage` table allow a later billing phase to add customer, subscription, price/tier, entitlement, quota-period, and webhook-event tables without changing authentication ownership.

Authoritative subscription status and entitlements must be written by verified Stripe webhooks or trusted server operations. They must not live only in browser state, `user_metadata`, or other user-editable fields. Checkout and Customer Portal sessions will be created server-side, and AI functions will enforce quotas from server-maintained subscription/tier state.

## 4. Database design

The migration creates:

- `profiles`: one row per `auth.users` row, with constrained `user`/`admin` role.
- `child_characters`: user-owned name, optional age, AI description, and private storage paths.
- `stories`: user-owned story metadata, art style/status, primary and secondary character references, translations, cover path, and page count.
- `story_pages`: user-owned ordered pages with text and image path.
- `ai_usage`: trusted-backend-only OpenAI operation accounting without fabricated cost data.

All primary keys are fresh UUIDs. `created_at` and `updated_at` are timezone-aware. One reusable trigger maintains `updated_at`.

### Relationship and ownership integrity

Composite keys enforce same-owner references:

- `(stories.user_id, stories.child_character_id)` references the same owner's child character. Deleting that character clears the primary reference.
- `(story_pages.user_id, story_pages.story_id)` references the same owner's story and cascades when the story is deleted.
- `(ai_usage.user_id, ai_usage.story_id)` prevents usage from being attached across owners and clears the optional story reference on story deletion.

`secondary_characters` remains JSON to preserve saved-character and quick-character behavior. A validation trigger permits only `{ "character_id": "<uuid>" }` owned by the story owner or `{ "quick_description": "..." }`. A character-delete trigger removes its saved references from this JSON. The browser is therefore not trusted to validate relationships.

## 5. Row Level Security

RLS is enabled on every application table.

- Profiles: an authenticated user may read only their own row. No browser insert/update/delete policy exists, so users cannot promote themselves.
- Child characters: authenticated owners may select, insert, update, and delete their own rows.
- Stories: authenticated owners may select, insert, update, and delete their own rows.
- Story pages: every policy requires both matching `user_id` and an owned parent story.
- AI usage: no client policy exists. Browsers cannot read or forge usage records; trusted Edge Functions use server credentials after verifying the caller.

The service role bypasses RLS and must remain server-side. Future Edge Functions must still derive the subject from a verified JWT and explicitly authorize referenced resources.

## 6. Profile creation and admin assignment

An `AFTER INSERT` trigger on `auth.users` calls a `SECURITY DEFINER` function with an empty `search_path`. It inserts an idempotent profile with role `user` and ignores user metadata for role assignment.

Assign an administrator only through a deliberate trusted operation, such as the Dashboard SQL editor or a tightly controlled server/admin process:

```sql
update public.profiles
set role = 'admin'
where id = '<verified-auth-user-uuid>'::uuid;
```

Verify the user UUID independently before running this statement. Never expose a general role-update endpoint to ordinary clients.

## 7. Storage

The migration creates three private buckets:

| Bucket | Limit | MIME types |
| --- | ---: | --- |
| `character-photos` | 10 MiB | JPEG, PNG, WebP |
| `character-images` | 20 MiB | JPEG, PNG, WebP |
| `story-images` | 20 MiB | JPEG, PNG, WebP |

Object paths must begin with the authenticated user's UUID. Policies cover select, insert, update, and delete only within that namespace.

Use these canonical layouts:

```text
character-photos/{user_id}/{character_id}/original.{ext}
character-images/{user_id}/{character_id}/portrait.{ext}
story-images/{user_id}/{story_id}/pages/001.{ext}
story-images/{user_id}/{story_id}/pages/002.{ext}
story-images/{user_id}/{story_id}/cover.{ext}
```

Database columns store the object path, not a signed URL or temporary OpenAI URL. Phase 3+ clients/functions will generate short-lived signed URLs when reading private files. Bucket MIME/size constraints are defense in depth; the frontend and Edge Functions must also validate file signatures, MIME type, extension, dimensions, and size before processing. Original child photos remain private.

## 8. Environment variables and secrets

Copy `.env.example` to an ignored `.env.local` when Phase 3 begins:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Supabase now recommends publishable keys for browser clients; legacy projects may display an `anon` key, which has the same public-client role. This project uses `VITE_SUPABASE_PUBLISHABLE_KEY` to make the intended exposure explicit.

Future Edge Function secrets—not frontend variables—will include values such as:

```text
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Supabase-hosted functions receive project connection values through their runtime. Store custom secrets with `supabase secrets set` only when deliberately linked to the correct project. Never commit secret values.

## 9. Verify the foundation

After applying locally or to a fresh project:

1. Confirm migration history contains `20260807000000_storyloom_foundation`.
2. Confirm all five tables exist and RLS is enabled.
3. Confirm all three buckets exist and are private with the documented limits/types.
4. Create two test users; confirm each receives exactly one `user` profile.
5. As each authenticated user, test own-row CRUD and confirm cross-user selects/writes fail.
6. Try forging another user's `child_character_id`, secondary JSON `character_id`, and `story_id`; each must fail.
7. Confirm clients cannot update `profiles.role` or insert/select `ai_usage`.
8. Test storage CRUD under each user's own UUID prefix and rejection under the other user's prefix.
9. Delete a story and confirm its pages cascade. Delete a referenced character and confirm primary/secondary references are cleared.
10. Inspect policies in Database > Policies; no user-owned policy should contain unconditional `true`.

Useful local commands, if the CLI and container runtime are installed:

```bash
supabase start
supabase db reset
supabase migration list --local
supabase status
```

Historical Phase 2 note: runtime wiring began in Phase 3. The completed application now uses Supabase for authentication, data, Storage, and server functions.
