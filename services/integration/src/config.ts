import { timingSafeEqual, createHmac } from 'node:crypto';
import { Cipher, type Credential, type Principal } from './domain.js';

export type Config = { databaseUrl: string; databaseSchema?: string; rabbitUrl: string; port: number; host: string; cipher: Cipher; credentials: Credential[] };
export function config(env = process.env): Config {
  const required = (key: string): string => {
    if (!env[key]) throw new Error(`${key} is required.`);
    return env[key]!;
  };
  const credentials: Credential[] = JSON.parse(required('INTEGRATION_CREDENTIALS'));
  if (!Array.isArray(credentials) || !credentials.length) throw new Error('At least one integration credential is required.');
  const ids = new Set<string>();
  const tokens = new Set<string>();
  for (const credential of credentials) {
    if (!credential || !['producer', 'operator'].includes(credential.role) ||
      !['id','tenantId','branchId','source'].every(key => typeof credential[key as keyof Credential] === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(credential[key as keyof Credential])) ||
      typeof credential.token !== 'string' || credential.token.length < 32 || ids.has(credential.id) || tokens.has(credential.token)) {
      throw new Error('Credentials require unique IDs/tokens, scope, role and a secret of at least 32 characters.');
    }
    ids.add(credential.id); tokens.add(credential.token);
  }
  const port = Number(env.PORT ?? 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid.');
  if (env.DATABASE_SCHEMA && !/^[a-z_][a-z0-9_]{0,62}$/.test(env.DATABASE_SCHEMA)) throw new Error('DATABASE_SCHEMA is invalid.');
  return { databaseUrl: required('DATABASE_URL'), databaseSchema: env.DATABASE_SCHEMA || undefined, rabbitUrl: required('RABBITMQ_URL'), port,
    host: env.HOST ?? '127.0.0.1', cipher: new Cipher(required('PAYLOAD_KEY')), credentials };
}
export function principalOf({ token: _token, ...principal }: Credential): Principal { return principal; }
export function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function authenticate(token: string, credentials: Credential[]): Credential | undefined {
  return credentials.find(credential => equalSecret(token, credential.token));
}
export function signature(token: string, messageId: string, xml: string): string {
  return createHmac('sha256', token).update(`${messageId}\n${xml}`).digest('hex');
}
