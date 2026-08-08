import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260807000000_storyloom_foundation.sql');
const hardening = read('supabase/migrations/20260808000000_harden_private_paths.sql');
const edge = read('supabase/functions/story-ai/index.ts');

test('every application table enables RLS and client privileges are explicit', () => {
  for (const table of ['profiles', 'child_characters', 'stories', 'story_pages', 'ai_usage']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'));
  }
  assert.doesNotMatch(migration, /grant[^;]+ai_usage[^;]+authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]+ai_usage/is);
});

test('profile role is trigger-created and never client writable', () => {
  assert.match(migration, /insert into public\.profiles \(id, role\)[\s\S]+values \(new\.id, 'user'\)/);
  assert.match(migration, /grant select on public\.profiles to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*(insert|update|delete)[^;]*public\.profiles/i);
  assert.doesNotMatch(migration, /create policy[^;]+profiles for (insert|update|delete)/i);
  assert.match(hardening, /revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated/);
});

test('composite foreign keys and JSON trigger enforce cross-owner references', () => {
  assert.match(migration, /foreign key \(user_id, child_character_id\)[\s\S]+references public\.child_characters \(user_id, id\)/);
  assert.match(migration, /foreign key \(user_id, story_id\)[\s\S]+references public\.stories \(user_id, id\)/);
  assert.match(migration, /where c\.id = character_uuid and c\.user_id = new\.user_id/);
  assert.match(migration, /item_key_count <> 1/);
  assert.match(migration, /jsonb_typeof\(item\) <> 'object'/);
  assert.match(migration, /length\(btrim\(item ->> 'quick_description'\)\) = 0/);
});

test('private Storage policies require canonical authenticated-user paths', () => {
  assert.match(hardening, /is_storyloom_storage_path\(bucket_id, name, \(select auth\.uid\(\)\)\)/);
  assert.match(hardening, /character-photos/);
  assert.match(hardening, /character-images/);
  assert.match(hardening, /story-images/);
  assert.match(hardening, /\/original\\\.\(jpg\|png\|webp\)\$/);
  assert.match(hardening, /\/portrait\\\.\(jpg\|png\|webp\)\$/);
  assert.match(hardening, /\/\(cover\|pages\/\[0-9\]\{3\}\)\\\.\(jpg\|png\|webp\)\$/);

  const storage = read('src/services/storage.js');
  assert.match(storage, /segment === '\.' \|\| segment === '\.\.'/);
  assert.match(storage, /normalized\.includes\('\\\\'\)/);
  assert.match(storage, /segments\[0\] !== userId/);
});

test('database paths cannot persist signed or external URLs', () => {
  for (const constraint of [
    'child_characters_photo_path_canonical_check',
    'child_characters_image_path_canonical_check',
    'stories_cover_path_canonical_check',
    'story_pages_image_path_canonical_check',
  ]) assert.match(hardening, new RegExp(constraint));
  assert.match(hardening, /validate constraint stories_cover_path_canonical_check/);
});

test('signed URL and query caches are cleared before a new user resolves', () => {
  const auth = read('src/lib/AuthContext.jsx');
  const transition = auth.indexOf('didAuthenticatedUserChange(userIdRef.current, session.user.id)');
  const verification = auth.indexOf('await supabase.auth.getUser()');
  assert.ok(transition !== -1 && verification !== -1 && transition < verification);
  assert.match(auth, /clearSignedUrlCache\(\)/);
  assert.match(auth, /queryClientInstance\.clear\(\)/);
  assert.match(auth, /setUser\(null\)[\s\S]+setIsAuthenticated\(false\)[\s\S]+setIsLoadingAuth\(true\)/);
});

test('Edge Function authenticates and authorizes before every provider boundary', () => {
  assert.match(edge, /auth\.getUser\(token\)/);
  assert.doesNotMatch(edge, /body\.(user_id|userId|owner_id|ownerId|role|subscription)/);
  assert.ok(edge.indexOf('const auth = await authenticate(request)') < edge.indexOf('await structured('));
  assert.ok(edge.indexOf('const character = await ownedCharacter(client, characterId)') < edge.indexOf('structured(characterAnalysisPrompt'));
  assert.ok(edge.indexOf('const story = await ownedStory(client, storyId)') < edge.indexOf("if (action === 'generate-page-image')"));
  assert.ok(edge.indexOf('await assertAiEntitlement({ userId, operation: action') < edge.indexOf('generateImage(pageImagePrompt'));
  assert.ok(edge.indexOf('await assertAiEntitlement({ userId, operation: action') < edge.indexOf("if (action === 'suggest-continuation')"));
});

test('service role and OpenAI secrets remain outside browser source', () => {
  const sourceFiles = readdirSync(resolve(root, 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.[jt]sx?$/.test(entry.name));
  const browserSource = sourceFiles.map((entry) => read(resolve(entry.parentPath, entry.name))).join('\n');
  assert.doesNotMatch(browserSource, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|api\.openai\.com/);
  assert.match(read('supabase/functions/story-ai/openai.ts'), /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.match(edge, /service\.from\('ai_usage'\)\.insert/);
  assert.doesNotMatch(edge, /service\.from\('(stories|story_pages|child_characters)'\)/);
});

test('CORS is allowlist-based and errors remain stable', () => {
  assert.match(edge, /configured\.includes\(origin\)/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin['"]:\s*['"]\*['"]/);
  assert.match(edge, /throw new AppError\('PERMISSION_DENIED', 'This origin is not allowed\.'/);
  const errors = read('supabase/functions/story-ai/errors.ts');
  assert.match(errors, /return new AppError\('AI_PROVIDER', 'The AI request could not be completed\.'/);
  assert.doesNotMatch(errors, /stack/);
});

test('server validation bounds costly and structured inputs', () => {
  const config = read('supabase/functions/story-ai/config.ts');
  const validation = read('supabase/functions/story-ai/validation.ts');
  const openai = read('supabase/functions/story-ai/openai.ts');
  assert.match(validation, /const UUID =/);
  assert.match(validation, /!Number\.isInteger\(value\)/);
  assert.match(config, /PROMPT: 4_000/);
  assert.match(config, /CHARACTERS: 3/);
  assert.match(config, /IMAGE_BYTES: 20 \* 1024 \* 1024/);
  assert.match(edge, /pageNumber < 1 \|\| pageNumber > 25/);
  assert.match(edge, /LANGUAGE_NAMES\[language\]/);
  assert.match(openai, /bytes\[0\] !== 0x89/);
  assert.match(edge, /data\.size <= 0 \|\| data\.size > 10 \* 1024 \* 1024/);
  assert.match(edge, /const jpeg = data\.type === 'image\/jpeg'/);
  assert.match(edge, /const png = data\.type === 'image\/png'/);
  assert.match(edge, /const webp = data\.type === 'image\/webp'/);

  const storage = read('src/services/storage.js');
  assert.match(storage, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(storage, /matchesImageSignature\(header, file\.type\.toLowerCase\(\)\)/);
});
