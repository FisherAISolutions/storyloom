import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

const PLAN_NAMES = Object.freeze({
  free: 'MyStorybook AI Starter',
  unpaid: 'No active plan',
  family: 'MyStorybook AI Family',
  creator: 'MyStorybook AI Creator',
});

function withPublicPlanName(plan) {
  return plan && PLAN_NAMES[plan.plan_key] ? { ...plan, display_name: PLAN_NAMES[plan.plan_key] } : plan;
}

async function invoke(functionName, body = {}) {
  const { data, error } = await getSupabaseClient().functions.invoke(functionName, { body });
  if (error) {
    let details; try { details = await error.context?.json(); } catch {}
    throw new ServiceError(details?.error?.code || 'BILLING_ERROR', details?.error?.message || 'The billing request could not be completed.');
  }
  if (!data?.data) throw new ServiceError('BILLING_ERROR', 'The billing service returned an invalid response.');
  return data.data;
}

export async function getPlans() {
  const { data, error } = await getSupabaseClient().rpc('get_public_billing_plans');
  if (error) throw new ServiceError('BILLING_ERROR', 'Plans could not be loaded.');
  return (data || []).map(withPublicPlanName);
}

export async function getEntitlements() {
  const { data, error } = await getSupabaseClient().rpc('get_billing_summary');
  if (error) throw new ServiceError('BILLING_ERROR', 'Billing usage could not be loaded.');
  return withPublicPlanName(data);
}

export const getSubscription = getEntitlements;
export const getUsage = getEntitlements;
export const createCheckout = (planKey) => invoke('billing-checkout', { plan_key: planKey });
export const createPortalSession = () => invoke('billing-portal');
