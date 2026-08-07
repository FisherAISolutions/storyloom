-- Story Loom Kids: fresh Supabase backend foundation.
-- This migration intentionally imports no Base44 users, IDs, or records.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  age integer,
  description text,
  photo_path text,
  character_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  summary text,
  theme text,
  art_style text not null default 'watercolor',
  status text not null default 'draft' check (status in ('draft', 'generating', 'ready', 'failed')),
  cover_image_path text,
  child_character_id uuid,
  secondary_characters jsonb not null default '[]'::jsonb,
  translations jsonb not null default '{}'::jsonb,
  page_count integer not null default 0 check (page_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint stories_child_character_same_owner_fk
    foreign key (user_id, child_character_id)
    references public.child_characters (user_id, id)
    on delete set null (child_character_id),
  constraint stories_secondary_characters_array_check
    check (jsonb_typeof(secondary_characters) = 'array'),
  constraint stories_translations_object_check
    check (jsonb_typeof(translations) = 'object')
);

create table public.story_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  story_id uuid not null,
  page_number integer not null check (page_number > 0),
  text text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, page_number),
  constraint story_pages_story_same_owner_fk
    foreign key (user_id, story_id)
    references public.stories (user_id, id)
    on delete cascade
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (length(btrim(operation)) > 0),
  story_id uuid,
  model text,
  success boolean not null default true,
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  image_count integer check (image_count is null or image_count >= 0),
  created_at timestamptz not null default now(),
  constraint ai_usage_story_same_owner_fk
    foreign key (user_id, story_id)
    references public.stories (user_id, id)
    on delete set null (story_id)
);

create index stories_user_created_at_idx
  on public.stories (user_id, created_at desc);

create index child_characters_user_created_at_idx
  on public.child_characters (user_id, created_at desc);

-- The story_pages(story_id, page_number) unique constraint already supplies
-- the ordered lookup index used by the editor and PDF export.
create index story_pages_user_id_idx
  on public.story_pages (user_id);

create index ai_usage_user_created_at_idx
  on public.ai_usage (user_id, created_at desc);

create index ai_usage_story_id_idx
  on public.ai_usage (story_id) where story_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger child_characters_set_updated_at
before update on public.child_characters
for each row execute function public.set_updated_at();

create trigger stories_set_updated_at
before update on public.stories
for each row execute function public.set_updated_at();

create trigger story_pages_set_updated_at
before update on public.story_pages
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Validate saved-character references embedded in the legacy-compatible JSON
-- representation. Quick characters have only a non-empty quick_description.
create or replace function public.validate_story_secondary_characters()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  character_uuid uuid;
  item_key_count integer;
begin
  for item in select value from jsonb_array_elements(new.secondary_characters)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each secondary character must be an object';
    end if;

    select count(*) into item_key_count
    from jsonb_object_keys(item);

    if item ? 'character_id' then
      if item ? 'quick_description' or item_key_count <> 1 then
        raise exception 'A saved secondary character must contain only character_id';
      end if;

      begin
        character_uuid := (item ->> 'character_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'secondary character_id must be a UUID';
      end;

      if not exists (
        select 1
        from public.child_characters c
        where c.id = character_uuid and c.user_id = new.user_id
      ) then
        raise exception 'Secondary character must belong to the story owner';
      end if;
    elsif item ? 'quick_description' then
      if item_key_count <> 1
         or length(btrim(item ->> 'quick_description')) = 0 then
        raise exception 'A quick secondary character requires only a non-empty quick_description';
      end if;
    else
      raise exception 'A secondary character requires character_id or quick_description';
    end if;
  end loop;

  return new;
end;
$$;

create trigger stories_validate_secondary_characters
before insert or update of user_id, secondary_characters
on public.stories
for each row execute function public.validate_story_secondary_characters();

-- Keep legacy-compatible JSON references coherent when a saved character is
-- deleted. The primary composite FK clears child_character_id separately.
create or replace function public.remove_deleted_secondary_character_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.stories s
  set secondary_characters = (
    select coalesce(jsonb_agg(item), '[]'::jsonb)
    from jsonb_array_elements(s.secondary_characters) as item
    where item ->> 'character_id' is distinct from old.id::text
  )
  where s.user_id = old.user_id
    and s.secondary_characters @> jsonb_build_array(
      jsonb_build_object('character_id', old.id::text)
    );

  return old;
end;
$$;

create trigger child_characters_remove_secondary_refs
before delete on public.child_characters
for each row execute function public.remove_deleted_secondary_character_refs();

alter table public.profiles enable row level security;
alter table public.child_characters enable row level security;
alter table public.stories enable row level security;
alter table public.story_pages enable row level security;
alter table public.ai_usage enable row level security;

-- Make API privileges explicit. RLS further restricts every authenticated
-- operation; anonymous clients receive no table privileges.
revoke all on public.profiles from public, anon, authenticated;
revoke all on public.child_characters from public, anon, authenticated;
revoke all on public.stories from public, anon, authenticated;
revoke all on public.story_pages from public, anon, authenticated;
revoke all on public.ai_usage from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.child_characters to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.story_pages to authenticated;

create policy "Users can read their profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

-- No profile INSERT, UPDATE, or DELETE policy is granted to clients. Profiles
-- are created by the auth trigger; admin roles are assigned only server-side.

create policy "Users can read their child characters"
on public.child_characters for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their child characters"
on public.child_characters for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their child characters"
on public.child_characters for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their child characters"
on public.child_characters for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their stories"
on public.stories for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their stories"
on public.stories for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their stories"
on public.stories for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their stories"
on public.stories for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read pages of their stories"
on public.story_pages for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.user_id = (select auth.uid())
  )
);

create policy "Users can create pages for their stories"
on public.story_pages for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.user_id = (select auth.uid())
  )
);

create policy "Users can update pages of their stories"
on public.story_pages for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.user_id = (select auth.uid())
  )
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.user_id = (select auth.uid())
  )
);

create policy "Users can delete pages of their stories"
on public.story_pages for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.stories s
    where s.id = story_id and s.user_id = (select auth.uid())
  )
);

-- ai_usage intentionally has no client policies. RLS therefore denies browser
-- reads and writes. Trusted Edge Functions record authoritative usage through
-- the service role after deriving user_id from a verified JWT.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('character-photos', 'character-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('character-images', 'character-images', false, 20971520, array['image/jpeg', 'image/png', 'image/webp']),
  ('story-images', 'story-images', false, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their Story Loom objects"
on storage.objects for select
to authenticated
using (
  bucket_id in ('character-photos', 'character-images', 'story-images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can create their Story Loom objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('character-photos', 'character-images', 'story-images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their Story Loom objects"
on storage.objects for update
to authenticated
using (
  bucket_id in ('character-photos', 'character-images', 'story-images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id in ('character-photos', 'character-images', 'story-images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their Story Loom objects"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('character-photos', 'character-images', 'story-images')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

comment on table public.ai_usage is
  'Authoritative OpenAI usage events written by trusted backend code only; no browser RLS policies.';

comment on column public.child_characters.photo_path is
  'Persistent path in the private character-photos bucket, never a signed URL.';

comment on column public.child_characters.character_image_path is
  'Persistent path in the private character-images bucket, never a provider or signed URL.';

comment on column public.stories.cover_image_path is
  'Persistent path in the private story-images bucket.';

comment on column public.story_pages.image_path is
  'Persistent path in the private story-images bucket.';
