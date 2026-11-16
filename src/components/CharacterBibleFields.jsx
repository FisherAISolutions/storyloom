import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CHARACTER_KINDS } from '@/lib/characterBible';

const commonFields = [
  ['eyes', 'Eyes', 'large blue eyes'],
  ['skin_or_surface', 'Skin, fur, scales, or surface', 'warm brown skin, golden fur, emerald scales…'],
  ['body_features', 'Body features', 'small and round, long ears, athletic build…'],
  ['clothing', 'Clothing', 'yellow flowered dress and blue cardigan'],
  ['clothing_colors', 'Clothing colors', 'yellow, white, and sky blue'],
  ['shoes', 'Shoes', 'red rain boots'],
  ['accessories', 'Accessories', 'silver glasses and a star-shaped backpack'],
  ['distinguishing_features', 'Distinguishing features', 'freckles across the nose, white patch over one eye…'],
  ['palette', 'Character palette', 'coral, teal, cream, and gold'],
  ['negative_constraints', 'Never change', 'eye color, dress pattern, horn count…'],
];

export default function CharacterBibleFields({ idPrefix = 'character', characterKind, setCharacterKind, species, setSpecies, pronouns, setPronouns, bible, setBible, locked, setLocked }) {
  const update = (key, value) => setBible((current) => ({ ...current, [key]: value }));
  const fields = [
    ...(characterKind === 'human' ? [['hair', 'Hair', 'strawberry-blonde shoulder-length curls']] : []),
    ...commonFields,
    ...(characterKind !== 'human' ? [['tail', 'Tail', 'long striped tail with a white tip']] : []),
    ...(characterKind === 'mythical' ? [
      ['wings', 'Wings', 'two translucent turquoise wings'],
      ['horns', 'Horns', 'two short curled golden horns'],
    ] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${idPrefix}-kind`}>Character type</Label>
          <select id={`${idPrefix}-kind`} value={characterKind} onChange={(event) => setCharacterKind(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm">
            {CHARACTER_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-species`}>Species</Label>
          <Input id={`${idPrefix}-species`} value={species} onChange={(event) => setSpecies(event.target.value)} maxLength={120} placeholder={characterKind === 'human' ? 'human' : characterKind === 'animal' ? 'golden retriever' : 'young sea dragon'} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-pronouns`}>Pronouns (optional)</Label>
          <Input id={`${idPrefix}-pronouns`} value={pronouns} onChange={(event) => setPronouns(event.target.value)} maxLength={80} placeholder="she/her" className="mt-1.5" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label, placeholder]) => (
          <div key={key}>
            <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
            <Input id={`${idPrefix}-${key}`} value={bible[key] || ''} onChange={(event) => update(key, event.target.value)} maxLength={500} placeholder={placeholder} className="mt-1.5" />
          </div>
        ))}
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
        <input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} className="mt-1" />
        <span><strong className="block text-stone-800">Lock this appearance</strong>Use these physical details, clothing, colors, and distinguishing features as continuity rules in every story.</span>
      </label>
    </div>
  );
}
