import { AppError } from '../errors.ts';
import { LIMITS } from '../config.ts';
import { modelDefinition } from './catalog.js';

const credentials = () => {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!accountId || !token) throw providerError('PROVIDER_UNAVAILABLE', 'Cloudflare Workers AI is not configured.', 503);
  return { accountId, token };
};

function providerError(providerCode: string, message: string, status = 502) {
  const error: any = new AppError(status === 429 ? 'RATE_LIMIT' : 'AI_PROVIDER', message, status);
  error.providerCode = providerCode;
  return error;
}

function bytesFromBase64(value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageResult(bytes: Uint8Array, model: string) {
  if (!bytes.length || bytes.length > LIMITS.IMAGE_BYTES) throw providerError('PROVIDER_INVALID_RESPONSE', 'Cloudflare returned an invalid image.');
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!png && !jpeg) throw providerError('PROVIDER_INVALID_RESPONSE', 'Cloudflare returned an unsupported image format.');
  const definition = modelDefinition('cloudflare', model);
  return { blob: new Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' }), model, provider: 'cloudflare', usage: {}, estimatedCostUsd: definition?.estimatedCostUsd || 0, estimatedNeurons: definition?.estimatedNeurons || null, extension: png ? 'png' : 'jpg' };
}

export async function generateCloudflareImage({ prompt, model, references = [] }: { prompt: string; model: string; references?: Blob[] }) {
  const { accountId, token } = credentials();
  const definition = modelDefinition('cloudflare', model);
  if (!definition) throw providerError('PROVIDER_UNAVAILABLE', 'The configured Cloudflare model is not allowed.', 503);
  const form = new FormData(); form.append('prompt', prompt); form.append('width', '1024'); form.append('height', '1024');
  if (model.includes('flux-1-schnell')) form.append('num_steps', '4');
  else if (model.includes('leonardo')) form.append('num_steps', '20');
  references.slice(0, 4).forEach((reference, index) => form.append(`input_image_${index}`, reference, `reference-${index + 1}.png`));
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!response.ok) {
    const providerCode = response.status === 429 || response.status === 403 ? 'PROVIDER_QUOTA' : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED';
    throw providerError(providerCode, providerCode === 'PROVIDER_QUOTA' ? 'Cloudflare image allowance is exhausted.' : 'Cloudflare could not complete the image request.', response.status === 429 ? 429 : 502);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) return imageResult(new Uint8Array(await response.arrayBuffer()), model);
  const payload = await response.json();
  const encoded = payload?.result?.image || payload?.result?.[0]?.image || payload?.image;
  if (typeof encoded !== 'string') throw providerError('PROVIDER_INVALID_RESPONSE', 'Cloudflare returned no usable image.');
  return imageResult(bytesFromBase64(encoded), model);
}

