-- Ensure character deletion aggregates each surviving JSON array value rather
-- than a set-returning-function row wrapper. Kept as a forward migration
-- because the Phase 2 foundation may already have been applied elsewhere.

create or replace function public.remove_deleted_secondary_character_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.stories s
  set secondary_characters = (
    select coalesce(jsonb_agg(element), '[]'::jsonb)
    from jsonb_array_elements(s.secondary_characters) as elements(element)
    where element ->> 'character_id' is distinct from old.id::text
  )
  where s.user_id = old.user_id
    and s.secondary_characters @> jsonb_build_array(
      jsonb_build_object('character_id', old.id::text)
    );

  return old;
end;
$$;
