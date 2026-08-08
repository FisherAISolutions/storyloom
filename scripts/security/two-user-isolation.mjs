// Supabase initializes its optional Realtime client even though this harness
// never opens a channel. Node 20 has no global WebSocket, so provide a harmless
// constructor solely to keep the unused transport dormant without adding a
// dependency.
if (!globalThis.WebSocket) globalThis.WebSocket = class UnusedWebSocket {};
const { createClient } = await import('@supabase/supabase-js');

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SECURITY_TEST_USER_A_EMAIL',
  'SECURITY_TEST_USER_A_PASSWORD',
  'SECURITY_TEST_USER_B_EMAIL',
  'SECURITY_TEST_USER_B_PASSWORD',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(2);
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const userAClient = createClient(url, key, options);
const userBClient = createClient(url, key, options);
const anonymousClient = createClient(url, key, options);
const created = { aCharacter: null, bCharacter: null, aStory: null, bStory: null, aPage: null, objects: [] };
let passed = 0;

function ok(condition, label) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  passed += 1;
  console.log(`ok ${passed} - ${label}`);
}

function denied(result, label) {
  ok(Boolean(result.error), label);
}

async function signIn(client, email, password, label) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`${label} sign-in failed; use confirmed ordinary test accounts.`);
  return data.user;
}

async function edgeMustDeny(client, body, label) {
  const { error } = await client.functions.invoke('story-ai', { body });
  ok(Boolean(error), label);
}

async function cleanup() {
  for (const item of created.objects.reverse()) {
    await item.client.storage.from(item.bucket).remove([item.path]);
  }
  if (created.aStory) await userAClient.from('stories').delete().eq('id', created.aStory.id);
  if (created.bStory) await userBClient.from('stories').delete().eq('id', created.bStory.id);
  if (created.aCharacter) await userAClient.from('child_characters').delete().eq('id', created.aCharacter.id);
  if (created.bCharacter) await userBClient.from('child_characters').delete().eq('id', created.bCharacter.id);
  await Promise.allSettled([userAClient.auth.signOut(), userBClient.auth.signOut()]);
}

try {
  const userA = await signIn(userAClient, process.env.SECURITY_TEST_USER_A_EMAIL, process.env.SECURITY_TEST_USER_A_PASSWORD, 'User A');
  const userB = await signIn(userBClient, process.env.SECURITY_TEST_USER_B_EMAIL, process.env.SECURITY_TEST_USER_B_PASSWORD, 'User B');
  ok(userA.id !== userB.id, 'test accounts are distinct users');

  const profileA = await userAClient.from('profiles').select('id,role').eq('id', userA.id).single();
  ok(!profileA.error && profileA.data?.id === userA.id && profileA.data.role === 'user', 'User A reads only a normal own profile');
  const profileBFromA = await userAClient.from('profiles').select('id,role').eq('id', userB.id);
  ok(!profileBFromA.error && profileBFromA.data.length === 0, 'User A cannot read User B profile');
  const profileAFromB = await userBClient.from('profiles').select('id,role').eq('id', userA.id);
  ok(!profileAFromB.error && profileAFromB.data.length === 0, 'User B cannot read User A profile');
  denied(await anonymousClient.from('profiles').select('id').limit(1), 'anonymous profile reads are denied');
  denied(await userAClient.from('profiles').update({ role: 'admin' }).eq('id', userA.id), 'normal users cannot update profile roles');
  denied(await userAClient.from('profiles').insert({ id: userA.id, role: 'admin' }), 'normal users cannot insert admin profiles');

  let result = await userAClient.from('child_characters').insert({ name: 'Phase 8 A', user_id: userA.id }).select('id,user_id').single();
  if (result.error) throw result.error;
  created.aCharacter = result.data;
  result = await userBClient.from('child_characters').insert({ name: 'Phase 8 B', user_id: userB.id }).select('id,user_id').single();
  if (result.error) throw result.error;
  created.bCharacter = result.data;

  result = await userAClient.from('stories').insert({ title: 'Phase 8 A', user_id: userA.id, child_character_id: created.aCharacter.id }).select('id,user_id').single();
  if (result.error) throw result.error;
  created.aStory = result.data;
  result = await userBClient.from('stories').insert({ title: 'Phase 8 B valid', user_id: userB.id, child_character_id: created.bCharacter.id }).select('id,user_id').single();
  if (result.error) throw result.error;
  created.bStory = result.data;
  result = await userAClient.from('story_pages').insert({ user_id: userA.id, story_id: created.aStory.id, page_number: 1, text: 'Phase 8 test' }).select('id').single();
  if (result.error) throw result.error;
  created.aPage = result.data;

  for (const [table, id, label] of [
    ['child_characters', created.aCharacter.id, 'character'],
    ['stories', created.aStory.id, 'story'],
    ['story_pages', created.aPage.id, 'story page'],
  ]) {
    const read = await userBClient.from(table).select('id').eq('id', id);
    ok(!read.error && read.data.length === 0, `User B cannot read User A ${label}`);
    const updatePayload = table === 'stories'
      ? { page_count: 999 }
      : table === 'child_characters'
        ? { name: 'forged' }
        : { text: 'forged' };
    const update = await userBClient.from(table).update(updatePayload).eq('id', id).select('id');
    ok(!update.error && update.data.length === 0, `User B cannot update User A ${label}`);
    const remove = await userBClient.from(table).delete().eq('id', id).select('id');
    ok(!remove.error && remove.data.length === 0, `User B cannot delete User A ${label}`);
  }

  denied(await userBClient.from('stories').insert({ title: 'Forged primary', user_id: userB.id, child_character_id: created.aCharacter.id }), 'composite FK rejects User A primary character on User B story');
  denied(await userBClient.from('story_pages').insert({ user_id: userB.id, story_id: created.aStory.id, page_number: 2 }), 'composite FK/RLS rejects a page in User A story');
  denied(await userBClient.from('stories').insert({ title: 'Forged secondary', user_id: userB.id, secondary_characters: [{ character_id: created.aCharacter.id }] }), 'secondary-character trigger rejects User A character UUID');

  const malformedSecondary = [
    [{ character_id: 'not-a-uuid' }],
    [{ character_id: created.bCharacter.id, extra: true }],
    [{ character_id: created.bCharacter.id, quick_description: 'both' }],
    [{ quick_description: '' }],
    ['not-an-object'],
  ];
  for (const value of malformedSecondary) {
    denied(await userBClient.from('stories').insert({ title: 'Malformed secondary', user_id: userB.id, secondary_characters: value }), `malformed secondary characters rejected: ${JSON.stringify(value)}`);
  }
  const validStillExists = await userBClient.from('stories').select('id').eq('id', created.bStory.id).single();
  ok(!validStillExists.error, 'malformed writes do not corrupt an existing valid story');

  const onePixelPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  const storageCases = [
    ['character-photos', `${userA.id}/${created.aCharacter.id}/original.png`],
    ['character-images', `${userA.id}/${created.aCharacter.id}/portrait.png`],
    ['story-images', `${userA.id}/${created.aStory.id}/cover.png`],
  ];
  for (const [bucket, path] of storageCases) {
    const upload = await userAClient.storage.from(bucket).upload(path, onePixelPng, { contentType: 'image/png', upsert: true });
    if (upload.error) throw upload.error;
    created.objects.push({ client: userAClient, bucket, path });
    const list = await userBClient.storage.from(bucket).list(`${userA.id}/${path.split('/')[1]}`);
    ok(!list.error && list.data.length === 0, `User B cannot list User A object in ${bucket}`);
    denied(await userBClient.storage.from(bucket).download(path), `User B cannot download User A object in ${bucket}`);
    denied(await userBClient.storage.from(bucket).createSignedUrl(path, 60), `User B cannot sign User A object in ${bucket}`);
    denied(await userBClient.storage.from(bucket).upload(path, onePixelPng, { contentType: 'image/png', upsert: true }), `User B cannot overwrite User A object in ${bucket}`);
    await userBClient.storage.from(bucket).remove([path]);
    const ownerStillReads = await userAClient.storage.from(bucket).download(path);
    ok(!ownerStillReads.error, `User B delete attempt leaves User A ${bucket} object intact`);
    denied(await anonymousClient.storage.from(bucket).download(path), `anonymous download is denied in ${bucket}`);
    denied(await anonymousClient.storage.from(bucket).createSignedUrl(path, 60), `anonymous signing is denied in ${bucket}`);
  }

  const forgedPaths = [
    { path: `${userB.id}/../escape.png`, behavior: 'reject' },
    { path: `${userB.id}/${created.bCharacter.id}/../portrait.png`, behavior: 'reject' },
    {
      path: `${userB.id}//${created.bCharacter.id}/portrait.png`,
      behavior: 'normalize',
      canonical: `${userB.id}/${created.bCharacter.id}/portrait.png`,
    },
    { path: `missing-prefix/${created.bCharacter.id}/portrait.png`, behavior: 'reject' },
  ];
  for (const { path, behavior, canonical } of forgedPaths) {
    const upload = await userBClient.storage.from('character-images').upload(path, onePixelPng, { contentType: 'image/png' });
    if (behavior === 'normalize' && !upload.error) {
      ok(upload.data?.path === canonical, `extra slash is normalized only to User B canonical path: ${path}`);
      await userBClient.storage.from('character-images').remove([canonical]);
      continue;
    }
    if (!upload.error) {
      await userBClient.storage.from('character-images').remove([path]);
      throw new Error(`FAILED: malformed Storage path was accepted without safe canonicalization: ${path}`);
    }
    ok(true, `malformed Storage path rejected: ${path}`);
  }
  denied(await userBClient.from('stories').update({ cover_image_path: 'https://example.invalid/signed-token' }).eq('id', created.bStory.id), 'database rejects persisted signed/external cover URLs');

  denied(await userAClient.from('ai_usage').select('id').limit(1), 'browser cannot read ai_usage');
  denied(await userAClient.from('ai_usage').insert({ user_id: userA.id, operation: 'forged' }), 'browser cannot forge ai_usage');

  await edgeMustDeny(anonymousClient, { action: 'suggest-continuation', storyId: created.aStory.id }, 'anonymous Edge invocation is denied');
  const attacks = [
    ['analyze-character', { characterId: created.aCharacter.id }],
    ['generate-character-image', { characterId: created.aCharacter.id, description: 'forged' }],
    ['generate-page-image', { storyId: created.aStory.id, pageNumber: 1, text: 'forged' }],
    ['suggest-continuation', { storyId: created.aStory.id }],
    ['continue-story', { storyId: created.aStory.id, pageCount: 3, continuationPrompt: 'forged' }],
    ['translate-story', { storyId: created.aStory.id, language: 'es' }],
    ['generate-cover', { storyId: created.aStory.id, prompt: 'forged' }],
  ];
  for (const [action, body] of attacks) {
    await edgeMustDeny(userBClient, { action, ...body }, `User B AI ${action} against User A resource is denied`);
  }

  const invalidJwt = await fetch(`${url}/functions/v1/story-ai`, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer invalid.jwt.value', 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ action: 'suggest-continuation', storyId: created.aStory.id }),
  });
  ok(invalidJwt.status === 401, 'invalid JWT Edge invocation is denied');

  console.log(`\nPASS: ${passed} ordinary-user/anonymous isolation assertions succeeded.`);
} finally {
  await cleanup();
}
