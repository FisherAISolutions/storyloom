-- Phase 8: require canonical, owner-prefixed private object paths at both the
-- Storage policy and database-reference boundaries.

create or replace function public.is_storyloom_storage_path(
  object_bucket text,
  object_name text,
  owner_id uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when owner_id is null or object_name is null then false
    when object_bucket = 'character-photos' then
      object_name ~ (
        '^' || owner_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '/original\.(jpg|png|webp)$'
      )
    when object_bucket = 'character-images' then
      object_name ~ (
        '^' || owner_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '/portrait\.(jpg|png|webp)$'
      )
    when object_bucket = 'story-images' then
      object_name ~ (
        '^' || owner_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
        '/(cover|pages/[0-9]{3})\.(jpg|png|webp)$'
      )
    else false
  end;
$$;

revoke all on function public.is_storyloom_storage_path(text, text, uuid)
from public, anon, authenticated;
grant execute on function public.is_storyloom_storage_path(text, text, uuid)
to authenticated;

drop policy if exists "Users can read their Story Loom objects" on storage.objects;
drop policy if exists "Users can create their Story Loom objects" on storage.objects;
drop policy if exists "Users can update their Story Loom objects" on storage.objects;
drop policy if exists "Users can delete their Story Loom objects" on storage.objects;

create policy "Users can read their Story Loom objects"
on storage.objects for select
to authenticated
using (public.is_storyloom_storage_path(bucket_id, name, (select auth.uid())));

create policy "Users can create their Story Loom objects"
on storage.objects for insert
to authenticated
with check (public.is_storyloom_storage_path(bucket_id, name, (select auth.uid())));

create policy "Users can update their Story Loom objects"
on storage.objects for update
to authenticated
using (public.is_storyloom_storage_path(bucket_id, name, (select auth.uid())))
with check (public.is_storyloom_storage_path(bucket_id, name, (select auth.uid())));

create policy "Users can delete their Story Loom objects"
on storage.objects for delete
to authenticated
using (public.is_storyloom_storage_path(bucket_id, name, (select auth.uid())));

alter table public.child_characters
  add constraint child_characters_photo_path_canonical_check
  check (
    photo_path is null
    or public.is_storyloom_storage_path('character-photos', photo_path, user_id)
  ) not valid,
  add constraint child_characters_image_path_canonical_check
  check (
    character_image_path is null
    or public.is_storyloom_storage_path('character-images', character_image_path, user_id)
  ) not valid;

alter table public.stories
  add constraint stories_cover_path_canonical_check
  check (
    cover_image_path is null
    or public.is_storyloom_storage_path('story-images', cover_image_path, user_id)
  ) not valid;

alter table public.story_pages
  add constraint story_pages_image_path_canonical_check
  check (
    image_path is null
    or public.is_storyloom_storage_path('story-images', image_path, user_id)
  ) not valid;

alter table public.child_characters
  validate constraint child_characters_photo_path_canonical_check,
  validate constraint child_characters_image_path_canonical_check;

alter table public.stories
  validate constraint stories_cover_path_canonical_check;

alter table public.story_pages
  validate constraint story_pages_image_path_canonical_check;

-- Trigger functions are invoked by their owning triggers. They should not be
-- directly executable through API roles, especially the SECURITY DEFINER
-- profile bootstrap.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.validate_story_secondary_characters() from public, anon, authenticated;
revoke execute on function public.remove_deleted_secondary_character_refs() from public, anon, authenticated;
