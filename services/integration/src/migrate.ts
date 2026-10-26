import { Postgres, migrate } from './database.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = new Postgres(process.env.DATABASE_URL, process.env.DATABASE_SCHEMA || undefined);
try { await migrate(db); console.log('Integration migrations applied.'); }
finally { await db.close(); }
