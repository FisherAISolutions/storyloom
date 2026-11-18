import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as affiliates from '@/services/affiliates';

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

export default function AffiliateDashboard() {
  const [data,setData]=useState(undefined); const [name,setName]=useState(''); const [error,setError]=useState('');
  async function load(){ try{setData(await affiliates.getDashboard());}catch(caught){setError(caught?.message || 'Affiliate dashboard unavailable.');} }
  useEffect(()=>{void load();},[]);
  async function enroll(event){event.preventDefault();setError('');try{await affiliates.enroll(name);await load();}catch(caught){setError(caught?.message || 'Enrollment failed.');}}
  if(data===undefined&&!error)return <div className="flex justify-center py-24">Loading…</div>;
  if(!data)return <div className="mx-auto max-w-xl rounded-3xl border bg-white p-7"><h1 className="font-display text-3xl font-semibold">Become an affiliate</h1><p className="mt-2 text-stone-600">Apply for a referral link. Applications require Owner approval before tracking begins.</p>{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}<form onSubmit={enroll} className="mt-5 flex gap-2"><Input value={name} onChange={(event)=>setName(event.target.value)} placeholder="Public display name" required maxLength={80}/><Button type="submit">Apply</Button></form></div>;
  const account=data.account; const link=`${window.location.origin}/r/${account.referral_code}`;
  return <div className="space-y-6"><header><h1 className="font-display text-4xl font-semibold">Affiliate Dashboard</h1><p className="mt-2 text-stone-600">Status: <span className="font-medium capitalize">{account.status}</span> · {(account.commission_bps/100).toFixed(2)}% commission</p></header><section className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">Your referral link</p><Input readOnly value={link} className="mt-2"/></section><section className="grid gap-3 sm:grid-cols-4">{[['Clicks',data.clicks],['Signups',data.signups],['Conversions',data.conversions],['Pending earnings',money(data.pending_earnings_cents)]].map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-5"><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-display text-2xl font-semibold">Commissions</h2><div className="mt-3 space-y-2">{(data.commissions||[]).map((entry)=><div key={entry.id} className="flex justify-between rounded-xl bg-stone-50 p-3 text-sm"><span>{new Date(entry.earned_at).toLocaleDateString()} · {entry.status}</span><span>{money(entry.commission_amount_cents-entry.reversed_amount_cents)}</span></div>)}</div></section></div>;
}
