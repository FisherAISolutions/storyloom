-- Provisional Stripe TEST-mode Price identifiers for Phase 10B verification.
-- These identifiers are non-secret and must be replaced before any live launch.
update public.billing_plans
set stripe_price_id = 'price_1U2LvcHEiMUagmivI9mPEREH'
where plan_key = 'family';

update public.billing_plans
set stripe_price_id = 'price_1U2LvdHEiMUagmivD6tjJMkF'
where plan_key = 'creator';
