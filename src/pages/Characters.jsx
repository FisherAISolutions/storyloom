import React, { useState, useEffect } from 'react';
import { analyzeChildCharacter, generateCharacterImage } from '@/lib/storyStudio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PrivateImage from '@/components/PrivateImage';
import * as charactersService from '@/services/characters';
import { STORAGE_BUCKETS, uploadCharacterPhoto } from '@/services/storage';

export default function Characters() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [progress, setProgress] = useState('');
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      setCharacters(await charactersService.list());
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(f);
    });
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function handleCreate() {
    if (!name.trim() || !photo) return;
    setCreating(true);
    try {
      setProgress('Uploading photo…');
      const character = await charactersService.create({ name: name.trim(), age: age ? Number(age) : undefined });
      const photoPath = await uploadCharacterPhoto(character.id, photo);
      await charactersService.update(character.id, { photo_path: photoPath });
      setProgress('Studying your child’s likeness…');
      const description = await analyzeChildCharacter(character.id);
      setProgress('Painting the storybook character…');
      const characterImagePath = await generateCharacterImage(character.id, description);
      await charactersService.update(character.id, {
        description,
        character_image_path: characterImagePath,
      });
      toast({ title: 'Character ready!', description: `${name} can now star in stories.` });
      setName(''); setAge(''); setPhoto(null); setPreview((current) => { if (current) URL.revokeObjectURL(current); return ''; });
      await load();
    } catch (e) {
      toast({ title: 'Character creation stopped', description: e?.message || 'Completed work was preserved. Please try again.', variant: 'destructive' });
    }
    setProgress('');
    setCreating(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Storybook characters</h1>
        <p className="mt-2 text-stone-500">Upload a photo of your child and the AI will paint them as a soft watercolor character, ready to drop into any story.</p>
      </div>

      {/* Create form */}
      <div className="grid gap-6 rounded-3xl border border-stone-200 bg-white p-6 md:grid-cols-2 md:p-8">
        <div>
          <Label htmlFor="name">Child's name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lily" className="mt-1.5" />
          <div className="mt-4">
            <Label htmlFor="age">Age (optional)</Label>
            <Input id="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="5" className="mt-1.5" />
          </div>
          <div className="mt-4">
            <Label htmlFor="photo">Photo</Label>
            <label
              htmlFor="photo"
              className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center transition hover:border-stone-400 hover:bg-stone-100"
            >
              {preview ? (
                <img src={preview} alt="preview" className="h-28 w-28 rounded-full object-cover" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-stone-400" />
                  <span className="mt-2 text-sm text-stone-500">Tap to upload a photo</span>
                </>
              )}
            </label>
            <input id="photo" type="file" accept="image/*" className="hidden" onChange={onFile} />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !photo || creating}
            className="mt-6 rounded-full bg-stone-900 hover:bg-stone-800"
          >
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {creating ? 'Creating…' : 'Create character'}
          </Button>
          {progress && <p className="mt-3 text-sm text-stone-500">{progress}</p>}
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 p-6">
          <h3 className="font-display text-lg font-semibold">How it works</h3>
          <ol className="mt-3 space-y-3 text-sm text-stone-600">
            <li>1. Upload a clear photo of your child's face.</li>
            <li>2. The AI describes their features — hair, eyes, glow.</li>
            <li>3. A watercolor portrait is painted in storybook style.</li>
            <li>4. Choose the character when creating a story to place them inside.</li>
          </ol>
        </div>
      </div>

      {/* Gallery */}
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Your characters</h2>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-stone-400" /></div>
        ) : characters.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/50 py-10 text-center text-sm text-stone-400">
            No characters yet — create one above.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {characters.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="relative aspect-square overflow-hidden">
                  <PrivateImage bucket={STORAGE_BUCKETS.CHARACTER_IMAGES} path={c.character_image_path} alt={c.name} fittingType="fill" className="h-full w-full" fallback={<div className="flex h-full items-center justify-center bg-stone-50 text-xs text-stone-400">Portrait unavailable</div>} />
                </div>
                <div className="p-3">
                  <h3 className="font-display text-base font-semibold">{c.name}</h3>
                  {c.age && <p className="text-xs text-stone-400">Age {c.age}</p>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
