import { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import * as billing from '@/services/billing';

const date = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';
export default function Billing() {
  const [summary, setSummary] = useState(null); const [loading, setLoading] = useState(true); const [opening, setOpening] = useState(false); const [error, setError] = useState('');
  useEffect(() => { billing.getEntitlements().then(setSummary).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function manage() { setOpening(true); setError(''); try { const result = await billing.createPortalSession(); window.location.assign(result.url); } catch (e) { setError(e.message); setOpening(false); } }
  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-stone-400" /></div>;
  return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="font-display text-3xl font-semibold">Billing & usage</h1><p className="mt-2 text-stone-500">Your limits come from verified subscription and usage records.</p></div>
    {summary && <section className="rounded-3xl border border-stone-200 bg-white p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-stone-400">Current plan</p><h2 className="font-display text-2xl font-semibold">{summary.display_name}</h2><p className="mt-1 text-sm capitalize text-stone-500">{summary.status}{summary.cancel_at_period_end ? ' · Cancels at period end' : ''}</p></div><CreditCard className="h-7 w-7 text-stone-400" /></div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2"><Usage label="Story units remaining" remaining={summary.story_units_remaining} limit={summary.story_units_limit} /><Usage label="Image generations remaining" remaining={summary.image_units_remaining} limit={summary.image_units_limit} /></div>
      <p className="mt-5 text-sm text-stone-500">Usage period: {date(summary.period_start)} – {date(summary.period_end)}</p>
      <div className="mt-6 flex flex-wrap gap-3">{summary.can_manage_billing && <Button onClick={manage} disabled={opening} className="rounded-full">{opening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Manage subscription</Button>}<Button asChild variant="outline" className="rounded-full"><Link to="/pricing">View plans</Link></Button></div>
    </section>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
function Usage({ label, remaining, limit }) { const used = Math.max(0, limit - remaining); return <div className="rounded-2xl bg-stone-50 p-4"><p className="text-sm text-stone-500">{label}</p><p className="mt-1 text-2xl font-semibold">{remaining}<span className="text-sm font-normal text-stone-400"> / {limit}</span></p><p className="mt-1 text-xs text-stone-400">{used} used · {remaining} remaining</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-stone-900" style={{ width: `${limit ? Math.min(100, used / limit * 100) : 100}%` }} /></div></div>; }
