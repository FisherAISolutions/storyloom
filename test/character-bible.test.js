import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCharacterDescription, hasAppearanceDetails, normalizeAppearanceBible } from '../src/lib/characterBible.js';

test('Character Bible descriptions are deterministic and preserve locked traits', () => {
  const input = {
    characterKind: 'mythical', species: 'young sea dragon', pronouns: 'she/her', appearanceLocked: true,
    appearanceBible: { eyes: 'large violet eyes', skin_or_surface: 'turquoise scales', wings: 'two silver fins', horns: 'two gold horns', clothing: 'red explorer vest', negative_constraints: 'horn count and vest color' },
  };
  const first = buildCharacterDescription(input);
  assert.equal(first, buildCharacterDescription(input));
  assert.match(first, /young sea dragon/);
  assert.match(first, /turquoise scales/);
  assert.match(first, /red explorer vest/);
  assert.match(first, /Do not change: horn count and vest color/);
  assert.match(first, /consistent in every illustration/);
});

test('Character Bible normalization removes unknown and non-string fields', () => {
  const normalized = normalizeAppearanceBible({ eyes: ' blue ', unknown: 'ignored', wings: 2 });
  assert.equal(normalized.eyes, 'blue');
  assert.equal(normalized.wings, '');
  assert.equal(Object.hasOwn(normalized, 'unknown'), false);
  assert.equal(hasAppearanceDetails(normalized), true);
});
