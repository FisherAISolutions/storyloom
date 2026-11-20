-- Optional, buyer-funded personalized editions of Community Marketplace books.
-- Source books remain unchanged and no source image path is copied.

-- `story_characters.id` is already the primary key, so this pair cannot contain
-- duplicates. The explicit owner/id key lets personalization provenance use an
-- ownership-aware foreign key without changing Character Bible behavior.
alter table public.story_characters
  add constraint story_characters_user_id_id_key unique (user_id, id);

create table public.marketplace_personalization_settings (
  community_story_id uuid primary key references public.community_stories(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  story_character_id uuid not null,
  enabled boolean not null default false,
  allow_name boolean not null default true,
  allow_appearance boolean not null default true,
  allow_clothing boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint marketplace_personalization_character_fk
    foreign key (author_user_id, story_character_id)
    references public.story_characters(user_id, id) on delete cascade,
  check (not enabled or allow_name or allow_appearance or allow_clothing)
);

create table public.marketplace_personalized_editions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  community_story_id uuid references public.community_stories(id) on delete set null,
  source_story_id uuid references public.stories(id) on delete set null,
  personalized_story_id uuid not null unique,
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  buyer_character_id uuid,
  source_character_id uuid,
  source_author_user_id uuid references public.profiles(id) on delete set null,
  qualifying_purchase_id uuid references public.marketplace_purchases(id) on delete set null,
  requires_active_purchase boolean not null,
  source_author_name text not null check (char_length(source_author_name) between 1 and 80),
  source_title text not null check (char_length(btrim(source_title)) > 0),
  status text not null default 'generating' check (status in ('generating','ready','failed')),
  estimated_image_units integer not null check (estimated_image_units > 0),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (buyer_user_id, request_id),
  constraint marketplace_personalized_story_owner_fk
    foreign key (buyer_user_id, personalized_story_id)
    references public.stories(user_id, id) on delete cascade,
  constraint marketplace_personalized_buyer_character_fk
    foreign key (buyer_user_id, buyer_character_id)
    references public.child_characters(user_id, id) on delete set null (buyer_character_id),
  constraint marketplace_personalized_source_character_fk
    foreign key (source_author_user_id, source_character_id)
    references public.story_characters(user_id, id) on delete set null,
  check (
    (requires_active_purchase and qualifying_purchase_id is not null)
    or (not requires_active_purchase and qualifying_purchase_id is null)
  )
);

create index marketplace_personalized_editions_buyer_idx
  on public.marketplace_personalized_editions(buyer_user_id, created_at desc);
create unique index marketplace_one_generating_edition_idx
  on public.marketplace_personalized_editions(community_story_id,buyer_user_id,buyer_character_id)
  where status='generating' and community_story_id is not null and buyer_character_id is not null;

-- The marketplace ledger must not block safe account/source deletion. Financial
-- rows remain for audit while identity/source references are anonymized.
alter table public.marketplace_purchases
  drop constraint marketplace_purchases_community_story_id_fkey,
  drop constraint marketplace_purchases_story_id_fkey,
  drop constraint marketplace_purchases_buyer_user_id_fkey,
  drop constraint marketplace_purchases_author_user_id_fkey,
  alter column community_story_id drop not null,
  alter column story_id drop not null,
  alter column buyer_user_id drop not null,
  alter column author_user_id drop not null,
  add constraint marketplace_purchases_community_story_id_fkey foreign key(community_story_id) references public.community_stories(id) on delete set null,
  add constraint marketplace_purchases_story_id_fkey foreign key(story_id) references public.stories(id) on delete set null,
  add constraint marketplace_purchases_buyer_user_id_fkey foreign key(buyer_user_id) references public.profiles(id) on delete set null,
  add constraint marketplace_purchases_author_user_id_fkey foreign key(author_user_id) references public.profiles(id) on delete set null;

alter table public.marketplace_author_earnings
  drop constraint marketplace_author_earnings_author_user_id_fkey,
  alter column author_user_id drop not null,
  add constraint marketplace_author_earnings_author_user_id_fkey foreign key(author_user_id) references public.profiles(id) on delete set null;

alter table public.marketplace_personalization_settings enable row level security;
alter table public.marketplace_personalized_editions enable row level security;
revoke all on public.marketplace_personalization_settings, public.marketplace_personalized_editions from public, anon, authenticated;
grant select on public.marketplace_personalization_settings, public.marketplace_personalized_editions to authenticated;

create or replace function public.can_access_owned_story(p_user_id uuid,p_story_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and p_story_id is not null and (
    not exists(select 1 from public.marketplace_personalized_editions mpe where mpe.personalized_story_id=p_story_id)
    or exists(
      select 1 from public.marketplace_personalized_editions mpe
      where mpe.personalized_story_id=p_story_id and mpe.buyer_user_id=p_user_id
        and (
          not mpe.requires_active_purchase
          or exists(
            select 1 from public.marketplace_purchases mp
            where mp.id=mpe.qualifying_purchase_id and mp.buyer_user_id=p_user_id and mp.status='active'
          )
        )
    )
  );
$$;

create or replace function public.can_access_story_storage_object(p_user_id uuid,p_object_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_story_id uuid;
begin
  if p_user_id is null or p_object_name is null or split_part(p_object_name,'/',1)<>p_user_id::text then return false; end if;
  begin v_story_id:=split_part(p_object_name,'/',2)::uuid; exception when invalid_text_representation then return false; end;
  return public.can_access_owned_story(p_user_id,v_story_id);
end; $$;

revoke all on function public.can_access_owned_story(uuid,uuid),public.can_access_story_storage_object(uuid,text) from public,anon,authenticated;
grant execute on function public.can_access_owned_story(uuid,uuid),public.can_access_story_storage_object(uuid,text) to authenticated;

-- Replace broad owner-only policies with entitlement-aware owner policies.
drop policy "Users can read their stories" on public.stories;
drop policy "Users can create their stories" on public.stories;
drop policy "Users can update their stories" on public.stories;
drop policy "Users can delete their stories" on public.stories;
create policy "Users can read accessible owned stories" on public.stories for select to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),id));
create policy "Users can create owned stories" on public.stories for insert to authenticated
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),id));
create policy "Users can update accessible owned stories" on public.stories for update to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),id))
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),id));
create policy "Users can delete accessible owned stories" on public.stories for delete to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),id));

drop policy "Users can read pages of their stories" on public.story_pages;
drop policy "Users can create pages for their stories" on public.story_pages;
drop policy "Users can update pages of their stories" on public.story_pages;
drop policy "Users can delete pages of their stories" on public.story_pages;
create policy "Users can read pages of accessible stories" on public.story_pages for select to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Users can create pages for accessible stories" on public.story_pages for insert to authenticated
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Users can update pages of accessible stories" on public.story_pages for update to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id))
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Users can delete pages of accessible stories" on public.story_pages for delete to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));

drop policy "Owners manage their story worlds" on public.story_worlds;
drop policy "Owners manage their story locations" on public.story_locations;
drop policy "Owners manage their page scenes" on public.story_page_scenes;
create policy "Owners manage accessible story worlds" on public.story_worlds for all to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id))
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Owners manage accessible story locations" on public.story_locations for all to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id))
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Owners manage accessible page scenes" on public.story_page_scenes for all to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id))
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));

drop policy "Owners read story character snapshots" on public.story_characters;
drop policy "Owners create story character snapshots" on public.story_characters;
drop policy "Owners read story character states" on public.story_character_states;
drop policy "Owners append story character states" on public.story_character_states;
create policy "Owners read accessible story character snapshots" on public.story_characters for select to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Owners create accessible story character snapshots" on public.story_characters for insert to authenticated
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Owners read accessible story character states" on public.story_character_states for select to authenticated
using ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));
create policy "Owners append accessible story character states" on public.story_character_states for insert to authenticated
with check ((select auth.uid())=user_id and public.can_access_owned_story((select auth.uid()),story_id));

drop policy "Users can read their Story Loom objects" on storage.objects;
drop policy "Users can create their Story Loom objects" on storage.objects;
drop policy "Users can update their Story Loom objects" on storage.objects;
drop policy "Users can delete their Story Loom objects" on storage.objects;
create policy "Users can read accessible Story Loom objects" on storage.objects for select to authenticated
using (public.is_storyloom_storage_path(bucket_id,name,(select auth.uid())) and (bucket_id<>'story-images' or public.can_access_story_storage_object((select auth.uid()),name)));
create policy "Users can create accessible Story Loom objects" on storage.objects for insert to authenticated
with check (public.is_storyloom_storage_path(bucket_id,name,(select auth.uid())) and (bucket_id<>'story-images' or public.can_access_story_storage_object((select auth.uid()),name)));
create policy "Users can update accessible Story Loom objects" on storage.objects for update to authenticated
using (public.is_storyloom_storage_path(bucket_id,name,(select auth.uid())) and (bucket_id<>'story-images' or public.can_access_story_storage_object((select auth.uid()),name)))
with check (public.is_storyloom_storage_path(bucket_id,name,(select auth.uid())) and (bucket_id<>'story-images' or public.can_access_story_storage_object((select auth.uid()),name)));
create policy "Users can delete accessible Story Loom objects" on storage.objects for delete to authenticated
using (public.is_storyloom_storage_path(bucket_id,name,(select auth.uid())) and (bucket_id<>'story-images' or public.can_access_story_storage_object((select auth.uid()),name)));

create policy "Authors read personalization settings"
on public.marketplace_personalization_settings for select to authenticated
using ((select auth.uid()) = author_user_id);

create policy "Buyers read personalized editions"
on public.marketplace_personalized_editions for select to authenticated
using ((select auth.uid()) = buyer_user_id and public.can_access_owned_story((select auth.uid()),personalized_story_id));

create or replace function public.configure_marketplace_personalization(
  p_story_id uuid,
  p_enabled boolean,
  p_story_character_id uuid,
  p_allow_name boolean default true,
  p_allow_appearance boolean default true,
  p_allow_clothing boolean default true
) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_share public.community_stories;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select cs.* into v_share from public.community_stories cs
    where cs.story_id=p_story_id and cs.user_id=v_user for update;
  if not found or v_share.status <> 'published' then raise exception 'STORY_NOT_PUBLISHED'; end if;
  if not exists(select 1 from public.story_characters sc where sc.id=p_story_character_id and sc.story_id=p_story_id and sc.user_id=v_user)
    then raise exception 'CHARACTER_NOT_IN_STORY'; end if;
  if p_allow_name and not exists(select 1 from public.story_characters sc where sc.id=p_story_character_id and char_length(btrim(sc.name))>0)
    then raise exception 'CHARACTER_NAME_REQUIRED'; end if;
  if p_enabled and not (p_allow_name or p_allow_appearance or p_allow_clothing)
    then raise exception 'CUSTOMIZATION_REQUIRED'; end if;
  insert into public.marketplace_personalization_settings(
    community_story_id,author_user_id,story_character_id,enabled,allow_name,allow_appearance,allow_clothing,updated_at
  ) values(v_share.id,v_user,p_story_character_id,p_enabled,p_allow_name,p_allow_appearance,p_allow_clothing,now())
  on conflict(community_story_id) do update set
    story_character_id=excluded.story_character_id, enabled=excluded.enabled,
    allow_name=excluded.allow_name, allow_appearance=excluded.allow_appearance,
    allow_clothing=excluded.allow_clothing, updated_at=now();
end; $$;

create or replace function public.create_marketplace_personalized_edition(
  p_slug text, p_buyer_character_id uuid, p_request_id uuid, p_confirmed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_buyer uuid := auth.uid(); v_share public.community_stories; v_setting public.marketplace_personalization_settings;
  v_source public.stories; v_buyer_character public.child_characters; v_source_character public.story_characters;
  v_story_id uuid; v_existing public.marketplace_personalized_editions; v_page_count integer; v_purchase_id uuid; v_author_name text;
  v_location_map jsonb := '{}'::jsonb; v_character_map jsonb := '{}'::jsonb;
  v_location record; v_page record; v_character record; v_state record;
  v_new_location uuid; v_new_page uuid; v_new_character uuid; v_new_bible jsonb; v_new_name text; v_locked text;
begin
  if v_buyer is null then raise exception 'AUTH_REQUIRED'; end if;
  if not p_confirmed then raise exception 'CONFIRMATION_REQUIRED'; end if;
  select cs.* into v_share from public.community_stories cs where cs.public_slug=p_slug and cs.status='published';
  if not found then raise exception 'BOOK_NOT_AVAILABLE'; end if;
  if v_share.user_id=v_buyer then raise exception 'SELF_PERSONALIZATION_NOT_ALLOWED'; end if;
  select mps.* into v_setting from public.marketplace_personalization_settings mps
    where mps.community_story_id=v_share.id and mps.enabled;
  if not found then raise exception 'PERSONALIZATION_NOT_AVAILABLE'; end if;
  if v_share.marketplace_enabled then
    select mp.id into v_purchase_id from public.marketplace_purchases mp
    where mp.community_story_id=v_share.id and mp.buyer_user_id=v_buyer and mp.status='active'
    order by mp.purchased_at desc limit 1;
    if v_purchase_id is null then raise exception 'PURCHASE_REQUIRED'; end if;
  end if;

  select mpe.* into v_existing from public.marketplace_personalized_editions mpe
  where mpe.buyer_user_id=v_buyer and mpe.request_id=p_request_id;
  if found then
    if v_existing.community_story_id is distinct from v_share.id then raise exception 'REQUEST_ID_CONFLICT'; end if;
    if v_existing.requires_active_purchase and v_existing.qualifying_purchase_id is distinct from v_purchase_id then
      update public.marketplace_personalized_editions set qualifying_purchase_id=v_purchase_id where id=v_existing.id;
    end if;
    return jsonb_build_object('edition_id',v_existing.id,'story_id',v_existing.personalized_story_id,'estimated_image_units',v_existing.estimated_image_units,'status',v_existing.status);
  end if;

  select s.* into strict v_source from public.stories s where s.id=v_share.story_id and s.user_id=v_share.user_id;
  select cc.* into v_buyer_character from public.child_characters cc where cc.id=p_buyer_character_id and cc.user_id=v_buyer;
  if not found then raise exception 'BUYER_CHARACTER_REQUIRED'; end if;
  select mpe.* into v_existing from public.marketplace_personalized_editions mpe
    where mpe.community_story_id=v_share.id and mpe.buyer_user_id=v_buyer and mpe.buyer_character_id=p_buyer_character_id and mpe.status='generating';
  if found then
    if v_existing.requires_active_purchase and v_existing.qualifying_purchase_id is distinct from v_purchase_id then
      update public.marketplace_personalized_editions set qualifying_purchase_id=v_purchase_id where id=v_existing.id;
    end if;
    return jsonb_build_object('edition_id',v_existing.id,'story_id',v_existing.personalized_story_id,'estimated_image_units',v_existing.estimated_image_units,'status',v_existing.status);
  end if;
  select sc.* into strict v_source_character from public.story_characters sc where sc.id=v_setting.story_character_id and sc.story_id=v_source.id;
  select count(*)::integer into v_page_count from public.story_pages sp where sp.story_id=v_source.id;
  if v_page_count < 1 then raise exception 'SOURCE_BOOK_EMPTY'; end if;
  select coalesce(ap.display_name,v_share.display_author_name,'MyStorybook AI creator') into v_author_name
  from (select 1) seed left join public.author_profiles ap on ap.user_id=v_share.user_id;

  insert into public.stories(user_id,title,summary,theme,art_style,status,cover_image_path,child_character_id,secondary_characters,translations,page_count)
  values(v_buyer,v_source.title||' — Personalized Edition',v_source.summary,v_source.theme,v_source.art_style,'generating',null,p_buyer_character_id,'[]'::jsonb,'{}'::jsonb,v_page_count)
  returning id into v_story_id;

  for v_page in select * from public.story_pages sp where sp.story_id=v_source.id order by sp.page_number loop
    insert into public.story_pages(user_id,story_id,page_number,text,illustration_scene,illustration_instructions,image_path)
    values(v_buyer,v_story_id,v_page.page_number,
      case when v_setting.allow_name then replace(coalesce(v_page.text,''),v_source_character.name,v_buyer_character.name) else v_page.text end,
      case when v_setting.allow_name then replace(coalesce(v_page.illustration_scene,''),v_source_character.name,v_buyer_character.name) else v_page.illustration_scene end,
      case when v_setting.allow_name then replace(coalesce(v_page.illustration_instructions,''),v_source_character.name,v_buyer_character.name) else v_page.illustration_instructions end,
      null) returning id into v_new_page;
  end loop;

  insert into public.story_worlds(story_id,user_id,main_setting,environment_type,architecture_landmarks,lighting_atmosphere,visual_palette,environmental_rules,negative_constraints,bible_version,illustration_style_key,illustration_style_prompt)
  select v_story_id,v_buyer,sw.main_setting,sw.environment_type,sw.architecture_landmarks,sw.lighting_atmosphere,sw.visual_palette,sw.environmental_rules,sw.negative_constraints,sw.bible_version,sw.illustration_style_key,sw.illustration_style_prompt
  from public.story_worlds sw where sw.story_id=v_source.id;

  for v_location in select * from public.story_locations sl where sl.story_id=v_source.id loop
    insert into public.story_locations(user_id,story_id,location_key,name,environment_type,visual_description,environmental_rules,lighting_atmosphere,visual_palette,negative_constraints,is_main)
    values(v_buyer,v_story_id,v_location.location_key,v_location.name,v_location.environment_type,v_location.visual_description,v_location.environmental_rules,v_location.lighting_atmosphere,v_location.visual_palette,v_location.negative_constraints,v_location.is_main)
    returning id into v_new_location;
    v_location_map := v_location_map || jsonb_build_object(v_location.id::text,v_new_location::text);
  end loop;

  insert into public.story_page_scenes(story_page_id,user_id,story_id,location_id,scene_description,environment_state,continuity_notes,transition_kind,transition_description,characters_present,character_actions)
  select np.id,v_buyer,v_story_id,(v_location_map->>ss.location_id::text)::uuid,
    case when v_setting.allow_name then replace(ss.scene_description,v_source_character.name,v_buyer_character.name) else ss.scene_description end,
    ss.environment_state,ss.continuity_notes,ss.transition_kind,ss.transition_description,ss.characters_present,
    case when v_setting.allow_name then replace(ss.character_actions,v_source_character.name,v_buyer_character.name) else ss.character_actions end
  from public.story_page_scenes ss
  join public.story_pages op on op.id=ss.story_page_id
  join public.story_pages np on np.story_id=v_story_id and np.page_number=op.page_number
  where ss.story_id=v_source.id and v_location_map ? ss.location_id::text;

  for v_character in select * from public.story_characters sc where sc.story_id=v_source.id order by sc.display_order loop
    v_new_name := case when v_character.id=v_setting.story_character_id and v_setting.allow_name then v_buyer_character.name else v_character.name end;
    v_new_bible := v_character.bible_snapshot;
    if v_character.id=v_setting.story_character_id then
      if v_setting.allow_appearance then
        v_new_bible := v_new_bible || (v_buyer_character.appearance_bible - 'clothing' - 'clothing_colors' - 'shoes' - 'accessories');
      end if;
      if v_setting.allow_clothing then
        v_new_bible := v_new_bible || jsonb_strip_nulls(jsonb_build_object(
          'clothing',v_buyer_character.appearance_bible->'clothing','clothing_colors',v_buyer_character.appearance_bible->'clothing_colors',
          'shoes',v_buyer_character.appearance_bible->'shoes','accessories',v_buyer_character.appearance_bible->'accessories'));
      end if;
      v_locked := coalesce(nullif(btrim(v_buyer_character.description),''),v_character.locked_description);
    else v_locked := v_character.locked_description; end if;
    insert into public.story_characters(user_id,story_id,source_character_id,character_key,name,role,display_order,age,character_kind,species,pronouns,bible_snapshot,locked_description,appearance_locked,source_bible_version)
    values(v_buyer,v_story_id,case when v_character.id=v_setting.story_character_id then p_buyer_character_id else null end,v_character.character_key,v_new_name,v_character.role,v_character.display_order,
      case when v_character.id=v_setting.story_character_id and v_setting.allow_appearance then v_buyer_character.age else v_character.age end,
      case when v_character.id=v_setting.story_character_id and v_setting.allow_appearance then v_buyer_character.character_kind else v_character.character_kind end,
      case when v_character.id=v_setting.story_character_id and v_setting.allow_appearance then v_buyer_character.species else v_character.species end,
      case when v_character.id=v_setting.story_character_id and v_setting.allow_appearance then v_buyer_character.pronouns else v_character.pronouns end,
      v_new_bible,v_locked,true,case when v_character.id=v_setting.story_character_id then v_buyer_character.bible_version else v_character.source_bible_version end)
    returning id into v_new_character;
    v_character_map := v_character_map || jsonb_build_object(v_character.id::text,v_new_character::text);
  end loop;

  insert into public.story_character_states(user_id,story_id,story_character_id,effective_page_number,change_kind,outfit_snapshot,appearance_override,change_description)
  select v_buyer,v_story_id,(v_character_map->>scs.story_character_id::text)::uuid,scs.effective_page_number,scs.change_kind,scs.outfit_snapshot,scs.appearance_override,scs.change_description
  from public.story_character_states scs where scs.story_id=v_source.id and v_character_map ? scs.story_character_id::text;

  insert into public.marketplace_personalized_editions(request_id,community_story_id,source_story_id,personalized_story_id,buyer_user_id,buyer_character_id,source_character_id,source_author_user_id,qualifying_purchase_id,requires_active_purchase,source_author_name,source_title,status,estimated_image_units,confirmed_at)
  values(p_request_id,v_share.id,v_source.id,v_story_id,v_buyer,p_buyer_character_id,v_setting.story_character_id,v_share.user_id,v_purchase_id,v_share.marketplace_enabled,v_author_name,v_source.title,'generating',v_page_count,now())
  returning * into v_existing;
  return jsonb_build_object('edition_id',v_existing.id,'story_id',v_story_id,'estimated_image_units',v_page_count,'status','generating');
end; $$;

create or replace function public.complete_marketplace_personalized_edition(p_story_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_count integer; v_cover text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.can_access_owned_story(v_user,p_story_id) or not exists(select 1 from public.marketplace_personalized_editions mpe where mpe.personalized_story_id=p_story_id and mpe.buyer_user_id=v_user)
    then raise exception 'EDITION_NOT_FOUND'; end if;
  select count(*),min(sp.image_path) into v_count,v_cover from public.story_pages sp where sp.story_id=p_story_id and sp.user_id=v_user and sp.image_path is not null;
  if v_count <> (select s.page_count from public.stories s where s.id=p_story_id and s.user_id=v_user) then raise exception 'EDITION_INCOMPLETE'; end if;
  update public.stories set status='ready',cover_image_path=(select image_path from public.story_pages where story_id=p_story_id order by page_number limit 1) where id=p_story_id and user_id=v_user;
  update public.marketplace_personalized_editions set status='ready' where personalized_story_id=p_story_id and buyer_user_id=v_user;
end; $$;

create or replace function public.get_personalized_editions()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('edition_id',mpe.id,'story_id',s.id,'title',s.title,'art_style',s.art_style,'page_count',s.page_count,'cover_image_path',s.cover_image_path,'status',mpe.status,'created_at',mpe.created_at,'attribution',mpe.source_author_name) order by mpe.created_at desc),'[]'::jsonb)
  from public.marketplace_personalized_editions mpe join public.stories s on s.id=mpe.personalized_story_id
  where mpe.buyer_user_id=auth.uid() and public.can_access_owned_story(auth.uid(),mpe.personalized_story_id);
$$;

-- A legitimate repurchase restores preserved editions by relinking them to the
-- new active entitlement. Refunds/chargebacks remain authoritative immediately.
create or replace function public.record_marketplace_purchase(p_checkout_session_id text,p_payment_intent_id text,p_charge_id text,p_buyer_user_id uuid,p_listing_id uuid,p_amount_cents integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_share public.community_stories; v_purchase uuid;
begin
  if auth.role()<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into v_share from public.community_stories where id=p_listing_id and status='published' and marketplace_enabled=true for update;
  if not found or v_share.user_id=p_buyer_user_id or p_amount_cents<>v_share.price_cents or lower(p_currency)<>v_share.currency then raise exception 'PURCHASE_INVALID'; end if;
  insert into public.marketplace_purchases(community_story_id,story_id,buyer_user_id,author_user_id,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id,gross_amount_cents,currency)
  values(v_share.id,v_share.story_id,p_buyer_user_id,v_share.user_id,p_checkout_session_id,p_payment_intent_id,p_charge_id,p_amount_cents,lower(p_currency))
  on conflict(stripe_checkout_session_id) do update set stripe_charge_id=coalesce(public.marketplace_purchases.stripe_charge_id,excluded.stripe_charge_id) returning id into v_purchase;
  insert into public.marketplace_author_earnings(purchase_id,author_user_id,amount_cents,currency) values(v_purchase,v_share.user_id,v_share.author_earnings_cents,v_share.currency) on conflict(purchase_id) do nothing;
  update public.marketplace_personalized_editions set qualifying_purchase_id=v_purchase
    where community_story_id=v_share.id and buyer_user_id=p_buyer_user_id and requires_active_purchase;
  return v_purchase;
end; $$;

create or replace function public.get_author_marketplace_dashboard()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'profile',(select to_jsonb(ap)-'user_id' from public.author_profiles ap where ap.user_id=auth.uid()),
    'listings',coalesce((select jsonb_agg(jsonb_build_object(
      'story_id',cs.story_id,'slug',cs.public_slug,'title',s.title,'status',cs.status,'enabled',cs.marketplace_sales_enabled,'is_paid',cs.marketplace_enabled,'price_cents',cs.price_cents,'description',cs.marketplace_description,'preview_page_count',cs.preview_page_count,'author_earnings_cents',cs.author_earnings_cents,
      'personalization',(select jsonb_build_object('enabled',mps.enabled,'story_character_id',mps.story_character_id,'allow_name',mps.allow_name,'allow_appearance',mps.allow_appearance,'allow_clothing',mps.allow_clothing) from public.marketplace_personalization_settings mps where mps.community_story_id=cs.id),
      'characters',coalesce((select jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'role',sc.role) order by sc.display_order) from public.story_characters sc where sc.story_id=cs.story_id),'[]'::jsonb)
    )) from public.community_stories cs join public.stories s on s.id=cs.story_id where cs.user_id=auth.uid()),'[]'::jsonb),
    'sales',coalesce((select count(*) from public.marketplace_purchases mp where mp.author_user_id=auth.uid() and mp.status='active'),0),
    'pending_earnings_cents',coalesce((select sum(me.amount_cents) from public.marketplace_author_earnings me where me.author_user_id=auth.uid() and me.status in ('pending','available')),0)
  );
$$;

revoke all on function public.configure_marketplace_personalization(uuid,boolean,uuid,boolean,boolean,boolean), public.create_marketplace_personalized_edition(text,uuid,uuid,boolean), public.complete_marketplace_personalized_edition(uuid), public.get_personalized_editions(), public.record_marketplace_purchase(text,text,text,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.configure_marketplace_personalization(uuid,boolean,uuid,boolean,boolean,boolean), public.create_marketplace_personalized_edition(text,uuid,uuid,boolean), public.complete_marketplace_personalized_edition(uuid), public.get_personalized_editions() to authenticated;
grant execute on function public.record_marketplace_purchase(text,text,text,uuid,uuid,integer,text) to service_role;

comment on table public.marketplace_personalization_settings is 'Author-controlled opt-in and safe customization scope. Existing listings have no row and therefore default to off.';
comment on table public.marketplace_personalized_editions is 'Private buyer-owned copies. Paid editions remain preserved but inaccessible unless their linked marketplace purchase is active.';
