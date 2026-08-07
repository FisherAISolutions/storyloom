import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getStylePrompt, DEFAULT_ART_STYLE } from '@/lib/artStyles';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, Save, X } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function CoverCreator({ story, onClose, onSaved }) {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState(story.cover_image_url || '');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrompt(
      `A children's book cover illustration for "${story.title}". ${story.summary || ''} Theme: ${story.theme}. Style: ${getStylePrompt(story.art_style || DEFAULT_ART_STYLE)}. No text or title in the image.`
    );
    setImageUrl(story.cover_image_url || '');
  }, [story]);

  async function generate() {
    setGenerating(true);
    try {
      const { url } = await base44.integrations.Core.GenerateImage({ prompt });
      setImageUrl(url);
    } catch {}
    setGenerating(false);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await base44.entities.Story.update(story.id, { cover_image_url: imageUrl, status: story.status === 'generating' ? 'ready' : story.status });
      onSaved?.(imageUrl);
      onClose?.();
    } catch {}
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl md:p-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Cover creator</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-stone-500">Describe the cover, paint it, and save it as the book's cover.</p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium">Cover prompt</label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} className="resize-none" />
            <Button onClick={generate} disabled={generating} className="w-full rounded-full bg-stone-900 hover:bg-stone-800">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {generating ? 'Painting…' : imageUrl ? 'Repaint cover' : 'Generate cover'}
            </Button>
          </div>
          <div className="flex flex-col">
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
              {imageUrl ? (
                <Image src={imageUrl} alt="cover" fittingType="fill" className="h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-stone-400">Your cover preview will appear here</div>
              )}
              {generating && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
                </div>
              )}
            </div>
            <Button onClick={save} disabled={!imageUrl || saving} className="mt-3 rounded-full bg-stone-900 hover:bg-stone-800">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save cover
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}