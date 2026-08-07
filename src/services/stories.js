import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import {
  ServiceError,
  pickDefined,
  rejectOwnershipOverride,
  requireId,
  requireObject,
  toServiceError,
} from '@/services/errors';

export const STORY_COLUMNS = [
  'id', 'user_id', 'title', 'summary', 'theme', 'art_style', 'status',
  'cover_image_path', 'child_character_id', 'secondary_characters',
  'translations', 'page_count', 'created_at', 'updated_at',
].join(',');

export const STORY_WRITE_FIELDS = [
  'title', 'summary', 'theme', 'art_style', 'status', 'cover_image_path',
  'child_character_id', 'secondary_characters', 'translations', 'page_count',
];

function storyPayload(input) {
  requireObject(input, 'Story input');
  rejectOwnershipOverride(input);
  return pickDefined(input, STORY_WRITE_FIELDS);
}

export async function list() {
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .select(STORY_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw toServiceError(error, 'Stories could not be loaded');
  return data || [];
}

export async function get(id) {
  const storyId = requireId(id, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .select(STORY_COLUMNS)
    .eq('id', storyId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw toServiceError(error, 'Story could not be loaded');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested story was not found.');
  return data;
}

export async function create(input) {
  const payload = storyPayload(input);
  if (typeof payload.title !== 'string' || !payload.title.trim()) {
    throw new ServiceError('VALIDATION', 'Story title is required.');
  }

  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .insert({ ...payload, title: payload.title.trim(), user_id: user.id })
    .select(STORY_COLUMNS)
    .single();

  if (error) throw toServiceError(error, 'Story creation');
  return data;
}

export async function update(id, input) {
  const storyId = requireId(id, 'Story ID');
  const payload = storyPayload(input);
  if (!Object.keys(payload).length) throw new ServiceError('VALIDATION', 'No story changes were provided.');
  if (payload.title !== undefined) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      throw new ServiceError('VALIDATION', 'Story title cannot be empty.');
    }
    payload.title = payload.title.trim();
  }

  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .update(payload)
    .eq('id', storyId)
    .eq('user_id', user.id)
    .select(STORY_COLUMNS)
    .maybeSingle();

  if (error) throw toServiceError(error, 'Story update');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested story was not found.');
  return data;
}

export async function remove(id) {
  const storyId = requireId(id, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('stories')
    .delete()
    .eq('id', storyId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) throw toServiceError(error, 'Story deletion');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested story was not found.');
}
