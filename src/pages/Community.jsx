import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import CommunityStoryCard from '@/components/CommunityStoryCard';
import FeaturedBooksCarousel from '@/components/FeaturedBooksCarousel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as community from '@/services/community';

const normalize = (value) => String(value || '').trim().toLowerCase();

export default function Community() {
  const [stories,setStories]=useState([]); const [loading,setLoading]=useState(true); const [offset,setOffset]=useState(0); const [more,setMore]=useState(false);
  const [query,setQuery]=useState(''); const [access,setAccess]=useState('all'); const [style,setStyle]=useState('all');
  async function load(next=0){ setLoading(true); try { const rows=await community.listPublished(12,next); setStories((current)=>next ? [...current,...rows] : rows); setOffset(next+rows.length); setMore(rows.length===12); } catch { if(!next)setStories([]); setMore(false); } finally { setLoading(false); } }
  useEffect(()=>{ void load(); },[]);
  const featured=useMemo(()=>stories.filter((story)=>story.featured),[stories]);
  const carouselBooks=featured.length?featured:stories.slice(0,7);
  const styles=useMemo(()=>[...new Set(stories.map((story)=>story.art_style).filter(Boolean))].sort(),[stories]);
  const filtered=useMemo(()=>stories.filter((story)=>{
    const haystack=normalize([story.title,story.attribution,story.description,story.theme,story.art_style].join(' '));
    return (!normalize(query)||haystack.includes(normalize(query)))&&(access==='all'||(access==='paid')===Boolean(story.is_paid))&&(style==='all'||story.art_style===style);
  }),[stories,query,access,style]);
  const hasFilters=Boolean(query)||access!=='all'||style!=='all';

  return <div className="space-y-12">
    <header className="relative overflow-hidden rounded-[2.5rem] border border-stone-200 bg-[#fffaf1] px-6 py-12 text-center shadow-[0_25px_80px_-55px_rgba(52,35,18,.7)] md:px-12">
      <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[#8fd3ce]/25 blur-3xl"/><div className="pointer-events-none absolute -bottom-20 -right-12 h-56 w-56 rounded-full bg-[#f6b49f]/30 blur-3xl"/>
      <p className="relative text-xs font-semibold uppercase tracking-[.24em] text-[#ed6a5e]">Community Shelf Marketplace</p><h1 className="relative mx-auto mt-3 max-w-4xl font-display text-4xl font-semibold leading-tight text-[#12304b] md:text-6xl">Open a book. Step into someone’s imagination.</h1><p className="relative mx-auto mt-4 max-w-2xl text-stone-600">Read free community adventures, preview books from independent creators, and keep purchased stories in your library.</p>
      <div className="relative mx-auto mt-7 flex max-w-xl flex-col gap-3 sm:flex-row sm:justify-center"><Button asChild className="rounded-full bg-[#087f7c] px-6 hover:bg-[#066a68]"><a href="#browse-books"><BookOpen className="mr-2 h-4 w-4"/>Browse the shelf</a></Button><Button asChild variant="outline" className="rounded-full bg-white/80"><Link to="/author/dashboard">Share your stories</Link></Button></div>
    </header>

    {carouselBooks.length>0&&<FeaturedBooksCarousel books={carouselBooks} title={featured.length?'Featured adventures':'New on the shelf'}/>}

    <section id="browse-books" className="scroll-mt-24 space-y-6" aria-labelledby="browse-heading">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#087f7c]">Explore the collection</p><h2 id="browse-heading" className="mt-2 font-display text-3xl font-semibold text-[#12304b] md:text-4xl">Find your next story</h2><p className="mt-2 text-sm text-stone-500">Search the books currently available on the Community Shelf.</p></div><p className="text-sm font-medium text-stone-500">{filtered.length} {filtered.length===1?'book':'books'} shown</p></div>
      <div className="grid gap-3 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto] md:items-center">
        <label className="relative"><span className="sr-only">Search books and authors</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"/><Input value={query} onChange={(event)=>setQuery(event.target.value)} className="rounded-full pl-10" placeholder="Search by title, author, theme, or style…"/></label>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-600"><SlidersHorizontal className="h-4 w-4"/><span className="sr-only md:not-sr-only">Access</span><select value={access} onChange={(event)=>setAccess(event.target.value)} className="rounded-full border border-stone-200 bg-white px-4 py-2"><option value="all">All books</option><option value="free">Free to read</option><option value="paid">Paid books</option></select></label>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-600"><span className="sr-only md:not-sr-only">Art style</span><select value={style} onChange={(event)=>setStyle(event.target.value)} className="rounded-full border border-stone-200 bg-white px-4 py-2"><option value="all">Every art style</option>{styles.map((value)=><option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      {loading&&!stories.length?<Loader2 className="mx-auto h-7 w-7 animate-spin" aria-label="Loading community books"/>:filtered.length?<><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((story)=><CommunityStoryCard key={story.slug} story={story}/>)}</div>{more&&!hasFilters&&<Button onClick={()=>load(offset)} disabled={loading} variant="outline" className="mx-auto flex rounded-full">{loading?'Loading…':'Load more books'}</Button>}</>:stories.length?<div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center"><h3 className="font-display text-2xl font-semibold text-[#12304b]">No books match those filters</h3><p className="mt-2 text-stone-500">Try another title, author, access type, or art style.</p><Button type="button" variant="outline" className="mt-5 rounded-full" onClick={()=>{setQuery('');setAccess('all');setStyle('all');}}>Clear filters</Button></div>:<div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-10 text-center"><h2 className="font-display text-2xl font-semibold">Be one of the first to share an adventure.</h2><Button asChild className="mt-5 rounded-full"><Link to="/create">Create a Storybook</Link></Button></div>}
    </section>
  </div>;
}
