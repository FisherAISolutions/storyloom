import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { rejectOwnershipOverride, requireId, requireObject, toServiceError } from '@/services/errors';

const WORLD_FIELDS = ['story_id', 'main_setting', 'environment_type', 'architecture_landmarks', 'lighting_atmosphere', 'visual_palette', 'environmental_rules', 'negative_constraints', 'illustration_style_key', 'illustration_style_prompt'];
const LOCATION_FIELDS = ['story_id', 'location_key', 'name', 'environment_type', 'visual_description', 'environmental_rules', 'lighting_atmosphere', 'visual_palette', 'negative_constraints', 'is_main'];
const SCENE_FIELDS = ['story_page_id', 'story_id', 'location_id', 'scene_description', 'environment_state', 'continuity_notes', 'transition_kind', 'transition_description', 'characters_present', 'character_actions'];

function payload(input, fields, label) {
  requireObject(input, label);
  rejectOwnershipOverride(input);
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

export async function createWorld(input) {
  const value = payload(input, WORLD_FIELDS, 'Story World Bible');
  requireId(value.story_id, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('story_worlds').insert({ ...value, user_id: user.id }).select('*').single();
  if (error) throw toServiceError(error, 'Story World Bible creation');
  return data;
}

export async function upsertLocation(input) {
  const value = payload(input, LOCATION_FIELDS, 'Story location');
  requireId(value.story_id, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('story_locations')
    .upsert({ ...value, user_id: user.id }, { onConflict: 'story_id,location_key' }).select('*').single();
  if (error) throw toServiceError(error, 'Story location save');
  return data;
}

export async function listLocations(storyId) {
  const id = requireId(storyId, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('story_locations').select('*').eq('story_id', id).eq('user_id', user.id).order('created_at', { ascending: true });
  if (error) throw toServiceError(error, 'Story locations load');
  return data || [];
}

export async function createScene(input) {
  const value = payload(input, SCENE_FIELDS, 'Page scene');
  requireId(value.story_page_id, 'Story page ID'); requireId(value.story_id, 'Story ID'); requireId(value.location_id, 'Location ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('story_page_scenes').insert({ ...value, user_id: user.id }).select('*').single();
  if (error) throw toServiceError(error, 'Page scene creation');
  return data;
}
