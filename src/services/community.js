import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { ServiceError, toServiceError } from '@/services/errors';

export async function listPublished(limit = 6, offset = 0) {
  const { data, error } = await getSupabaseClient().functions.invoke('community-public', { body: { action: 'list', limit, offset } });
  if (error) throw new ServiceError('DATABASE', 'Community stories could not be loaded.');
  return data?.data || [];
}
export async function getPublished(slug) {
  const { data, error } = await getSupabaseClient().functions.invoke('community-public', { body: { action: 'get', slug } });
  if (error || !data?.data) throw new ServiceError('NOT_FOUND', 'This community story is unavailable.');
  return data.data;
}
export async function getOwnerState(storyId) {
  await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('community_stories').select('id,status,public_slug,featured').eq('story_id', storyId).maybeSingle();
  if (error) throw toServiceError(error, 'Community sharing state');
  return data;
}
export async function share(storyId) {
  const user = await requireAuthenticatedUser();
  const existing = await getOwnerState(storyId);
  const query = existing
    ? getSupabaseClient().from('community_stories').update({ status: 'published' }).eq('id', existing.id)
    : getSupabaseClient().from('community_stories').insert({ story_id: storyId, user_id: user.id, status: 'published' });
  const { data, error } = await query.select('id,status,public_slug,featured').single();
  if (error) throw toServiceError(error, 'Community sharing');
  return data;
}
export async function unpublish(id) {
  await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('community_stories').update({ status: 'removed' }).eq('id', id).select('id,status,public_slug,featured').single();
  if (error) throw toServiceError(error, 'Community unpublishing');
  return data;
}
export async function listAdmin() {
  await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('community_stories').select('id,status,public_slug,featured,shared_at,stories(title)').order('created_at', { ascending: false }).limit(100);
  if (error) throw toServiceError(error, 'Community moderation');
  return data || [];
}
export async function moderate(id, input) {
  await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient().from('community_stories').update(input).eq('id', id).select('id,status,public_slug,featured').single();
  if (error) throw toServiceError(error, 'Community moderation');
  return data;
}
