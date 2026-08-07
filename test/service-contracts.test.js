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
