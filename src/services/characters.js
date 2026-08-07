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

export const CHARACTER_COLUMNS = [
  'id', 'user_id', 'name', 'age', 'description', 'photo_path',
  'character_image_path', 'created_at', 'updated_at',
].join(',');

export const CHARACTER_WRITE_FIELDS = [
  'name', 'age', 'description', 'photo_path', 'character_image_path',
];

function characterPayload(input) {
  requireObject(input, 'Character input');
  rejectOwnershipOverride(input);
  return pickDefined(input, CHARACTER_WRITE_FIELDS);
}

export async function list() {
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('child_characters')
    .select(CHARACTER_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw toServiceError(error, 'Characters could not be loaded');
  return data || [];
}

export async function get(id) {
  const characterId = requireId(id, 'Character ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('child_characters')
    .select(CHARACTER_COLUMNS)
    .eq('id', characterId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw toServiceError(error, 'Character could not be loaded');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested character was not found.');
  return data;
}

export async function create(input) {
  const payload = characterPayload(input);
  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    throw new ServiceError('VALIDATION', 'Character name is required.');
  }
  if (payload.age !== undefined && payload.age !== null && !Number.isInteger(payload.age)) {
    throw new ServiceError('VALIDATION', 'Character age must be a whole number.');
  }

  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('child_characters')
    .insert({ ...payload, name: payload.name.trim(), user_id: user.id })
    .select(CHARACTER_COLUMNS)
    .single();

  if (error) throw toServiceError(error, 'Character creation');
  return data;
}

export async function update(id, input) {
  const characterId = requireId(id, 'Character ID');
  const payload = characterPayload(input);
  if (!Object.keys(payload).length) throw new ServiceError('VALIDATION', 'No character changes were provided.');
  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new ServiceError('VALIDATION', 'Character name cannot be empty.');
    }
    payload.name = payload.name.trim();
  }
  if (payload.age !== undefined && payload.age !== null && !Number.isInteger(payload.age)) {
    throw new ServiceError('VALIDATION', 'Character age must be a whole number.');
  }

  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('child_characters')
    .update(payload)
    .eq('id', characterId)
    .eq('user_id', user.id)
    .select(CHARACTER_COLUMNS)
    .maybeSingle();

  if (error) throw toServiceError(error, 'Character update');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested character was not found.');
  return data;
}

export async function remove(id) {
  const characterId = requireId(id, 'Character ID');
  const user = await requireAuthenticatedUser();
  const { data, error } = await getSupabaseClient()
    .from('child_characters')
    .delete()
    .eq('id', characterId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) throw toServiceError(error, 'Character deletion');
  if (!data) throw new ServiceError('NOT_FOUND', 'The requested character was not found.');
}
