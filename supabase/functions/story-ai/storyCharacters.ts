import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.109.0';
import { AppError } from './errors.ts';

const BIBLE_FIELDS = [
  'hair', 'eyes', 'skin_or_surface', 'body_features', 'clothing', 'clothing_colors',
  'shoes', 'accessories', 'wings', 'horns', 'tail', 'distinguishing_features', 'palette',
] as const;

function value(input: unknown, max = 500) {
  return typeof input === 'string' ? input.trim().slice(0, max) : '';
}

function snapshotDescription(snapshot: any, state: any) {
  if (!snapshot?.bible_snapshot || typeof snapshot.bible_snapshot !== 'object') return value(snapshot?.locked_description, 8_000);
  const baseline = snapshot.bible_snapshot;
  const baselineDetailCount = BIBLE_FIELDS.filter((field) => value(baseline[field])).length;
  if (baselineDetailCount < 3 && snapshot.locked_description) {
    if (!state || state.change_kind === 'return_to_baseline') return value(snapshot.locked_description, 8_000);
    const changedDetails = Object.values({ ...(state.appearance_override || {}), ...(state.outfit_snapshot || {}) }).filter((detail) => value(detail)).join('; ');
    return `${value(snapshot.locked_description, 6_500)}${changedDetails ? ` Current intentional appearance: ${value(changedDetails, 1_000)}.` : ''}${state.change_description ? ` ${value(state.change_description, 500)}.` : ''}`;
  }
  const overrides = state?.change_kind === 'return_to_baseline'
    ? {}
    : { ...(state?.appearance_override || {}), ...(state?.outfit_snapshot || {}) };
  const bible = { ...baseline, ...overrides };
  const identity = `${snapshot.age ? `${snapshot.age}-year-old ` : ''}${value(snapshot.species, 120) || value(snapshot.character_kind, 40) || 'character'}`.trim();
  const labels: Record<string, string> = {
    hair: 'Hair', eyes: 'Eyes', skin_or_surface: 'Skin, fur, scales, or surface', body_features: 'Body features',
    clothing: 'Clothing', clothing_colors: 'Clothing colors', shoes: 'Shoes', accessories: 'Accessories',
    wings: 'Wings', horns: 'Horns', tail: 'Tail', distinguishing_features: 'Distinguishing features', palette: 'Visual palette',
  };
  const details = BIBLE_FIELDS.map((field) => [labels[field], value(bible[field])] as const)
    .filter(([, detail]) => detail).map(([label, detail]) => `${label}: ${detail}.`);
  const constraints = value(bible.negative_constraints) ? `Do not change: ${value(bible.negative_constraints)}.` : '';
  const stateNote = state?.change_description ? `Intentional page-effective change: ${value(state.change_description, 1_000)}.` : '';
  return [`A ${identity}.`, snapshot.pronouns ? `Pronouns: ${value(snapshot.pronouns, 80)}.` : '', ...details, constraints, stateNote, 'Keep all other identity and appearance details consistent in every illustration.'].filter(Boolean).join(' ');
}

export async function snapshotStoryCharacters(client: SupabaseClient, storyId: string, pageNumber?: number) {
  const snapshotsResult = await client.from('story_characters').select('*').eq('story_id', storyId).order('display_order', { ascending: true });
  if (snapshotsResult.error) throw new AppError('DATABASE', 'Story character snapshots could not be loaded.', 500);
  const snapshots = snapshotsResult.data || [];
  if (!snapshots.length) return [];

  let statesQuery = client.from('story_character_states').select('*').eq('story_id', storyId).order('effective_page_number', { ascending: true });
  if (pageNumber) statesQuery = statesQuery.lte('effective_page_number', pageNumber);
  const statesResult = await statesQuery;
  if (statesResult.error) throw new AppError('DATABASE', 'Story character continuity could not be loaded.', 500);
  const latestState = new Map<string, any>();
  for (const state of statesResult.data || []) {
    const previous = latestState.get(state.story_character_id) || {};
    latestState.set(state.story_character_id, state.change_kind === 'return_to_baseline' ? state : {
      ...state,
      outfit_snapshot: { ...(previous.outfit_snapshot || {}), ...(state.outfit_snapshot || {}) },
      appearance_override: { ...(previous.appearance_override || {}), ...(state.appearance_override || {}) },
    });
  }

  return snapshots.map((snapshot: any) => ({
    key: snapshot.character_key,
    name: snapshot.name || '',
    description: snapshotDescription(snapshot, latestState.get(snapshot.id)),
  }));
}
