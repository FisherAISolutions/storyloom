import { useEffect, useState } from 'react';
import { BookOpen, ImageOff, Loader2 } from 'lucide-react';
import PrivateImage from '@/components/PrivateImage';
import { STORAGE_BUCKETS } from '@/services/storage';
import { getPageAnimation } from '@/lib/storyMedia';
import { cn } from '@/lib/utils';

function MediaFallback({ failed=false }) {
  return <div className="reader-media-fallback" role="status">{failed?<ImageOff className="h-9 w-9"/>:<Loader2 className="h-8 w-8 animate-spin"/>}<span>{failed?'Illustration unavailable':'Loading illustration…'}</span></div>;
}

function StaticPageImage({ page, alt, className }) {
  const [loaded,setLoaded]=useState(false);const [failed,setFailed]=useState(false);
  useEffect(()=>{setLoaded(false);setFailed(false);},[page.image_url,page.image_path]);
  if(page.image_url)return <div className="relative h-full w-full">{!loaded&&!failed&&<MediaFallback/>}{failed?<MediaFallback failed/>:<img src={page.image_url} alt={alt} className={className} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>}</div>;
  if(page.image_path)return <PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={page.image_path} alt={alt} fittingType="fill" className={className} fallback={<MediaFallback/>}/>;
  return <div className="reader-media-fallback"><BookOpen className="h-9 w-9"/><span>No illustration available</span></div>;
}

export default function StoryPageMedia({ page, alt, className, reducedMotion=false }) {
  const animation=getPageAnimation(page);const [animationFailed,setAnimationFailed]=useState(false);const [animationReady,setAnimationReady]=useState(false);
  useEffect(()=>{setAnimationFailed(false);setAnimationReady(false);},[animation.videoUrl]);
  if(animation.videoUrl&&!animationFailed&&!reducedMotion)return <div className="relative h-full w-full">{!animationReady&&<StaticPageImage page={page} alt={alt} className={className}/>}<video src={animation.videoUrl} poster={animation.posterUrl||undefined} className={cn('absolute inset-0',className)} muted loop autoPlay playsInline preload="metadata" aria-label={`${alt}, animated`} onLoadedData={()=>setAnimationReady(true)} onError={()=>setAnimationFailed(true)}/></div>;
  return <StaticPageImage page={page} alt={alt} className={className}/>;
}
