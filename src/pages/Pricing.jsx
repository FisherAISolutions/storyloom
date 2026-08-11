import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as billing from '@/services/billing';
import { useAuth } from '@/lib/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';

export default function Pricing() {
  const { isAuthenticated, authChecked } = useAuth();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState([]); const [current, setCurrent] = useState(null); const [loading, setLoading] = useState(true); const [starting, setStarting] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    if (!authChecked) return;
    const requests = isAuthenticated ? Promise.all([billing.getPlans(), billing.getEntitlements()]) : Promise.all([billing.getPlans(), Promise.resolve(null)]);
    requests.then(([available, summary]) => { setPlans(available); setCurrent(summary); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [authChecked, isAuthenticated]);
  async function choose(planKey) {
    if (planKey === 'free' || planKey === current?.plan_key) return;
    setStarting(planKey); setError(''); try { const result = current?.plan_key !== 'free' ? await billing.createPortalSession() : await billing.createCheckout(planKey); window.location.assign(result.url); } catch (e) { setError(e.message); setStarting(''); }
  }
  if (loading || !authChecked) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-stone-400" /></div>;
  return <div className="mx-auto max-w-5xl">
    <div className="text-center"><h1 className="font-display text-4xl font-semibold">Choose your MyStorybook AI plan</h1><p className="mt-3 text-stone-500">Every plan has clear generation limits. You can review usage before creating more.</p></div>
    <div className="mt-10 grid gap-5 md:grid-cols-3">{plans.map((plan) => <section key={plan.plan_key} className={`rounded-3xl border bg-white p-6 ${current?.plan_key === plan.plan_key ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}>
      <h2 className="font-display text-2xl font-semibold">{plan.display_name}</h2><p className="mt-2 text-xl font-medium">{plan.monthly_price_display}</p>
      <ul className="mt-5 space-y-3 text-sm text-stone-600"><li className="flex gap-2"><Check className="h-4 w-4 shrink-0" /> {plan.story_units_limit} story {plan.story_units_limit === 1 ? 'unit' : 'units'} each month <span className="sr-only">Larger stories use more units.</span></li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0" /> {plan.image_units_limit} image generations each month</li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0" /> Up to {plan.max_story_pages} pages per story</li><li className="flex gap-2"><Check className="h-4 w-4 shrink-0" /> Editing, translations, and PDF download</li></ul>
      {!isAuthenticated ? <Button asChild className="mt-7 w-full rounded-full"><Link to="/register?returnTo=%2Fpricing">{plan.plan_key === 'free' ? 'Start free' : `Choose ${plan.display_name}`}</Link></Button> : <Button className="mt-7 w-full rounded-full" variant={current?.plan_key === plan.plan_key ? 'outline' : 'default'} disabled={plan.plan_key === 'free' || current?.plan_key === plan.plan_key || Boolean(starting)} onClick={() => choose(plan.plan_key)}>{starting === plan.plan_key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{current?.plan_key === plan.plan_key ? 'Current plan' : plan.plan_key === 'free' ? 'Included' : current?.plan_key !== 'free' ? 'Manage plan' : 'Subscribe'}</Button>}
    </section>)}</div>
    <p className="mt-6 text-center text-sm text-stone-500">A 6-page story uses 1 story unit; longer stories use more. Each new illustration, character portrait, repaint, or custom cover uses 1 image generation.</p>{params.get('checkout') === 'cancelled' && <p role="status" className="mt-4 text-center text-sm text-stone-600">Checkout was canceled. Your plan was not changed.</p>}{error && <p role="alert" className="mt-4 text-center text-sm text-red-600">{error}</p>}
  </div>;
}
