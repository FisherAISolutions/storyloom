export class ServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'ServiceError';
    this.code = code;
  }
}

const PERMISSION_CODES = new Set(['42501', 'PGRST301']);

export function toServiceError(error, operation, { notFound = false, storage = false } = {}) {
  if (error instanceof ServiceError) return error;

  if (notFound || error?.code === 'PGRST116') {
    return new ServiceError('NOT_FOUND', 'The requested resource was not found.');
  }

  if (PERMISSION_CODES.has(error?.code) || error?.status === 401 || error?.status === 403) {
    return new ServiceError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
  }

  return new ServiceError(
    storage ? 'STORAGE' : 'DATABASE',
    storage ? 'The file operation could not be completed.' : `${operation} could not be completed.`,
    { cause: error },
  );
}

export function requireObject(value, label = 'Input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError('VALIDATION', `${label} must be an object.`);
  }
}

export function requireId(value, label = 'ID') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceError('VALIDATION', `${label} is required.`);
  }
  return value.trim();
}

export function rejectOwnershipOverride(input) {
  if (Object.prototype.hasOwnProperty.call(input, 'user_id')) {
    throw new ServiceError('VALIDATION', 'Resource ownership cannot be supplied by the caller.');
  }
}

export function pickDefined(input, fields) {
  return Object.fromEntries(
    fields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]),
  );
}
