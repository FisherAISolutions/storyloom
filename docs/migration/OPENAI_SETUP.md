# OpenAI Edge Function Setup

## Architecture and models

`supabase/functions/story-ai` is the sole OpenAI boundary. The authenticated browser calls it through `src/services/ai.js`; it verifies the Supabase JWT, re-checks resource ownership with the caller-scoped client, validates inputs, runs the entitlement hook, calls OpenAI, and writes generated image bytes directly to private Supabase Storage.

Server-side defaults are centralized in `config.ts`:

- `gpt-5.6-sol` for structured story, continuation, translation, and vision output. The Responses API uses strict JSON Schema plus application validation. Reasoning effort is `none` to keep these bounded generation calls close to their former latency/cost role.
- `gpt-image-2` for page/cover generation and reference-photo character edits. The Image API returns base64 bytes, which are signature/size checked and uploaded as PNG without exposing provider URLs.

These choices follow the current OpenAI guidance for [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [vision inputs](https://developers.openai.com/api/docs/guides/images-vision), and the latest [GPT Image model](https://developers.openai.com/api/docs/guides/image-generation). Model overrides are server secrets only: `OPENAI_TEXT_MODEL`, `OPENAI_VISION_MODEL`, and `OPENAI_IMAGE_MODEL`.

## Required secrets and deployment

Create an API key in the OpenAI developer platform, then configure it directly as a Supabase secret. Do not add it to `.env.local` or any `VITE_*` variable.

```powershell
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set OPENAI_API_KEY=<your-openai-key> ALLOWED_ORIGINS=http://localhost:5173,https://preview.example.com,https://storyloom.example.com
supabase functions deploy story-ai
```

When not linked, use `--project-ref <your-project-ref>` with both `secrets set` and `functions deploy`.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. The service role is used only for trusted `ai_usage` inserts after caller verification; database ownership checks, private downloads, and uploads use the caller-scoped client and RLS.

For local serving, create an ignored server-only env file outside frontend configuration and run:

```powershell
supabase start
supabase functions serve story-ai --env-file supabase/functions/.env.local
```

The server-only file needs `OPENAI_API_KEY`; it may also set `ALLOWED_ORIGINS` and model overrides. Never prefix these with `VITE_`.

## Security and request behavior

- Gateway JWT verification and explicit `auth.getUser()` verification are both enabled.
- Story and character rows are read with the authenticated caller's JWT, so RLS remains authoritative.
- Private photos are downloaded inside the function and sent to OpenAI as an in-memory base64 data URL. No public photo URL is created.
- Generated PNGs use deterministic paths and `upsert`: portrait, page, and cover retries replace the same object rather than accumulating files.
- Story counts are limited to 6/10/15; continuation counts to 3/5/10; page numbers, prompt sizes, character counts, languages, and art-style IDs are bounded.
- A lightweight per-isolate throttle supplements authentication and input limits. It is not a distributed billing quota.
- `assertAiEntitlement()` runs server-side before every provider request. A later Stripe phase should replace its allow-all body with webhook-maintained entitlement and billing-period quota checks.
- Failures return stable safe codes and do not include provider bodies, stack traces, secrets, or image bytes.

## Persistence and consistency

Image generation is incremental: the frontend still creates text first and requests one page image at a time. The function uploads directly to:

- `character-images/{user_id}/{character_id}/portrait.png`
- `story-images/{user_id}/{story_id}/pages/{page_number_padded}.png`
- `story-images/{user_id}/{story_id}/cover.png`

The browser receives only these paths and persists them through existing CRUD services. Page-image character continuity matches the Base44 implementation by resolving saved-character descriptions and quick-character descriptions server-side. The existing implementation did not pass reference portraits into page generation; the child portrait itself uses the original photo through the Images Edits endpoint.

## Usage and cost visibility

Text generation, translation, and vision consume model input/output tokens; image creation/editing consumes image generation. `ai_usage` records provider token counts only when returned and records `image_count=1` for image operations. It does not fabricate pricing or missing usage fields, and logging failure does not discard a successful generation.

## Testing status

Repository contract tests are mock/static validation, not live provider verification. After configuring and deploying, use a normal confirmed account and a non-sensitive test image to verify one short story request, suggestion, translation, photo analysis, page illustration, and cover/portrait. Confirm the generated objects remain private and that another normal account cannot read or overwrite them.
