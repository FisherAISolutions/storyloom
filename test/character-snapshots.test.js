import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('story character snapshots are owner-scoped, immutable, and same-owner linked', () => {
  const migration = read('supabase/migrations/20260817000000_story_character_snapshots.sql');
  for (const table of ['story_characters', 'story_character_states']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /grant select, insert on public\.story_characters, public\.story_character_states to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]+(update|delete)[^;]+story_character/i);
  assert.match(migration, /story_characters_story_same_owner_fk foreign key \(user_id, story_id\)/);
  assert.match(migration, /story_characters_source_same_owner_fk foreign key \(user_id, source_character_id\)/);
  assert.match(migration, /story_character_states_character_same_story_fk foreign key \(user_id, story_id, story_character_id\)/);
  assert.match(migration, /update public\.story_worlds world[\s\S]+from public\.stories story/);
});

test('new stories freeze Character Bibles and art style before painting pages', () => {
  const create = read('src/pages/CreateStory.jsx');
  assert.match(create, /buildCharacterDescription/);
  assert.match(create, /source_bible_version: character\.bible_version/);
  assert.match(create, /generatedCharacterSnapshots/);
  assert.match(create, /illustration_style_prompt: getStylePrompt\(artStyle\)/);
  assert.ok(create.indexOf('storyCharactersService.createSnapshots') < create.indexOf('storyPagesService.create'));
  assert.ok(create.indexOf('storyCharactersService.createState') < create.indexOf('await generatePageImage'));
});

test('server illustration paths prefer immutable snapshots and page-effective states', () => {
  const edge = read('supabase/functions/story-ai/index.ts');
  const snapshots = read('supabase/functions/story-ai/storyCharacters.ts');
  assert.match(edge, /snapshotStoryCharacters\(client, story\.id, pageNumber\)/);
  assert.match(edge, /if \(snapshots\.length\) return snapshots/);
  assert.match(snapshots, /\.lte\('effective_page_number', pageNumber\)/);
  assert.match(snapshots, /outfit_snapshot: \{ \.\.\.\(previous\.outfit_snapshot/);
  assert.match(snapshots, /appearance_override: \{ \.\.\.\(previous\.appearance_override/);
  assert.match(edge, /storyCharacters\(client, story, pageNumber\)/);
  assert.match(edge, /storyCharacters\(client, story, 1\)/);
  assert.match(edge, /context\.world\?\.illustration_style_prompt/);
});

test('intentional appearance changes share the existing story-writing request', () => {
  const schemas = read('supabase/functions/story-ai/worldBible.ts');
  const prompts = read('supabase/functions/story-ai/prompts.ts');
  const continuation = read('src/components/ContinueStoryModal.jsx');
  assert.match(schemas, /character_changes/);
  assert.match(schemas, /generated_characters/);
  assert.match(schemas, /'outfit_change', 'transformation', 'return_to_baseline'/);
  assert.match(prompts, /character_changes only when the prose intentionally introduces/);
  assert.ok(continuation.indexOf('storyCharactersService.createState') < continuation.indexOf('await generatePageImage'));
});
