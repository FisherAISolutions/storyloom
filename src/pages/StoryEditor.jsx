import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { generatePageImage, resolveStoryCharacters, translateStory } from '@/lib/storyStudio';
import { downloadStoryPdf } from '@/lib/storyPdf';
import CoverCreator from '@/components/CoverCreator';
import ContinueStoryModal from '@/components/ContinueStoryModal';
import LanguagePicker from '@/components/LanguagePicker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, RefreshCw, Save, Loader2, Pencil, BookOpen, Download, Palette, Plus } from 'lucide-react';
import PrivateImage from '@/components/PrivateImage';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { invalidatePageTranslations, shouldSyncCoverForPage } from '@/lib/storyState';
import * as storiesService from '@/services/stories';
import * as storyPagesService from '@/services/storyPages';
import { STORAGE_BUCKETS, persistStoryPageImage } from '@/services/storage';

export default function StoryEditor() {
  const { id } = useParams();
  const [story, setStory] = useState(null);
  const [pages, setPages] = useState([]);
  const [storyCharacters, setStoryCharacters] = useState([]);
  const [current, setCurrent] = useState(0);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await storiesService.get(id);
        setStory(s);
        const ps = await storyPagesService.listByStory(id);
        setPages(ps);
        if (ps[0]) setDraft(ps[0].text);
        const chars = await resolveStoryCharacters(s);
        setStoryCharacters(chars);
      } catch (e) { setError(e?.message || 'This story could not be loaded.'); }
      setLoading(false);
    })();
  }, [id]);

  const page = pages[current];

  function go(delta) {
    const next = Math.min(Math.max(current + delta, 0), pages.length - 1);
    setCurrent(next);
    setDraft(pages[next]?.text || '');
    setEditing(false);
  }

  async function saveText() {
    if (!page) return;
    setSaving(true);
    try {
      const updated = await storyPagesService.update(page.id, { text: draft });
      const copy = [...pages];
      copy[current] = updated;
      setPages(copy);
      // Translations for this page are now stale — drop them so they regenerate on next toggle.
      if (story.translations && Object.keys(story.translations).length) {
        const translations = invalidatePageTranslations(story.translations, current);
        await storiesService.update(story.id, { translations });
        setStory({ ...story, translations });
      }
      setEditing(false);
    } catch (e) { setError(e?.message || 'The page text could not be saved.'); }
    setSaving(false);
  }

  async function downloadPdf() {
    if (!story) return;
    setDownloading(true);
    try {
      await downloadStoryPdf(story, pages);
    } catch (e) { setError(e?.message || 'The PDF could not be created.'); }
    setDownloading(false);
  }

  async function regenerateImage() {
    if (!page || !story) return;
    setRegenerating(true);
    try {
      const providerUrl = await generatePageImage({
        text: draft || page.text,
        theme: story.theme,
        characters: storyCharacters,
        artStyle: story.art_style,
      });
      const imagePath = await persistStoryPageImage(story.id, page.page_number, providerUrl);
      const updated = await storyPagesService.update(page.id, { image_path: imagePath, text: draft || page.text });
      const copy = [...pages];
      copy[current] = updated;
      setPages(copy);
      if (shouldSyncCoverForPage(current)) {
        await storiesService.update(story.id, { cover_image_path: imagePath });
        setStory({ ...story, cover_image_path: imagePath });
      }
    } catch (e) { setError(e?.message || 'The page could not be repainted.'); }
    setRegenerating(false);
  }

  async function changeLanguage(lang) {
    setLanguage(lang);
    if (lang === 'en') return;
    if (story.translations && story.translations[lang]) return;
    setTranslating(true);
    try {
      const texts = pages.map((p) => p.text);
      const translated = await translateStory({ texts, language: lang });
      const translations = { ...(story.translations || {}), [lang]: translated };
      const updated = await storiesService.update(story.id, { translations });
      setStory({ ...story, translations });
    } catch (e) { setError(e?.message || 'The story could not be translated.'); }
    setTranslating(false);
  }

  function onContinueDone(newPages) {
    setPages([...pages, ...newPages]);
    setStory({ ...story, page_count: pages.length + newPages.length });
    setContinueOpen(false);
    setCurrent(pages.length); // jump to first new page
    setDraft(newPages[0]?.text || '');
    setEditing(false);
  }

  const translation = language !== 'en' ? story?.translations?.[language] : null;
  const displayText = language === 'en' ? page?.text : translation && translation[current] != null ? translation[current] : page?.text;

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-stone-400" /></div>;
  }
  if (!page) {
    return (
      <div className="py-24 text-center">
        <p className="text-stone-500">{error || 'This story has no pages yet.'}</p>
        <Link to="/create" className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white">Create a story</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/library" className="text-xs text-stone-400 hover:text-stone-600">← Library</Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{story.title}</h1>
          {story.summary && <p className="mt-0.5 text-sm text-stone-500">{story.summary}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setContinueOpen(true)} variant="outline" size="sm" className="rounded-full border-stone-300 bg-white">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Continue
          </Button>
          <LanguagePicker value={language} onChange={changeLanguage} translating={translating} />
          <Button onClick={() => setCoverOpen(true)} variant="outline" size="sm" className="rounded-full border-stone-300 bg-white">
            <Palette className="mr-1.5 h-3.5 w-3.5" /> Cover
          </Button>
          <Button onClick={downloadPdf} disabled={downloading} size="sm" className="rounded-full bg-stone-900 hover:bg-stone-800">
            {downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />} PDF
          </Button>
        </div>
      </div>

      {coverOpen && (
        <CoverCreator
          story={story}
          onClose={() => setCoverOpen(false)}
          onSaved={(coverImagePath) => setStory({ ...story, cover_image_path: coverImagePath })}
        />
      )}

      {continueOpen && (
        <ContinueStoryModal
          story={story}
          pages={pages}
          onClose={() => setContinueOpen(false)}
          onDone={onContinueDone}
        />
      )}

      {/* Spread */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {/* Image side */}
        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="relative aspect-[4/3] md:aspect-[3/4]">
            {page.image_path ? (
              <PrivateImage bucket={STORAGE_BUCKETS.STORY_IMAGES} path={page.image_path} alt={`Page ${current + 1}`} fittingType="fill" className="h-full w-full" fallback={<div className="flex h-full items-center justify-center bg-stone-50"><BookOpen className="h-8 w-8 text-stone-300" /></div>} />
            ) : (
              <div className="flex h-full items-center justify-center bg-stone-50"><BookOpen className="h-8 w-8 text-stone-300" /></div>
            )}
            {regenerating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-stone-500" />
                <span className="mt-2 text-sm text-stone-600">Painting…</span>
              </div>
            )}
          </div>
        </div>

        {/* Text / editor side */}
        <div className="flex flex-col rounded-3xl border border-stone-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-stone-400">PAGE {String(current + 1).padStart(2, '0')}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(!editing)}
              className="text-stone-500 hover:text-stone-900"
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> {editing ? 'Cancel' : 'Edit text'}
            </Button>
          </div>

          {editing ? (
            <div className="mt-4 flex-1 space-y-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={8}
                className="resize-none text-base leading-relaxed"
              />
              <div className="flex gap-2">
                <Button onClick={saveText} disabled={saving} className="rounded-full bg-stone-900 hover:bg-stone-800">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button
                  onClick={regenerateImage}
                  disabled={regenerating}
                  variant="outline"
                  className="rounded-full"
                >
                  {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Repaint to match
                </Button>
              </div>
            </div>
          ) : language !== 'en' && translating ? (
            <div className="mt-4 flex flex-1 items-center gap-2 text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Translating…
            </div>
          ) : (
            <motion.p
              key={`${language}-${current}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 flex-1 font-display text-lg leading-relaxed text-stone-700 md:text-xl"
            >
              {displayText}
            </motion.p>
          )}

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go(-1)}
              disabled={current === 0}
              className="rounded-full"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <div className="flex gap-1.5">
              {pages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrent(i); setDraft(pages[i]?.text || ''); setEditing(false); }}
                  className={cn(
                    'h-2 rounded-full transition',
                    i === current ? 'w-6 bg-stone-900' : 'w-2 bg-stone-200 hover:bg-stone-300'
                  )}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => go(1)}
              disabled={current === pages.length - 1}
              className="rounded-full"
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
