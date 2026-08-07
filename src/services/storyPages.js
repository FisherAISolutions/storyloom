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

export const STORY_PAGE_COLUMNS = [
  'id', 'user_id', 'story_id', 'page_number', 'text', 'image_path', 'created_at', 'updated_at',
].join(',');

export const STORY_PAGE_WRITE_FIELDS = ['story_id', 'page_number', 'text', 'image_path'];

function pagePayload(input) {
  requireObject(input, 'Story page input');
  rejectOwnershipOverride(input);
  return pickDefined(input, STORY_PAGE_WRITE_FIELDS);
}

export async function listByStory(storyId) {
  const id = requireId(storyId, 'Story ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('story_pages')
    .select(STORY_PAGE_COLUMNS)
    .eq('story_id', id)
    .eq('user_id', user.id)
    .order('page_number', { ascending: true });

  if (error) throw toServiceError(error, 'Story pages could not be loaded');
  return data || [];
}

export async function create(input) {
  const payload = pagePayload(input);
  requireId(payload.story_id, 'Story ID');
  if (!Number.isInteger(payload.page_number) || payload.page_number <= 0) {
    throw new ServiceError('VALIDATION', 'Page number must be a positive integer.');
  }

  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('story_pages')
    .insert({ ...payload, user_id: user.id })
    .select(STORY_PAGE_COLUMNS)
    .single();

  if (error) throw toServiceError(error, 'Story page creation');
  return data;
}

export async function update(id, input) {
  const pageId = requireId(id, 'Story page ID');
  const payload = pagePayload(input);
  if (!Object.keys(payload).length) throw new ServiceError('VALIDATION', 'No page changes were provided.');
  if (payload.page_number !== undefined && (!Number.isInteger(payload.page_number) || payload.page_number <= 0)) {
    throw new ServiceError('VALIDATION', 'Page number must be a positive integer.');
  }

  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('story_pages')
    .update(payload)
    .eq('id', pageId)
    .eq('user_id', user.id)
    .select(STORY_PAGE_COLUMNS)
    .maybeSingle();

  if (error) throw toServiceError(error, 'Story page update');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested story page was not found.');
  return data;
}

export async function remove(id) {
  const pageId = requireId(id, 'Story page ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('story_pages')
    .delete()
    .eq('id', pageId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) throw toServiceError(error, 'Story page deletion');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested story page was not found.');
}
