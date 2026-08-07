import { AppError } from './errors.ts';
import { ART_STYLE_PROMPTS, LIMITS } from './config.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('VALIDATION', 'Request body must be an object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = LIMITS.TEXT, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError('VALIDATION', `${label} is invalid.`);
  return value.trim();
}
export function uuid(value: unknown, label: string): string {
  const result = text(value, label, 64);
  if (!UUID.test(result)) throw new AppError('VALIDATION', `${label} is invalid.`);
  return result;
}
export function integerIn(value: unknown, allowed: Set<number>, label: string): number {
  if (!Number.isInteger(value) || !allowed.has(value as number)) throw new AppError('VALIDATION', `${label} is not supported.`);
  return value as number;
}
export function artStyle(value: unknown): string {
  const id = text(value, 'Art style', 32);
  if (!ART_STYLE_PROMPTS[id]) throw new AppError('VALIDATION', 'Art style is not supported.');
  return id;
}
export function characterInputs(value: unknown) {
  if (!Array.isArray(value) || value.length > LIMITS.CHARACTERS) throw new AppError('VALIDATION', 'Characters are invalid.');
  return value.map((item) => {
    const row = object(item);
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '';
    const description = typeof row.description === 'string' ? row.description.trim().slice(0, 1_500) : '';
    if (!name && !description) throw new AppError('VALIDATION', 'Character details are invalid.');
    return { name, description };
  });
}
