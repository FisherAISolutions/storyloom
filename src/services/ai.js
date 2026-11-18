import { getSupabaseClient } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

const ERROR_CODES = new Set(['AUTH_REQUIRED', 'PERMISSION_DENIED', 'VALIDATION', 'AI_PROVIDER', 'AI_RESPONSE_INVALID', 'STORAGE', 'DATABASE', 'RATE_LIMIT', 'ENTITLEMENT_LIMIT', 'ENTITLEMENT_UNAVAILABLE']);

async function invokeAi(action, payload = {}) {
  const { data, error } = await getSupabaseClient().functions.invoke('story-ai', { body: { action, requestId: crypto.randomUUID(), ...payload } });
  if (error) {
    let details;
    try { details = await error.context?.json(); } catch {}
    const edgeCode = details?.error?.code;
    const gatewayCode = typeof details?.code === 'string' ? details.code : '';
    const gatewayAuthFailure = gatewayCode.startsWith('UNAUTHORIZED_') || details?.message === 'Invalid JWT' || details?.msg === 'Invalid JWT';
    const code = ERROR_CODES.has(edgeCode) ? edgeCode : gatewayAuthFailure ? 'AUTH_REQUIRED' : 'AI_PROVIDER';
    const message = details?.error?.message || (gatewayAuthFailure ? 'Your session could not be verified. Please sign in again.' : 'The AI request could not be completed.');
    throw new ServiceError(code, message);
  }
  if (!data?.data) throw new ServiceError('AI_RESPONSE_INVALID', 'The AI service returned an invalid response.');
  return data.data;
}

export const generateStory = (input) => invokeAi('generate-story', input);
export const analyzeCharacter = (characterId) => invokeAi('analyze-character', { characterId });
export const generateCharacterImage = (characterId) => invokeAi('generate-character-image', { characterId });
export const generatePageImage = (input) => invokeAi('generate-page-image', input);
export const suggestContinuation = (storyId) => invokeAi('suggest-continuation', { storyId });
export const continueStory = (storyId, pageCount, continuationPrompt) => invokeAi('continue-story', { storyId, pageCount, continuationPrompt });
export const translateStory = (storyId, language) => invokeAi('translate-story', { storyId, language });
export const generateCover = (storyId, prompt) => invokeAi('generate-cover', { storyId, prompt });
