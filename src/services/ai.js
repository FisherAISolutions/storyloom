import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

const ERROR_CODES = new Set(['AUTH_REQUIRED', 'PERMISSION_DENIED', 'VALIDATION', 'AI_PROVIDER', 'AI_RESPONSE_INVALID', 'STORAGE', 'DATABASE', 'RATE_LIMIT']);

async function invokeAi(action, payload = {}) {
  const { data, error } = await getSupabaseClient().functions.invoke('story-ai', { body: { action, ...payload } });
  if (error) {
    let details;
    try { details = await error.context?.json(); } catch {}
    const code = ERROR_CODES.has(details?.error?.code) ? details.error.code : 'AI_PROVIDER';
    throw new ServiceError(code, details?.error?.message || 'The AI request could not be completed.');
  }
  if (!data?.data) throw new ServiceError('AI_RESPONSE_INVALID', 'The AI service returned an invalid response.');
  return data.data;
}

export const generateStory = (input) => invokeAi('generate-story', input);
export const analyzeCharacter = (characterId) => invokeAi('analyze-character', { characterId });
export const generateCharacterImage = (characterId, description) => invokeAi('generate-character-image', { characterId, description });
export const generatePageImage = (input) => invokeAi('generate-page-image', input);
export const suggestContinuation = (storyId) => invokeAi('suggest-continuation', { storyId });
export const continueStory = (storyId, pageCount, continuationPrompt) => invokeAi('continue-story', { storyId, pageCount, continuationPrompt });
export const translateStory = (storyId, language) => invokeAi('translate-story', { storyId, language });
export const generateCover = (storyId, prompt) => invokeAi('generate-cover', { storyId, prompt });
