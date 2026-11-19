import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const migration=read('supabase/migrations/20260822000000_marketplace_personalization.sql');
const publicFn=read('supabase/functions/community-public/index.ts');
const page=read('src/pages/PersonalizeStory.jsx');
const service=read('src/services/marketplace.js');

test('author personalization is opt-in and constrained to a character in the owned published story',()=>{
  assert.match(migration,/enabled boolean not null default false/);
  assert.match(migration,/cs\.story_id=p_story_id and cs\.user_id=v_user/);
  assert.match(migration,/sc\.story_id=p_story_id and sc\.user_id=v_user/);
  assert.match(migration,/CHARACTER_NOT_IN_STORY/);
});

test('paid personalization requires an active purchase and forbids self-personalization',()=>{
  assert.match(migration,/SELF_PERSONALIZATION_NOT_ALLOWED/);
  assert.match(migration,/marketplace_enabled and not exists/);
  assert.match(migration,/buyer_user_id=v_buyer and mp\.status='active'/);
  assert.match(migration,/PURCHASE_REQUIRED/);
});

test('private copy is buyer-owned and never reuses protected source image paths',()=>{
  assert.match(migration,/marketplace_personalized_story_owner_fk/);
  assert.match(migration,/values\(v_buyer,v_story_id,v_page\.page_number/s);
  assert.match(migration,/v_page\.illustration_instructions end,\s*null\)/);
  assert.doesNotMatch(migration,/v_page\.image_path/);
  assert.match(migration,/cover_image_path.*null/s);
});

test('Character and World Bible continuity is cloned without altering the source story',()=>{
  assert.match(migration,/insert into public\.story_worlds/);
  assert.match(migration,/insert into public\.story_locations/);
  assert.match(migration,/insert into public\.story_page_scenes/);
  assert.match(migration,/insert into public\.story_characters/);
  assert.match(migration,/insert into public\.story_character_states/);
  assert.doesNotMatch(migration,/update public\.story_pages/);
});

test('generation requires explicit confirmation and uses existing metered page-image calls',()=>{
  assert.match(migration,/if not p_confirmed then raise exception 'CONFIRMATION_REQUIRED'/);
  assert.match(page,/I approve using up to/);
  assert.match(page,/storyStudio\.generatePageImage/);
  assert.match(page,/image-generation credits/);
  assert.doesNotMatch(page,/free unlimited|price_cents|Stripe/i);
});

test('edition creation is idempotent and direct table writes remain unavailable',()=>{
  assert.match(migration,/unique \(buyer_user_id, request_id\)/);
  assert.match(migration,/marketplace_one_generating_edition_idx/);
  assert.match(migration,/where mpe\.buyer_user_id=v_buyer and mpe\.request_id=p_request_id/);
  assert.match(migration,/revoke all on public\.marketplace_personalization_settings, public\.marketplace_personalized_editions/);
  assert.doesNotMatch(migration,/grant (insert|update|delete)/);
  assert.match(service,/crypto\.randomUUID|requestId/);
});

test('public API exposes only safe offer metadata, not Character Bibles or buyer details',()=>{
  assert.match(publicFn,/marketplace_personalization_settings/);
  assert.match(publicFn,/estimated_image_units/);
  assert.doesNotMatch(publicFn,/bible_snapshot|appearance_bible|buyer_character_id/);
});

test('personalized editions remain owner-only reader books',()=>{
  assert.match(migration,/Buyers read personalized editions/);
  assert.match(migration,/\(select auth\.uid\(\)\) = buyer_user_id/);
  assert.match(page,/navigate\(`\/story\/\$\{edition\.story_id\}\/read`\)/);
});
