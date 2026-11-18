import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.109.0';
import { AppError } from '../errors.ts';
import { generateImage as generateOpenAiImage } from '../openai.ts';
import { generateCloudflareImage } from './cloudflare.ts';
import { selectImageProviders, isRetryableProviderFailure } from './selection.js';

const defaults = [
  { provider: 'openai', model: 'gpt-image-2', enabled: true, priority: 100, allowPaidFallback: false },
  { provider: 'cloudflare', model: '@cf/black-forest-labs/flux-2-klein-4b', enabled: false, priority: 10, allowPaidFallback: false },
];

async function configuration(service: SupabaseClient) {
  const { data, error } = await service.from('image_provider_settings').select('*').order('priority');
  if (error || !data?.length) return { mode: 'openai_only', allowPaidFallback: false, providers: defaults };
  const policy = data.find((row: any) => row.provider_key === 'policy');
  const today = new Date().toISOString().slice(0, 10);
  const usage = await service.from('image_provider_daily_usage').select('provider_key,request_count,estimated_cost_usd,estimated_neurons').eq('usage_date', today);
  const since = `${today}T00:00:00.000Z`;
  const events = await service.from('image_provider_events').select('provider_key,outcome,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(100);
  const usageByProvider = new Map((usage.data || []).map((row: any) => [row.provider_key, row]));
  return {
    mode: policy?.selection_mode || 'openai_only', allowPaidFallback: Boolean(policy?.allow_paid_fallback),
    providers: data.filter((row: any) => row.provider_key !== 'policy').map((row: any) => {
      const used: any = usageByProvider.get(row.provider_key) || {};
      const providerEvents = (events.data || []).filter((event: any) => event.provider_key === row.provider_key);
      const quotaExhausted = providerEvents.some((event: any) => event.outcome === 'quota_exhausted');
      const recentFailures = providerEvents.filter((event: any) => event.outcome !== 'success' && Date.now() - Date.parse(event.created_at) < 5 * 60_000).length;
      return { provider: row.provider_key, model: row.model_key, enabled: row.enabled, available: recentFailures < 3, priority: row.priority, allowPaidFallback: row.allow_paid_fallback,
        remainingRequests: quotaExhausted ? 0 : row.daily_request_limit == null ? null : Math.max(0, row.daily_request_limit - (used.request_count || 0)),
        remainingSpendUsd: row.daily_spend_limit_usd == null ? null : Math.max(0, Number(row.daily_spend_limit_usd) - Number(used.estimated_cost_usd || 0)),
        remainingNeurons: row.daily_neuron_limit == null ? null : Math.max(0, Number(row.daily_neuron_limit) - Number(used.estimated_neurons || 0)) };
    }),
  };
}

export async function generateConfiguredImage(input: { service: SupabaseClient; prompt: string; references?: Blob[]; requiredCapabilities?: string[]; isPayingCustomer?: boolean; requestId: string }) {
  const config = await configuration(input.service);
  const candidates = selectImageProviders({ ...config, requiredCapabilities: input.requiredCapabilities || ['text_to_image'], isPayingCustomer: Boolean(input.isPayingCustomer) });
  if (!candidates.length) throw new AppError('AI_PROVIDER', 'No enabled image provider can safely complete this request.', 503);
  let lastError: any;
  for (const candidate of candidates) {
    try {
      const result = candidate.provider === 'openai'
        ? await generateOpenAiImage(input.prompt, input.references?.[0])
        : await generateCloudflareImage({ prompt: input.prompt, model: candidate.model, references: input.references });
      const estimatedCostUsd = result.estimatedCostUsd ?? candidate.definition.estimatedCostUsd;
      const estimatedNeurons = result.estimatedNeurons ?? candidate.definition.estimatedNeurons;
      await input.service.rpc('record_image_provider_event', { p_request_id: input.requestId, p_provider_key: candidate.provider, p_model_key: candidate.model, p_outcome: 'success', p_estimated_cost_usd: estimatedCostUsd, p_estimated_neurons: estimatedNeurons || 0, p_failure_reason: null });
      return { ...result, provider: candidate.provider, estimatedCostUsd, estimatedNeurons, extension: result.extension || 'png' };
    } catch (error) {
      lastError = error;
      console.error('Image provider failed', candidate.provider, candidate.model, error?.providerCode || 'PROVIDER_ERROR');
      await input.service.rpc('record_image_provider_event', { p_request_id: input.requestId, p_provider_key: candidate.provider, p_model_key: candidate.model, p_outcome: error?.providerCode === 'PROVIDER_QUOTA' ? 'quota_exhausted' : 'failure', p_estimated_cost_usd: 0, p_estimated_neurons: 0, p_failure_reason: error?.providerCode || 'PROVIDER_ERROR' });
      if (!isRetryableProviderFailure(error)) break;
    }
  }
  throw lastError || new AppError('AI_PROVIDER', 'The image provider could not complete the request.', 502);
}

