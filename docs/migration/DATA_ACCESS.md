# Supabase Data Access Foundation

Phase 3 adds the browser infrastructure that later migrations will consume. It is intentionally not imported by the current React pages or `AuthContext`, so an unconfigured Supabase project cannot break the still-active Base44 runtime.

## Client and environment

`src/lib/supabase.js` owns a lazy singleton. The first Supabase service call validates only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then creates one client using normal browser session persistence, refresh, and callback detection. Missing or malformed configuration produces a `CONFIGURATION` service error without logging values. Merely loading the current application does not initialize this client.

No service-role or OpenAI secret is accepted anywhere in browser code.

## Identity and ownership

`src/services/auth.js` calls `supabase.auth.getUser()` for every service operation. This obtains an identity validated by the Auth server rather than trusting cached component props. Every insert sets `user_id` from that user, every query is owner-filtered as defense in depth, and writable input allowlists exclude `user_id`. Passing `user_id` explicitly is rejected.

Database RLS and the Phase 2 composite foreign keys remain authoritative. Client filters improve intent and non-enumerating behavior but do not replace RLS.

## Service APIs

- `stories.js`: `list`, `get`, `create`, `update`, and service-only `remove`. Lists by `created_at DESC`.
- `storyPages.js`: `listByStory`, `create`, `update`, and service-only `remove`. Lists by `page_number ASC`.
- `characters.js`: `list`, `get`, `create`, `update`, and service-only `remove`. Lists by `created_at DESC`.
- `storage.js`: allowlisted-bucket `getSignedUrl`, `download`, `upload`, and `remove`, plus character/story URL helpers and `clearSignedUrlCache`.

Delete functions add no product behavior because no React component calls these modules yet.

## Paths and display URLs

Database services expose schema-native `photo_path`, `character_image_path`, `image_path`, and `cover_image_path`. They do not synthesize Base44-style URL fields and never persist a signed URL.

UI migration will resolve a path explicitly through the matching storage helper. Signed URLs default to five minutes and are cached in memory by user, bucket, and path until 30 seconds before expiration. Storage operations validate the allowlisted bucket and require the first path segment to equal the authenticated user's UUID before Supabase RLS performs the authoritative check. Phase 4 now calls `clearSignedUrlCache()` and clears TanStack Query data on logout and authenticated-user changes.

## Errors

Services throw `ServiceError` with a small stable code set:

- `CONFIGURATION`
- `AUTH_REQUIRED`
- `NOT_FOUND`
- `PERMISSION_DENIED`
- `VALIDATION`
- `DATABASE`
- `STORAGE`

Owner-filtered `get`, `update`, and `remove` operations return `NOT_FOUND` for both missing and invisible rows. This avoids revealing whether another user owns a supplied UUID. Internal SDK/database errors may be attached as an error cause for diagnostics, while the public message avoids database details.

## Phase 2 consistency review

- All composite foreign keys have matching unique `(user_id, id)` targets.
- Story pages, primary child characters, and AI usage use the intended same-owner composite foreign keys.
- The profile trigger is `SECURITY DEFINER`, has an empty `search_path`, uses `public.profiles`, and always assigns `user` independent of metadata.
- Storage policies allow only the three Story Loom buckets and compare the first folder segment with `auth.uid()`. Missing or malformed folder segments produce `NULL`/nonmatching checks and are denied.
- A forward migration, `20260807010000_fix_character_reference_cleanup.sql`, corrects the deleted-character JSON aggregation alias. The original Phase 2 migration is unchanged because it may already have been applied.

## What remains on Base44

React authentication now uses Supabase. Entity CRUD, uploads, LLM calls, and image generation remain temporarily on Base44. Later phases will migrate CRUD/storage and then server-side OpenAI execution.
