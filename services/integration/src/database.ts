import { Pool, type QueryResultRow } from 'pg';
import { readFile } from 'node:fs/promises';

export interface Sql {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
export interface Database extends Sql {
  transaction<T>(run: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class Postgres implements Database {
  private pool: Pool;
  constructor(url: string, private schema?: string) {
    if (schema && !/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('DATABASE_SCHEMA is invalid.');
    this.pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 3000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000 });
    this.pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  }
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) {
    if (this.schema) return this.transaction(tx => tx.query<T>(sql, params));
    return this.pool.query<T>(sql, params);
  }
  async transaction<T>(run: (sql: Sql) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Transaction-local configuration survives pooling without leaking the schema to the next borrower.
      if (this.schema) await client.query(`SET LOCAL search_path TO "${this.schema}", pg_catalog`);
      const value = await run(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
export async function migrate(db: Database): Promise<void> {
  const schema = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  await db.transaction(async tx => {
    // Serialize migrations across replicas; migration execution is an explicit deployment step.
    await tx.query('SELECT pg_advisory_xact_lock(74832001)');
    await tx.query('CREATE TABLE IF NOT EXISTS integration_migration (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = await tx.query('SELECT version FROM integration_migration WHERE version = 1');
    if (!applied.rows.length) {
      await tx.query(schema);
      await tx.query('INSERT INTO integration_migration (version) VALUES (1)');
    }
  });
}
