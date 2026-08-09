import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260810000000_ai_economics_admin.sql');
const marginGuard = read('supabase/migrations/20260810010000_ai_economics_unpriced_margin_guard.sql');
const edge = read('supabase/functions/story-ai/index.ts');
const page = read('src/pages/AdminAiEconomics.jsx');
const service = read('src/services/analytics.js');

test('admin analytics is enforced by the authoritative profile role', () => {
  assert.match(migration, /p\.id=v_user and p\.role='admin'/);
  assert.match(migration, /raise exception 'ADMIN_REQUIRED'/);
  assert.match(migration, /grant execute on function public\.get_admin_ai_economics\(text\) to authenticated/);
  assert.match(service, /get_admin_ai_economics/);
  assert.match(read('src/components/ProtectedRoute.jsx'), /user\?\.role !== 'admin'/);
});

test('normal clients cannot read raw pricing, segments, usage, or estimates', () => {
  assert.match(migration, /revoke all on public\.story_generation_segments,public\.ai_provider_pricing from public,anon,authenticated/);
  assert.match(migration, /revoke all on public\.ai_usage_cost_estimates from public,anon,authenticated/);
  assert.doesNotMatch(migration, /grant select on public\.(ai_provider_pricing|story_generation_segments|ai_usage)/);
});

test('cost calculation uses configured token and image rates and stays null when unavailable', () => {
  assert.match(migration, /p_input_tokens::numeric\/1000000\)\*p\.input_usd_per_million/);
  assert.match(migration, /p_output_tokens::numeric\/1000000\)\*p\.output_usd_per_million/);
  assert.match(migration, /p_image_count\*p\.image_usd_per_unit/);
  assert.match(migration, /if p\.image_usd_per_unit is null then return null/);
  assert.match(migration, /phase11-unconfigured-v1/);
});

test('request correlation links provider and entitlement usage without prompts', () => {
  for (const field of ['request_id','reservation_id','entitlement_bucket','entitlement_amount','plan_key']) assert.match(migration, new RegExp(`add column ${field}`));
  assert.match(edge, /reservation_id: reservation\?\.reservationId/);
  assert.match(edge, /request_id: input\.requestId/);
  assert.match(read('src/pages/CreateStory.jsx'), /linkGeneration\(story\.id, content\.analytics_request_id\)/);
  assert.match(read('src/pages/CreateStory.jsx'), /catch \{ console\.error\('Story analytics link failed'\); \}/);
  assert.match(edge, /if \(segment\.error\) console\.error\('continuation analytics segment insert failed'\)/);
  assert.doesNotMatch(migration, /full_prompt|prompt_text|story_text|photo_bytes/);
});

test('image operation classification remains economically distinct', () => {
  for (const kind of ['character_portrait','initial_page_illustration','continuation_illustration','repaint','custom_cover']) {
    assert.match(edge + migration, new RegExp(kind));
  }
  assert.match(edge, /story_generation_segments/);
  assert.match(edge, /existingPage\.data\?\.image_path/);
});

test('initial story aggregation covers every supported page count and excludes later actions', () => {
  assert.match(migration, /\(values\(6\),\(10\),\(15\),\(24\),\(30\)\) sizes\(page_count\)/);
  assert.match(migration, /i\.generation_kind='initial_page_illustration'/);
  assert.match(migration, /t\.generation_kind='initial_story'/);
  assert.doesNotMatch(migration.match(/initial_books as \([\s\S]*?\), story_sizes as/)[0], /custom_cover|repaint|translation|continuation_illustration/);
});

test('continuation aggregation covers 3, 5, and 10 pages with correlated images', () => {
  assert.match(migration, /\(values\(3\),\(5\),\(10\)\) sizes\(page_count\)/);
  assert.match(migration, /i\.parent_request_id=c\.request_id/);
  assert.match(edge, /generationKind = 'continuation'/);
});

test('test revenue and margin are explicitly estimates rather than net profit', () => {
  assert.match(migration, /'stripe_mode','TEST'/);
  assert.match(migration, /'margin_label','AI GROSS MARGIN ESTIMATE'/);
  assert.match(page, /Stripe test mode/);
  assert.match(page, /excludes Stripe fees, hosting, taxes, support, refunds/);
  assert.doesNotMatch(page, /net profit/i);
  assert.match(marginGuard, /prices_complete/);
  assert.match(marginGuard, /'ai_gross_margin_estimate_usd',null/);
  assert.match(marginGuard, /'estimated_max_ai_cost_usd',null/);
});

test('zero and small samples remain visible without fabricated averages', () => {
  assert.match(page, /Not configured/);
  assert.match(page, /Priced samples/);
  assert.match(page, /No samples in this range/);
  assert.match(migration, /nullif\(count\(\*\),0\)/);
});

test('admin payload and UI contain no private story content or media', () => {
  const payload = migration.match(/select jsonb_build_object\([\s\S]*?\) into v_result/)[0];
  assert.doesNotMatch(payload, /prompt|summary|story_text|page_text|photo_path|image_path/);
  assert.doesNotMatch(page, /story\.title|row\.story_text|row\.photo_path|row\.image_path/);
});
