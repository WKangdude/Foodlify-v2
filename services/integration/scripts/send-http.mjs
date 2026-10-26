import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const producer = JSON.parse(process.env.INTEGRATION_CREDENTIALS ?? '[]').find(c => c.source === 'orders' && c.role === 'producer');
if (!producer) throw new Error('Configure a demo orders producer credential.');
const xml = await readFile(new URL('../contracts/order-placed.xml', import.meta.url), 'utf8');
const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3010}/v1/messages`, {
  method: 'POST', headers: { Authorization: `Bearer ${producer.token}`, 'Content-Type': 'application/xml', 'Idempotency-Key': randomUUID() }, body: xml,
});
console.log(response.status, await response.json());
if (!response.ok) process.exitCode = 1;
