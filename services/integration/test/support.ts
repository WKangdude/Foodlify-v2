import { PGlite } from '@electric-sql/pglite';
import type { QueryResultRow } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Postgres, migrate, type Database, type Sql } from '../src/database.js';
import { Cipher, type Principal } from '../src/domain.js';
import { IntegrationStore } from '../src/store.js';
import { EventValidator } from '../src/xml.js';

export const producer: Principal = { id: 'orders-demo', tenantId: 'demo', branchId: 'main', source: 'orders', role: 'producer' };
export const operator: Principal = { id: 'operator-demo', tenantId: 'demo', branchId: 'main', source: 'integration', role: 'operator' };
export const key = Buffer.alloc(32, 7).toString('base64');
export const sample = await readFile(new URL('../contracts/order-placed.xml', import.meta.url), 'utf8');

export async function fixture() {
  if (process.env.TEST_DATABASE_URL) {
    const url = new URL(process.env.TEST_DATABASE_URL);
    const schema = `integration_test_${randomUUID().replaceAll('-', '')}`;
    const admin = new Postgres(url.toString());
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const db = new Postgres(url.toString());
    await migrate(db);
    const validator = await EventValidator.create();
    const cipher = new Cipher(key);
    const store = new IntegrationStore(db, cipher, validator, { maxRetries: 2, baseSeconds: 0.01, multiplier: 2, maxSeconds: 1, jitterPercent: 0 });
    return { db: db as Database, validator, store, cipher, close: async () => {
      validator.close(); await db.close(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.close();
    } };
  }
  const pg = new PGlite();
  function sql(client: Pick<PGlite, 'query' | 'exec'>): Sql {
    return {
      async query<T extends QueryResultRow>(text: string, params?: unknown[]) {
        if (params?.length) {
          const result = await client.query<T>(text, params);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        }
        const results = await client.exec(text);
        const result = results.at(-1)!;
        return { rows: result.rows as T[], rowCount: result.affectedRows ?? result.rows.length };
      },
    };
  }
  const db: Database = { ...sql(pg), transaction: run => pg.transaction(tx => run(sql(tx))), close: () => pg.close() };
  await pg.exec(await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
  const validator = await EventValidator.create();
  const cipher = new Cipher(key);
  const store = new IntegrationStore(db, cipher, validator, { maxRetries: 2, baseSeconds: 0.01, multiplier: 2, maxSeconds: 1, jitterPercent: 0 });
  return { db, validator, store, cipher, close: async () => { validator.close(); await db.close(); } };
}
export async function due(db: Database) {
  await db.query("UPDATE message_hospital SET next_retry_at=now()-interval '1 second' WHERE status='pending'");
}
