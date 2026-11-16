import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { rejectOwnershipOverride, requireId, requireObject, toServiceError } from '@/services/errors';

const SNAPSHOT_FIELDS = [
  'story_id', 'source_character_id', 'character_key', 'name', 'role', 'display_order',
  'age', 'character_kind', 'species', 'pronouns', 'bible_snapshot',
  'locked_description', 'appearance_locked', 'source_bible_version',
];
const STATE_FIELDS = [
  'story_id', 'story_character_id', 'effective_page_number', 'change_kind',
  'outfit_snapshot', 'appearance_override', 'change_description',
];

function payload(input, fields, label) {
  requireObject(input, label);
  rejectOwnershipOverride(input);
  return Object.fromEntries(fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
}

export async function createSnapshots(inputs) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 3) return [];
  const user = await requireAuthenticatedUser();
  const values = inputs.map((input) => {
    const value = payload(input, SNAPSHOT_FIELDS, 'Story character snapshot');
    requireId(value.story_id, 'Story ID');
    if (value.source_character_id) requireId(value.source_character_id, 'Source character ID');
    return { ...value, user_id: user.id };
  });
  const { data, error } = await getSupabaseClient().from('story_characters').insert(values).select('*').order('display_order');
  if (error) throw toServiceError(error, 'Story character snapshot creation');
  return data || [];
}

export async function listSnapshots(storyId) {
  const id = requireId(storyId, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('story_characters').select('*').eq('story_id', id).eq('user_id', user.id).order('display_order');
  if (error) throw toServiceError(error, 'Story character snapshots load');
  return data || [];
}

export async function createState(input) {
  const value = payload(input, STATE_FIELDS, 'Story character state');
  requireId(value.story_id, 'Story ID');
  requireId(value.story_character_id, 'Story character ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('story_character_states').insert({ ...value, user_id: user.id }).select('*').single();
  if (error) throw toServiceError(error, 'Story character state creation');
  return data;
}
