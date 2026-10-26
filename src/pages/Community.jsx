import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import CommunityStoryCard from '@/components/CommunityStoryCard';
import { Button } from '@/components/ui/button';
import * as community from '@/services/community';

export default function Community() {
  const [stories,setStories]=useState([]); const [loading,setLoading]=useState(true); const [offset,setOffset]=useState(0); const [more,setMore]=useState(false);
  async function load(next=0){ setLoading(true); try { const rows=await community.listPublished(12,next); setStories(next ? [...stories,...rows] : rows); setOffset(next+rows.length); setMore(rows.length===12); } catch { setStories(next ? stories : []); setMore(false); } finally { setLoading(false); } }
  useEffect(()=>{ void load(); },[]);
  return <div className="space-y-10"><header className="text-center"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#ed6a5e]">Community Stories</p><h1 className="mt-2 font-display text-4xl font-semibold text-[#12304b] md:text-5xl">Adventures shared by our community</h1><p className="mx-auto mt-3 max-w-2xl text-stone-600">Discover magical stories families have chosen to share with MyStorybook AI.</p></header>{loading&&!stories.length?<Loader2 className="mx-auto h-7 w-7 animate-spin"/>:stories.length?<><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{stories.map(s=><CommunityStoryCard key={s.slug} story={s}/>)}</div>{more&&<Button onClick={()=>load(offset)} disabled={loading} variant="outline" className="mx-auto flex rounded-full">Load more</Button>}</>:<div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-10 text-center"><h2 className="font-display text-2xl font-semibold">Be one of the first to share an adventure.</h2><Button asChild className="mt-5 rounded-full"><Link to="/create">Create a Storybook</Link></Button></div>}</div>;
}
