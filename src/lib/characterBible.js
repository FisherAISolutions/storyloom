export const CHARACTER_KINDS = Object.freeze([
  { value: 'human', label: 'Human' },
  { value: 'animal', label: 'Animal' },
  { value: 'mythical', label: 'Mythical or fantasy creature' },
]);

export const EMPTY_APPEARANCE_BIBLE = Object.freeze({
  hair: '', eyes: '', skin_or_surface: '', body_features: '', clothing: '',
  clothing_colors: '', shoes: '', accessories: '', wings: '', horns: '', tail: '',
  distinguishing_features: '', palette: '', negative_constraints: '',
});

export function normalizeAppearanceBible(value = {}) {
  return Object.fromEntries(Object.keys(EMPTY_APPEARANCE_BIBLE).map((key) => [
    key,
    typeof value?.[key] === 'string' ? value[key].trim().slice(0, 500) : '',
  ]));
}

export function hasAppearanceDetails(value = {}) {
  return Object.values(normalizeAppearanceBible(value)).some(Boolean);
}

export function buildCharacterDescription({ characterKind = 'human', species = '', age, pronouns = '', appearanceBible = {}, appearanceLocked = true }) {
  const bible = normalizeAppearanceBible(appearanceBible);
  const kindLabel = characterKind === 'mythical' ? 'mythical or fantasy creature' : characterKind;
  const identity = `${age ? `${age}-year-old ` : ''}${species?.trim() || kindLabel}`.trim();
  const details = [
    ['Hair', bible.hair], ['Eyes', bible.eyes], ['Skin, fur, scales, or surface', bible.skin_or_surface],
    ['Body features', bible.body_features], ['Clothing', bible.clothing], ['Clothing colors', bible.clothing_colors],
    ['Shoes', bible.shoes], ['Accessories', bible.accessories], ['Wings', bible.wings], ['Horns', bible.horns],
    ['Tail', bible.tail], ['Distinguishing features', bible.distinguishing_features], ['Visual palette', bible.palette],
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}.`);
  const constraints = bible.negative_constraints ? `Do not change: ${bible.negative_constraints}.` : '';
  const lock = appearanceLocked ? 'Keep these appearance details consistent in every illustration.' : '';
  return [`A ${identity}.`, pronouns ? `Pronouns: ${pronouns.trim()}.` : '', ...details, constraints, lock].filter(Boolean).join(' ');
}
