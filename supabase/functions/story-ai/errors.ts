export type ErrorCode = 'AUTH_REQUIRED' | 'PERMISSION_DENIED' | 'VALIDATION' | 'AI_PROVIDER' | 'AI_RESPONSE_INVALID' | 'STORAGE' | 'DATABASE' | 'RATE_LIMIT';

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public status = 400) { super(message); }
}

export const jsonResponse = (body: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

export function safeError(error: unknown) {
  if (error instanceof AppError) return error;
  console.error('story-ai internal failure', error instanceof Error ? error.message : 'unknown');
  return new AppError('AI_PROVIDER', 'The AI request could not be completed.', 502);
}
