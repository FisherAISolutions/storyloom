import test from 'node:test';
import assert from 'node:assert/strict';
import { selectImageProviders, isRetryableProviderFailure } from '../supabase/functions/story-ai/imageProviders/selection.js';

const providers = [
  { provider: 'cloudflare', model: '@cf/black-forest-labs/flux-1-schnell', enabled: true, available: true, priority: 10, remainingRequests: 20, remainingSpendUsd: 1, allowPaidFallback: false },
  { provider: 'cloudflare', model: '@cf/black-forest-labs/flux-2-klein-9b', enabled: true, available: true, priority: 20, remainingRequests: 20, remainingSpendUsd: 1, allowPaidFallback: false },
  { provider: 'openai', model: 'gpt-image-2', enabled: true, available: true, priority: 100, remainingRequests: null, remainingSpendUsd: 1, allowPaidFallback: true },
];

test('free-first selects a capable free provider before authorized paid fallback', () => {
  const selected = selectImageProviders({ mode: 'free_first', providers, requiredCapabilities: ['text_to_image'], allowPaidFallback: true, isPayingCustomer: false });
  assert.deepEqual(selected.map((entry) => entry.provider), ['cloudflare', 'cloudflare', 'openai']);
});

test('paid fallback is excluded unless the Owner policy authorizes it', () => {
  const selected = selectImageProviders({ mode: 'free_first', providers, requiredCapabilities: ['text_to_image'], allowPaidFallback: false, isPayingCustomer: false });
  assert.ok(selected.every((entry) => entry.provider !== 'openai'));
});

test('quota-exhausted providers and models lacking reference capabilities are excluded', () => {
  const exhausted = providers.map((entry) => entry.model.includes('klein-9b') ? { ...entry, remainingRequests: 0 } : entry);
  const selected = selectImageProviders({ mode: 'free_first', providers: exhausted, requiredCapabilities: ['image_edit', 'single_reference'], allowPaidFallback: true, isPayingCustomer: false });
  assert.deepEqual(selected.map((entry) => entry.provider), ['openai']);
});

test('paying customers are not silently downgraded from OpenAI', () => {
  const selected = selectImageProviders({ mode: 'free_first', providers, requiredCapabilities: ['text_to_image'], allowPaidFallback: true, isPayingCustomer: true });
  assert.deepEqual(selected.map((entry) => entry.provider), ['openai']);
});

test('only transient availability and quota failures are eligible for safe fallback', () => {
  assert.equal(isRetryableProviderFailure({ providerCode: 'PROVIDER_QUOTA' }), true);
  assert.equal(isRetryableProviderFailure({ providerCode: 'PROVIDER_UNAVAILABLE' }), true);
  assert.equal(isRetryableProviderFailure({ providerCode: 'PROVIDER_REJECTED' }), false);
});

