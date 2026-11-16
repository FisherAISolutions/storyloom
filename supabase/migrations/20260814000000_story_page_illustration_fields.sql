-- Keep reader-visible prose independent from visual-only illustration direction.
-- Existing books remain valid: a NULL illustration_scene falls back to story_pages.text.
alter table public.story_pages
  add column illustration_scene text,
  add column illustration_instructions text not null default '';

alter table public.story_pages
  add constraint story_pages_illustration_scene_length_check
    check (illustration_scene is null or char_length(illustration_scene) between 1 and 4000),
  add constraint story_pages_illustration_instructions_length_check
    check (char_length(illustration_instructions) <= 4000);

comment on column public.story_pages.text is
  'Reader-visible story prose. Image generation must never rewrite this field.';
comment on column public.story_pages.illustration_scene is
  'Visual scene description kept separate from reader-visible prose. NULL uses text as the legacy fallback.';
comment on column public.story_pages.illustration_instructions is
  'Optional owner-authored visual-only direction used for illustration generation and repainting.';
