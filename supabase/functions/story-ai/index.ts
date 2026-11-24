import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.109.0';
import { ART_STYLE_PROMPTS, CONTINUATION_PAGE_COUNTS, LANGUAGE_NAMES, LIMITS, MODELS, STORY_PAGE_COUNTS } from './config.ts';
import { AppError, jsonResponse, safeError } from './errors.ts';
import { structured } from './openai.ts';
import { generateConfiguredImage } from './imageProviders/index.ts';
import { characterAnalysisPrompt, characterImagePrompt, continuationPrompt, continuationSuggestionPrompt, pageImagePrompt, storyPrompt, translationPrompt } from './prompts.ts';
import { artStyle, characterInputs, integerIn, object, text, uuid } from './validation.ts';
import { assertAiEntitlement, finalizeAiEntitlement, releaseAiEntitlement, type EntitlementReservation } from './entitlements.ts';
import { characterBibleDescription } from './characterBible.ts';
import { continuationPackageSchema, normalizeStoryPackage, storyPackageSchema, worldIllustrationBlock } from './worldBible.ts';
import { snapshotStoryCharacters } from './storyCharacters.ts';

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

async function ownedStory(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('stories').select('id,title,summary,theme,art_style,child_character_id,secondary_characters,page_count').eq('id', id).maybeSingle();
  if (error) throw new AppError('DATABASE', 'The story could not be loaded.', 500);
  if (!data) throw new AppError('PERMISSION_DENIED', 'The story is unavailable.', 403);
  artStyle(data.art_style);
  return data;
}
async function ownedCharacter(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('child_characters').select('id,name,age,description,photo_path,character_image_path,character_kind,species,pronouns,appearance_bible,appearance_locked,bible_version').eq('id', id).maybeSingle();
  if (error) throw new AppError('DATABASE', 'The character could not be loaded.', 500);
  if (!data) throw new AppError('PERMISSION_DENIED', 'The character is unavailable.', 403);
  return data;
}
async function storyCharacters(client: SupabaseClient, story: Record<string, any>, pageNumber?: number) {
  const snapshots = await snapshotStoryCharacters(client, story.id, pageNumber);
  if (snapshots.length) return snapshots;
  const result: Array<{ key: string; name: string; description: string }> = []; const seen = new Set<string>();
  const ids = [story.child_character_id, ...(Array.isArray(story.secondary_characters) ? story.secondary_characters.map((item: any) => item?.character_id) : [])].filter(Boolean);
  for (const id of ids) if (!seen.has(id)) { const character = await ownedCharacter(client, id); result.push({ key: `saved:${id}`, name: character.name || '', description: characterBibleDescription(character) }); seen.add(id); }
  for (const [index, item] of (Array.isArray(story.secondary_characters) ? story.secondary_characters : []).entries()) if (item?.quick_description) result.push({ key: `quick:${index + 1}`, name: '', description: String(item.quick_description).slice(0, 1_500) });
  if (result.length > LIMITS.CHARACTERS) throw new AppError('VALIDATION', 'The story has too many characters.');
  return result;
}
async function storyPages(client: SupabaseClient, storyId: string) {
  const { data, error } = await client.from('story_pages').select('page_number,text').eq('story_id', storyId).order('page_number', { ascending: true });
  if (error) throw new AppError('DATABASE', 'Story pages could not be loaded.', 500);
  return data || [];
}
async function worldContext(client: SupabaseClient, storyId: string, pageNumber?: number) {
  const worldResult = await client.from('story_worlds').select('*').eq('story_id', storyId).maybeSingle();
  if (worldResult.error) throw new AppError('DATABASE', 'The Story World Bible could not be loaded.', 500);
  const locationsResult = await client.from('story_locations').select('*').eq('story_id', storyId).order('created_at', { ascending: true });
  if (locationsResult.error) throw new AppError('DATABASE', 'Story locations could not be loaded.', 500);
  let scene = null; let location = null; let lastLocationKey = '';
  const pageQuery = client.from('story_pages').select('id,page_number').eq('story_id', storyId).order('page_number', { ascending: false });
  const pageResult = pageNumber ? await pageQuery.eq('page_number', pageNumber).maybeSingle() : await pageQuery.limit(1).maybeSingle();
  if (pageResult.error) throw new AppError('DATABASE', 'Story page continuity could not be loaded.', 500);
  if (pageResult.data) {
    const sceneResult = await client.from('story_page_scenes').select('*').eq('story_page_id', pageResult.data.id).maybeSingle();
    if (sceneResult.error) throw new AppError('DATABASE', 'The page scene could not be loaded.', 500);
    scene = sceneResult.data;
    if (scene?.location_id) {
      location = (locationsResult.data || []).find((item: any) => item.id === scene.location_id) || null;
      lastLocationKey = location?.location_key || '';
    }
  }
  return { world: worldResult.data, locations: locationsResult.data || [], scene, location, lastLocationKey };
}
async function privatePhoto(client: SupabaseClient, userId: string, character: Record<string, any>) {
  if (typeof character.photo_path !== 'string' || !character.photo_path.startsWith(`${userId}/${character.id}/`)) throw new AppError('PERMISSION_DENIED', 'The character photo is unavailable.', 403);
  const { data, error } = await client.storage.from('character-photos').download(character.photo_path);
  if (error || !data) throw new AppError('STORAGE', 'The character photo could not be downloaded.', 500);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.type) || data.size <= 0 || data.size > 10 * 1024 * 1024) throw new AppError('VALIDATION', 'The character photo format is invalid.');
  const header = new Uint8Array(await data.slice(0, 12).arrayBuffer());
  const jpeg = data.type === 'image/jpeg' && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png = data.type === 'image/png' && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47 && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;
  const webp = data.type === 'image/webp' && new TextDecoder().decode(header.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(header.slice(8, 12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new AppError('VALIDATION', 'The character photo contents are invalid.');
  return data;
}
async function uploadImage(client: SupabaseClient, bucket: string, path: string, blob: Blob) {
  const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: 'image/png', cacheControl: '3600', upsert: true });
  if (error) throw new AppError('STORAGE', 'The generated image could not be stored.', 500);
  return path;
}

async function claimImageGeneration(userId: string, requestId: string, operation: string) {
  const { error } = await service.from('image_generation_requests').insert({ request_id: requestId, user_id: userId, operation });
  if (error?.code === '23505') throw new AppError('RATE_LIMIT', 'This image request is already being processed.', 409);
  if (error) throw new AppError('DATABASE', 'The image request could not be reserved.', 500);
}

async function finishImageGeneration(requestId: string, status: 'provider_completed' | 'completed' | 'failed', provider?: string, model?: string) {
  const { error } = await service.from('image_generation_requests').update({ status, provider_key: provider || null, model_key: model || null, updated_at: new Date().toISOString() }).eq('request_id', requestId);
  if (error) console.error('image generation request finalization failed', status);
}
async function usage(input: { userId: string; requestId: string; operation: string; storyId: string | null; model: string; success: boolean; reservation?: EntitlementReservation | null; providerUsage?: any; imageCount?: number | null; generationKind?: string | null; pageCount?: number | null; resourceId?: string | null; parentRequestId?: string | null; imageSize?: string | null; imageQuality?: string | null; failureStage?: string | null }) {
  const providerUsage = input.providerUsage || {}; const reservation = input.reservation;
  try { await service.from('ai_usage').insert({ user_id: input.userId, request_id: input.requestId, reservation_id: reservation?.reservationId || null, operation: input.operation, story_id: input.storyId, model: input.model, success: input.success, input_tokens: providerUsage.input_tokens ?? null, output_tokens: providerUsage.output_tokens ?? null, image_count: input.imageCount ?? null, generation_kind: input.generationKind || null, page_count: input.pageCount ?? null, resource_id: input.resourceId || null, parent_request_id: input.parentRequestId || null, image_size: input.imageSize || null, image_quality: input.imageQuality || null, entitlement_bucket: reservation?.bucket || null, entitlement_amount: reservation?.amount ?? null, plan_key: reservation?.planKey || null, failure_stage: input.failureStage || null }); } catch { console.error('ai_usage insert failed', input.operation); }
}

function failureStage(code: string) {
  if (code.startsWith('ENTITLEMENT_')) return 'entitlement';
  if (code === 'AI_PROVIDER' || code === 'AI_RESPONSE_INVALID' || code === 'RATE_LIMIT') return 'provider';
  if (code === 'STORAGE' || code === 'DATABASE') return 'storage_database';
  if (code === 'VALIDATION' || code === 'PERMISSION_DENIED' || code === 'AUTH_REQUIRED') return 'validation';
  return 'unknown';
}

Deno.serve(async (request) => {
  let headers: HeadersInit = {}; let userId = ''; let action = ''; let storyId: string | null = null; let correlationId = ''; let generationKind: string | null = null; let pageCountMetadata: number | null = null; let resourceId: string | null = null; let parentRequestId: string | null = null; let reservation: EntitlementReservation | null = null; let imageClaimed = false; let providerCharged = false;
  try {
    headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new AppError('VALIDATION', 'Only POST requests are supported.', 405);
    const auth = await authenticate(request); userId = auth.user.id;
    let requestBody: unknown;
    try { requestBody = await request.json(); } catch { throw new AppError('VALIDATION', 'Request body must be valid JSON.'); }
    const body = object(requestBody); action = text(body.action, 'Action', 64); correlationId = typeof body.requestId === 'string' ? uuid(body.requestId, 'Request ID') : crypto.randomUUID(); rateLimit(userId, action);
    const client = auth.client;
    if (action === 'generate-story') {
      const pageCount = integerIn(body.pageCount, STORY_PAGE_COUNTS, 'Page count'); const premise = text(body.prompt, 'Story premise', LIMITS.PROMPT); const theme = text(body.theme, 'Theme', 200); const characters = characterInputs(body.characters || []);
      generationKind = 'initial_story'; pageCountMetadata = pageCount;
      reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: action, requestedPageCount: pageCount });
      const result = await structured(storyPrompt(premise, theme, characters, pageCount), 'story', storyPackageSchema(pageCount)); const value: any = normalizeStoryPackage(result.value, pageCount, characters.map((character) => character.key));
      await usage({ userId, requestId: correlationId, operation: action, storyId: null, model: result.model, success: true, reservation, providerUsage: result.usage, generationKind, pageCount }); await finalizeAiEntitlement(service, reservation); reservation = null; return jsonResponse({ data: { ...value, analytics_request_id: correlationId } }, 200, headers);
    }
    storyId = typeof body.storyId === 'string' ? uuid(body.storyId, 'Story ID') : null;
    if (action === 'analyze-character' || action === 'generate-character-image') {
      const characterId = uuid(body.characterId, 'Character ID'); resourceId = characterId; generationKind = action === 'analyze-character' ? 'character_analysis' : 'character_portrait'; const character = await ownedCharacter(client, characterId); const photo = await privatePhoto(client, userId, character);
      reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: action, requestedImageCount: action === 'generate-character-image' ? 1 : undefined });
      if (action === 'analyze-character') {
        const fields = ['hair', 'eyes', 'skin_or_surface', 'body_features', 'distinguishing_features'];
        const schema = { type: 'object', properties: Object.fromEntries(fields.map((field) => [field, { type: 'string' }])), required: fields, additionalProperties: false };
        const result = await structured(characterAnalysisPrompt(character.character_kind || 'human', character.species || ''), 'character_appearance', schema, photo); const value: any = result.value;
        const appearanceBible = Object.fromEntries(fields.map((field) => [field, typeof value?.[field] === 'string' ? value[field].trim().slice(0, 500) : '']));
        if (!Object.values(appearanceBible).some(Boolean)) throw new AppError('AI_RESPONSE_INVALID', 'The character appearance could not be analyzed.', 502);
        await usage({ userId, requestId: correlationId, operation: action, storyId: null, model: result.model, success: true, reservation, providerUsage: result.usage, generationKind, resourceId }); await finalizeAiEntitlement(service, reservation); reservation = null; return jsonResponse({ data: { appearance_bible: appearanceBible } }, 200, headers);
      }
      await claimImageGeneration(userId, correlationId, action); imageClaimed = true;
      const description = characterBibleDescription(character); const result = await generateConfiguredImage({ service, prompt: characterImagePrompt(description, character.character_kind || 'character'), references: [photo], requiredCapabilities: ['text_to_image', 'image_edit', 'single_reference', 'large_reference'], isPayingCustomer: reservation.planKey !== 'staff_test', requestId: correlationId }); providerCharged = true; await finishImageGeneration(correlationId, 'provider_completed', result.provider, result.model); const path = `${userId}/${characterId}/portrait.${result.extension}`;
      await uploadImage(client, 'character-images', path, result.blob); await finishImageGeneration(correlationId, 'completed', result.provider, result.model); imageClaimed = false; await usage({ userId, requestId: correlationId, operation: action, storyId: null, model: result.model, success: true, reservation, providerUsage: result.usage, imageCount: 1, generationKind, resourceId, imageSize: '1024x1024', imageQuality: 'medium' }); await finalizeAiEntitlement(service, reservation); reservation = null; providerCharged = false; return jsonResponse({ data: { character_image_path: path } }, 200, headers);
    }
    if (!storyId) throw new AppError('VALIDATION', 'Story ID is required.');
    const story = await ownedStory(client, storyId);
    if (action === 'generate-page-image') {
      const rawPageNumber = body.pageNumber; if (!Number.isInteger(rawPageNumber) || (rawPageNumber as number) < 1 || (rawPageNumber as number) > 30) throw new AppError('VALIDATION', 'Page number is invalid.'); const pageNumber = rawPageNumber as number;
      const existingPage = await client.from('story_pages').select('id,text,illustration_scene,illustration_instructions,image_path').eq('story_id', storyId).eq('page_number', pageNumber).maybeSingle();
      if (existingPage.error) throw new AppError('DATABASE', 'The page could not be checked.', 500);
      const priorRequest = await service.from('image_generation_requests').select('status').eq('request_id', correlationId).eq('user_id', userId).maybeSingle();
      if (priorRequest.data?.status === 'provider_completed') throw new AppError('GENERATION_RECONCILIATION_REQUIRED', 'The provider completed this request and its result is awaiting safe reconciliation.', 409);
      if (priorRequest.data?.status === 'completed' && existingPage.data?.image_path) {
        const pending = await service.from('entitlement_usage').select('id').eq('request_id', correlationId).eq('user_id', userId).eq('status', 'reserved').maybeSingle();
        if (pending.data?.id) await finalizeAiEntitlement(service, { requestId: correlationId, reservationId: pending.data.id, planKey: 'reconciliation', bucket: 'image', amount: 1, remaining: 0 });
        return jsonResponse({ data: { image_path: existingPage.data.image_path, replayed: true } }, 200, headers);
      }
      const legacyPageRequest = !existingPage.data;
      if (legacyPageRequest && typeof body.text !== 'string') throw new AppError('PERMISSION_DENIED', 'The page is unavailable.', 403);
      const meteredOperation = existingPage.data?.image_path ? 'generate-page-image-repaint' : 'generate-page-image-initial';
      if (meteredOperation === 'generate-page-image-repaint') generationKind = 'repaint';
      else {
        const segment = await service.from('story_generation_segments').select('request_id').eq('user_id', userId).eq('story_id', storyId).lte('start_page', pageNumber).gte('end_page', pageNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (segment.error) throw new AppError('DATABASE', 'Page generation context could not be loaded.', 500);
        if (legacyPageRequest && pageNumber > story.page_count && !segment.data) throw new AppError('PERMISSION_DENIED', 'The page is unavailable.', 403);
        generationKind = segment.data ? 'continuation_illustration' : 'initial_page_illustration'; parentRequestId = segment.data?.request_id || null;
      }
      pageCountMetadata = pageNumber;
      reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: meteredOperation, storyId, requestedPageCount: pageNumber, requestedImageCount: 1 });
      await claimImageGeneration(userId, correlationId, meteredOperation); imageClaimed = true;
      const scene = legacyPageRequest
        ? text(body.text, 'Legacy page text', LIMITS.PROMPT)
        : text(existingPage.data!.illustration_scene || existingPage.data!.text, 'Illustration scene', LIMITS.PROMPT);
      const illustrationInstructions = typeof existingPage.data?.illustration_instructions === 'string' ? existingPage.data.illustration_instructions.trim().slice(0, LIMITS.PROMPT) : '';
      const context = await worldContext(client, storyId, pageNumber); const allCharacters = await storyCharacters(client, story, pageNumber);
      const presentKeys = new Set(Array.isArray(context.scene?.characters_present) ? context.scene.characters_present.filter((value: unknown) => typeof value === 'string') : []);
      const characters = presentKeys.size ? allCharacters.filter((character) => presentKeys.has(character.key)) : allCharacters;
      const result = await generateConfiguredImage({ service, prompt: pageImagePrompt(scene, story.theme || '', characters, story.art_style, illustrationInstructions, worldIllustrationBlock(context), context.scene?.character_actions || '', context.world?.illustration_style_prompt || ''), requiredCapabilities: ['text_to_image'], isPayingCustomer: reservation.planKey !== 'staff_test', requestId: correlationId }); providerCharged = true; await finishImageGeneration(correlationId, 'provider_completed', result.provider, result.model); const path = `${userId}/${storyId}/pages/${String(pageNumber).padStart(3, '0')}.${result.extension}`;
      await uploadImage(client, 'story-images', path, result.blob); if (existingPage.data?.id) { const persisted = await client.from('story_pages').update({ image_path: path }).eq('id', existingPage.data.id).eq('story_id', storyId).select('id').single(); if (persisted.error) throw new AppError('DATABASE', 'The page image could not be linked.', 500); } await finishImageGeneration(correlationId, 'completed', result.provider, result.model); imageClaimed = false; await usage({ userId, requestId: correlationId, operation: meteredOperation, storyId, model: result.model, success: true, reservation, providerUsage: result.usage, imageCount: 1, generationKind, pageCount: pageNumber, parentRequestId, imageSize: '1024x1024', imageQuality: 'medium' }); await finalizeAiEntitlement(service, reservation); reservation = null; providerCharged = false; return jsonResponse({ data: { image_path: path } }, 200, headers);
    }
    if (action === 'suggest-continuation') {
      generationKind = 'continuation_suggestion'; reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: action, storyId });
      const pages = await storyPages(client, storyId); const prompt = continuationSuggestionPrompt(story.title, story.summary || '', pages.slice(-2).map((page) => page.text || ''));
      const schema = { type: 'object', properties: { suggestion: { type: 'string' } }, required: ['suggestion'], additionalProperties: false }; const result = await structured(prompt, 'continuation_suggestion', schema); const value: any = result.value;
      if (typeof value.suggestion !== 'string' || !value.suggestion.trim() || value.suggestion.length > 2_000) throw new AppError('AI_RESPONSE_INVALID', 'The continuation suggestion is invalid.', 502);
      await usage({ userId, requestId: correlationId, operation: action, storyId, model: result.model, success: true, reservation, providerUsage: result.usage, generationKind }); await finalizeAiEntitlement(service, reservation); reservation = null; return jsonResponse({ data: { suggestion: value.suggestion.trim() } }, 200, headers);
    }
    if (action === 'continue-story') {
      const count = integerIn(body.pageCount, CONTINUATION_PAGE_COUNTS, 'Continuation page count'); const premise = text(body.continuationPrompt, 'Continuation premise', LIMITS.PROMPT); const characters = await storyCharacters(client, story); const context = await worldContext(client, storyId);
      generationKind = 'continuation'; pageCountMetadata = count; reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: action, storyId, requestedPageCount: count });
      const locationSummary = context.locations.length ? `${context.world ? `Story World Bible: ${worldIllustrationBlock(context)}\n` : ''}Available locations:\n${context.locations.map((location: any) => `${location.location_key}: ${location.name} — ${location.visual_description}`).join('\n')}\nLast active location key: ${context.lastLocationKey || 'unknown'}.` : 'This legacy story has no stored World Bible; infer continuity from the summary and recent pages.';
      const result = await structured(continuationPrompt(story.title, story.summary || '', characters, count, premise, locationSummary), 'continuation', continuationPackageSchema(count));
      const existingKeys = context.locations.map((location: any) => location.location_key).filter((key: string) => key !== context.lastLocationKey); if (context.lastLocationKey) existingKeys.push(context.lastLocationKey);
      const value = normalizeStoryPackage(result.value, count, characters.map((character) => character.key), existingKeys, false);
      const segment = await service.from('story_generation_segments').insert({ request_id: correlationId, user_id: userId, story_id: storyId, generation_kind: 'continuation', page_count: count, start_page: story.page_count + 1, end_page: story.page_count + count });
      if (segment.error) console.error('continuation analytics segment insert failed');
      await usage({ userId, requestId: correlationId, operation: action, storyId, model: result.model, success: true, reservation, providerUsage: result.usage, generationKind, pageCount: count }); await finalizeAiEntitlement(service, reservation); reservation = null; return jsonResponse({ data: { ...value, analytics_request_id: correlationId } }, 200, headers);
    }
    if (action === 'translate-story') {
      const language = text(body.language, 'Language', 8); if (!LANGUAGE_NAMES[language]) throw new AppError('VALIDATION', 'Language is not supported.'); const pages = await storyPages(client, storyId);
      if (!pages.length || pages.length > LIMITS.TRANSLATION_PAGES) throw new AppError('VALIDATION', 'The story page count cannot be translated.'); const texts = pages.map((page) => text(page.text, 'Page text', LIMITS.TEXT));
      generationKind = 'translation'; pageCountMetadata = texts.length; reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: action, storyId, requestedPageCount: texts.length });
      const schema = { type: 'object', properties: { translations: { type: 'array', minItems: texts.length, maxItems: texts.length, items: { type: 'string' } } }, required: ['translations'], additionalProperties: false }; const result = await structured(translationPrompt(texts, language), 'translations', schema); const value: any = result.value;
      if (!Array.isArray(value.translations) || value.translations.length !== texts.length || value.translations.some((item: unknown) => typeof item !== 'string' || !item.trim())) throw new AppError('AI_RESPONSE_INVALID', 'The translations are invalid.', 502);
      await usage({ userId, requestId: correlationId, operation: action, storyId, model: result.model, success: true, reservation, providerUsage: result.usage, generationKind, pageCount: texts.length }); await finalizeAiEntitlement(service, reservation); reservation = null; return jsonResponse({ data: { translations: value.translations } }, 200, headers);
    }
    if (action === 'generate-cover') {
      generationKind = 'custom_cover'; const prompt = text(body.prompt, 'Cover prompt', LIMITS.PROMPT); if (!ART_STYLE_PROMPTS[story.art_style]) throw new AppError('VALIDATION', 'Art style is not supported.'); reservation = await assertAiEntitlement({ service, userId, requestId: correlationId, operation: action, storyId, requestedImageCount: 1 }); await claimImageGeneration(userId, correlationId, action); imageClaimed = true;
      const context = await worldContext(client, storyId, 1); const characters = await storyCharacters(client, story, 1);
      const continuityPrompt = `${prompt}\n${worldIllustrationBlock(context)}\n${characters.length ? `Use these locked character identities:\n${characters.map((character, index) => `Character ${index + 1}: ${character.name ? `${character.name}. ` : ''}${character.description}`).join('\n')}` : ''}\nStyle: ${context.world?.illustration_style_prompt || ART_STYLE_PROMPTS[story.art_style]}. No words or text in the image.`;
      const result = await generateConfiguredImage({ service, prompt: continuityPrompt, requiredCapabilities: ['text_to_image'], isPayingCustomer: reservation.planKey !== 'staff_test', requestId: correlationId }); providerCharged = true; await finishImageGeneration(correlationId, 'provider_completed', result.provider, result.model); const path = `${userId}/${storyId}/cover.${result.extension}`;
      await uploadImage(client, 'story-images', path, result.blob); await finishImageGeneration(correlationId, 'completed', result.provider, result.model); imageClaimed = false; await usage({ userId, requestId: correlationId, operation: action, storyId, model: result.model, success: true, reservation, providerUsage: result.usage, imageCount: 1, generationKind, imageSize: '1024x1024', imageQuality: 'medium' }); await finalizeAiEntitlement(service, reservation); reservation = null; providerCharged = false; return jsonResponse({ data: { cover_image_path: path } }, 200, headers);
    }
    throw new AppError('VALIDATION', 'Action is not supported.');
  } catch (caught) {
    if (imageClaimed && !providerCharged) await finishImageGeneration(correlationId, 'failed'); if (!providerCharged) await releaseAiEntitlement(service, reservation); const error = safeError(caught); if (userId && action && correlationId) await usage({ userId, requestId: correlationId, operation: action, storyId, model: action.includes('image') || action === 'generate-cover' ? MODELS.IMAGE : MODELS.TEXT, success: false, reservation, generationKind, pageCount: pageCountMetadata, resourceId, parentRequestId, imageSize: action.includes('image') || action === 'generate-cover' ? '1024x1024' : null, imageQuality: action.includes('image') || action === 'generate-cover' ? 'medium' : null, failureStage: failureStage(error.code) });
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status, headers);
  }
});
