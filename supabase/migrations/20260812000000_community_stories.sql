-- Opt-in Community Stories. Private story rows and private Storage remain authoritative.
create table public.community_stories (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null,
  user_id uuid not null,
  status text not null default 'published' check (status in ('pending', 'published', 'hidden', 'removed')),
  shared_at timestamptz,
  updated_at timestamptz not null default now(),
  featured boolean not null default false,
  display_author_name text,
  public_slug text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now(),
  constraint community_story_owner_fk foreign key (story_id, user_id)
    references public.stories (id, user_id) on delete cascade,
  constraint community_author_length check (display_author_name is null or char_length(display_author_name) between 1 and 80),
  unique (story_id)
);

create index community_stories_public_listing_idx
  on public.community_stories (featured desc, shared_at desc)
  where status = 'published';

alter table public.community_stories enable row level security;
revoke all on public.community_stories from public, anon, authenticated;
grant select, insert, update, delete on public.community_stories to authenticated;

create policy "Owners read their community state"
on public.community_stories for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

create policy "Owners share their stories"
on public.community_stories for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and status = 'published'
  and featured = false
  and exists (select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid()))
);

create policy "Owners unpublish their stories"
on public.community_stories for update to authenticated
using ((select auth.uid()) = user_id or public.is_admin())
with check (
  public.is_admin()
  or ((select auth.uid()) = user_id and featured = false and status in ('published', 'removed'))
);

create policy "Owners remove their community state"
on public.community_stories for delete to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

create or replace function public.protect_community_moderation_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (old.status is distinct from 'published' or old.shared_at is null) then new.shared_at := now(); end if;
  if not public.is_admin() then
    new.user_id := old.user_id;
    new.story_id := old.story_id;
    new.public_slug := old.public_slug;
    new.featured := old.featured;
  end if;
  return new;
end;
$$;

create trigger protect_community_moderation_fields
before update on public.community_stories
for each row execute function public.protect_community_moderation_fields();

comment on table public.community_stories is 'Opt-in publication state only. Public story content and short-lived signed media are delivered by the community-public Edge Function after publication verification.';
