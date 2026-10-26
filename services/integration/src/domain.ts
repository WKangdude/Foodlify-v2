import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type Principal = { id: string; tenantId: string; branchId: string; source: string; role: 'producer' | 'operator' };
export type Credential = Principal & { token: string };
export type Policy = { maxRetries: number; baseSeconds: number; multiplier: number; maxSeconds: number; jitterPercent: number };
export const defaultPolicy: Policy = { maxRetries: 5, baseSeconds: 2, multiplier: 2, maxSeconds: 60, jitterPercent: 20 };
export class MessageError extends Error {
  constructor(public code: string, public retryable: boolean, message: string) { super(message); }
}
export function safeError(error: unknown): MessageError {
  return error instanceof MessageError ? error : new MessageError('PROCESSING_FAILED', true, 'Processing failed; inspect service health.');
}
export function delaySeconds(policy: Policy, retryCount: number, random = Math.random): number {
  const nominal = policy.baseSeconds * policy.multiplier ** retryCount;
  const jitter = 1 + (random() * 2 - 1) * policy.jitterPercent / 100;
  return Math.min(policy.maxSeconds, nominal * jitter);
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class Cipher {
  private key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, 'base64');
    if (this.key.length !== 32) throw new Error('PAYLOAD_KEY must be a base64-encoded 32-byte key.');
  }
  encrypt(payload: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const content = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), content.toString('base64')].join('.');
  }
  decrypt(payload: string): string {
    const [version, iv, tag, content] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || content === undefined) throw new Error('Invalid encrypted payload.');
    const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(content, 'base64')), cipher.final()]).toString('utf8');
  }
}

export const routes: Record<string, { source: string; destinations: string[] }> = {
  OrderPlaced: { source: 'orders', destinations: ['kitchen', 'billing'] },
  OrderUpdated: { source: 'orders', destinations: ['kitchen', 'billing'] },
  OrderCancelled: { source: 'orders', destinations: ['kitchen', 'billing'] },
  BillFinalized: { source: 'orders', destinations: ['billing'] },
  KitchenTicketAccepted: { source: 'kitchen', destinations: ['orders'] },
  KitchenStatusChanged: { source: 'kitchen', destinations: ['orders'] },
  PaymentRecorded: { source: 'billing', destinations: ['dining-room', 'reporting'] },
  VisitOpened: { source: 'dining-room', destinations: ['orders', 'menu'] },
  VisitClosed: { source: 'dining-room', destinations: ['orders', 'menu'] },
  CatalogPublished: { source: 'catalog', destinations: ['orders', 'menu'] },
};
export const destinations = [...new Set(Object.values(routes).flatMap(route => route.destinations))];
