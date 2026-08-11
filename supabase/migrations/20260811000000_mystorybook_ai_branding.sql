-- Public product rename only. Plan keys, Stripe mappings, quotas, and entitlement behavior are unchanged.
update public.billing_plans
set display_name = case plan_key
  when 'free' then 'MyStorybook AI Free'
  when 'family' then 'MyStorybook AI Family'
  when 'creator' then 'MyStorybook AI Creator'
  else display_name
end
where plan_key in ('free', 'family', 'creator');
