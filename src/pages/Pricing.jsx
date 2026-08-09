import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as billing from '@/services/billing';

export default function Pricing() {
  const [plans, setPlans] = useState([]); const [current, setCurrent] = useState(null); const [loading, setLoading] = useState(true); const [starting, setStarting] = useState(''); const [error, setError] = useState('');
  useEffect(() => { Promise.all([billing.getPlans(), billing.getEntitlements()]).then(([available, summary]) => { setPlans(available); setCurrent(summary); }).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function choose(planKey) {
    if (planKey === 'free' || planKey === current?.plan_key) return;
    setStarting(planKey); setError(''); try { const result = current?.plan_key !== 'free' ? await billing.createPortalSession() : await billing.createCheckout(planKey); window.location.assign(result.url); } catch (e) { setError(e.message); setStarting(''); }
  }
  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-stone-400" /></div>;
  return <div className="mx-auto max-w-5xl">
    <div className="text-center"><h1 className="font-display text-4xl font-semibold">Choose your Story Loom plan</h1><p className="mt-3 text-stone-500">Every plan has clear generation limits. You can review usage before creating more.</p></div>
    <div className="mt-10 grid gap-5 md:grid-cols-3">{plans.map((plan) => <section key={plan.plan_key} className={`rounded-3xl border bg-white p-6 ${current?.plan_key === plan.plan_key ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200'}`}>
      <h2 className="font-display text-2xl font-semibold">{plan.display_name}</h2><p className="mt-2 text-xl font-medium">{plan.monthly_price_display}</p>
      <ul className="mt-5 space-y-3 text-sm text-stone-600"><li className="flex gap-2"><Check className="h-4 w-4" /> {plan.story_units_limit} weighted story units</li><li className="flex gap-2"><Check className="h-4 w-4" /> {plan.image_units_limit} image generations</li><li className="flex gap-2"><Check className="h-4 w-4" /> Up to {plan.max_story_pages} pages per story</li></ul>
      <Button className="mt-7 w-full rounded-full" variant={current?.plan_key === plan.plan_key ? 'outline' : 'default'} disabled={plan.plan_key === 'free' || current?.plan_key === plan.plan_key || Boolean(starting)} onClick={() => choose(plan.plan_key)}>{starting === plan.plan_key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{current?.plan_key === plan.plan_key ? 'Current plan' : plan.plan_key === 'free' ? 'Included' : current?.plan_key !== 'free' ? 'Manage plan' : 'Subscribe'}</Button>
    </section>)}</div>
    <p className="mt-6 text-center text-xs text-stone-400">Initial limits are provisional and will be calibrated using real Story Loom AI costs.</p>{error && <p role="alert" className="mt-4 text-center text-sm text-red-600">{error}</p>}
  </div>;
}
