import { BookOpen } from 'lucide-react';
import PrivateImage from '@/components/PrivateImage';
import { cn } from '@/lib/utils';
import { STORAGE_BUCKETS } from '@/services/storage';

export default function StoryThumbnailStrip({ story, pages, current, coverActive, onCover, onSelect }) {
  const nearby = pages.map((page, index) => ({ page, index })).filter(({ index }) => Math.abs(index - current) <= 3);
  const fallback = <div className="flex h-full items-center justify-center bg-stone-100"><BookOpen className="h-4 w-4 text-stone-300" /></div>;
  return (
    <nav aria-label="Story pages" className="flex gap-2 overflow-x-auto rounded-2xl border border-stone-200 bg-white/75 p-3 shadow-sm">
      <button type="button" onClick={onCover} aria-current={coverActive ? 'page' : undefined} className={cn('w-20 shrink-0 rounded-xl border p-1.5 text-xs transition', coverActive ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-stone-200 hover:border-stone-400')}>
        <div className="aspect-[4/3] overflow-hidden rounded-lg"><PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={story.cover_image_path} alt="Story cover thumbnail" fittingType="fill" className="h-full w-full" fallback={fallback} /></div>
        <span className="mt-1 block">Cover</span>
      </button>
      {nearby.map(({ page, index }) => (
        <button key={page.id} type="button" onClick={() => onSelect(index)} aria-current={!coverActive && current === index ? 'page' : undefined} className={cn('w-20 shrink-0 rounded-xl border p-1.5 text-xs transition', !coverActive && current === index ? 'border-teal-700 bg-teal-50 text-teal-800' : 'border-stone-200 hover:border-stone-400')}>
          <div className="aspect-[4/3] overflow-hidden rounded-lg"><PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={page.image_path} alt={`Page ${index + 1} thumbnail`} fittingType="fill" className="h-full w-full" fallback={fallback} /></div>
          <span className="mt-1 block">Page {index + 1}</span>
        </button>
      ))}
    </nav>
  );
}
