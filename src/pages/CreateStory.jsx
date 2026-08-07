import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TEMPLATES } from '@/lib/templates';
import { generateStoryContent, generatePageImage } from '@/lib/storyStudio';
import { ART_STYLES, DEFAULT_ART_STYLE } from '@/lib/artStyles';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2, Check } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';
import CharacterSlots from '@/components/CharacterSlots';
import * as storiesService from '@/services/stories';
import * as storyPagesService from '@/services/storyPages';
import * as charactersService from '@/services/characters';

/** Convert UI slots into the characters array used by the AI. */
function slotsToCharacters(slots, savedCharacters) {
  return slots
    .filter(Boolean)
    .map((s) => {
      if (s.type === 'saved') {
        const c = savedCharacters.find((x) => x.id === s.character_id);
        return c ? { name: c.name, description: c.description } : null;
      }
      return { name: '', description: s.quick_description };
    })
    .filter(Boolean);
}

/** Convert UI slots into the storage shape for the Story entity. */
function slotsToStorage(slots) {
  const filtered = slots.filter(Boolean);
  const firstSaved = filtered.find((s) => s.type === 'saved');
  const child_character_id = firstSaved?.character_id || undefined;
  const secondary_characters = filtered.map((s) =>
    s.type === 'saved' ? { character_id: s.character_id } : { quick_description: s.quick_description }
  );
  return { child_character_id, secondary_characters };
}

export default function CreateStory() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState('template');
  const [selected, setSelected] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [slots, setSlots] = useState([]);
  const [savedCharacters, setSavedCharacters] = useState([]);
  const [pageCount, setPageCount] = useState(6);
  const [artStyle, setArtStyle] = useState(DEFAULT_ART_STYLE);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    charactersService.list().then(setSavedCharacters).catch(() => setSavedCharacters([]));
    const tplId = params.get('template');
    const idea = params.get('idea');
    if (tplId) {
      const t = TEMPLATES.find((x) => x.id === tplId);
      if (t) {
        setSelected(t);
        setMode('template');
      }
    } else if (idea) {
      setCustomPrompt(idea);
      setMode('custom');
    }
  }, [params]);

  const canStart =
    (mode === 'template' && selected) || (mode === 'custom' && customPrompt.trim().length > 5);

  async function handleGenerate() {
    const theme = mode === 'template' ? selected.theme : 'custom adventure';
    const premise = mode === 'template' ? selected.idea : customPrompt.trim();
    if (!premise) return;
    setLoading(true);
    setError('');
    try {
      setProgress('Writing your story…');
      const characters = slotsToCharacters(slots, savedCharacters);
      const content = await generateStoryContent({ prompt: premise, theme, characters, pageCount });
      if (!Array.isArray(content?.pages) || content.pages.length !== pageCount) {
        throw new Error('The story generator did not return the requested number of pages. Please try again.');
      }
      const { child_character_id, secondary_characters } = slotsToStorage(slots);
      const story = await storiesService.create({
        title: content.title,
        summary: content.summary,
        theme,
        art_style: artStyle,
        status: 'generating',
        child_character_id,
        secondary_characters: secondary_characters.length ? secondary_characters : undefined,
        page_count: content.pages.length,
      });
      let coverPath = null;
      for (let i = 0; i < content.pages.length; i++) {
        setProgress(`Painting page ${i + 1} of ${content.pages.length}…`);
        const imagePath = await generatePageImage({
          storyId: story.id,
          pageNumber: i + 1,
          text: content.pages[i].text,
        });
        if (i === 0) coverPath = imagePath;
        await storyPagesService.create({
          story_id: story.id,
          page_number: i + 1,
          text: content.pages[i].text,
          image_path: imagePath,
        });
      }
      await storiesService.update(story.id, { status: 'ready', cover_image_path: coverPath });
      navigate(`/story/${story.id}`);
    } catch (e) {
      setProgress('');
      setError(e?.message || 'Story creation stopped before it was complete. Your completed pages were preserved.');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Create a story</h1>
        <p className="mt-2 text-stone-500">Pick a watercolor world or write your own spark of an idea.</p>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-full border border-stone-200 bg-white p-1">
        {[
          { k: 'template', label: 'From template' },
          { k: 'custom', label: 'Custom idea' },
        ].map((m) => (
          <button
            key={m.k}
            onClick={() => setMode(m.k)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              mode === m.k ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'template' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={cn(
                'group relative overflow-hidden rounded-2xl border bg-white text-left transition',
                selected?.id === t.id ? 'border-stone-900 ring-2 ring-stone-900' : 'border-stone-200 hover:border-stone-400'
              )}
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image src={t.image} alt={t.title} fittingType="fill" className="h-full w-full" />
                {selected?.id === t.id && (
                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-white">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-display text-sm font-semibold leading-snug">{t.title}</h3>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="prompt">Your story idea</Label>
          <Textarea
            id="prompt"
            rows={4}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="A tiny dragon who collects lost buttons and opens a button shop…"
            className="resize-none"
          />
        </div>
      )}

      {/* Characters */}
      <div className="space-y-3">
        <div>
          <Label>Characters (up to 3)</Label>
          <p className="text-xs text-stone-400">Add saved characters from your library or quick characters — the AI keeps them consistent across every page.</p>
        </div>
        <CharacterSlots value={slots} onChange={setSlots} savedCharacters={savedCharacters} />
      </div>

      {/* Story options */}
      <div className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 md:grid-cols-2 md:gap-6">
        <div className="space-y-2 md:col-span-2">
          <Label>Art style</Label>
          <div className="flex flex-wrap gap-2">
            {ART_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setArtStyle(s.id)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition',
                  artStyle === s.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-400">Choose the look of your illustrations — applied to every page and the cover.</p>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Story length</Label>
          <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
            {[6, 10, 15].map((n) => (
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
          <p className="text-xs text-stone-400">Longer books take a little more time to paint — hang tight while each page is illustrated.</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button
          onClick={handleGenerate}
          disabled={!canStart || loading}
          size="lg"
          className="rounded-full bg-stone-900 hover:bg-stone-800"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          {loading ? 'Creating…' : 'Create my story'}
        </Button>
        {progress && <span className="text-sm text-stone-500">{progress}</span>}
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
