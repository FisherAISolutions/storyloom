import { AppError } from './errors.ts';
import { LIMITS, MODELS } from './config.ts';

const apiKey = () => {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new AppError('AI_PROVIDER', 'OpenAI is not configured.', 503);
  return key;
};

async function openAiFetch(path: string, init: RequestInit) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...init.headers },
  });
  if (!response.ok) {
    console.error('OpenAI request failed', path, response.status);
    throw new AppError(response.status === 429 ? 'RATE_LIMIT' : 'AI_PROVIDER', response.status === 429 ? 'AI capacity is temporarily limited. Please try again shortly.' : 'The AI provider could not complete the request.', response.status === 429 ? 429 : 502);
  }
  return response.json();
}

function outputText(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new AppError('AI_RESPONSE_INVALID', 'The AI provider returned no usable text.', 502);
}

export async function structured(prompt: string, name: string, schema: Record<string, unknown>, image?: Blob) {
  const input = image ? [{ role: 'user', content: [
    { type: 'input_text', text: prompt },
    { type: 'input_image', image_url: `data:${image.type};base64,${bytesToBase64(new Uint8Array(await image.arrayBuffer()))}`, detail: 'high' },
  ] }] : prompt;
  const response = await openAiFetch('/responses', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: image ? MODELS.VISION : MODELS.TEXT, input, reasoning: { effort: 'none' }, store: false, text: { format: { type: 'json_schema', name, strict: true, schema } } }),
  });
  let parsed;
  try { parsed = JSON.parse(outputText(response)); } catch { throw new AppError('AI_RESPONSE_INVALID', 'The AI provider returned malformed structured data.', 502); }
  return { value: parsed, usage: response.usage || {}, model: image ? MODELS.VISION : MODELS.TEXT };
}

export async function generateImage(prompt: string, source?: Blob) {
  let response;
  if (source) {
    const form = new FormData();
    const extension = source.type === 'image/jpeg' ? 'jpg' : source.type === 'image/webp' ? 'webp' : 'png';
    form.append('model', MODELS.IMAGE); form.append('prompt', prompt); form.append('image', source, `source.${extension}`);
    form.append('size', '1024x1024'); form.append('quality', 'medium'); form.append('output_format', 'png');
    response = await openAiFetch('/images/edits', { method: 'POST', body: form });
  } else {
    response = await openAiFetch('/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODELS.IMAGE, prompt, size: '1024x1024', quality: 'medium', output_format: 'png' }) });
  }
  const encoded = response?.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || !encoded) throw new AppError('AI_RESPONSE_INVALID', 'The AI provider returned no usable image.', 502);
  const bytes = base64ToBytes(encoded);
  if (!bytes.length || bytes.length > LIMITS.IMAGE_BYTES || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new AppError('AI_RESPONSE_INVALID', 'The generated image format is invalid.', 502);
  return { blob: new Blob([bytes], { type: 'image/png' }), model: MODELS.IMAGE, usage: response.usage || {} };
}

function bytesToBase64(bytes: Uint8Array) { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; }
