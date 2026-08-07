import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, BookOpen } from 'lucide-react';
import PrivateImage from '@/components/PrivateImage';
import * as storiesService from '@/services/stories';
import { STORAGE_BUCKETS } from '@/services/storage';

export default function Library() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storiesService
      .list()
      .then(setStories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Your library</h1>
        <p className="mt-2 text-stone-500">Every story you've woven, ready to read or edit.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-stone-400" /></div>
      ) : stories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white/50 py-20 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-4 text-stone-500">Your shelves are empty.</p>
          <Link
            to="/create"
            className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Create your first story
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          {stories.map((s) => (
            <Link
              key={s.id}
              to={`/story/${s.id}`}
              className="group overflow-hidden rounded-2xl border border-stone-200 bg-white transition hover:-translate-y-1 hover:shadow-xl hover:shadow-stone-200"
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-stone-100">
                {s.cover_image_path ? (
                  <PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={s.cover_image_path} alt={s.title} fittingType="fill" className="h-full w-full transition duration-500 group-hover:scale-105" fallback={<div className="flex h-full items-center justify-center"><BookOpen className="h-8 w-8 text-stone-300" /></div>} />
                ) : (
                  <div className="flex h-full items-center justify-center"><BookOpen className="h-8 w-8 text-stone-300" /></div>
                )}
                {s.status === 'generating' && (
                  <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">painting…</span>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-display text-sm font-semibold leading-snug line-clamp-2">{s.title}</h3>
                {s.summary && <p className="mt-1 line-clamp-2 text-xs text-stone-400">{s.summary}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
