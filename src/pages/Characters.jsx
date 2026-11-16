import React, { useEffect, useState } from 'react';
import { analyzeChildCharacter, generateCharacterImage } from '@/lib/storyStudio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil, Sparkles, Upload } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PrivateImage from '@/components/PrivateImage';
import CharacterBibleFields from '@/components/CharacterBibleFields';
import { buildCharacterDescription, EMPTY_APPEARANCE_BIBLE, hasAppearanceDetails, normalizeAppearanceBible } from '@/lib/characterBible';
import * as charactersService from '@/services/characters';
import { STORAGE_BUCKETS, uploadCharacterPhoto } from '@/services/storage';

const emptyBible = () => ({ ...EMPTY_APPEARANCE_BIBLE });

export default function Characters() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [characterKind, setCharacterKind] = useState('human');
  const [species, setSpecies] = useState('human');
  const [pronouns, setPronouns] = useState('');
  const [bible, setBible] = useState(emptyBible);
  const [locked, setLocked] = useState(true);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [progress, setProgress] = useState('');
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try { setCharacters(await charactersService.list()); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function resetForm() {
    setName(''); setAge(''); setCharacterKind('human'); setSpecies('human'); setPronouns('');
    setBible(emptyBible()); setLocked(true); setPhoto(null);
    setPreview((current) => { if (current) URL.revokeObjectURL(current); return ''; });
  }

  async function handleCreate() {
    if (!name.trim() || !species.trim()) return;
    setCreating(true);
    try {
      let appearanceBible = normalizeAppearanceBible(bible);
      let description = buildCharacterDescription({ characterKind, species, age: age ? Number(age) : null, pronouns, appearanceBible, appearanceLocked: locked });
      const character = await charactersService.create({
        name: name.trim(), age: age ? Number(age) : undefined, character_kind: characterKind,
        species: species.trim(), pronouns: pronouns.trim() || null, appearance_bible: appearanceBible,
        appearance_locked: locked, description,
      });

      if (photo) {
        setProgress('Uploading the private reference photo…');
        const photoPath = await uploadCharacterPhoto(character.id, photo);
        await charactersService.update(character.id, { photo_path: photoPath });
        setProgress('Finding visible character details…');
        try {
          const analyzed = await analyzeChildCharacter(character.id);
          appearanceBible = normalizeAppearanceBible(Object.fromEntries(
            Object.keys(appearanceBible).map((key) => [key, appearanceBible[key] || analyzed?.[key] || '']),
          ));
          description = buildCharacterDescription({ characterKind, species, age: age ? Number(age) : null, pronouns, appearanceBible, appearanceLocked: locked });
          await charactersService.update(character.id, { appearance_bible: appearanceBible, description });
        } catch (analysisError) {
          toast({ title: 'Photo details need review', description: analysisError?.message || 'The character was saved with the details you entered.' });
        }
        setProgress('Painting the storybook portrait…');
        const characterImagePath = await generateCharacterImage(character.id);
        await charactersService.update(character.id, { character_image_path: characterImagePath });
      }

      toast({ title: 'Character ready!', description: `${name} can now star in stories.` });
      resetForm();
    } catch (error) {
      toast({ title: 'Character creation stopped', description: error?.message || 'Completed work was preserved. Please try again.', variant: 'destructive' });
    }
    setProgress('');
    setCreating(false);
    await load();
  }

  function startEdit(character) {
    setEditing({
      ...character,
      age: character.age ? String(character.age) : '',
      character_kind: character.character_kind || 'human',
      species: character.species || (character.character_kind === 'animal' ? 'animal' : character.character_kind === 'mythical' ? 'fantasy creature' : 'human'),
      pronouns: character.pronouns || '',
      appearance_bible: normalizeAppearanceBible(character.appearance_bible),
      appearance_locked: character.appearance_locked !== false,
    });
  }

  async function saveEdit() {
    if (!editing?.name?.trim() || !editing.species?.trim()) return;
    setSavingEdit(true);
    try {
      const appearanceBible = normalizeAppearanceBible(editing.appearance_bible);
      const generated = buildCharacterDescription({
        characterKind: editing.character_kind, species: editing.species, age: editing.age ? Number(editing.age) : null,
        pronouns: editing.pronouns, appearanceBible, appearanceLocked: editing.appearance_locked,
      });
      await charactersService.update(editing.id, {
        name: editing.name.trim(), age: editing.age ? Number(editing.age) : null,
        character_kind: editing.character_kind, species: editing.species.trim(), pronouns: editing.pronouns.trim() || null,
        appearance_bible: appearanceBible, appearance_locked: editing.appearance_locked,
        description: hasAppearanceDetails(appearanceBible) ? generated : editing.description || generated,
      });
      toast({ title: 'Character Bible updated', description: 'Future stories will use these reviewed details.' });
      setEditing(null);
      await load();
    } catch (error) {
      toast({ title: 'Character update failed', description: error?.message || 'Please try again.', variant: 'destructive' });
    }
    setSavingEdit(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Storybook characters</h1>
        <p className="mt-2 text-stone-500">Create a human, animal, or mythical character. A photo is optional, and every saved character gets a reusable Character Bible.</p>
      </div>

      <div className="space-y-6 rounded-3xl border border-stone-200 bg-white p-6 md:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="name">Character name</Label><Input id="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Luna" className="mt-1.5" /></div>
          <div><Label htmlFor="age">Age (optional)</Label><Input id="age" type="number" value={age} onChange={(event) => setAge(event.target.value)} placeholder="5" className="mt-1.5" /></div>
        </div>
        <CharacterBibleFields characterKind={characterKind} setCharacterKind={(value) => { setCharacterKind(value); if (species === 'human' || !species) setSpecies(value === 'human' ? 'human' : value === 'animal' ? 'animal' : 'fantasy creature'); }} species={species} setSpecies={setSpecies} pronouns={pronouns} setPronouns={setPronouns} bible={bible} setBible={setBible} locked={locked} setLocked={setLocked} />
        <div>
          <Label htmlFor="photo">Reference photo (optional)</Label>
          <label htmlFor="photo" className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center transition hover:border-stone-400 hover:bg-stone-100">
            {preview ? <img src={preview} alt="Selected private reference" className="h-28 w-28 rounded-full object-cover" /> : <><Upload className="h-6 w-6 text-stone-400" /><span className="mt-2 text-sm text-stone-500">Add a private photo for likeness analysis and a portrait, or create without one</span></>}
          </label>
          <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
        </div>
        <Button onClick={handleCreate} disabled={!name.trim() || !species.trim() || creating} className="rounded-full bg-stone-900 hover:bg-stone-800">
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{creating ? 'Creating…' : 'Save character'}
        </Button>
        {progress && <p className="text-sm text-stone-500">{progress}</p>}
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Your characters</h2>
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-stone-400" /></div> : characters.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white/50 py-10 text-center text-sm text-stone-400">No characters yet — create one above.</p>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {characters.map((character) => (
              <div key={character.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <div className="relative aspect-square overflow-hidden"><PrivateImage bucket={STORAGE_BUCKETS.CHARACTER_IMAGES} path={character.character_image_path} alt={character.name} fittingType="fill" className="h-full w-full" fallback={<div className="flex h-full items-center justify-center bg-gradient-to-br from-amber-50 to-sky-50 px-4 text-center text-sm text-stone-500">{character.species || character.character_kind || 'Character'}</div>} /></div>
                <div className="p-3"><h3 className="font-display text-base font-semibold">{character.name}</h3><p className="text-xs capitalize text-stone-400">{character.species || character.character_kind}{character.age ? ` · Age ${character.age}` : ''}</p><Button variant="ghost" size="sm" onClick={() => startEdit(character)} className="mt-2 h-8 rounded-full px-2 text-xs"><Pencil className="mr-1 h-3 w-3" /> Review details</Button></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="rounded-3xl border border-[#087f7c]/30 bg-white p-6 md:p-8">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-2xl font-semibold">Review {editing.name}’s Character Bible</h2><p className="mt-1 text-sm text-stone-500">Correct any detail before using this character in a new story.</p></div><Button variant="ghost" onClick={() => setEditing(null)}>Close</Button></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="edit-name">Character name</Label><Input id="edit-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="mt-1.5" /></div><div><Label htmlFor="edit-age">Age (optional)</Label><Input id="edit-age" type="number" value={editing.age} onChange={(event) => setEditing({ ...editing, age: event.target.value })} className="mt-1.5" /></div></div>
          <div className="mt-5"><CharacterBibleFields idPrefix="edit-character" characterKind={editing.character_kind} setCharacterKind={(value) => setEditing({ ...editing, character_kind: value })} species={editing.species} setSpecies={(value) => setEditing({ ...editing, species: value })} pronouns={editing.pronouns} setPronouns={(value) => setEditing({ ...editing, pronouns: value })} bible={editing.appearance_bible} setBible={(updater) => setEditing((current) => ({ ...current, appearance_bible: typeof updater === 'function' ? updater(current.appearance_bible) : updater }))} locked={editing.appearance_locked} setLocked={(value) => setEditing({ ...editing, appearance_locked: value })} /></div>
          <Button onClick={saveEdit} disabled={savingEdit} className="mt-6 rounded-full bg-[#087f7c] hover:bg-[#066c69]">{savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save reviewed details</Button>
        </div>
      )}
    </div>
  );
}
