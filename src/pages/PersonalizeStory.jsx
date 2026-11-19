import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as community from '@/services/community';
import * as characters from '@/services/characters';
import * as marketplace from '@/services/marketplace';
import * as storyPages from '@/services/storyPages';
import * as storyStudio from '@/lib/storyStudio';

export default function PersonalizeStory(){
  const {slug}=useParams();const navigate=useNavigate();const requestId=useRef(crypto.randomUUID());
  const [book,setBook]=useState(null);const [saved,setSaved]=useState([]);const [characterId,setCharacterId]=useState('');
  const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');
  useEffect(()=>{Promise.all([community.getPublished(slug),characters.list()]).then(([nextBook,nextCharacters])=>{setBook(nextBook);setSaved(nextCharacters);setCharacterId(nextCharacters[0]?.id||'');}).catch((e)=>setError(e.message));},[slug]);
  async function create(){
    if(!confirmed||!characterId)return;setBusy(true);setError('');
    try{
      const edition=await marketplace.createPersonalizedEdition(slug,characterId,requestId.current);
      const pages=await storyPages.listByStory(edition.story_id);let completed=pages.filter((page)=>page.image_path).length;
      for(const page of pages){if(page.image_path)continue;setProgress(`Creating illustration ${completed+1} of ${pages.length}…`);const imagePath=await storyStudio.generatePageImage({storyId:edition.story_id,pageNumber:page.page_number});await storyPages.update(page.id,{image_path:imagePath});completed+=1;}
      await marketplace.completePersonalizedEdition(edition.story_id);setProgress('Your private edition is ready.');navigate(`/story/${edition.story_id}/read`);
    }catch(e){setError(e.message);setBusy(false);}
  }
  if(error&&!book)return <div className="py-20 text-center" role="alert">{error}</div>;
  if(!book)return <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin"/>;
  const offer=book.personalization;
  if(!offer)return <div className="mx-auto max-w-2xl py-20 text-center"><h1 className="font-display text-3xl font-semibold">Personalization is not available</h1><Link className="mt-4 inline-block underline" to={`/community/${slug}`}>Return to the book</Link></div>;
  if(book.is_paid&&!book.has_full_access)return <div className="mx-auto max-w-2xl py-20 text-center"><h1 className="font-display text-3xl font-semibold">Purchase required</h1><p className="mt-3 text-stone-600">Buy this book before creating a personalized edition.</p><Link className="mt-4 inline-block underline" to={`/community/${slug}`}>Return to the book</Link></div>;
  return <div className="mx-auto max-w-3xl space-y-6 py-8"><header><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#087f7c]">Private personalized edition</p><h1 className="mt-2 font-display text-4xl font-semibold">Make {book.title} your own</h1><p className="mt-3 text-stone-600">The author allows {offer.character_name} to be replaced using one of your saved Character Bibles. The original book and author attribution stay unchanged.</p></header>
    <section className="rounded-3xl border bg-white p-6"><h2 className="font-display text-2xl font-semibold">Choose your character</h2>{saved.length?<select className="mt-4 w-full rounded-xl border p-3" value={characterId} onChange={(e)=>setCharacterId(e.target.value)} disabled={busy}>{saved.map((character)=><option key={character.id} value={character.id}>{character.name} · {character.species}</option>)}</select>:<p className="mt-3 text-sm text-stone-600">Create a saved character first, including the appearance and clothing you want used.</p>}<div className="mt-4 flex flex-wrap gap-2 text-xs">{offer.allow_name&&<span className="rounded-full bg-teal-50 px-3 py-1">Name</span>}{offer.allow_appearance&&<span className="rounded-full bg-teal-50 px-3 py-1">Appearance</span>}{offer.allow_clothing&&<span className="rounded-full bg-teal-50 px-3 py-1">Clothing</span>}</div></section>
    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><AlertTriangle className="mt-1 h-5 w-5 text-amber-700"/><div><h2 className="font-semibold">Generation estimate</h2><p className="mt-1 text-sm leading-6 text-stone-700">This edition needs up to <strong>{offer.estimated_image_units} image-generation credits</strong>. It uses your current plan credits and limits. No separate personalization price is assumed, and generation stops if your available entitlement is exhausted.</p></div></div><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={(e)=>setConfirmed(e.target.checked)} disabled={busy}/><span>I approve using up to {offer.estimated_image_units} image-generation credits to create a separate private copy.</span></label></section>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} Your private draft is preserved; retrying resumes missing pages without regenerating completed ones.</p>}{progress&&<p className="flex items-center gap-2 text-sm text-stone-600">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}{progress}</p>}
    <div className="flex gap-3"><Button disabled={busy||!confirmed||!characterId} onClick={()=>void create()}><Sparkles className="mr-2 h-4 w-4"/>{busy?'Creating your edition…':'Create private edition'}</Button>{!saved.length&&<Button variant="outline" asChild><Link to="/characters">Create a character</Link></Button>}</div>
  </div>;
}
