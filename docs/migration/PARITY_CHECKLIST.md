# Migration Parity Checklist

Use the untouched live Base44 app as the behavioral reference. Mark an item complete only after it is verified against fresh Supabase data with RLS enabled. Record intentional differences and approval beside the item.

## Authentication

- [ ] Email signup accepts the same valid inputs and surfaces comparable validation/errors.
- [ ] Email verification is enabled if required and the six-digit verification workflow works.
- [ ] Verification-code resend works and reports success.
- [ ] Successful verification establishes a session and honors a validated return path.
- [ ] Email/password login works and honors a validated return path.
- [ ] Google OAuth works if retained, returns to the intended app route, and does not permit open redirects.
- [ ] Logout clears the Supabase session and updates application state; redirecting and non-redirecting variants behave as needed.
- [ ] Password-reset request always shows a neutral success result to prevent account enumeration.
- [ ] Password-reset links establish the recovery context and allow a new password; invalid/expired links are handled.
- [ ] Session persists across reloads/tabs and refreshes safely.
- [ ] Expired or revoked sessions return the user to login without loops or stale privileged UI.
- [ ] Protected routes wait for initial auth resolution and never flash another user's data.
- [ ] Anonymous, authenticated, and cross-user RLS behavior is verified for every table and storage bucket.
- [x] Admin-only behavior, if retained, uses the RLS-protected `profiles.role` rather than editable metadata.
- [x] Login, register, forgot-password, reset-password, and callback routes are explicitly registered in React Router.
- [x] Base44 MCP OAuth consent was confirmed unreachable/unimported and removed rather than rebuilt.

## Characters

- [ ] Character list loads only the signed-in user's characters, newest first.
- [ ] Create character requires a nonblank name and photo; age remains optional and numeric.
- [ ] Original photo uploads with type/size validation to a private, user-owned storage path.
- [ ] Upload preview behaves as before and temporary object URLs are cleaned up.
- [ ] AI photo analysis describes hair, eyes, skin tone, and distinctive features with the preserved prompt intent.
- [ ] Vision processing uses an authorized server-side reference to the private photo.
- [ ] Generated storybook likeness preserves the watercolor portrait prompt and can use the original photo as an image reference.
- [ ] Generated portrait is copied into durable project-controlled storage.
- [ ] Character record saves name, optional age, description, original-photo reference, and portrait reference.
- [ ] Saved character appears in the gallery and can be reused in story creation.
- [ ] Multiple saved characters can be selected without duplicates.
- [ ] Quick characters store and use their free-form description without creating a saved character.
- [ ] Quick characters ask the AI to invent a fitting, consistent appearance.
- [ ] Existing behavior for character deletion/editing is documented (currently unsupported) before adding either feature.

## Story creation

- [ ] Template mode retains all nine templates, titles, themes, ideas, imagery, and deep-link selection via `?template=`.
- [ ] Custom mode retains custom-idea behavior and deep-link population via `?idea=`.
- [ ] Start-button eligibility matches the current template/custom validation.
- [ ] Page-count choices and default match the reference app.
- [ ] All six art styles, IDs, labels, prompt text, and watercolor default are unchanged.
- [ ] Multiple saved and quick characters are converted into the same AI character descriptions.
- [ ] Generated story title is persisted.
- [ ] Generated one-sentence summary is persisted.
- [ ] Theme and art style are persisted.
- [ ] Initial status transitions coherently from generating to ready.
- [ ] Text generation preserves the ages 4–8, gentle read-aloud tone and 1–2 sentence page requirements.
- [ ] Structured output is validated and contains exactly the requested page count.
- [ ] Story pages persist with contiguous one-based page numbers in the correct order.
- [ ] Each page image preserves scene, theme, character-consistency, art-style, and no-text prompt behavior.
- [ ] Generated images are durable Supabase Storage objects before their references are committed.
- [ ] Initial cover is the first page image.
- [ ] Partial generation failures are visible and recoverable and do not silently leave misleading ready records.
- [ ] Successful generation navigates to `/story/{id}`.

## Story editor

- [ ] Story loads by ID only for its owner.
- [ ] Pages load in ascending `page_number` order regardless of database return order.
- [ ] Empty/missing stories display an appropriate state without leaking existence across users.
- [ ] Previous/next controls, page dots, current page, and edit draft remain synchronized.
- [ ] Page text can be edited and saved.
- [ ] Editing a page invalidates only that page's cached entry in every translation.
- [ ] Language selection preserves English fallback and supported languages: Spanish, French, German, Portuguese, Japanese, and Chinese.
- [ ] Missing language translation triggers one ordered translation request and persists the result.
- [ ] Translation output length/order is validated against story pages.
- [ ] Page image regeneration uses the edited draft (if present), theme, resolved characters, and saved art style.
- [ ] Repainting persists both page text and image as current behavior does.
- [ ] Regenerating page 1 synchronizes `Story.cover_image_url` to the new page image.
- [ ] Regenerating any other page does not alter the cover.
- [ ] Custom cover opens with the existing cover and a prefilled editable prompt.
- [ ] Custom cover generation preserves title, summary, theme, art-style, and no-text prompt behavior.
- [ ] Saving a custom cover updates only the story cover (and changes generating to ready if necessary), allowing it to differ from page 1.
- [ ] Continuation suggestion uses the title, summary, and last two page texts.
- [ ] Suggested continuation is editable before generation.
- [ ] Three-page continuation works.
- [ ] Five-page continuation works.
- [ ] Ten-page continuation works.
- [ ] Continuation text preserves title, summary, theme, characters, natural flow, and 1–2 sentence page behavior.
- [ ] New pages append with unique, contiguous page numbers even under retries/concurrent requests.
- [ ] `page_count` updates to the actual total after a successful continuation.
- [ ] Editor jumps to the first appended page and preserves correct draft/navigation state.
- [ ] Partial continuation failures are recoverable and do not leave a false page count.

## Library

- [ ] Story list is restricted to the signed-in user.
- [ ] Stories sort newest first by creation time.
- [ ] Cards show cover, title, summary, and generating state as before.
- [ ] Selecting a story opens `/story/{id}`.
- [ ] Empty-library state links to story creation.
- [ ] Story deletion is either implemented with page/media cleanup and confirmation or explicitly recorded as unsupported to match the current app (no delete flow was found).
- [ ] Cross-user story IDs cannot be opened or deleted.

## PDF

- [ ] PDF generation downloads with a sanitized title-based filename.
- [ ] Cover uses the custom cover when present and otherwise falls back to page 1's image.
- [ ] Cover title and summary render in the expected positions.
- [ ] Story pages appear in ascending page-number order without mutating editor state.
- [ ] Every page includes its illustration, text, and displayed page number.
- [ ] Images load successfully from Supabase Storage with the chosen private/public URL policy and browser CORS behavior.
- [ ] PNG/JPEG handling, aspect-ratio containment, and missing-image fallback work.
- [ ] Expired signed URLs are refreshed or generated for the export operation.
- [ ] A representative story with all supported image formats exports and opens successfully.

## Security and final removal

- [ ] Built frontend contains no OpenAI key or Supabase service-role key.
- [ ] Edge Functions verify the caller and row/storage ownership for every referenced resource.
- [ ] AI endpoints validate inputs, structured outputs, file types/sizes, and enforce rate/cost controls.
- [ ] Child photos are not anonymously public unless explicitly approved.
- [ ] Logs and user-facing errors contain no tokens, secrets, or sensitive photo data.
- [ ] Two-user isolation tests pass for stories, pages, characters, translations, and storage.
- [ ] No Base44 package/import/plugin/API URL/environment variable/token convention/runtime asset remains.
- [ ] All Base44-hosted template, hero, and favicon assets have project-controlled replacements.
- [ ] Legacy `base44/` reference files are removed only after equivalent schema/policy verification.
- [ ] Build, lint, typecheck, tests, and production smoke checks pass without Base44 services.
