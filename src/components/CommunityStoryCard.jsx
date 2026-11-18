import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export default function CommunityStoryCard({ story }) {
  return <Link to={`/community/${story.slug}`} className="group overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className="aspect-[4/3] overflow-hidden bg-stone-100">{story.cover_url ? <img src={story.cover_url} alt={`Cover of ${story.title}`} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center"><BookOpen className="h-8 w-8 text-stone-300" /></div>}</div>
    <div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-display text-xl font-semibold text-[#12304b]">{story.title}</h3>{story.is_paid&&<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">${(story.price_cents/100).toFixed(2)}</span>}</div><p className="mt-2 text-xs text-stone-500">{story.page_count} pages{story.art_style ? ` · ${story.art_style}` : ''}</p><p className="mt-3 text-sm text-stone-600">{story.attribution}</p></div>
  </Link>;
}
