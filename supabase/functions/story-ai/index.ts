import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.109.0';
import { ART_STYLE_PROMPTS, CONTINUATION_PAGE_COUNTS, LANGUAGE_NAMES, LIMITS, MODELS, STORY_PAGE_COUNTS } from './config.ts';
import { AppError, jsonResponse, safeError } from './errors.ts';
import { generateImage, structured } from './openai.ts';
import { characterAnalysisPrompt, characterImagePrompt, continuationPrompt, continuationSuggestionPrompt, pageImagePrompt, storyPrompt, translationPrompt } from './prompts.ts';
import { artStyle, characterInputs, integerIn, object, text, uuid } from './validation.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const rateWindows = new Map<string, { start: number; count: number }>();

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin');
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim()).filter(Boolean);
  if (origin && !configured.includes(origin)) throw new AppError('PERMISSION_DENIED', 'This origin is not allowed.', 403);
  return { 'Access-Control-Allow-Origin': origin || configured[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}

async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new AppError('AUTH_REQUIRED', 'Authentication is required.', 401);
  const token = authorization.slice(7);
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new AppError('AUTH_REQUIRED', 'Authentication is required.', 401);
  return { user: data.user, client };
}

function rateLimit(userId: string, action: string) {
  const now = Date.now(); const key = `${userId}:${action}`; const current = rateWindows.get(key);
  const limit = action.includes('image') || action === 'generate-cover' ? 6 : 20;
  if (!current || now - current.start >= 60_000) { rateWindows.set(key, { start: now, count: 1 }); return; }
  if (current.count >= limit) throw new AppError('RATE_LIMIT', 'Too many AI requests. Please try again shortly.', 429);
  current.count += 1;
}

// Future Stripe/webhook-maintained entitlements and billing-period quotas plug in here.
async function assertAiEntitlement(_input: { userId: string; operation: string; requestedPageCount?: number }) { return; }

async function ownedStory(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('stories').select('id,title,summary,theme,art_style,child_character_id,secondary_characters,page_count').eq('id', id).maybeSingle();
  if (error) throw new AppError('DATABASE', 'The story could not be loaded.', 500);
  if (!data) throw new AppError('PERMISSION_DENIED', 'The story is unavailable.', 403);
  artStyle(data.art_style);
  return data;
}
async function ownedCharacter(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('child_characters').select('id,name,description,photo_path,character_image_path').eq('id', id).maybeSingle();
  if (error) throw new AppError('DATABASE', 'The character could not be loaded.', 500);
  if (!data) throw new AppError('PERMISSION_DENIED', 'The character is unavailable.', 403);
  return data;
}
async function storyCharacters(client: SupabaseClient, story: Record<string, any>) {
  const result: Array<{ name: string; description: string }> = []; const seen = new Set<string>();
  const ids = [story.child_character_id, ...(Array.isArray(story.secondary_characters) ? story.secondary_characters.map((item: any) => item?.character_id) : [])].filter(Boolean);
  for (const id of ids) if (!seen.has(id)) { const character = await ownedCharacter(client, id); result.push({ name: character.name || '', description: character.description || '' }); seen.add(id); }
  for (const item of Array.isArray(story.secondary_characters) ? story.secondary_characters : []) if (item?.quick_description) result.push({ name: '', description: String(item.quick_description).slice(0, 1_500) });
  if (result.length > LIMITS.CHARACTERS) throw new AppError('VALIDATION', 'The story has too many characters.');
  return result;
}
async function storyPages(client: SupabaseClient, storyId: string) {
  const { data, error } = await client.from('story_pages').select('page_number,text').eq('story_id', storyId).order('page_number', { ascending: true });
  if (error) throw new AppError('DATABASE', 'Story pages could not be loaded.', 500);
  return data || [];
}
async function privatePhoto(client: SupabaseClient, userId: string, character: Record<string, any>) {
  if (typeof character.photo_path !== 'string' || !character.photo_path.startsWith(`${userId}/${character.id}/`)) throw new AppError('PERMISSION_DENIED', 'The character photo is unavailable.', 403);
  const { data, error } = await client.storage.from('character-photos').download(character.photo_path);
  if (error || !data) throw new AppError('STORAGE', 'The character photo could not be downloaded.', 500);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.type) || data.size > 10 * 1024 * 1024) throw new AppError('VALIDATION', 'The character photo format is invalid.');
  return data;
}
async function uploadImage(client: SupabaseClient, bucket: string, path: string, blob: Blob) {
  const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: 'image/png', cacheControl: '3600', upsert: true });
  if (error) throw new AppError('STORAGE', 'The generated image could not be stored.', 500);
  return path;
}
async function usage(userId: string, operation: string, storyId: string | null, model: string, success: boolean, providerUsage: any = {}, imageCount: number | null = null) {
  try { await service.from('ai_usage').insert({ user_id: userId, operation, story_id: storyId, model, success, input_tokens: providerUsage.input_tokens ?? null, output_tokens: providerUsage.output_tokens ?? null, image_count: imageCount }); } catch { console.error('ai_usage insert failed', operation); }
}

const pageSchema = (count: number) => ({ type: 'object', properties: { pages: { type: 'array', minItems: count, maxItems: count, items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } } }, required: ['pages'], additionalProperties: false });
function validatePages(value: any, count: number) {
  if (!value || !Array.isArray(value.pages) || value.pages.length !== count || value.pages.some((page: any) => typeof page?.text !== 'string' || !page.text.trim() || page.text.length > LIMITS.TEXT)) throw new AppError('AI_RESPONSE_INVALID', 'The AI response did not contain the requested pages.', 502);
  return value;
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {}; let userId = ''; let action = ''; let storyId: string | null = null;
  try {
    headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new AppError('VALIDATION', 'Only POST requests are supported.', 405);
    const auth = await authenticate(request); userId = auth.user.id;
    let requestBody: unknown;
    try { requestBody = await request.json(); } catch { throw new AppError('VALIDATION', 'Request body must be valid JSON.'); }
    const body = object(requestBody); action = text(body.action, 'Action', 64); rateLimit(userId, action);
    const client = auth.client;
    if (action === 'generate-story') {
      const pageCount = integerIn(body.pageCount, STORY_PAGE_COUNTS, 'Page count'); const premise = text(body.prompt, 'Story premise', LIMITS.PROMPT); const theme = text(body.theme, 'Theme', 200); const characters = characterInputs(body.characters || []);
      await assertAiEntitlement({ userId, operation: action, requestedPageCount: pageCount });
      const schema = { type: 'object', properties: { title: { type: 'string' }, summary: { type: 'string' }, ...pageSchema(pageCount).properties }, required: ['title', 'summary', 'pages'], additionalProperties: false };
      const result = await structured(storyPrompt(premise, theme, characters, pageCount), 'story', schema); const value: any = validatePages(result.value, pageCount);
      if (typeof value.title !== 'string' || !value.title.trim() || typeof value.summary !== 'string') throw new AppError('AI_RESPONSE_INVALID', 'The generated story is invalid.', 502);
      await usage(userId, action, null, result.model, true, result.usage); return jsonResponse({ data: value }, 200, headers);
    }
    storyId = typeof body.storyId === 'string' ? uuid(body.storyId, 'Story ID') : null;
    if (action === 'analyze-character' || action === 'generate-character-image') {
      const characterId = uuid(body.characterId, 'Character ID'); const character = await ownedCharacter(client, characterId); const photo = await privatePhoto(client, userId, character);
      await assertAiEntitlement({ userId, operation: action });
      if (action === 'analyze-character') {
        const schema = { type: 'object', properties: { description: { type: 'string' } }, required: ['description'], additionalProperties: false };
        const result = await structured(characterAnalysisPrompt, 'character_description', schema, photo); const value: any = result.value;
        if (typeof value.description !== 'string' || !value.description.trim() || value.description.length > 2_000) throw new AppError('AI_RESPONSE_INVALID', 'The character description is invalid.', 502);
        await usage(userId, action, null, result.model, true, result.usage); return jsonResponse({ data: { description: value.description.trim() } }, 200, headers);
      }
      const description = text(body.description, 'Character description', 2_000); const result = await generateImage(characterImagePrompt(description), photo); const path = `${userId}/${characterId}/portrait.png`;
      await uploadImage(client, 'character-images', path, result.blob); await usage(userId, action, null, result.model, true, result.usage, 1); return jsonResponse({ data: { character_image_path: path } }, 200, headers);
    }
    if (!storyId) throw new AppError('VALIDATION', 'Story ID is required.');
    const story = await ownedStory(client, storyId); await assertAiEntitlement({ userId, operation: action, requestedPageCount: typeof body.pageCount === 'number' ? body.pageCount : undefined });
    if (action === 'generate-page-image') {
      const pageNumber = body.pageNumber; if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 25) throw new AppError('VALIDATION', 'Page number is invalid.');
      const scene = text(body.text, 'Page text', LIMITS.TEXT); const characters = await storyCharacters(client, story); const result = await generateImage(pageImagePrompt(scene, story.theme || '', characters, story.art_style)); const path = `${userId}/${storyId}/pages/${String(pageNumber).padStart(3, '0')}.png`;
      await uploadImage(client, 'story-images', path, result.blob); await usage(userId, action, storyId, result.model, true, result.usage, 1); return jsonResponse({ data: { image_path: path } }, 200, headers);
    }
    if (action === 'suggest-continuation') {
      const pages = await storyPages(client, storyId); const prompt = continuationSuggestionPrompt(story.title, story.summary || '', pages.slice(-2).map((page) => page.text || ''));
      const schema = { type: 'object', properties: { suggestion: { type: 'string' } }, required: ['suggestion'], additionalProperties: false }; const result = await structured(prompt, 'continuation_suggestion', schema); const value: any = result.value;
      if (typeof value.suggestion !== 'string' || !value.suggestion.trim() || value.suggestion.length > 2_000) throw new AppError('AI_RESPONSE_INVALID', 'The continuation suggestion is invalid.', 502);
      await usage(userId, action, storyId, result.model, true, result.usage); return jsonResponse({ data: { suggestion: value.suggestion.trim() } }, 200, headers);
    }
    if (action === 'continue-story') {
      const count = integerIn(body.pageCount, CONTINUATION_PAGE_COUNTS, 'Continuation page count'); const premise = text(body.continuationPrompt, 'Continuation premise', LIMITS.PROMPT); const characters = await storyCharacters(client, story);
      const result = await structured(continuationPrompt(story.title, story.summary || '', characters, count, premise), 'continuation', pageSchema(count)); const value = validatePages(result.value, count);
      await usage(userId, action, storyId, result.model, true, result.usage); return jsonResponse({ data: value }, 200, headers);
    }
    if (action === 'translate-story') {
      const language = text(body.language, 'Language', 8); if (!LANGUAGE_NAMES[language]) throw new AppError('VALIDATION', 'Language is not supported.'); const pages = await storyPages(client, storyId);
      if (!pages.length || pages.length > LIMITS.TRANSLATION_PAGES) throw new AppError('VALIDATION', 'The story page count cannot be translated.'); const texts = pages.map((page) => text(page.text, 'Page text', LIMITS.TEXT));
      const schema = { type: 'object', properties: { translations: { type: 'array', minItems: texts.length, maxItems: texts.length, items: { type: 'string' } } }, required: ['translations'], additionalProperties: false }; const result = await structured(translationPrompt(texts, language), 'translations', schema); const value: any = result.value;
      if (!Array.isArray(value.translations) || value.translations.length !== texts.length || value.translations.some((item: unknown) => typeof item !== 'string' || !item.trim())) throw new AppError('AI_RESPONSE_INVALID', 'The translations are invalid.', 502);
      await usage(userId, action, storyId, result.model, true, result.usage); return jsonResponse({ data: { translations: value.translations } }, 200, headers);
    }
    if (action === 'generate-cover') {
      const prompt = text(body.prompt, 'Cover prompt', LIMITS.PROMPT); if (!ART_STYLE_PROMPTS[story.art_style]) throw new AppError('VALIDATION', 'Art style is not supported.'); const result = await generateImage(prompt); const path = `${userId}/${storyId}/cover.png`;
      await uploadImage(client, 'story-images', path, result.blob); await usage(userId, action, storyId, result.model, true, result.usage, 1); return jsonResponse({ data: { cover_image_path: path } }, 200, headers);
    }
    throw new AppError('VALIDATION', 'Action is not supported.');
  } catch (caught) {
    const error = safeError(caught); if (userId && action) await usage(userId, action, storyId, action.includes('image') || action === 'generate-cover' ? MODELS.IMAGE : MODELS.TEXT, false);
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status, headers);
  }
});
