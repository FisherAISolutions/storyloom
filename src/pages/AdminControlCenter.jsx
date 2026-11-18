import { useEffect, useState } from 'react';
import { Loader2, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as admin from '@/services/admin';

const ROLES = ['owner', 'user', 'tester', 'support', 'moderator', 'admin'];
const money = (value) => value == null ? 'Unavailable' : `$${Number(value).toFixed(2)}`;

export default function AdminControlCenter() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState(null);

  async function load(term = search) {
    setBusy(true); setError('');
    try { const [controlCenter, imageProviders] = await Promise.all([admin.getControlCenter(term), admin.getImageProviders()]); setData(controlCenter); setProviders(imageProviders); }
    catch (caught) { setError(caught?.message || 'The Admin Control Center could not be loaded.'); }
    setBusy(false);
  }
  useEffect(() => { void load(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function changeRole(row, role) {
    const reason = window.prompt(`Reason for changing ${row.email || 'this user'} to ${role}:`);
    if (!reason) return;
    setBusy(true); setError('');
    try { await admin.setUserRole(row.id, role, reason); await load(); }
    catch (caught) { setError(caught?.message || 'The role could not be changed.'); setBusy(false); }
  }

  async function addCredits(row) {
    const story = Number(window.prompt('Complimentary story units:', '1'));
    const images = Number(window.prompt('Complimentary image units:', '5'));
    const reason = window.prompt('Reason for this grant:');
    if (!reason || !Number.isInteger(story) || !Number.isInteger(images)) return;
    const expires = new Date(); expires.setMonth(expires.getMonth() + 1);
    setBusy(true); setError('');
    try { await admin.grantCredits(row.id, story, images, expires.toISOString(), reason); await load(); }
    catch (caught) { setError(caught?.message || 'Credits could not be granted.'); setBusy(false); }
  }

  async function configureTesting(row, enabled) {
    if (!enabled) {
      const reason = window.prompt('Reason for disabling staff AI testing:');
      if (!reason) return;
      setBusy(true); setError('');
      try { await admin.setTestLimit(row.id, false, row.test_limit_cents || 0, reason); await load(); }
      catch (caught) { setError(caught?.message || 'The testing limit could not be changed.'); setBusy(false); }
      return;
    }
    const dollars = Number(window.prompt('Monthly staff testing limit in dollars:', String((row.test_limit_cents || 0) / 100)));
    const reason = window.prompt('Reason for this testing limit:');
    if (!reason || !Number.isFinite(dollars) || dollars < 0) return;
    setBusy(true); setError('');
    try { await admin.setTestLimit(row.id, true, Math.round(dollars * 100), reason); await load(); }
    catch (caught) { setError(caught?.message || 'The testing limit could not be changed.'); setBusy(false); }
  }

  async function revokeCredits(grant) {
    const reason = window.prompt('Reason for revoking this complimentary credit grant:');
    if (!reason) return;
    setBusy(true); setError('');
    try { await admin.revokeCredits(grant.id, reason); await load(); }
    catch (caught) { setError(caught?.message || 'Credits could not be revoked.'); setBusy(false); }
  }

  async function saveProvider(setting) {
    const reason = window.prompt('Reason for changing image-provider configuration:');
    if (!reason) return;
    setBusy(true); setError('');
    try { await admin.updateImageProvider(setting, reason); await load(); }
    catch (caught) { setError(caught?.message || 'The image-provider configuration could not be saved.'); setBusy(false); }
  }

  function patchProvider(key, changes) {
    setProviders((current) => ({ ...current, settings: current.settings.map((setting) => setting.provider_key === key ? { ...setting, ...changes } : setting) }));
  }

  if (!data && busy) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  const overview = data?.overview || {};
  return <div className="space-y-8">
    <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#087f7c]">Secure operations</p><h1 className="mt-1 font-display text-4xl font-semibold">Admin Control Center</h1><p className="mt-2 text-stone-500">Server-authorized user, credit, testing, and operational controls.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[['Users', overview.total_users ?? '—'], ['Active subscriptions', overview.active_subscriptions ?? '—'], ['AI generations · 30d', overview.ai_generations_30d ?? '—'], ['Generation errors · 30d', overview.ai_failures_30d ?? '—'], ['Estimated AI cost · 30d', money(overview.estimated_ai_cost_30d)], ['Estimated monthly revenue', overview.estimated_monthly_revenue_cents == null ? 'Unavailable' : money(overview.estimated_monthly_revenue_cents / 100)]].map(([label, value]) => <div key={label} className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}
    </section>
    <section className="rounded-3xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl font-semibold">User management</h2><p className="text-sm text-stone-500">Email, role, billing state, complimentary balances, and staff testing controls.</p></div><form onSubmit={(event) => { event.preventDefault(); void load(search); }} className="flex gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email" className="w-64" /><Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button></form></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-stone-500"><th className="p-2">Account</th><th className="p-2">Role</th><th className="p-2">Billing</th><th className="p-2">Complimentary</th><th className="p-2">Testing</th><th className="p-2">Actions</th></tr></thead><tbody>{(data?.users || []).map((row) => <tr key={row.id} className="border-b align-top"><td className="p-2"><div>{row.email || 'No email'}</div><div className="text-xs text-stone-400">{row.id}</div></td><td className="p-2"><select value={row.role} disabled={busy || row.role === 'owner' || (data.actor_role !== 'owner' && row.role === 'admin')} onChange={(event) => void changeRole(row, event.target.value)} className="rounded border p-1">{ROLES.map((role) => <option key={role}>{role}</option>)}</select></td><td className="p-2">{row.plan_key || 'none'}<div className="text-xs text-stone-400">{row.subscription_status || 'unsubscribed'}</div></td><td className="p-2">{row.promo_story_units} story · {row.promo_image_units} image</td><td className="p-2">{row.test_enabled ? `$${(row.test_limit_cents / 100).toFixed(2)}/mo` : 'Disabled'}</td><td className="p-2"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void addCredits(row)} disabled={busy}>Grant credits</Button>{['owner', 'admin', 'tester'].includes(row.role) && <><Button size="sm" variant="outline" onClick={() => void configureTesting(row, true)} disabled={busy}>Test limit</Button>{row.test_enabled && <Button size="sm" variant="outline" onClick={() => void configureTesting(row, false)} disabled={busy}>Disable testing</Button>}</>}</div></td></tr>)}</tbody></table></div>
    </section>
    <section className="rounded-3xl border bg-white p-5"><h2 className="font-display text-2xl font-semibold">Active complimentary credit grants</h2><div className="mt-4 space-y-2">{(data?.credit_grants || []).map((grant) => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3 text-sm"><span>{grant.email || grant.user_id}: {grant.remaining_story_units} story · {grant.remaining_image_units} image, expires {new Date(grant.expires_at).toLocaleDateString()}</span><Button size="sm" variant="outline" onClick={() => void revokeCredits(grant)} disabled={busy}>Revoke</Button></div>)}</div></section>
    <section className="rounded-3xl border bg-white p-5">
      <h2 className="font-display text-2xl font-semibold">Image Providers</h2><p className="mt-1 text-sm text-stone-500">Server-side routing, free allowances, paid fallback, and safety caps. Credentials remain in Supabase secrets.</p>
      <div className="mt-4 space-y-3">{(providers?.settings || []).map((setting) => <div key={setting.provider_key} className="grid gap-3 rounded-xl bg-stone-50 p-4 text-sm md:grid-cols-7 md:items-end">
        <div><div className="font-semibold capitalize">{setting.provider_key}</div><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={setting.enabled} disabled={setting.provider_key === 'policy'} onChange={(event) => patchProvider(setting.provider_key, { enabled: event.target.checked })} />Enabled</label></div>
        {setting.provider_key === 'policy' ? <label>Mode<select className="mt-1 w-full rounded border p-2" value={setting.selection_mode} onChange={(event) => patchProvider(setting.provider_key, { selection_mode: event.target.value })}><option value="openai_only">OpenAI Only</option><option value="free_first">Free First</option><option value="manual">Manual Provider</option></select></label> : <label>Model<input className="mt-1 w-full rounded border p-2" value={setting.model_key || ''} onChange={(event) => patchProvider(setting.provider_key, { model_key: event.target.value })} /></label>}
        <label>Priority<input type="number" className="mt-1 w-full rounded border p-2" value={setting.priority} onChange={(event) => patchProvider(setting.provider_key, { priority: Number(event.target.value) })} /></label>
        <label>Daily requests<input type="number" className="mt-1 w-full rounded border p-2" value={setting.daily_request_limit ?? ''} onChange={(event) => patchProvider(setting.provider_key, { daily_request_limit: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label>Daily spend ($)<input type="number" step="0.01" className="mt-1 w-full rounded border p-2" value={setting.daily_spend_limit_usd ?? ''} onChange={(event) => patchProvider(setting.provider_key, { daily_spend_limit_usd: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <label>Daily neurons<input type="number" className="mt-1 w-full rounded border p-2" value={setting.daily_neuron_limit ?? ''} onChange={(event) => patchProvider(setting.provider_key, { daily_neuron_limit: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <div><label className="flex items-center gap-2"><input type="checkbox" checked={setting.allow_paid_fallback} onChange={(event) => patchProvider(setting.provider_key, { allow_paid_fallback: event.target.checked })} />Paid fallback</label><Button className="mt-2" size="sm" variant="outline" disabled={busy || data?.actor_role !== 'owner'} onClick={() => void saveProvider(setting)}>Save</Button></div>
      </div>)}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-2"><div><h3 className="font-semibold">Usage · last 7 days</h3>{(providers?.daily_usage || []).map((row) => <p key={`${row.provider_key}-${row.usage_date}`} className="mt-1 text-sm text-stone-600">{row.usage_date} · {row.provider_key}: {row.success_count}/{row.request_count} succeeded · {money(row.estimated_cost_usd)}</p>)}</div><div><h3 className="font-semibold">Recent provider events</h3>{(providers?.recent_events || []).slice(0, 8).map((event) => <p key={event.id} className="mt-1 text-sm text-stone-600">{event.provider_key} · {event.model_key} · {event.outcome}{event.failure_reason ? ` (${event.failure_reason})` : ''}</p>)}</div></div>
    </section>
    <section className="rounded-3xl border bg-white p-5"><h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><ShieldCheck className="h-5 w-5" />Administrative activity</h2><div className="mt-4 space-y-2">{(data?.audit || []).map((entry) => <div key={entry.id} className="rounded-xl bg-stone-50 p-3 text-sm"><span className="font-medium">{entry.action}</span><span className="ml-2 text-stone-500">{new Date(entry.created_at).toLocaleString()}</span></div>)}</div></section>
  </div>;
}
