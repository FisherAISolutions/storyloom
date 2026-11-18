export const IMAGE_PROVIDER_MODES = ['openai_only', 'free_first', 'manual'];

export const IMAGE_MODELS = Object.freeze({
  'openai:gpt-image-2': {
    provider: 'openai', model: 'gpt-image-2', paid: true,
    capabilities: ['text_to_image', 'image_edit', 'single_reference', 'large_reference'],
    estimatedCostUsd: 0.04, estimatedNeurons: null,
  },
  'cloudflare:@cf/black-forest-labs/flux-1-schnell': {
    provider: 'cloudflare', model: '@cf/black-forest-labs/flux-1-schnell', paid: false,
    capabilities: ['text_to_image'], estimatedCostUsd: 0.0006336, estimatedNeurons: 57.6,
  },
  'cloudflare:@cf/black-forest-labs/flux-2-klein-4b': {
    provider: 'cloudflare', model: '@cf/black-forest-labs/flux-2-klein-4b', paid: false,
    capabilities: ['text_to_image', 'image_edit', 'single_reference'], estimatedCostUsd: 0.001148, estimatedNeurons: 104.2,
  },
  'cloudflare:@cf/black-forest-labs/flux-2-klein-9b': {
    provider: 'cloudflare', model: '@cf/black-forest-labs/flux-2-klein-9b', paid: false,
    capabilities: ['text_to_image', 'image_edit', 'single_reference', 'multiple_references'], estimatedCostUsd: 0.015, estimatedNeurons: 1363.64,
  },
  'cloudflare:@cf/leonardo/lucid-origin': {
    provider: 'cloudflare', model: '@cf/leonardo/lucid-origin', paid: false,
    capabilities: ['text_to_image'], estimatedCostUsd: 0.030624, estimatedNeurons: 2784,
  },
  'cloudflare:@cf/leonardo/phoenix-1.0': {
    provider: 'cloudflare', model: '@cf/leonardo/phoenix-1.0', paid: false,
    capabilities: ['text_to_image'], estimatedCostUsd: 0.02552, estimatedNeurons: 2320,
  },
});

export function modelDefinition(provider, model) {
  return IMAGE_MODELS[`${provider}:${model}`] || null;
}

export function supportsCapabilities(definition, required = []) {
  return Boolean(definition) && required.every((capability) => definition.capabilities.includes(capability));
}

