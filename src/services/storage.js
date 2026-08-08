import { getSupabaseClient } from '@/lib/supabase';
import { requireAuthenticatedUser } from '@/services/auth';
import { ServiceError, requireId, toServiceError } from '@/services/errors';

export const STORAGE_BUCKETS = Object.freeze({
  CHARACTER_PHOTOS: 'character-photos',
  CHARACTER_IMAGES: 'character-images',
  STORY_IMAGES: 'story-images',
});

const ALLOWED_BUCKETS = new Set(Object.values(STORAGE_BUCKETS));
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const CACHE_SAFETY_WINDOW_MS = 30_000;
const signedUrlCache = new Map();
const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

function matchesImageSignature(bytes, type) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (type === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

function requireBucket(bucket) {
  if (!ALLOWED_BUCKETS.has(bucket)) {
    throw new ServiceError('VALIDATION', 'Unsupported storage bucket.');
  }
  return bucket;
}

function requireOwnedPath(path, userId) {
  const normalized = requireId(path, 'Storage path').replace(/^\/+/, '');
  const segments = normalized.split('/');
  if (
    segments.length < 3
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
    || normalized.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new ServiceError('VALIDATION', 'Storage path is malformed.');
  }
  if (segments[0] !== userId) {
    throw new ServiceError('PERMISSION_DENIED', 'The storage path is outside your private namespace.');
  }
  return normalized;
}

/** Clear private URL state on logout or authenticated-user changes in Phase 4. */
export function clearSignedUrlCache() {
  signedUrlCache.clear();
}

export async function getSignedUrl(bucket, path, expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const safeBucket = requireBucket(bucket);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 3600) {
    throw new ServiceError('VALIDATION', 'Signed URL lifetime must be between 60 and 3600 seconds.');
  }

  const user = await requireAuthenticatedUser();
  const safePath = requireOwnedPath(path, user.id);
  const cacheKey = `${user.id}:${safeBucket}:${safePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await getSupabaseClient()
    .storage
    .from(safeBucket)
    .createSignedUrl(safePath, expiresIn);

  if (error || !data?.signedUrl) throw toServiceError(error, 'Signed URL creation', { storage: true });

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + expiresIn * 1000 - CACHE_SAFETY_WINDOW_MS,
  });
  return data.signedUrl;
}

export async function download(bucket, path) {
  const safeBucket = requireBucket(bucket);
  const user = await requireAuthenticatedUser();
  const safePath = requireOwnedPath(path, user.id);
  const { data, error } = await getSupabaseClient().storage.from(safeBucket).download(safePath);
  if (error) throw toServiceError(error, 'File download', { storage: true });
  return data;
}

export async function upload(bucket, path, file, options = {}) {
  const safeBucket = requireBucket(bucket);
  const user = await requireAuthenticatedUser();
  const safePath = requireOwnedPath(path, user.id);
  if (!file) throw new ServiceError('VALIDATION', 'A file is required.');

  const { data, error } = await getSupabaseClient().storage.from(safeBucket).upload(safePath, file, {
    cacheControl: options.cacheControl || '3600',
    contentType: options.contentType,
    upsert: options.upsert === true,
  });
  if (error) throw toServiceError(error, 'File upload', { storage: true });
  signedUrlCache.delete(`${user.id}:${safeBucket}:${safePath}`);
  return data.path;
}

export async function remove(bucket, path) {
  const safeBucket = requireBucket(bucket);
  const user = await requireAuthenticatedUser();
  const safePath = requireOwnedPath(path, user.id);
  const { data, error } = await getSupabaseClient().storage.from(safeBucket).remove([safePath]);
  if (error) throw toServiceError(error, 'File removal', { storage: true });
  signedUrlCache.delete(`${user.id}:${safeBucket}:${safePath}`);
  return data;
}

function requireImageType(type) {
  const extension = IMAGE_EXTENSIONS[type?.toLowerCase()];
  if (!extension) throw new ServiceError('VALIDATION', 'Only JPEG, PNG, and WebP images are supported.');
  return extension;
}

async function ownedImagePath(suffix, type) {
  const user = await requireAuthenticatedUser();
  return `${user.id}/${suffix}.${requireImageType(type)}`;
}

export async function uploadCharacterPhoto(characterId, file) {
  const id = requireId(characterId, 'Character ID');
  if (!file) throw new ServiceError('VALIDATION', 'A photo is required.');
  requireImageType(file.type);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new ServiceError('VALIDATION', 'The photo must be no larger than 10 MB.');
  }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesImageSignature(header, file.type.toLowerCase())) {
    throw new ServiceError('VALIDATION', 'The photo contents do not match its image type.');
  }
  const path = await ownedImagePath(`${id}/original`, file.type);
  return upload(STORAGE_BUCKETS.CHARACTER_PHOTOS, path, file, { contentType: file.type, upsert: true });
}

export const getCharacterPhotoUrl = (path, expiresIn) =>
  getSignedUrl(STORAGE_BUCKETS.CHARACTER_PHOTOS, path, expiresIn);

export const getCharacterImageUrl = (path, expiresIn) =>
  getSignedUrl(STORAGE_BUCKETS.CHARACTER_IMAGES, path, expiresIn);

export const getStoryImageUrl = (path, expiresIn) =>
  getSignedUrl(STORAGE_BUCKETS.STORY_IMAGES, path, expiresIn);
