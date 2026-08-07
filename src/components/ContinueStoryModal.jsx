import React, { useState, useEffect } from 'react';
import { suggestContinuation, generateContinuation, generatePageImage, resolveStoryCharacters } from '@/lib/storyStudio';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as storiesService from '@/services/stories';
import * as storyPagesService from '@/services/storyPages';
import { persistStoryPageImage } from '@/services/storage';

export default function ContinueStoryModal({ story, pages, onClose, onDone }) {
  const [suggestion, setSuggestion] = useState('');
  const [loadingSuggestion, setLoadingSuggestion] = useState(true);
  const [pageCount, setPageCount] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const last = pages.slice(-2).map((p) => p.text);
        const s = await suggestContinuation({ title: story.title, summary: story.summary, lastPages: last });
        if (alive) setSuggestion(s || '');
      } catch {
        if (alive) setSuggestion('');
      } finally {
        if (alive) setLoadingSuggestion(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function handleContinue() {
    if (!suggestion.trim()) return;
    setRunning(true);
    setError('');
    try {
      const characters = await resolveStoryCharacters(story);
      setProgress('Writing new pages…');
      const content = await generateContinuation({
        title: story.title,
        summary: story.summary,
        theme: story.theme,
        characters,
        pageCount,
        continuationPrompt: suggestion.trim(),
      });
      if (!Array.isArray(content?.pages) || content.pages.length !== pageCount) {
        throw new Error('The story generator did not return the requested number of pages. Please try again.');
      }

      const startNumber = pages.length;
      const newRecords = [];
      for (let i = 0; i < content.pages.length; i++) {
        setProgress(`Painting page ${i + 1} of ${content.pages.length}…`);
        const providerUrl = await generatePageImage({
          text: content.pages[i].text,
          theme: story.theme,
          characters,
          artStyle: story.art_style,
        });
        const pageNumber = startNumber + i + 1;
        const imagePath = await persistStoryPageImage(story.id, pageNumber, providerUrl);
        const rec = await storyPagesService.create({
          story_id: story.id,
          page_number: pageNumber,
          text: content.pages[i].text,
          image_path: imagePath,
        });
        newRecords.push(rec);
      }
      await storiesService.update(story.id, { page_count: startNumber + content.pages.length });
      onDone(newRecords);
    } catch (e) { setError(e?.message || 'Continuation stopped. Completed pages were preserved.'); }
    setRunning(false);
    setProgress('');
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Continue story</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Add more pages to your book. The AI suggests where the story could go next — edit it freely.
        </p>

        <div className="mt-5 space-y-3">
          <label className="text-sm font-medium text-stone-700">Continuation idea</label>
          <Textarea
            value={loadingSuggestion ? '' : suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            rows={4}
            placeholder={loadingSuggestion ? 'Thinking of a good next chapter…' : 'What happens next?'}
            className="resize-none"
          />
          {loadingSuggestion && (
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Suggesting a continuation…
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium text-stone-700">How many new pages?</label>
          <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setPageCount(n)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition',
                  pageCount === n ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'
                )}
              >
                {n} pages
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleContinue} disabled={running || loadingSuggestion || !suggestion.trim()} className="rounded-full bg-stone-900 hover:bg-stone-800">
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {running ? 'Continuing…' : 'Continue story'}
          </Button>
          {progress && <span className="text-sm text-stone-500">{progress}</span>}
          <Button variant="ghost" onClick={onClose} disabled={running} className="ml-auto text-stone-500">
            Cancel
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}
