-- Never imply zero AI cost or full margin while current provider prices are incomplete.

alter function public.get_admin_ai_economics(text) rename to get_admin_ai_economics_base;

create or replace function public.get_admin_ai_economics(p_range text default '30d')
returns jsonb language plpgsql security definer set search_path='' stable as $$
declare result jsonb; prices_complete boolean; guarded_plans jsonb;
begin
  result:=public.get_admin_ai_economics_base(p_range);
  select
    exists(select 1 from public.ai_provider_pricing where model='gpt-5.6-sol' and input_usd_per_million is not null and output_usd_per_million is not null)
    and exists(select 1 from public.ai_provider_pricing where model='gpt-image-2' and image_size='1024x1024' and image_quality='medium' and image_usd_per_unit is not null)
  into prices_complete;
  if prices_complete then return result; end if;
  select coalesce(jsonb_agg(plan || jsonb_build_object(
    'estimated_max_ai_cost_usd',null,
    'ai_gross_margin_estimate_usd',null,
    'ai_gross_margin_estimate_pct',null
  )),'[]'::jsonb) into guarded_plans
  from jsonb_array_elements(result->'plans') plan;
  return jsonb_set(result,'{plans}',guarded_plans);
end;
$$;

revoke all on function public.get_admin_ai_economics_base(text) from public,anon,authenticated;
revoke all on function public.get_admin_ai_economics(text) from public,anon,authenticated;
grant execute on function public.get_admin_ai_economics(text) to authenticated;
