import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('story generation returns world, locations, and visual-only page scenes in one request', () => {
  const edge = read('supabase/functions/story-ai/index.ts');
  const prompts = read('supabase/functions/story-ai/prompts.ts');
  const schemas = read('supabase/functions/story-ai/worldBible.ts');
  assert.match(edge, /storyPackageSchema\(pageCount\)/);
  assert.match(edge, /normalizeStoryPackage\(result\.value, pageCount/);
  assert.match(prompts, /Story World Bible/);
  for (const field of ['illustration_scene', 'location_key', 'environment_state', 'continuity_notes', 'transition_kind', 'characters_present']) assert.match(schemas, new RegExp(field));
  assert.equal((edge.match(/structured\(storyPrompt/g) || []).length, 1);
});

test('page generation loads authoritative world and location continuity server-side', () => {
  const edge = read('supabase/functions/story-ai/index.ts');
  const world = read('supabase/functions/story-ai/worldBible.ts');
  assert.match(edge, /worldContext\(client, storyId, pageNumber\)/);
  assert.match(edge, /worldIllustrationBlock\(context\)/);
  assert.match(world, /CURRENT PAGE LOCATION \(authoritative\)/);
  assert.match(world, /Do not force the main setting/);
});

test('pages and scenes are persisted before their image request', () => {
  for (const file of ['src/pages/CreateStory.jsx', 'src/components/ContinueStoryModal.jsx']) {
    const source = read(file);
    assert.ok(source.indexOf('storyPagesService.create') < source.indexOf('await generatePageImage'));
    assert.ok(source.indexOf('storyWorldsService.createScene') < source.indexOf('await generatePageImage'));
  }
});
