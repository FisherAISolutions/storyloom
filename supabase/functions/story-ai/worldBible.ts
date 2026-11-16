import { AppError } from './errors.ts';
import { LIMITS } from './config.ts';

const stringField = { type: 'string' };
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
  },
  required: ['text', 'illustration_scene', 'location_key', 'environment_state', 'continuity_notes', 'transition_kind', 'transition_description', 'characters_present', 'character_actions'],
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
    pages: { type: 'array', minItems: count, maxItems: count, items: pageSceneSchema },
  },
  required: ['title', 'summary', 'world', 'locations', 'pages'],
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
  const allowedCharacters = new Set(characterKeys);
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
    return {
      text: clean(page.text, LIMITS.TEXT, true), illustration_scene: clean(page.illustration_scene, LIMITS.PROMPT, true), location_key: locationKey,
      environment_state: clean(page.environment_state, 1_500), continuity_notes: clean(page.continuity_notes, 1_500),
      transition_kind: transitionKind, transition_description: clean(page.transition_description, 1_000),
      characters_present: present, character_actions: clean(page.character_actions, 1_500),
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
    locations: locations.map((location) => ({ ...location, is_main: location.location_key === mainLocationKey })), pages,
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
