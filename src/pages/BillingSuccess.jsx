import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getEntitlements } from '@/services/billing';

export default function BillingSuccess() {
  const [summary, setSummary] = useState(null);
  useEffect(() => { let active = true; let attempts = 0; const refresh = async () => { try { const value = await getEntitlements(); if (!active) return; setSummary(value); if (value.plan_key === 'unpaid' && attempts++ < 5) window.setTimeout(refresh, 1500); } catch { if (active && attempts++ < 5) window.setTimeout(refresh, 1500); } }; void refresh(); return () => { active = false; }; }, []);
  const ready = summary?.plan_key && summary.plan_key !== 'unpaid';
  return <div className="mx-auto max-w-xl rounded-3xl border border-stone-200 bg-white p-8 text-center"><h1 className="font-display text-3xl font-semibold">{ready ? 'Subscription ready' : 'Updating subscription…'}</h1><p className="mt-3 text-stone-500">{ready ? `Your ${summary.display_name} limits are now active.` : 'Stripe is confirming your subscription. This page uses the verified webhook result, not the checkout redirect.'}</p>{!ready && <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-stone-400" />}<Button asChild className="mt-7 rounded-full"><Link to={ready ? '/billing' : '/'}>{ready ? 'View billing' : 'Return home'}</Link></Button></div>;
}
