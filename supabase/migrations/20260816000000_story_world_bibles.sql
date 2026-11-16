-- Persistent Story World Bibles, named locations, and page-level scene continuity.
alter table public.story_pages
  add constraint story_pages_user_story_id_unique unique (user_id, story_id, id);

create table public.story_worlds (
  story_id uuid primary key,
  user_id uuid not null default auth.uid(),
  main_setting text not null check (char_length(btrim(main_setting)) between 1 and 1000),
  environment_type text not null check (char_length(btrim(environment_type)) between 1 and 120),
  architecture_landmarks text not null default '' check (char_length(architecture_landmarks) <= 2000),
  lighting_atmosphere text not null default '' check (char_length(lighting_atmosphere) <= 1000),
  visual_palette text not null default '' check (char_length(visual_palette) <= 500),
  environmental_rules text not null default '' check (char_length(environmental_rules) <= 2000),
  negative_constraints text not null default '' check (char_length(negative_constraints) <= 1000),
  bible_version integer not null default 1 check (bible_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, story_id),
  constraint story_worlds_story_same_owner_fk foreign key (user_id, story_id)
    references public.stories (user_id, id) on delete cascade
);

create table public.story_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  story_id uuid not null,
  location_key text not null check (location_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  environment_type text not null check (char_length(btrim(environment_type)) between 1 and 120),
  visual_description text not null check (char_length(btrim(visual_description)) between 1 and 2000),
  environmental_rules text not null default '' check (char_length(environmental_rules) <= 1500),
  lighting_atmosphere text not null default '' check (char_length(lighting_atmosphere) <= 1000),
  visual_palette text not null default '' check (char_length(visual_palette) <= 500),
  negative_constraints text not null default '' check (char_length(negative_constraints) <= 1000),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, location_key),
  unique (user_id, story_id, id),
  constraint story_locations_story_same_owner_fk foreign key (user_id, story_id)
    references public.stories (user_id, id) on delete cascade
);

create table public.story_page_scenes (
  story_page_id uuid primary key,
  user_id uuid not null default auth.uid(),
  story_id uuid not null,
  location_id uuid not null,
  scene_description text not null check (char_length(btrim(scene_description)) between 1 and 4000),
  environment_state text not null default '' check (char_length(environment_state) <= 1500),
  continuity_notes text not null default '' check (char_length(continuity_notes) <= 1500),
  transition_kind text not null default 'stay' check (transition_kind in ('stay', 'enter', 'exit', 'travel', 'transform')),
  transition_description text not null default '' check (char_length(transition_description) <= 1000),
  characters_present jsonb not null default '[]'::jsonb check (jsonb_typeof(characters_present) = 'array' and jsonb_array_length(characters_present) <= 3),
  character_actions text not null default '' check (char_length(character_actions) <= 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_page_scenes_page_same_owner_fk foreign key (user_id, story_id, story_page_id)
    references public.story_pages (user_id, story_id, id) on delete cascade,
  constraint story_page_scenes_location_same_story_fk foreign key (user_id, story_id, location_id)
    references public.story_locations (user_id, story_id, id) on delete restrict
);

create index story_locations_story_idx on public.story_locations (story_id, is_main desc, name);
create index story_page_scenes_story_idx on public.story_page_scenes (story_id, story_page_id);

create trigger story_worlds_set_updated_at before update on public.story_worlds
for each row execute function public.set_updated_at();
create trigger story_locations_set_updated_at before update on public.story_locations
for each row execute function public.set_updated_at();
create trigger story_page_scenes_set_updated_at before update on public.story_page_scenes
for each row execute function public.set_updated_at();

alter table public.story_worlds enable row level security;
alter table public.story_locations enable row level security;
alter table public.story_page_scenes enable row level security;
revoke all on public.story_worlds, public.story_locations, public.story_page_scenes from public, anon, authenticated;
grant select, insert, update, delete on public.story_worlds, public.story_locations, public.story_page_scenes to authenticated;

create policy "Owners manage their story worlds" on public.story_worlds for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners manage their story locations" on public.story_locations for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners manage their page scenes" on public.story_page_scenes for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

comment on table public.story_worlds is 'Persistent global visual rules for a story; does not override an explicit page location.';
comment on table public.story_locations is 'Named visual locations available to pages in one story.';
comment on table public.story_page_scenes is 'Visual-only page scene, active location, transition, character presence, and continuity state.';
