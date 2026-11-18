import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edge = readFileSync(new URL('../supabase/functions/story-ai/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260819000000_multi_provider_image_generation.sql', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../supabase/functions/story-ai/imageProviders/index.ts', import.meta.url), 'utf8');

test('character generation requires edit and reference capabilities', () => {
  assert.match(edge, /requiredCapabilities: \['text_to_image', 'image_edit', 'single_reference', 'large_reference'\]/);
  assert.match(edge, /references: \[photo\]/);
});

test('entitlement reservation remains before provider invocation and finalizes once after storage', () => {
  const page = edge.slice(edge.indexOf("if (action === 'generate-page-image')"), edge.indexOf("if (action === 'suggest-continuation')"));
  assert.ok(page.indexOf('assertAiEntitlement') < page.indexOf('generateConfiguredImage'));
  assert.ok(page.indexOf('generateConfiguredImage') < page.indexOf('uploadImage'));
  assert.ok(page.indexOf('uploadImage') < page.indexOf('finalizeAiEntitlement'));
  assert.match(edge, /releaseAiEntitlement\(service, reservation\)/);
});

test('idempotency claims are service-only and concurrent duplicates fail closed', () => {
  assert.match(migration, /request_id uuid primary key/);
  assert.match(migration, /revoke all on public\.image_provider_settings[\s\S]*image_generation_requests from public,anon,authenticated/);
  assert.match(edge, /error\?\.code === '23505'/);
});

test('provider policy is server-authoritative and records quota-safe telemetry', () => {
  assert.match(migration, /OWNER_REQUIRED/);
  assert.match(migration, /grant execute on function public\.record_image_provider_event[\s\S]*to service_role/);
  assert.match(provider, /record_image_provider_event/);
  assert.doesNotMatch(provider, /prompt.*image_provider_events/);
});

