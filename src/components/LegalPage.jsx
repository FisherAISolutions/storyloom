export default function LegalPage({ title, updated = 'August 9, 2026', children }) {
  return (
    <article className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-10">
      <header className="border-b border-stone-100 pb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: {updated}</p>
      </header>
      <div className="mt-7 space-y-7 text-sm leading-7 text-stone-600 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-stone-900 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
