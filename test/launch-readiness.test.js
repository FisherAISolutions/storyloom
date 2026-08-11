import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('marketing and trust routes are public while customer data routes remain protected', () => {
  const app = read('src/App.jsx');
  assert.match(app, /<Route element=\{<Layout \/>\}>[\s\S]*path="\/"/);
  for (const route of ['/pricing', '/privacy', '/terms', '/support']) assert.match(app, new RegExp(`path="${route}"`));
  for (const route of ['/create', '/characters', '/library', '/story/:id', '/billing']) assert.match(app, new RegExp(`path="${route}"`));
  assert.match(app, /<Route element=\{<ProtectedRoute \/>\}>[\s\S]*path="\/create"/);
});

test('production billing URLs fail closed instead of falling back to localhost', () => {
  const shared = read('supabase/functions/_shared/billing.ts');
  const checkout = read('supabase/functions/billing-checkout/index.ts');
  const portal = read('supabase/functions/billing-portal/index.ts');
  assert.match(shared, /export function appUrl\(\)/);
  assert.match(shared, /if \(!configured\) throw new BillingError/);
  assert.doesNotMatch(checkout, /APP_URL.*\|\|.*localhost/);
  assert.doesNotMatch(portal, /APP_URL.*\|\|.*localhost/);
  assert.match(checkout, /appUrl\(\)/);
  assert.match(portal, /appUrl\(\)/);
});

test('Vercel serves the SPA entry point for direct route navigation', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
});

test('public launch surfaces use MyStorybook AI branding and production metadata', () => {
  const publicSources = [
    'index.html',
    'src/components/Layout.jsx',
    'src/pages/Home.jsx',
    'src/pages/Pricing.jsx',
    'src/pages/Privacy.jsx',
    'src/pages/Support.jsx',
    'src/pages/Terms.jsx',
  ].map(read).join('\n');
  assert.match(publicSources, /MyStorybook AI/);
  assert.doesNotMatch(publicSources, /Story Loom|Storyloom|story-loom/i);
  assert.match(read('index.html'), /https:\/\/mystorybookai\.online\//);
  assert.match(read('package.json'), /"name": "mystorybook-ai"/);
});
