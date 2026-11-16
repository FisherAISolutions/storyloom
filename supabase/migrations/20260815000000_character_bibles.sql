-- Structured, reusable Character Bibles. Existing description-only characters remain valid.
alter table public.child_characters
  add column character_kind text not null default 'human'
    check (character_kind in ('human', 'animal', 'mythical')),
  add column species text not null default 'human'
    check (char_length(btrim(species)) between 1 and 120),
  add column pronouns text
    check (pronouns is null or char_length(btrim(pronouns)) between 1 and 80),
  add column appearance_bible jsonb not null default '{}'::jsonb,
  add column appearance_locked boolean not null default true,
  add column bible_version integer not null default 1 check (bible_version > 0);

create or replace function public.is_valid_character_bible(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and octet_length(value::text) <= 8000
    and not exists (
      select 1
      from jsonb_each(value) entry
      where entry.key not in (
        'hair', 'eyes', 'skin_or_surface', 'body_features', 'clothing',
        'clothing_colors', 'shoes', 'accessories', 'wings', 'horns', 'tail',
        'distinguishing_features', 'palette', 'negative_constraints'
      )
      or jsonb_typeof(entry.value) <> 'string'
      or char_length(trim(both '"' from entry.value::text)) > 500
    )
$$;

alter table public.child_characters
  add constraint child_characters_appearance_bible_check
    check (public.is_valid_character_bible(appearance_bible));

create or replace function public.bump_character_bible_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.bible_version := 1;
    return new;
  end if;
  if row(new.character_kind, new.species, new.pronouns, new.appearance_bible, new.appearance_locked)
     is distinct from
     row(old.character_kind, old.species, old.pronouns, old.appearance_bible, old.appearance_locked) then
    new.bible_version := old.bible_version + 1;
  else
    new.bible_version := old.bible_version;
  end if;
  return new;
end;
$$;

create trigger child_characters_bump_bible_version
before insert or update on public.child_characters
for each row execute function public.bump_character_bible_version();

comment on column public.child_characters.appearance_bible is
  'Owner-reviewed structured visual identity used to build deterministic illustration descriptions.';
comment on column public.child_characters.appearance_locked is
  'When true, the appearance is treated as a continuity constraint in illustration prompts.';
comment on column public.child_characters.bible_version is
  'Monotonic version used when a story snapshots this Character Bible.';
