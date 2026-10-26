import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Postgres } from '../src/database.js';

test('database schema names are validated before opening a connection', () => {
  assert.throws(() => new Postgres('postgresql://unused', 'public;drop schema public'), /DATABASE_SCHEMA/);
});

if (process.env.TEST_DATABASE_URL && process.env.RUN_SUPABASE_MIGRATION_TEST === '1') test('Supabase migration keeps integration private and runtime queries use its schema', async () => {
  // Only run on an isolated disposable Postgres instance: this test creates Supabase-style roles.
  const db = new Postgres(process.env.TEST_DATABASE_URL!);
  let backend: Postgres | undefined;
  try {
    await db.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS");
    const migration = await readFile(new URL('../../../supabase/migrations/20261026031134_integration_backend.sql', import.meta.url), 'utf8');
    await db.transaction(async tx => { await tx.query(migration); });
    const schema = await db.query(`SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='integration' AND c.relkind='r'`);
    assert.equal(schema.rows.length, 7);
    assert.ok(schema.rows.every(row => row.relrowsecurity));
    const access = await db.query(`SELECT has_schema_privilege('anon','integration','USAGE') AS anon_access,
      has_table_privilege('authenticated','integration.message_hospital','SELECT') AS user_access`);
    assert.equal(access.rows[0]!.anon_access, false);
    assert.equal(access.rows[0]!.user_access, false);
    backend = new Postgres(process.env.TEST_DATABASE_URL!, 'integration');
    const selected = await backend.query('SELECT version FROM integration_migration');
    assert.equal(selected.rows[0]!.version, 1);
    await backend.transaction(async tx => {
      await tx.query(`INSERT INTO integration_receipt (tenant_id,principal_id,transport_message_id,payload_hash)
        VALUES ('test','test',$1,'test')`, [randomUUID()]);
      assert.equal((await tx.query('SELECT * FROM integration_receipt')).rows.length, 1);
    });
  } finally { await backend?.close(); await db.close(); }
});
