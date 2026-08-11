import { Mail, CreditCard, KeyRound, ShieldQuestion } from 'lucide-react';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim();

export default function Support() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="text-center"><h1 className="font-display text-4xl font-semibold tracking-tight">Support</h1><p className="mt-3 text-stone-500">Help with accounts, stories, privacy, and subscriptions.</p></header>
      <div className="grid gap-5 md:grid-cols-3">
        {[{ icon: KeyRound, title: 'Account access', text: 'Use Forgot password on the login page for a secure reset link.' }, { icon: CreditCard, title: 'Subscriptions', text: 'Open Billing to review usage, manage your plan, or cancel through Stripe.' }, { icon: ShieldQuestion, title: 'Privacy requests', text: 'Contact support for account, access, correction, or deletion requests.' }].map(({ icon: Icon, title, text }) => <section key={title} className="rounded-2xl border border-stone-200 bg-white p-6"><Icon className="h-5 w-5 text-stone-500" /><h2 className="mt-4 font-display text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-500">{text}</p></section>)}
      </div>
      <section className="rounded-3xl border border-stone-200 bg-white p-7 text-center">
        <Mail className="mx-auto h-7 w-7 text-stone-400" />
        <h2 className="mt-3 font-display text-2xl font-semibold">Contact MyStorybook AI</h2>
        {supportEmail ? <p className="mt-3 text-stone-600">Email <a className="font-medium text-stone-900 underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>. Include a short description of the problem, but never send your password or payment-card details.</p> : <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">The support email has not been published yet. The product owner must set <code>VITE_SUPPORT_EMAIL</code> before launch.</p>}
      </section>
    </div>
  );
}
