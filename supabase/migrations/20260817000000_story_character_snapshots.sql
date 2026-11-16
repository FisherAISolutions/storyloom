-- Immutable per-story character identities and append-only appearance changes.
alter table public.story_worlds
  add column illustration_style_key text not null default 'watercolor'
    check (illustration_style_key in ('watercolor', 'cartoon', 'crayon', 'pencil', 'claymation', 'collage')),
  add column illustration_style_prompt text not null default 'soft hand-painted watercolor, whimsical, warm pastel palette, gentle brush texture, dreamy storybook lighting'
    check (char_length(illustration_style_prompt) <= 1000);

update public.story_worlds world
set illustration_style_key = story.art_style,
    illustration_style_prompt = case story.art_style
      when 'cartoon' then 'bold flat cartoon illustration, clean vector outlines, bright saturated colors, playful modern kids cartoon style'
      when 'crayon' then 'children''s crayon drawing, textured wax crayon strokes, visible paper grain, colorful and handmade'
      when 'pencil' then 'soft colored pencil sketch, gentle shading, light paper texture, warm and cozy'
      when 'claymation' then 'cute 3D claymation style, rounded soft clay shapes, soft studio lighting, animation still'
      when 'collage' then 'cut-paper collage illustration, layered textured paper, craft scissors look, storybook collage'
      else 'soft hand-painted watercolor, whimsical, warm pastel palette, gentle brush texture, dreamy storybook lighting'
    end
from public.stories story
where story.id = world.story_id;

create table public.story_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  story_id uuid not null,
  source_character_id uuid,
  character_key text not null check (character_key ~ '^(saved|quick|generated):[A-Za-z0-9_-]{1,64}$'),
  name text not null default '' check (char_length(name) <= 160),
  role text not null default 'supporting' check (role in ('primary', 'supporting')),
  display_order integer not null check (display_order between 0 and 2),
  age integer check (age is null or age between 0 and 120),
  character_kind text not null check (character_kind in ('human', 'animal', 'mythical')),
  species text not null check (char_length(btrim(species)) between 1 and 120),
  pronouns text check (pronouns is null or char_length(btrim(pronouns)) between 1 and 80),
  bible_snapshot jsonb not null default '{}'::jsonb
    check (public.is_valid_character_bible(bible_snapshot)),
  locked_description text not null check (char_length(btrim(locked_description)) between 1 and 8000),
  appearance_locked boolean not null default true,
  source_bible_version integer check (source_bible_version is null or source_bible_version > 0),
  created_at timestamptz not null default now(),
  unique (story_id, character_key),
  unique (user_id, story_id, id),
  constraint story_characters_story_same_owner_fk foreign key (user_id, story_id)
    references public.stories (user_id, id) on delete cascade,
  constraint story_characters_source_same_owner_fk foreign key (user_id, source_character_id)
    references public.child_characters (user_id, id) on delete set null (source_character_id)
);

create table public.story_character_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  story_id uuid not null,
  story_character_id uuid not null,
  effective_page_number integer not null check (effective_page_number between 1 and 1000),
  change_kind text not null check (change_kind in ('outfit_change', 'transformation', 'return_to_baseline')),
  outfit_snapshot jsonb not null default '{}'::jsonb
    check (public.is_valid_character_bible(outfit_snapshot)),
  appearance_override jsonb not null default '{}'::jsonb
    check (public.is_valid_character_bible(appearance_override)),
  change_description text not null default '' check (char_length(change_description) <= 1000),
  created_at timestamptz not null default now(),
  unique (story_character_id, effective_page_number),
  constraint story_character_states_character_same_story_fk foreign key (user_id, story_id, story_character_id)
    references public.story_characters (user_id, story_id, id) on delete cascade
);

create index story_characters_story_idx on public.story_characters (story_id, display_order);
create index story_character_states_effective_idx on public.story_character_states (story_id, effective_page_number, story_character_id);

alter table public.story_characters enable row level security;
alter table public.story_character_states enable row level security;
revoke all on public.story_characters, public.story_character_states from public, anon, authenticated;
grant select, insert on public.story_characters, public.story_character_states to authenticated;

create policy "Owners read story character snapshots" on public.story_characters for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Owners create story character snapshots" on public.story_characters for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Owners read story character states" on public.story_character_states for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Owners append story character states" on public.story_character_states for insert to authenticated
with check ((select auth.uid()) = user_id);

comment on table public.story_characters is 'Immutable Character Bible snapshots captured when a story is created; later edits to saved characters do not alter the book.';
comment on table public.story_character_states is 'Append-only page-effective outfit or appearance transitions. The most recent state at a page is authoritative.';
comment on column public.story_worlds.illustration_style_prompt is 'Frozen art-style prompt used to keep a book stable if global style presets change later.';
