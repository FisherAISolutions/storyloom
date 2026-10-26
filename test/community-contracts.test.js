import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync('supabase/migrations/20260812000000_community_stories.sql','utf8');
const fn=readFileSync('supabase/functions/community-public/index.ts','utf8');
const service=readFileSync('src/services/community.js','utf8');

test('community publication is owner opt-in and cross-owner writes are denied',()=>{ assert.match(migration,/auth\.uid\(\)\) = user_id/); assert.match(migration,/exists \(select 1 from public\.stories/); assert.match(migration,/community_story_owner_fk/); assert.match(service,/requireAuthenticatedUser/); });
test('unpublished and hidden stories are excluded from anonymous delivery',()=>{ assert.match(fn,/\.eq\('status', 'published'\)/); assert.doesNotMatch(migration,/policy[\s\S]*to anon/); });
test('public story payload excludes identity, photos, paths, billing, and internal metadata',()=>{ assert.doesNotMatch(fn,/email|photo_path|character_image_path|stripe|billing|user_id/); assert.doesNotMatch(fn,/image_path:/); assert.match(fn,/cover_url/); assert.match(fn,/image_url/); });
test('admin moderation derives authority from profiles role',()=>{ assert.match(migration,/public\.is_admin\(\)/); assert.match(migration,/featured = false/); assert.match(migration,/status in \('published', 'removed'\)/); });
