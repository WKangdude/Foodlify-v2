import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const secret = () => randomBytes(32).toString('hex');
const pgPassword = secret();
const rabbitPassword = secret();
const credentials = [
  { id: 'orders-demo', tenantId: 'demo', branchId: 'main', source: 'orders', role: 'producer', token: secret() },
  { id: 'operator-demo', tenantId: 'demo', branchId: 'main', source: 'integration', role: 'operator', token: secret() },
];
await writeFile(new URL('../.env', import.meta.url), [
  'HOST=127.0.0.1', 'PORT=3010', `PG_PASSWORD=${pgPassword}`, 'RABBITMQ_USER=foodlify', `RABBITMQ_PASSWORD=${rabbitPassword}`,
  `DATABASE_URL=postgresql://foodlify:${pgPassword}@127.0.0.1:5433/integration`,
  `RABBITMQ_URL=amqp://foodlify:${rabbitPassword}@127.0.0.1:5673`,
  `PAYLOAD_KEY=${randomBytes(32).toString('base64')}`,
  `INTEGRATION_CREDENTIALS='${JSON.stringify(credentials)}'`, '',
].join('\n'), { flag: 'wx', mode: 0o600 });
console.log('Created services/integration/.env with random local credentials. Existing files are never overwritten.');
