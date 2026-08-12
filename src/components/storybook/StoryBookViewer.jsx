import { useEffect, useRef } from 'react';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import PrivateImage from '@/components/PrivateImage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STORAGE_BUCKETS } from '@/services/storage';

function PageArtwork({ path, alt }) {
  const fallback = <div className="flex h-full items-center justify-center bg-gradient-to-br from-amber-50 to-stone-100"><BookOpen className="h-10 w-10 text-stone-300" /></div>;
  return path ? <PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={path} alt={alt} fittingType="fill" className="h-full w-full" fallback={fallback} /> : fallback;
}

function BookPage({ page, index, text, selected, side, onSelect, regenerating }) {
  if (!page) {
    return <div className={cn('hidden bg-[#fffdf3] md:block', side === 'left' ? 'rounded-l-2xl' : 'rounded-r-2xl')} aria-hidden="true" />;
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      aria-label={`Select page ${index + 1} for editing`}
      aria-pressed={selected}
      className={cn(
        'storybook-page group relative min-w-0 overflow-hidden bg-[#fffdf3] text-left focus-visible:z-20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/70',
        side === 'left' ? 'rounded-2xl md:rounded-r-sm' : 'rounded-2xl md:rounded-l-sm',
        selected && 'storybook-page-selected'
      )}
    >
      <PageArtwork path={page.image_path} alt={`Illustration for page ${index + 1}`} />
      <div className="storybook-page-text absolute inset-x-5 bottom-5 rounded-xl border border-white/70 bg-[#fffaf0]/95 px-4 py-3 font-display text-sm font-semibold leading-relaxed text-[#102a43] shadow-xl backdrop-blur-[4px] sm:inset-x-8 sm:bottom-7 sm:text-base lg:text-lg">
        {text}
      </div>
      <span className="absolute top-4 rounded-full bg-[#fffaf0]/85 px-2.5 py-1 text-[11px] font-semibold text-stone-600 shadow-sm backdrop-blur-sm data-[side=left]:left-4 data-[side=right]:right-4" data-side={side}>Page {index + 1}</span>
      {regenerating && selected && <div className="absolute inset-0 flex items-center justify-center bg-white/65 text-sm font-semibold text-stone-700 backdrop-blur-sm"><span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700" /><span className="ml-2">Painting…</span></div>}
    </button>
  );
}

function Cover({ story }) {
  return (
    <div className="mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-r-3xl rounded-l-lg border-[10px] border-[#79512e] bg-[#fffdf3] shadow-[18px_24px_45px_-20px_rgba(48,30,17,0.75)]">
      <div className="relative h-full">
        <PageArtwork path={story.cover_image_path} alt={`Cover of ${story.title}`} />
        <div className="absolute inset-x-6 top-8 rounded-2xl bg-[#fffaf0]/88 px-5 py-4 text-center shadow-xl backdrop-blur-sm">
          <p className="font-display text-2xl font-semibold text-[#12304b] sm:text-3xl">{story.title}</p>
        </div>
      </div>
    </div>
  );
}

export default function StoryBookViewer({ story, pages, current, coverActive, isMobile, direction, displayTextFor, regenerating, onSelect, onPrevious, onNext }) {
  const touchStart = useRef(null);
  const spreadStart = Math.floor(current / 2) * 2;
  const atStart = coverActive;
  const atEnd = !coverActive && (isMobile ? current >= pages.length - 1 : spreadStart + 2 >= pages.length);
  const counter = coverActive ? 'Cover' : isMobile ? `Page ${current + 1} of ${pages.length}` : `Pages ${spreadStart + 1}${pages[spreadStart + 1] ? `–${spreadStart + 2}` : ''} of ${pages.length}`;

  useEffect(() => {
    const handleKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
      if (event.key === 'ArrowLeft') onPrevious();
      if (event.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onNext, onPrevious]);

  return (
    <section aria-label="Storybook viewer" className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" className="rounded-full bg-white" onClick={onPrevious} disabled={atStart} aria-label="Previous page or spread"><ChevronLeft className="h-5 w-5" /></Button>
        <p className="min-w-36 text-center text-sm font-semibold text-[#12304b]" aria-live="polite">{counter}</p>
        <Button variant="outline" size="icon" className="rounded-full bg-white" onClick={onNext} disabled={atEnd} aria-label="Next page or spread"><ChevronRight className="h-5 w-5" /></Button>
      </div>

      <div
        className={cn('storybook-turn mx-auto', direction === 'next' ? 'storybook-turn-next' : direction === 'previous' ? 'storybook-turn-previous' : '')}
        key={`${coverActive ? 'cover' : spreadStart}-${isMobile ? current : 'spread'}`}
        onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          if (touchStart.current == null) return;
          const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
          touchStart.current = null;
          if (Math.abs(distance) < 50) return;
          if (distance < 0) onNext(); else onPrevious();
        }}
      >
        {coverActive ? <Cover story={story} /> : (
          <>
            <div className="storybook-spread hidden aspect-[1.55/1] grid-cols-2 rounded-3xl bg-[#79512e] p-2 md:grid lg:p-3">
              <BookPage page={pages[spreadStart]} index={spreadStart} text={displayTextFor(spreadStart)} selected={current === spreadStart} side="left" onSelect={onSelect} regenerating={regenerating} />
              <BookPage page={pages[spreadStart + 1]} index={spreadStart + 1} text={displayTextFor(spreadStart + 1)} selected={current === spreadStart + 1} side="right" onSelect={onSelect} regenerating={regenerating} />
              <div className="storybook-gutter" aria-hidden="true" />
            </div>
            <div className="storybook-mobile-page mx-auto aspect-[3/4] w-full max-w-xl rounded-2xl bg-[#79512e] p-2 shadow-2xl md:hidden">
              <BookPage page={pages[current]} index={current} text={displayTextFor(current)} selected side="right" onSelect={onSelect} regenerating={regenerating} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
