import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Pencil } from 'lucide-react';
import InteractiveStorybookReader from '@/components/storybook/InteractiveStorybookReader';
import { Button } from '@/components/ui/button';
import * as storiesService from '@/services/stories';
import * as storyPagesService from '@/services/storyPages';

export default function StoryReader(){
  const {id}=useParams();const [story,setStory]=useState(null);const [pages,setPages]=useState(null);const [error,setError]=useState('');
  useEffect(()=>{let active=true;(async()=>{try{const [nextStory,nextPages]=await Promise.all([storiesService.get(id),storyPagesService.listByStory(id)]);if(active){setStory(nextStory);setPages(nextPages);}}catch(loadError){if(active)setError(loadError?.message||'This story could not be opened.');}})();return()=>{active=false;};},[id]);
  if(error)return <div className="py-24 text-center"><p className="text-stone-600">{error}</p><Link to="/library" className="mt-4 inline-block text-sm font-semibold underline">Return to your library</Link></div>;
  if(!story||!pages)return <Loader2 className="mx-auto mt-24 h-8 w-8 animate-spin text-stone-400"/>;
  return <div className="mx-auto max-w-[1500px] space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><Link to="/library" className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-[#087f7c]"><ChevronLeft className="h-4 w-4"/>Your library</Link><Button asChild variant="outline" size="sm" className="rounded-full"><Link to={`/story/${story.id}`}><Pencil className="mr-1.5 h-4 w-4"/>Edit this book</Link></Button></header>{pages.length?<InteractiveStorybookReader title={story.title} pages={pages} coverPath={story.cover_image_path} readerKey={`owned:${story.id}`} accessLabel="Your completed book"/>:<div className="rounded-3xl border border-dashed p-12 text-center text-stone-500">This book does not have readable pages yet.</div>}</div>;
}
