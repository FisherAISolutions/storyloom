import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Download, Globe2, Info, Loader2, Palette, Pencil, Plus, RefreshCw, Save } from 'lucide-react';
import { generatePageImage, translateStory } from '@/lib/storyStudio';
import { downloadStoryPdf } from '@/lib/storyPdf';
import { invalidatePageTranslations, shouldSyncCoverForPage } from '@/lib/storyState';
import { useIsMobile } from '@/hooks/use-mobile';
import CoverCreator from '@/components/CoverCreator';
import ContinueStoryModal from '@/components/ContinueStoryModal';
import LanguagePicker from '@/components/LanguagePicker';
import StoryBookViewer from '@/components/storybook/StoryBookViewer';
import StoryThumbnailStrip from '@/components/storybook/StoryThumbnailStrip';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import * as storiesService from '@/services/stories';
import * as storyPagesService from '@/services/storyPages';
import * as communityService from '@/services/community';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function StoryEditor() {
  const { id } = useParams();
  const isMobile = useIsMobile();
  const [story, setStory] = useState(null);
  const [pages, setPages] = useState([]);
  const [current, setCurrent] = useState(0);
  const [coverActive, setCoverActive] = useState(true);
  const [direction, setDirection] = useState('');
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
  const [communityState, setCommunityState] = useState(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const loadedStory = await storiesService.get(id);
        setStory(loadedStory);
        const loadedPages = await storyPagesService.listByStory(id);
        setPages(loadedPages);
        if (loadedPages[0]) setDraft(loadedPages[0].text);
        communityService.getOwnerState(id).then(setCommunityState).catch(() => {});
      } catch (loadError) {
        setError(loadError?.message || 'This story could not be loaded.');
      }
      setLoading(false);
    })();
  }, [id]);

  const page = pages[current];
  const translation = language !== 'en' ? story?.translations?.[language] : null;
  const displayTextFor = useCallback((index) => {
    if (!pages[index]) return '';
    return language === 'en' ? pages[index].text : translation?.[index] ?? pages[index].text;
  }, [language, pages, translation]);

  const selectPage = useCallback((index) => {
    if (!pages[index]) return;
    setCoverActive(false);
    setCurrent(index);
    setDraft(pages[index].text || '');
    setEditing(false);
  }, [pages]);

  const previous = useCallback(() => {
    if (coverActive) return;
    const step = isMobile ? 1 : 2;
    const spreadStart = Math.floor(current / 2) * 2;
    const next = isMobile ? current - 1 : spreadStart - step;
    if (next < 0) {
      setCoverActive(true);
      setEditing(false);
    } else {
      setDirection('previous');
      selectPage(next);
    }
  }, [coverActive, current, isMobile, selectPage]);

  const next = useCallback(() => {
    if (coverActive) {
      setDirection('next');
      selectPage(0);
      return;
    }
    const step = isMobile ? 1 : 2;
    const spreadStart = Math.floor(current / 2) * 2;
    const target = isMobile ? current + 1 : spreadStart + step;
    if (target < pages.length) {
      setDirection('next');
      selectPage(target);
    }
  }, [coverActive, current, isMobile, pages.length, selectPage]);

  async function saveText() {
    if (!page) return;
    setSaving(true);
    setError('');
    try {
      const updated = await storyPagesService.update(page.id, { text: draft });
      const copy = [...pages];
      copy[current] = updated;
      setPages(copy);
      if (story.translations && Object.keys(story.translations).length) {
        const translations = invalidatePageTranslations(story.translations, current);
        await storiesService.update(story.id, { translations });
        setStory({ ...story, translations });
      }
      setEditing(false);
    } catch (saveError) {
      setError(saveError?.message || 'The page text could not be saved.');
    }
    setSaving(false);
  }

  async function downloadPdf() {
    if (!story) return;
    setDownloading(true);
    setError('');
    try {
      await downloadStoryPdf(story, pages);
    } catch (downloadError) {
      setError(downloadError?.message || 'The PDF could not be created.');
    }
    setDownloading(false);
  }

  async function regenerateImage() {
    if (!page || !story) return;
    setRegenerating(true);
    setError('');
    try {
      const imagePath = await generatePageImage({ storyId: story.id, pageNumber: page.page_number, text: draft || page.text });
      const updated = await storyPagesService.update(page.id, { image_path: imagePath, text: draft || page.text });
      const copy = [...pages];
      copy[current] = updated;
      setPages(copy);
      if (shouldSyncCoverForPage(current)) {
        await storiesService.update(story.id, { cover_image_path: imagePath });
        setStory({ ...story, cover_image_path: imagePath });
      }
    } catch (repaintError) {
      setError(repaintError?.message || 'The page could not be repainted.');
    }
    setRegenerating(false);
  }

  async function changeLanguage(lang) {
    setLanguage(lang);
    if (lang === 'en' || story.translations?.[lang]) return;
    setTranslating(true);
    setError('');
    try {
      const translated = await translateStory({ storyId: story.id, language: lang });
      const translations = { ...(story.translations || {}), [lang]: translated };
      await storiesService.update(story.id, { translations });
      setStory({ ...story, translations });
    } catch (translateError) {
      setError(translateError?.message || 'The story could not be translated.');
    }
    setTranslating(false);
  }

  function onContinueDone(newPages) {
    const firstNewPage = pages.length;
    setPages([...pages, ...newPages]);
    setStory({ ...story, page_count: pages.length + newPages.length });
    setContinueOpen(false);
    setCoverActive(false);
    setCurrent(firstNewPage);
    setDraft(newPages[0]?.text || '');
    setEditing(false);
  }

  async function shareCommunity() { setSharing(true); setError(''); try { setCommunityState(await communityService.share(story.id)); } catch (shareError) { setError(shareError?.message || 'The story could not be shared.'); } setSharing(false); }
  async function unpublishCommunity() { setSharing(true); setError(''); try { setCommunityState(await communityService.unpublish(communityState.id)); } catch (shareError) { setError(shareError?.message || 'The story could not be unpublished.'); } setSharing(false); }

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-stone-400" /></div>;
  if (!page) {
    return <div className="py-24 text-center"><p className="text-stone-500">{error || 'This story has no pages yet.'}</p><Link to="/create" className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white">Create a story</Link></div>;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/library" className="text-sm text-stone-500 hover:text-stone-900">← Back to Library</Link>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#12304b] md:text-3xl">{story.title}</h1>
          {story.summary && <p className="mt-1 max-w-2xl text-sm text-stone-500">{story.summary}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Story tools">
          <Button onClick={() => setContinueOpen(true)} variant="outline" size="sm" className="rounded-full bg-white"><Plus className="mr-1.5 h-3.5 w-3.5" /> Continue</Button>
          <LanguagePicker value={language} onChange={changeLanguage} translating={translating} />
          <Button onClick={() => setCoverOpen(true)} variant="outline" size="sm" className="rounded-full bg-white"><Palette className="mr-1.5 h-3.5 w-3.5" /> Cover</Button>
          <Button onClick={downloadPdf} disabled={downloading} size="sm" className="rounded-full bg-[#087f7c] hover:bg-[#066c69]">{downloading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />} PDF</Button>
          {communityState?.status === 'published' ? <Button onClick={unpublishCommunity} disabled={sharing} variant="outline" size="sm" className="rounded-full bg-white">Unpublish</Button> : <AlertDialog><AlertDialogTrigger asChild><Button disabled={sharing} variant="outline" size="sm" className="rounded-full bg-white"><Globe2 className="mr-1.5 h-3.5 w-3.5"/> Share to Community</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Share this story publicly?</AlertDialogTitle><AlertDialogDescription>Your story title, generated cover, story text, and generated illustrations will be publicly viewable. Your account email, original uploaded photo, billing information, and private account details will not be shown.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep private</AlertDialogCancel><AlertDialogAction onClick={shareCommunity}>Confirm and share</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </div>
      </header>

      {coverOpen && <CoverCreator story={story} onClose={() => setCoverOpen(false)} onSaved={(coverImagePath) => setStory({ ...story, cover_image_path: coverImagePath })} />}
      {continueOpen && <ContinueStoryModal story={story} pages={pages} onClose={() => setContinueOpen(false)} onDone={onContinueDone} />}

      <StoryBookViewer story={story} pages={pages} current={current} coverActive={coverActive} isMobile={isMobile} direction={direction} displayTextFor={displayTextFor} regenerating={regenerating} onSelect={selectPage} onPrevious={previous} onNext={next} />

      <section aria-labelledby="page-editor-heading" className="mx-auto max-w-5xl rounded-3xl border border-stone-200 bg-white/90 p-5 shadow-lg shadow-stone-900/5 md:p-7">
        {coverActive ? (
          <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
            <BookOpen className="h-7 w-7 text-[#087f7c]" />
            <div><h2 id="page-editor-heading" className="font-display text-xl font-semibold text-[#12304b]">Your story cover</h2><p className="mt-1 text-sm text-stone-500">Open the book to select and edit a story page.</p></div>
            <Button onClick={next} className="rounded-full bg-[#087f7c] hover:bg-[#066c69]">Open book</Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ed6a5e]">Selected page {current + 1}</p><h2 id="page-editor-heading" className="mt-1 flex items-center gap-2 font-display text-xl font-semibold text-[#12304b]"><Pencil className="h-4 w-4" /> Edit Text</h2></div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit text'}</Button>
              </div>
              {language !== 'en' && translating ? <div className="mt-4 flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Translating…</div> : editing ? (
                <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} className="mt-4 resize-none font-display text-base leading-relaxed" aria-label={`Text for page ${current + 1}`} />
              ) : <p className="mt-4 min-h-24 rounded-2xl bg-stone-50 p-4 font-display text-base leading-relaxed text-stone-700">{displayTextFor(current)}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={saveText} disabled={saving || language !== 'en'} className="rounded-full bg-[#087f7c] hover:bg-[#066c69]">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save</Button>
                <Button onClick={regenerateImage} disabled={regenerating || language !== 'en'} variant="outline" className="rounded-full">{regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Repaint to Match</Button>
              </div>
            </div>
            <aside className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm leading-6 text-stone-600">
              <Info className="mb-2 h-5 w-5 text-amber-700" /><strong className="block text-stone-800">You’re in control</strong>Edit the page text or repaint its illustration. A successful repaint uses one image credit and keeps you on this spread.
            </aside>
          </div>
        )}
      </section>

      <StoryThumbnailStrip story={story} pages={pages} current={current} coverActive={coverActive} onCover={() => { setCoverActive(true); setEditing(false); }} onSelect={selectPage} />
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
