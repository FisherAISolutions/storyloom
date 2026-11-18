import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import CommunityStoryCard from '@/components/CommunityStoryCard';
import * as marketplace from '@/services/marketplace';

export default function AuthorStorefront(){const {slug}=useParams();const [author,setAuthor]=useState(null);const [error,setError]=useState('');useEffect(()=>{marketplace.getAuthor(slug).then(setAuthor).catch((e)=>setError(e.message));},[slug]);if(error)return <div className="py-24 text-center">{error}</div>;if(!author)return <Loader2 className="mx-auto mt-24 h-8 w-8 animate-spin"/>;return <div className="space-y-10"><header className="mx-auto max-w-2xl text-center"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#ed6a5e]">Author storefront</p><h1 className="mt-2 font-display text-4xl font-semibold text-[#12304b]">{author.display_name}</h1>{author.biography&&<p className="mt-3 text-stone-600">{author.biography}</p>}</header><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{author.books.map((book)=><CommunityStoryCard key={book.slug} story={{...book,attribution:`By ${author.display_name}`,author_slug:author.slug}}/>)}</div></div>}
