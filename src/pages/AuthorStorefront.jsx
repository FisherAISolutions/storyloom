import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, Loader2, PenLine, Sparkles } from 'lucide-react';
import CommunityStoryCard from '@/components/CommunityStoryCard';
import FeaturedBooksCarousel from '@/components/FeaturedBooksCarousel';
import * as marketplace from '@/services/marketplace';

export default function AuthorStorefront(){
  const {slug}=useParams();const [author,setAuthor]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{marketplace.getAuthor(slug).then(setAuthor).catch((e)=>setError(e.message));},[slug]);
  const featured=useMemo(()=>author?.books?.filter((book)=>book.featured)||[],[author]);
  if(error)return <div className="py-24 text-center">{error}</div>;if(!author)return <Loader2 className="mx-auto mt-24 h-8 w-8 animate-spin"/>;
  const initials=author.display_name.split(/\s+/).map((part)=>part[0]).join('').slice(0,2).toUpperCase();
  const paidCount=author.books.filter((book)=>book.is_paid).length;
  return <div className="space-y-12">
    <Link to="/community" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-[#087f7c]"><ChevronLeft className="h-4 w-4"/>Community Shelf</Link>
    <header className="relative overflow-hidden rounded-[2.5rem] border border-stone-200 bg-[linear-gradient(135deg,#fff8eb_0%,#f4fbfa_100%)] px-6 py-10 shadow-[0_30px_80px_-55px_rgba(49,31,17,.8)] md:px-12 md:py-14">
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#ef9d87]/20 blur-3xl"/>
      <div className="relative flex flex-col items-center gap-7 text-center md:flex-row md:text-left"><div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white bg-[#087f7c] font-display text-4xl font-semibold text-white shadow-xl">{initials}</div><div><p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[.22em] text-[#ed6a5e] md:justify-start"><PenLine className="h-4 w-4"/>MyStorybook AI author</p><h1 className="mt-2 font-display text-4xl font-semibold text-[#12304b] md:text-6xl">{author.display_name}</h1>{author.biography?<p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">{author.biography}</p>:<p className="mt-4 text-stone-500">Stories and imaginative worlds shared with the MyStorybook AI community.</p>}<div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start"><span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#12304b] shadow-sm"><BookOpen className="mr-1.5 inline h-4 w-4"/>{author.books.length} {author.books.length===1?'book':'books'}</span>{paidCount>0&&<span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#12304b] shadow-sm">{paidCount} digital {paidCount===1?'edition':'editions'}</span>}</div></div></div>
    </header>
    {featured.length>0&&<FeaturedBooksCarousel books={featured} title={`Featured by ${author.display_name}`}/>}
    <section className="space-y-6" aria-labelledby="author-catalog-heading"><div className="flex items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-[#087f7c]"><Sparkles className="h-4 w-4"/>Author catalog</p><h2 id="author-catalog-heading" className="mt-2 font-display text-3xl font-semibold text-[#12304b] md:text-4xl">Books by {author.display_name}</h2></div></div>{author.books.length?<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{author.books.map((book)=><CommunityStoryCard key={book.slug} story={{...book,attribution:`By ${author.display_name}`,author_slug:author.slug}}/>)}</div>:<div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center"><BookOpen className="mx-auto h-9 w-9 text-stone-300"/><h3 className="mt-3 font-display text-2xl font-semibold text-[#12304b]">No public books yet</h3></div>}</section>
  </div>;
}
