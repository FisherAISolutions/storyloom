import { AppError } from './errors.ts';
import { LIMITS } from './config.ts';

const stringField = { type: 'string' };
const outfitChangeSchema = {
  type: 'object',
  properties: { clothing: stringField, clothing_colors: stringField, shoes: stringField, accessories: stringField },
  required: ['clothing', 'clothing_colors', 'shoes', 'accessories'], additionalProperties: false,
};
const appearanceChangeSchema = {
  type: 'object',
  properties: { hair: stringField, eyes: stringField, skin_or_surface: stringField, body_features: stringField, wings: stringField, horns: stringField, tail: stringField, distinguishing_features: stringField, palette: stringField },
  required: ['hair', 'eyes', 'skin_or_surface', 'body_features', 'wings', 'horns', 'tail', 'distinguishing_features', 'palette'], additionalProperties: false,
};
const fullBibleSchema = {
  type: 'object',
  properties: { ...appearanceChangeSchema.properties, ...outfitChangeSchema.properties, negative_constraints: stringField },
  required: [...appearanceChangeSchema.required, ...outfitChangeSchema.required, 'negative_constraints'], additionalProperties: false,
};
const generatedCharacterSchema = {
  type: 'object',
  properties: {
    character_key: stringField, name: stringField,
    character_kind: { type: 'string', enum: ['human', 'animal', 'mythical'] },
    species: stringField, pronouns: stringField, appearance_bible: fullBibleSchema,
  },
  required: ['character_key', 'name', 'character_kind', 'species', 'pronouns', 'appearance_bible'], additionalProperties: false,
};
const characterChangeSchema = {
  type: 'object',
  properties: {
    character_key: stringField,
    change_kind: { type: 'string', enum: ['outfit_change', 'transformation', 'return_to_baseline'] },
    outfit_snapshot: outfitChangeSchema, appearance_override: appearanceChangeSchema, change_description: stringField,
  },
  required: ['character_key', 'change_kind', 'outfit_snapshot', 'appearance_override', 'change_description'],
  additionalProperties: false,
};
const locationSchema = {
  type: 'object',
  properties: {
    location_key: stringField, name: stringField, environment_type: stringField,
    visual_description: stringField, environmental_rules: stringField,
    lighting_atmosphere: stringField, visual_palette: stringField, negative_constraints: stringField,
    is_main: { type: 'boolean' },
  },
  required: ['location_key', 'name', 'environment_type', 'visual_description', 'environmental_rules', 'lighting_atmosphere', 'visual_palette', 'negative_constraints', 'is_main'],
  additionalProperties: false,
};
const pageSceneSchema = {
  type: 'object',
  properties: {
    text: stringField, illustration_scene: stringField, location_key: stringField,
    environment_state: stringField, continuity_notes: stringField,
    transition_kind: { type: 'string', enum: ['stay', 'enter', 'exit', 'travel', 'transform'] },
    transition_description: stringField,
    characters_present: { type: 'array', maxItems: 3, items: stringField },
    character_actions: stringField,
    character_changes: { type: 'array', maxItems: 3, items: characterChangeSchema },
  },
  required: ['text', 'illustration_scene', 'location_key', 'environment_state', 'continuity_notes', 'transition_kind', 'transition_description', 'characters_present', 'character_actions', 'character_changes'],
  additionalProperties: false,
};

export const storyPackageSchema = (count: number) => ({
  type: 'object',
  properties: {
    title: stringField, summary: stringField,
    world: {
      type: 'object',
      properties: {
        main_setting: stringField, environment_type: stringField, main_location_key: stringField,
        architecture_landmarks: stringField, lighting_atmosphere: stringField, visual_palette: stringField,
        environmental_rules: stringField, negative_constraints: stringField,
      },
      required: ['main_setting', 'environment_type', 'main_location_key', 'architecture_landmarks', 'lighting_atmosphere', 'visual_palette', 'environmental_rules', 'negative_constraints'],
      additionalProperties: false,
    },
    locations: { type: 'array', minItems: 1, maxItems: 12, items: locationSchema },
    generated_characters: { type: 'array', maxItems: 3, items: generatedCharacterSchema },
    pages: { type: 'array', minItems: count, maxItems: count, items: pageSceneSchema },
  },
  required: ['title', 'summary', 'world', 'locations', 'generated_characters', 'pages'],
  additionalProperties: false,
});

export const continuationPackageSchema = (count: number) => ({
  type: 'object',
  properties: {
    locations: { type: 'array', maxItems: 8, items: locationSchema },
    pages: { type: 'array', minItems: count, maxItems: count, items: pageSceneSchema },
  },
  required: ['locations', 'pages'],
  additionalProperties: false,
});

const clean = (value: unknown, max: number, required = false) => {
  const result = typeof value === 'string' ? value.trim().slice(0, max) : '';
  if (required && !result) throw new AppError('AI_RESPONSE_INVALID', 'The AI response contained incomplete world or scene details.', 502);
  return result;
};

function normalizeLocation(value: any) {
  const locationKey = clean(value?.location_key, 64, true).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(locationKey)) throw new AppError('AI_RESPONSE_INVALID', 'The AI response contained an invalid location key.', 502);
  return {
    location_key: locationKey, name: clean(value.name, 160, true), environment_type: clean(value.environment_type, 120, true),
    visual_description: clean(value.visual_description, 2_000, true), environmental_rules: clean(value.environmental_rules, 1_500),
    lighting_atmosphere: clean(value.lighting_atmosphere, 1_000), visual_palette: clean(value.visual_palette, 500),
    negative_constraints: clean(value.negative_constraints, 1_000), is_main: value.is_main === true,
  };
}

export function normalizeStoryPackage(value: any, count: number, characterKeys: string[], existingLocationKeys: string[] = [], requireWorld = true) {
  if (!value || !Array.isArray(value.pages) || value.pages.length !== count || !Array.isArray(value.locations)) throw new AppError('AI_RESPONSE_INVALID', 'The AI response did not contain the requested story package.', 502);
  const locations = value.locations.map(normalizeLocation);
  const locationKeys = new Set(existingLocationKeys);
  for (const location of locations) {
    if (locationKeys.has(location.location_key) && !existingLocationKeys.includes(location.location_key)) throw new AppError('AI_RESPONSE_INVALID', 'The AI response repeated a location key.', 502);
    locationKeys.add(location.location_key);
  }
  const generatedCharacters = requireWorld && Array.isArray(value.generated_characters) ? value.generated_characters.slice(0, 3).map((character: any, index: number) => {
    const characterKey = clean(character?.character_key, 74, true).toLowerCase();
    if (!/^generated:[a-z0-9_-]{1,64}$/.test(characterKey)) throw new AppError('AI_RESPONSE_INVALID', 'A generated character key is invalid.', 502);
    const kind = ['human', 'animal', 'mythical'].includes(character?.character_kind) ? character.character_kind : 'mythical';
    const fields = ['hair', 'eyes', 'skin_or_surface', 'body_features', 'clothing', 'clothing_colors', 'shoes', 'accessories', 'wings', 'horns', 'tail', 'distinguishing_features', 'palette', 'negative_constraints'];
    return {
      character_key: characterKey || `generated:${index + 1}`, name: clean(character.name, 160), character_kind: kind,
      species: clean(character.species, 120, true), pronouns: clean(character.pronouns, 80),
      appearance_bible: Object.fromEntries(fields.map((field) => [field, clean(character.appearance_bible?.[field], 500)]).filter(([, detail]) => detail)),
    };
  }) : [];
  if (characterKeys.length + generatedCharacters.length > LIMITS.CHARACTERS) throw new AppError('AI_RESPONSE_INVALID', 'The story contains too many recurring characters.', 502);
  const allowedCharacters = new Set([...characterKeys, ...generatedCharacters.map((character: any) => character.character_key)]);
  if (allowedCharacters.size !== characterKeys.length + generatedCharacters.length) throw new AppError('AI_RESPONSE_INVALID', 'The story contains duplicate character keys.', 502);
  let previousLocation = existingLocationKeys.at(-1) || '';
  const pages = value.pages.map((page: any) => {
    const locationKey = clean(page?.location_key, 64, true).toLowerCase();
    if (!locationKeys.has(locationKey)) throw new AppError('AI_RESPONSE_INVALID', 'A story page referenced an unknown location.', 502);
    let transitionKind = ['stay', 'enter', 'exit', 'travel', 'transform'].includes(page.transition_kind) ? page.transition_kind : 'stay';
    if (!previousLocation) transitionKind = transitionKind === 'stay' ? 'enter' : transitionKind;
    else if (previousLocation !== locationKey && transitionKind === 'stay') transitionKind = 'travel';
    else if (previousLocation === locationKey && ['enter', 'exit', 'travel'].includes(transitionKind)) transitionKind = 'stay';
    previousLocation = locationKey;
    const present = Array.isArray(page.characters_present) ? page.characters_present.filter((key: unknown) => typeof key === 'string' && allowedCharacters.has(key)).slice(0, 3) : [];
    const changedCharacters = new Set<string>();
    const characterChanges = Array.isArray(page.character_changes) ? page.character_changes
      .filter((change: any) => {
        if (!allowedCharacters.has(change?.character_key) || changedCharacters.has(change.character_key) || !['outfit_change', 'transformation', 'return_to_baseline'].includes(change?.change_kind)) return false;
        changedCharacters.add(change.character_key); return true;
      })
      .slice(0, 3).map((change: any) => ({
        character_key: change.character_key,
        change_kind: change.change_kind,
        outfit_snapshot: Object.fromEntries(['clothing', 'clothing_colors', 'shoes', 'accessories'].map((field) => [field, clean(change.outfit_snapshot?.[field], 500)]).filter(([, detail]) => detail)),
        appearance_override: Object.fromEntries(['hair', 'eyes', 'skin_or_surface', 'body_features', 'wings', 'horns', 'tail', 'distinguishing_features', 'palette'].map((field) => [field, clean(change.appearance_override?.[field], 500)]).filter(([, detail]) => detail)),
        change_description: clean(change.change_description, 1_000, true),
      })) : [];
    return {
      text: clean(page.text, LIMITS.TEXT, true), illustration_scene: clean(page.illustration_scene, LIMITS.PROMPT, true), location_key: locationKey,
      environment_state: clean(page.environment_state, 1_500), continuity_notes: clean(page.continuity_notes, 1_500),
      transition_kind: transitionKind, transition_description: clean(page.transition_description, 1_000),
      characters_present: present, character_actions: clean(page.character_actions, 1_500), character_changes: characterChanges,
    };
  });
  if (!requireWorld) return { locations, pages };
  const world = value.world;
  if (!world || typeof world !== 'object') throw new AppError('AI_RESPONSE_INVALID', 'The AI response did not contain a Story World Bible.', 502);
  const mainLocationKey = clean(world.main_location_key, 64, true).toLowerCase();
  if (!locationKeys.has(mainLocationKey)) throw new AppError('AI_RESPONSE_INVALID', 'The Story World Bible main location is invalid.', 502);
  return {
    title: clean(value.title, 300, true), summary: clean(value.summary, LIMITS.SUMMARY),
    world: {
      main_setting: clean(world.main_setting, 1_000, true), environment_type: clean(world.environment_type, 120, true), main_location_key: mainLocationKey,
      architecture_landmarks: clean(world.architecture_landmarks, 2_000), lighting_atmosphere: clean(world.lighting_atmosphere, 1_000),
      visual_palette: clean(world.visual_palette, 500), environmental_rules: clean(world.environmental_rules, 2_000), negative_constraints: clean(world.negative_constraints, 1_000),
    },
    locations: locations.map((location) => ({ ...location, is_main: location.location_key === mainLocationKey })), generated_characters: generatedCharacters, pages,
  };
}

export function worldIllustrationBlock(context: any) {
  if (!context?.location) return '';
  const location = context.location; const scene = context.scene || {};
  const world = context.world || {
    main_setting: location.name, environment_type: location.environment_type,
    architecture_landmarks: location.visual_description, lighting_atmosphere: location.lighting_atmosphere,
    visual_palette: location.visual_palette, environmental_rules: location.environmental_rules,
    negative_constraints: location.negative_constraints,
  };
  return `STORY WORLD CONTINUITY:\nMain world: ${world.main_setting}.\nGlobal environment: ${world.environment_type}.\nArchitecture and landmarks: ${world.architecture_landmarks || 'Follow the established story world.'}\nGlobal lighting and atmosphere: ${world.lighting_atmosphere || 'Keep the established atmosphere.'}\nGlobal palette: ${world.visual_palette || 'Keep the established palette.'}\nPersistent environmental rules: ${world.environmental_rules || 'Preserve established environmental logic.'}\nGlobal exclusions: ${world.negative_constraints || 'None specified.'}\n\nCURRENT PAGE LOCATION (authoritative): ${location.name} — ${location.visual_description}\nLocation environment: ${location.environment_type}.\nLocation rules: ${location.environmental_rules || 'Follow the location description.'}\nLocation lighting: ${location.lighting_atmosphere || world.lighting_atmosphere || ''}\nLocation palette: ${location.visual_palette || world.visual_palette || ''}\nLocation exclusions: ${location.negative_constraints || 'None specified.'}\nCurrent environment state: ${scene.environment_state || 'Continue the established state.'}\nContinuity from the previous page: ${scene.continuity_notes || 'Maintain visual continuity.'}\nTransition: ${scene.transition_kind || 'stay'}${scene.transition_description ? ` — ${scene.transition_description}` : ''}.\nDo not force the main setting when the current location explicitly represents an intentional transition elsewhere.`;
}
