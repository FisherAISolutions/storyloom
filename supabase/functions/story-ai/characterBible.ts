const KEYS = [
  'hair', 'eyes', 'skin_or_surface', 'body_features', 'clothing', 'clothing_colors',
  'shoes', 'accessories', 'wings', 'horns', 'tail', 'distinguishing_features',
  'palette', 'negative_constraints',
] as const;

export function characterBibleDescription(character: Record<string, any>) {
  const bible = character.appearance_bible && typeof character.appearance_bible === 'object' && !Array.isArray(character.appearance_bible) ? character.appearance_bible : {};
  const labels: Record<string, string> = {
    hair: 'Hair', eyes: 'Eyes', skin_or_surface: 'Skin, fur, scales, or surface', body_features: 'Body features',
    clothing: 'Clothing', clothing_colors: 'Clothing colors', shoes: 'Shoes', accessories: 'Accessories',
    wings: 'Wings', horns: 'Horns', tail: 'Tail', distinguishing_features: 'Distinguishing features', palette: 'Visual palette',
  };
  const kind = character.character_kind === 'mythical' ? 'mythical or fantasy creature' : character.character_kind || 'character';
  const identity = `${character.age ? `${character.age}-year-old ` : ''}${String(character.species || kind).slice(0, 120)}`;
  const details = KEYS.filter((key) => key !== 'negative_constraints').map((key) => {
    const value = typeof bible[key] === 'string' ? bible[key].trim().slice(0, 500) : '';
    return value ? `${labels[key]}: ${value}.` : '';
  }).filter(Boolean);
  const negative = typeof bible.negative_constraints === 'string' && bible.negative_constraints.trim()
    ? `Do not change: ${bible.negative_constraints.trim().slice(0, 500)}.` : '';
  const structured = [`A ${identity}.`, character.pronouns ? `Pronouns: ${String(character.pronouns).slice(0, 80)}.` : '', ...details, negative,
    character.appearance_locked ? 'Keep these appearance details consistent in every illustration.' : ''].filter(Boolean).join(' ');
  return details.length ? structured : String(character.description || structured).slice(0, 2_000);
}
