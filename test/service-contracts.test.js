import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ServiceError,
  pickDefined,
  rejectOwnershipOverride,
} from '../src/services/errors.js';
import {
  didAuthenticatedUserChange,
  INITIAL_AUTH_STATE,
  toAppUser,
} from '../src/lib/authState.js';
import { invalidatePageTranslations, shouldSyncCoverForPage } from '../src/lib/storyState.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('write payload helpers reject caller-supplied ownership', () => {
  assert.throws(
    () => rejectOwnershipOverride({ user_id: 'forged' }),
    (error) => error instanceof ServiceError && error.code === 'VALIDATION',
  );
  assert.deepEqual(pickDefined({ title: 'A', ignored: true }, ['title']), { title: 'A' });
});

test('list contracts preserve deterministic Base44 ordering', () => {
  assert.match(read('src/services/stories.js'), /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(read('src/services/characters.js'), /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(read('src/services/storyPages.js'), /\.order\('page_number', \{ ascending: true \}\)/);
});

test('services derive user IDs instead of accepting them as writable fields', () => {
  for (const file of ['stories.js', 'storyPages.js', 'characters.js']) {
    const source = read(`src/services/${file}`);
    assert.match(source, /requireAuthenticatedUser\(\)/);
    assert.match(source, /rejectOwnershipOverride\(input\)/);
    assert.doesNotMatch(source, /WRITE_FIELDS[^;]*user_id/s);
  }
});

test('private database fields remain paths and signed URLs are transient', () => {
  const services = [
    read('src/services/stories.js'),
    read('src/services/storyPages.js'),
    read('src/services/characters.js'),
  ].join('\n');
  assert.match(services, /cover_image_path/);
  assert.match(services, /image_path/);
  assert.match(services, /photo_path/);
  assert.match(services, /character_image_path/);
  assert.doesNotMatch(services, /signedUrl/);

  const storage = read('src/services/storage.js');
  assert.match(storage, /createSignedUrl/);
  assert.match(storage, /signedUrlCache/);
});

test('browser source contains no privileged environment-variable references', () => {
  const files = [
    'src/lib/supabase.js',
    'src/services/auth.js',
    'src/services/stories.js',
    'src/services/storyPages.js',
    'src/services/characters.js',
    'src/services/storage.js',
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /SERVICE_ROLE|OPENAI_API_KEY/);
  assert.match(source, /VITE_SUPABASE_URL/);
  assert.match(source, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test('auth state starts private and maps only the application user shape', () => {
  assert.deepEqual(INITIAL_AUTH_STATE, {
    user: null,
    isAuthenticated: false,
    isLoadingAuth: true,
    authChecked: false,
  });
  assert.deepEqual(toAppUser({ id: 'u1', email: 'kid@example.com', user_metadata: { role: 'admin' } }), {
    id: 'u1', email: 'kid@example.com', role: 'user',
  });
  assert.equal(toAppUser({ id: 'u1', email: 'a@b.co' }, 'admin').role, 'admin');
  assert.equal(toAppUser(null), null);
});

test('authenticated user replacement is detectable for private-cache clearing', () => {
  assert.equal(didAuthenticatedUserChange(null, 'u1'), false);
  assert.equal(didAuthenticatedUserChange('u1', 'u1'), false);
  assert.equal(didAuthenticatedUserChange('u1', 'u2'), true);
});

test('auth wiring uses Supabase, protects routes, and clears private caches', () => {
  const context = read('src/lib/AuthContext.jsx');
  const routes = read('src/components/ProtectedRoute.jsx');
  const app = read('src/App.jsx');
  const authSources = [
    context,
    read('src/pages/Login.jsx'),
    read('src/pages/Register.jsx'),
    read('src/pages/ForgotPassword.jsx'),
    read('src/pages/ResetPassword.jsx'),
    read('src/lib/PageNotFound.jsx'),
  ].join('\n');

  assert.match(context, /getSession\(\)/);
  assert.match(context, /getUser\(\)/);
  assert.match(context, /onAuthStateChange/);
  assert.match(context, /clearSignedUrlCache\(\)/);
  assert.match(context, /queryClientInstance\.clear\(\)/);
  assert.match(routes, /isLoadingAuth \|\| !authChecked/);
  assert.match(routes, /<Navigate to=\{`\/login\?returnTo=/);
  assert.match(app, /path="\/login"/);
  assert.match(app, /path="\/reset-password"/);
  assert.doesNotMatch(authSources, /base44\.auth/);
  assert.doesNotMatch(authSources, /user_metadata[^\n]*role/);
});

test('runtime CRUD, uploads, and AI no longer use Base44 APIs', () => {
  const runtimeFiles = [
    'src/pages/CreateStory.jsx', 'src/pages/Characters.jsx', 'src/pages/Library.jsx',
    'src/pages/StoryEditor.jsx', 'src/components/ContinueStoryModal.jsx',
    'src/components/CoverCreator.jsx', 'src/lib/storyStudio.js',
  ];
  const source = runtimeFiles.map(read).join('\n');
  assert.doesNotMatch(source, /base44\.entities|UploadFile/);
  assert.doesNotMatch(source, /photo_url|character_image_url|cover_image_url|\bimage_url\b/);
  assert.doesNotMatch(source, /base44\.integrations|InvokeLLM|GenerateImage/);
});

test('original photos use deterministic private user-prefixed paths', () => {
  const storage = read('src/services/storage.js');
  assert.match(storage, /segments\[0\] !== userId/);
  assert.match(storage, /`\$\{user\.id\}\/\$\{suffix\}\.\$\{requireImageType\(type\)\}`/);
  assert.match(storage, /`\$\{id\}\/original`/);
  assert.doesNotMatch(storage, /providerUrl|downloadGeneratedImage|persistGeneratedImage/);
});

test('editing invalidates only the corresponding translated page', () => {
  const original = { es: ['uno', 'dos', 'tres'], fr: ['un', 'deux', 'trois'], metadata: 'kept' };
  const result = invalidatePageTranslations(original, 1);
  assert.deepEqual(result.es, ['uno', undefined, 'tres']);
  assert.deepEqual(result.fr, ['un', undefined, 'trois']);
  assert.equal(result.metadata, 'kept');
  assert.deepEqual(original.es, ['uno', 'dos', 'tres']);
});

test('only repainting page one synchronizes the cover', () => {
  assert.equal(shouldSyncCoverForPage(0), true);
  assert.equal(shouldSyncCoverForPage(1), false);
  assert.equal(shouldSyncCoverForPage(9), false);
});

test('PDF downloads private paths and does not mutate page ordering', () => {
  const pdf = read('src/lib/storyPdf.js');
  assert.match(pdf, /download\(STORAGE_BUCKETS\.STORY_IMAGES, path\)/);
  assert.match(pdf, /\[\.\.\.pages\]\.sort/);
  assert.match(pdf, /story\.cover_image_path \|\| orderedPages\[0\]\?\.image_path/);
  assert.doesNotMatch(pdf, /fetch\(/);
});

test('frontend AI uses one authenticated Supabase Edge Function boundary', () => {
  const ai = read('src/services/ai.js');
  const frontend = [ai, read('src/lib/storyStudio.js'), read('src/components/CoverCreator.jsx')].join('\n');
  assert.match(ai, /functions\.invoke\('story-ai'/);
  assert.doesNotMatch(frontend, /api\.openai\.com|OPENAI_API_KEY|VITE_OPENAI_API_KEY|base44/);
});

test('Edge Function authenticates, validates actions and ownership, and gates provider calls', () => {
  const edge = read('supabase/functions/story-ai/index.ts');
  assert.match(edge, /auth\.getUser\(token\)/);
  assert.match(edge, /throw new AppError\('AUTH_REQUIRED'/);
  assert.match(edge, /throw new AppError\('VALIDATION', 'Action is not supported\.'/);
  assert.match(edge, /ownedStory\(client, storyId\)/);
  assert.match(edge, /ownedCharacter\(client, characterId\)/);
  assert.match(edge, /assertAiEntitlement/);
  assert.ok(edge.indexOf('assertAiEntitlement') < edge.indexOf("structured(storyPrompt"));
  assert.match(edge, /rateLimit\(userId, action\)/);
});

test('AI contracts bound counts, styles, languages, and validate structured output', () => {
  const config = read('supabase/functions/story-ai/config.ts');
  const edge = read('supabase/functions/story-ai/index.ts');
  assert.match(config, /STORY_PAGE_COUNTS = new Set\(\[6, 10, 15\]\)/);
  assert.match(config, /CONTINUATION_PAGE_COUNTS = new Set\(\[3, 5, 10\]\)/);
  for (const style of ['watercolor', 'cartoon', 'crayon', 'pencil', 'claymation', 'collage']) assert.match(config, new RegExp(`${style}:`));
  for (const language of ['es', 'fr', 'de', 'pt', 'ja', 'zh']) assert.match(config, new RegExp(`${language}:`));
  assert.match(edge, /value\.pages\.length !== count/);
  assert.match(edge, /value\.translations\.length !== texts\.length/);
  assert.match(edge, /AI_RESPONSE_INVALID/);
});

test('generated images are decoded and uploaded server-side to deterministic paths', () => {
  const edge = read('supabase/functions/story-ai/index.ts');
  const openai = read('supabase/functions/story-ai/openai.ts');
  assert.match(openai, /b64_json/);
  assert.match(openai, /image\/png/);
  assert.match(edge, /`\$\{userId\}\/\$\{characterId\}\/portrait\.png`/);
  assert.match(edge, /pages\/\$\{String\(pageNumber\)\.padStart\(3, '0'\)\}\.png/);
  assert.match(edge, /`\$\{userId\}\/\$\{storyId\}\/cover\.png`/);
  assert.doesNotMatch(edge, /providerUrl|signedUrl/);
});

test('AI usage logging and future server-side entitlement hook exist', () => {
  const edge = read('supabase/functions/story-ai/index.ts');
  assert.match(edge, /service\.from\('ai_usage'\)\.insert/);
  assert.match(edge, /input_tokens:/);
  assert.match(edge, /output_tokens:/);
  assert.match(edge, /image_count:/);
  assert.match(edge, /Future Stripe\/webhook-maintained entitlements/);
});
