-- Forward-only correction for staging environments where 20260821000000 was
-- applied before remote PostgreSQL lint exposed the composite assignment.
create or replace function public.configure_marketplace_listing(p_story_id uuid,p_enabled boolean,p_price_cents integer default null,p_description text default null,p_preview_page_count integer default 2)
returns public.community_stories language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_share public.community_stories; v_pages integer; v_earnings integer; v_has_sales boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select cs.* into v_share from public.community_stories cs where cs.story_id=p_story_id and cs.user_id=v_user for update;
  if not found then raise exception 'STORY_NOT_PUBLISHED'; end if;
  select s.page_count into v_pages from public.stories s where s.id=v_share.story_id and s.user_id=v_user;
  if v_share.status <> 'published' then raise exception 'STORY_NOT_PUBLISHED'; end if;
  if p_enabled then
    if v_pages < 4 then raise exception 'STORY_NOT_ELIGIBLE'; end if;
    if not exists(select 1 from public.author_profiles ap where ap.user_id=v_user) then raise exception 'AUTHOR_PROFILE_REQUIRED'; end if;
    if p_price_cents is null or p_price_cents not between 699 and 5000 then raise exception 'PRICE_INVALID'; end if;
    select least(p_price_cents,ms.default_author_earnings_cents) into v_earnings from public.marketplace_settings ms where ms.id=true;
  else
    select exists(select 1 from public.marketplace_purchases mp where mp.community_story_id=v_share.id and mp.status='active') into v_has_sales;
  end if;
  perform set_config('app.marketplace_config','allowed',true);
  update public.community_stories set marketplace_enabled=case when p_enabled then true when v_has_sales then true else false end,marketplace_sales_enabled=p_enabled,marketplace_description=case when p_enabled then nullif(trim(p_description),'') when v_has_sales then marketplace_description else null end,price_cents=case when p_enabled then p_price_cents when v_has_sales then price_cents else null end,preview_page_count=case when p_enabled then p_preview_page_count when v_has_sales then preview_page_count else 2 end,author_earnings_cents=case when p_enabled then v_earnings when v_has_sales then author_earnings_cents else null end where id=v_share.id returning * into v_share;
  return v_share;
end; $$;

revoke all on function public.configure_marketplace_listing(uuid,boolean,integer,text,integer) from public,anon,authenticated;
grant execute on function public.configure_marketplace_listing(uuid,boolean,integer,text,integer) to authenticated;
