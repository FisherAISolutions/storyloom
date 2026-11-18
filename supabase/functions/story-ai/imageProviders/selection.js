import { modelDefinition, supportsCapabilities } from './catalog.js';

export function selectImageProviders({ mode, providers, requiredCapabilities, allowPaidFallback, isPayingCustomer }) {
  const enabled = providers
    .filter((entry) => entry.enabled && entry.available !== false)
    .map((entry) => ({ ...entry, definition: modelDefinition(entry.provider, entry.model) }))
    .filter((entry) => supportsCapabilities(entry.definition, requiredCapabilities))
    .filter((entry) => entry.remainingRequests == null || entry.remainingRequests > 0)
    .filter((entry) => entry.remainingNeurons == null || entry.definition.estimatedNeurons == null || entry.remainingNeurons >= entry.definition.estimatedNeurons)
    .filter((entry) => !entry.definition.paid || entry.remainingSpendUsd == null || entry.remainingSpendUsd >= entry.definition.estimatedCostUsd);

  if (mode === 'openai_only') return enabled.filter((entry) => entry.provider === 'openai').slice(0, 1);
  if (mode === 'manual') return enabled.sort((a, b) => a.priority - b.priority).slice(0, 1);

  // Paying customers retain the configured production-quality OpenAI path. Free-first
  // is limited to staff/test entitlements unless an Owner later creates a plan policy.
  if (isPayingCustomer) return enabled.filter((entry) => entry.provider === 'openai').slice(0, 1);
  return enabled
    .filter((entry) => !entry.definition.paid || (allowPaidFallback && entry.allowPaidFallback && entry.remainingSpendUsd != null))
    .sort((a, b) => Number(a.definition.paid) - Number(b.definition.paid) || a.priority - b.priority);
}

export function isRetryableProviderFailure(error) {
  return ['PROVIDER_QUOTA', 'PROVIDER_UNAVAILABLE', 'RATE_LIMIT'].includes(error?.providerCode);
}

