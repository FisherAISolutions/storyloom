export class PrintProviderError extends Error {
  constructor(code,message,{retryable=false}={}){super(message);this.name='PrintProviderError';this.code=code;this.retryable=retryable;}
}

export class PrintProviderAdapter {
  constructor(key){if(new.target===PrintProviderAdapter)throw new TypeError('PrintProviderAdapter is abstract.');this.key=key;}
  async listProducts(){throw new PrintProviderError('NOT_IMPLEMENTED','Provider product discovery is not configured.');}
  async createQuote(){throw new PrintProviderError('NOT_IMPLEMENTED','Provider quoting is not configured.');}
  async submitOrder(){throw new PrintProviderError('NOT_IMPLEMENTED','Provider ordering is not configured.');}
  async getOrder(){throw new PrintProviderError('NOT_IMPLEMENTED','Provider tracking is not configured.');}
  async cancelOrder(){throw new PrintProviderError('NOT_IMPLEMENTED','Provider cancellation is not configured.');}
}

const providers=new Map();
export function registerPrintProvider(adapter){if(!(adapter instanceof PrintProviderAdapter)||!adapter.key)throw new TypeError('A valid print provider adapter is required.');providers.set(adapter.key,adapter);}
export function getPrintProvider(key){const provider=providers.get(key);if(!provider)throw new PrintProviderError('PROVIDER_DISABLED','The print provider is not configured.');return provider;}

export function assertFulfillmentAuthorized(order){
  if(order?.payment_status!=='paid')throw new PrintProviderError('PAYMENT_REQUIRED','Confirmed payment is required before provider submission.');
  if(order?.fulfillment_status!=='fulfillment_authorized')throw new PrintProviderError('FULFILLMENT_NOT_AUTHORIZED','The order is not authorized for provider submission.');
  if(!order?.idempotency_key)throw new PrintProviderError('IDEMPOTENCY_REQUIRED','A provider idempotency key is required.');
  return true;
}

export async function withPrintProviderRetry(operation,{maxAttempts=2}={}){
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw new TypeError('Print retry attempts must be between 1 and 3.');
  let lastError;for(let attempt=1;attempt<=maxAttempts;attempt+=1){try{return await operation(attempt);}catch(error){lastError=error;if(!(error instanceof PrintProviderError)||!error.retryable||attempt===maxAttempts)throw error;}}
  throw lastError;
}

export async function submitAuthorizedPrintOrder(order){assertFulfillmentAuthorized(order);return getPrintProvider(order.provider_key).submitOrder(order,{idempotencyKey:order.idempotency_key});}
