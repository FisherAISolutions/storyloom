import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Gauge, Maximize2, Minimize2, Pause, Play, RotateCcw, Square, Users, Volume2, VolumeX } from 'lucide-react';
import PrivateImage from '@/components/PrivateImage';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { STORAGE_BUCKETS } from '@/services/storage';
import { cn } from '@/lib/utils';

const sentenceParts = (text) => String(text || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part)=>part.trim()).filter(Boolean) || [];

function ReaderImage({ url, path, alt, className }) {
  if (url) return <img src={url} alt={alt} className={className}/>;
  if (path) return <PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={path} alt={alt} fittingType="fill" className={className} fallback={<div className="flex h-full items-center justify-center bg-stone-100"><BookOpen className="h-10 w-10 text-stone-300"/></div>}/>;
  return <div className="flex h-full items-center justify-center bg-stone-100"><BookOpen className="h-10 w-10 text-stone-300"/></div>;
}

export default function InteractiveStorybookReader({ title, pages, coverUrl, coverPath, readerKey, accessLabel = 'Storybook', onClose }) {
  const isMobile=useIsMobile(); const rootRef=useRef(null); const touchStart=useRef(null); const utteranceRef=useRef(null); const openingTimer=useRef(null);
  const currentRef=useRef(-1); const narratingRef=useRef(false); const speedRef=useRef(1);
  const [current,setCurrentState]=useState(-1); const [direction,setDirection]=useState('next'); const [mode,setMode]=useState('together');
  const [narrating,setNarrating]=useState(false); const [paused,setPaused]=useState(false); const [speed,setSpeed]=useState(1); const [activeSentence,setActiveSentence]=useState(-1);
  const [fullscreen,setFullscreen]=useState(false); const [resumeMessage,setResumeMessage]=useState(''); const [opening,setOpening]=useState(false);
  const speechAvailable=typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
  const storageKey=`mystorybook-reader:${readerKey}`;
  const pageCount=pages.length;
  const spreadStart=current<0?-1:(isMobile?current:Math.floor(current/2)*2);
  const shownIndices=current<0?[]:(isMobile?[current]:[spreadStart,spreadStart+1]).filter((index)=>pages[index]);
  const progress=current<0?0:Math.min(100,Math.round(((current+1)/Math.max(pageCount,1))*100));

  const setCurrent=useCallback((next, announce=true)=>{
    const bounded=Math.max(-1,Math.min(next,pageCount-1)); currentRef.current=bounded; setCurrentState(bounded);
    if(readerKey&&bounded>=0){try{localStorage.setItem(storageKey,JSON.stringify({page:bounded,updatedAt:Date.now()}));}catch{/* Reading still works if storage is unavailable. */}}
    if(announce)setActiveSentence(-1);
  },[pageCount,readerKey,storageKey]);

  useEffect(()=>{
    if(!readerKey||!pageCount)return;
    try{const saved=JSON.parse(localStorage.getItem(storageKey));if(Number.isInteger(saved?.page)&&saved.page>=0&&saved.page<pageCount){setCurrent(saved.page,false);setResumeMessage(`Resumed at page ${saved.page+1}.`);}}
    catch{/* Ignore unavailable or malformed local progress. */}
  },[pageCount,readerKey,setCurrent,storageKey]);

  const stopNarration=useCallback(()=>{
    narratingRef.current=false; setNarrating(false); setPaused(false); setActiveSentence(-1); utteranceRef.current=null;
    if(speechAvailable)window.speechSynthesis.cancel();
  },[speechAvailable]);

  const openBook=useCallback(()=>{
    if(openingTimer.current)return;setOpening(true);const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    openingTimer.current=window.setTimeout(()=>{openingTimer.current=null;setOpening(false);setDirection('next');setCurrent(0);},reduced?0:520);
  },[setCurrent]);

  const speakSentence=useCallback(function speak(pageIndex,sentenceIndex){
    if(!speechAvailable||!narratingRef.current||!pages[pageIndex])return;
    const parts=sentenceParts(pages[pageIndex].text);
    if(!parts.length){const next=pageIndex+1;if(next<pageCount){setDirection('next');setCurrent(next,false);speak(next,0);}else stopNarration();return;}
    const index=Math.min(sentenceIndex,parts.length-1); setActiveSentence(index);
    const utterance=new window.SpeechSynthesisUtterance(parts[index]);utterance.rate=speedRef.current;utteranceRef.current=utterance;
    utterance.onend=()=>{if(!narratingRef.current)return;if(index+1<parts.length){speak(pageIndex,index+1);return;}const next=pageIndex+1;if(next<pageCount){setDirection('next');setCurrent(next,false);window.setTimeout(()=>speak(next,0),180);}else stopNarration();};
    utterance.onerror=(event)=>{if(event.error!=='canceled'&&event.error!=='interrupted')stopNarration();};
    window.speechSynthesis.speak(utterance);
  },[pageCount,pages,setCurrent,speechAvailable,stopNarration]);

  const startNarration=useCallback(()=>{
    if(!speechAvailable||!pageCount)return;window.speechSynthesis.cancel();const start=currentRef.current<0?0:currentRef.current;
    setMode('narrate');setCurrent(start,false);narratingRef.current=true;setNarrating(true);setPaused(false);speakSentence(start,0);
  },[pageCount,setCurrent,speakSentence,speechAvailable]);

  const previous=useCallback(()=>{stopNarration();setDirection('previous');if(currentRef.current<0)return;const step=isMobile?1:2;const start=isMobile?currentRef.current:Math.floor(currentRef.current/2)*2;setCurrent(start-step);},[isMobile,setCurrent,stopNarration]);
  const next=useCallback(()=>{stopNarration();setDirection('next');if(currentRef.current<0){openBook();return;}const step=isMobile?1:2;const start=isMobile?currentRef.current:Math.floor(currentRef.current/2)*2;if(start+step<pageCount)setCurrent(start+step);},[isMobile,openBook,pageCount,setCurrent,stopNarration]);
  const chooseTogether=()=>{stopNarration();setMode('together');};
  const togglePause=()=>{if(!speechAvailable||!narrating)return;if(paused){window.speechSynthesis.resume();setPaused(false);}else{window.speechSynthesis.pause();setPaused(true);}};
  const changeSpeed=(value)=>{const nextSpeed=Number(value);speedRef.current=nextSpeed;setSpeed(nextSpeed);if(narrating){window.speechSynthesis.cancel();setPaused(false);speakSentence(currentRef.current,Math.max(activeSentence,0));}};
  const toggleFullscreen=async()=>{try{if(!document.fullscreenElement)await rootRef.current?.requestFullscreen();else await document.exitFullscreen();}catch{/* Keep the in-page reader usable when fullscreen is blocked. */}};

  useEffect(()=>{const changed=()=>setFullscreen(document.fullscreenElement===rootRef.current);document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  useEffect(()=>()=>{window.clearTimeout(openingTimer.current);if(speechAvailable)window.speechSynthesis.cancel();},[speechAvailable]);

  const onKeyDown=(event)=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
    if(event.key==='ArrowLeft'){event.preventDefault();previous();}else if(event.key==='ArrowRight'){event.preventDefault();next();}else if(event.key===' '&&event.target.tagName!=='BUTTON'){event.preventDefault();narrating?togglePause():next();}else if(event.key==='Escape'&&onClose&&!document.fullscreenElement)onClose();
  };
  const finishSwipe=(clientX)=>{if(touchStart.current===null)return;const distance=clientX-touchStart.current;if(Math.abs(distance)>45)(distance>0?previous:next)();touchStart.current=null;};
  const atEnd=current>=0&&(isMobile?current>=pageCount-1:Math.floor(current/2)*2+2>=pageCount);

  return <section ref={rootRef} className={cn('interactive-reader outline-none',fullscreen&&'interactive-reader-fullscreen')} tabIndex={0} onKeyDown={onKeyDown} onTouchStart={(event)=>{touchStart.current=event.touches[0].clientX;}} onTouchEnd={(event)=>finishSwipe(event.changedTouches[0].clientX)} aria-label={`Interactive reader for ${title}`}>
    <div className="interactive-reader-toolbar">
      <div className="min-w-0"><p className="truncate font-display text-lg font-semibold text-[#12304b]">{title}</p><p className="text-xs text-stone-500">{accessLabel} · {pageCount} {pageCount===1?'page':'pages'}</p></div>
      <div className="flex flex-wrap items-center justify-end gap-2"><Button type="button" size="sm" variant={mode==='together'?'default':'outline'} className="rounded-full" onClick={chooseTogether}><Users className="mr-1.5 h-4 w-4"/>Read Together</Button><Button type="button" size="sm" variant={mode==='narrate'?'default':'outline'} className="rounded-full" onClick={startNarration} disabled={!speechAvailable}><Volume2 className="mr-1.5 h-4 w-4"/>Read to Me</Button><Button type="button" size="icon" variant="outline" className="rounded-full" onClick={toggleFullscreen} aria-label={fullscreen?'Exit bedtime fullscreen':'Enter fullscreen bedtime mode'}>{fullscreen?<Minimize2/>:<Maximize2/>}</Button>{onClose&&<Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onClose}>Close</Button>}</div>
    </div>
    {!speechAvailable&&<div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900" role="status"><VolumeX className="h-4 w-4"/>Read to Me is unavailable in this browser. Manual reading remains fully available.</div>}
    <div className="interactive-reader-progress" aria-label={`Reading progress ${progress}%`}><span style={{width:`${progress}%`}}/></div>
    <p className="sr-only" aria-live="polite">{resumeMessage}</p>

    <div className="interactive-reader-stage">
      {current<0?<button type="button" className={cn('reader-hardcover reader-book-opening',opening&&'reader-book-opening-active')} onClick={next} disabled={opening} aria-label={`Open ${title}`}><span className="reader-hardcover-edge"/><ReaderImage url={coverUrl} path={coverPath} alt={`Cover of ${title}`} className="h-full w-full object-cover"/><span className="reader-cover-invitation">{opening?'Opening…':'Open book'}</span></button>:
      <div key={`${spreadStart}-${direction}`} className={cn('reader-spread',isMobile?'reader-single-page':'reader-two-page',direction==='previous'?'reader-flip-previous':'reader-flip-next')}>
        {!isMobile&&<span className="reader-gutter"/>}
        {shownIndices.map((index)=><article key={pages[index].id||pages[index].page_number||index} className={cn('reader-page',index===current&&narrating&&'reader-page-narrating')} aria-label={`Page ${index+1}`}>
          <ReaderImage url={pages[index].image_url} path={pages[index].image_path} alt={`Illustration for page ${index+1} of ${title}`} className="h-full w-full object-cover"/>
          <div className="reader-page-copy">{index===current&&narrating?sentenceParts(pages[index].text).map((sentence,sentenceIndex)=><span key={`${sentenceIndex}-${sentence}`} className={cn(sentenceIndex===activeSentence&&'reader-sentence-active')}>{sentence}{' '}</span>):pages[index].text}<span className="reader-page-number">{index+1}</span></div>
        </article>)}
      </div>}
      <Button type="button" size="icon" variant="outline" className="reader-nav reader-nav-previous" onClick={previous} disabled={current<0} aria-label="Previous page"><ChevronLeft/></Button><Button type="button" size="icon" variant="outline" className="reader-nav reader-nav-next" onClick={next} disabled={atEnd} aria-label={current<0?'Open book':'Next page'}><ChevronRight/></Button>
    </div>

    <div className="interactive-reader-controls"><div className="flex items-center gap-2"><Button type="button" size="icon" variant="outline" className="rounded-full" onClick={previous} disabled={current<0} aria-label="Previous page"><ChevronLeft/></Button><span className="min-w-32 text-center text-sm font-semibold text-stone-700">{current<0?'Cover':isMobile?`Page ${current+1} of ${pageCount}`:`Pages ${spreadStart+1}${shownIndices.length>1?`–${spreadStart+2}`:''} of ${pageCount}`}</span><Button type="button" size="icon" variant="outline" className="rounded-full" onClick={next} disabled={atEnd} aria-label="Next page"><ChevronRight/></Button></div>
      {mode==='narrate'&&speechAvailable&&<div className="flex flex-wrap items-center justify-center gap-2"><Button type="button" size="sm" variant="outline" className="rounded-full" onClick={narrating?togglePause:startNarration}>{narrating?(paused?<Play className="mr-1.5 h-4 w-4"/>:<Pause className="mr-1.5 h-4 w-4"/>):<Play className="mr-1.5 h-4 w-4"/>}{narrating?(paused?'Resume':'Pause'):'Start'}</Button><Button type="button" size="sm" variant="outline" className="rounded-full" onClick={stopNarration} disabled={!narrating}><Square className="mr-1.5 h-3.5 w-3.5"/>Stop</Button><label className="flex items-center gap-2 text-xs font-semibold text-stone-600"><Gauge className="h-4 w-4"/><span>Speed</span><select value={speed} onChange={(event)=>changeSpeed(event.target.value)} className="rounded-full border bg-white px-3 py-1.5" aria-label="Narration speed"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label></div>}
      {current>=0&&<button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-[#087f7c]" onClick={()=>{stopNarration();setDirection('previous');setCurrent(-1);}}><RotateCcw className="h-3.5 w-3.5"/>Return to cover</button>}
    </div>
  </section>;
}
