import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260818000000_admin_control_center.sql');

test('staff roles are authoritative and browser users cannot write admin tables', () => {
  assert.match(migration, /role in \('owner', 'admin', 'moderator', 'support', 'tester', 'user'\)/);
  for (const table of ['admin_audit_log', 'admin_ai_test_limits', 'admin_ai_test_usage', 'promotional_credit_grants', 'promotional_credit_reservations']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.admin_audit_log[\s\S]+from public, anon, authenticated/);
});

test('initial owner assignment is one-time, ID-based, and unavailable to browser roles', () => {
  assert.match(migration, /not exists \(select 1 from auth\.users u where u\.id = p_user_id\)/);
  assert.match(migration, /OWNER_ALREADY_EXISTS/);
  assert.match(migration, /grant execute on function public\.assign_initial_owner\(uuid\) to service_role/);
  assert.match(migration, /profiles_protect_last_owner/);
  assert.match(migration, /LAST_OWNER_REQUIRED/);
  assert.doesNotMatch(migration, /@.*owner|email.*owner/i);
});

test('role management prevents admin and owner privilege escalation', () => {
  assert.match(migration, /p_role not in \('admin', 'moderator', 'support', 'tester', 'user'\)/);
  assert.match(migration, /v_actor_role = 'admin'[\s\S]+v_old_role not in \('owner', 'admin'\)/);
  assert.match(migration, /user_role_changed/);
});

test('owner can use the existing detailed operational economics dashboard', () => {
  assert.match(migration, /get_admin_ai_economics_base\(text\)/);
  assert.match(migration, /p\.role in \(''owner'',''admin''\)/);
  assert.match(migration, /ADMIN_ECONOMICS_GUARD_NOT_FOUND/);
});

test('staff AI testing is authenticated, audited, cost-capped, and concurrency-safe', () => {
  assert.match(migration, /v_role in \('owner', 'admin', 'tester'\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /v_used \+ v_estimate > v_limit/);
  assert.match(migration, /admin_ai_test_usage/);
  assert.match(migration, /source in \('free', 'subscription', 'override', 'staff_test', 'promotion'\)/);
  assert.match(read('supabase/functions/story-ai/index.ts'), /const story = await ownedStory\(client, storyId\)/);
  assert.match(read('supabase/functions/story-ai/entitlements.ts'), /reserve_ai_entitlement/);
});

test('complimentary credits are audited and released after provider failure', () => {
  assert.match(migration, /request_id uuid not null unique/);
  assert.match(migration, /where g\.request_id = p_request_id and g\.granted_by = v_actor/);
  assert.match(migration, /complimentary_credits_granted/);
  assert.match(migration, /complimentary_credits_revoked/);
  assert.match(migration, /promotional_credit_reservations/);
  assert.match(migration, /remaining_story_units = remaining_story_units \+ case/);
  assert.match(migration, /remaining_image_units = remaining_image_units \+ case/);
});

test('admin UI uses only server-authorized RPCs', () => {
  const service = read('src/services/admin.js');
  const routes = read('src/components/ProtectedRoute.jsx');
  assert.match(service, /get_admin_control_center/);
  assert.match(service, /admin_set_user_role/);
  assert.match(service, /admin_grant_complimentary_credits/);
  assert.match(service, /admin_revoke_complimentary_credits/);
  assert.match(service, /admin_set_ai_test_limit/);
  assert.match(routes, /\['owner', 'admin'\]\.includes\(user\?\.role\)/);
  assert.match(routes, /\['owner', 'admin', 'moderator'\]\.includes\(user\?\.role\)/);
});
