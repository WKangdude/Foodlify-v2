import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApplication } from '../src/http.js';
import { fixture, key, producer, operator, sample } from './support.js';
import type { Config } from '../src/config.js';

let f: Awaited<ReturnType<typeof fixture>>;
let app: Awaited<ReturnType<typeof createApplication>>;
let base: string;
const token = 'producer-'.padEnd(40, 'x');
const admin = 'operator-'.padEnd(40, 'y');
before(async () => {
  f = await fixture();
  const settings: Config = { databaseUrl: '', rabbitUrl: '', port: 3010, host: '127.0.0.1', cipher: f.cipher,
    credentials: [{ ...producer, token }, { ...operator, token: admin }] };
  app = await createApplication(settings, f.store, { ready: true, publish: async () => {} });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
after(async () => { await app?.close(); await f?.close(); });
const post = (xml: string, auth = token, id = 'http-001') => fetch(`${base}/v1/messages`, {
  method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/xml', 'Idempotency-Key': id }, body: xml,
});
test('HTTP ingress persists and returns duplicate receipts', async () => {
  assert.equal((await post(sample)).status, 202);
  const response = await post(sample);
  assert.equal((await response.json()).status, 'duplicate');
});
test('unauthenticated and operator ingress are refused', async () => {
  assert.equal((await post(sample, 'bad')).status, 401);
  assert.equal((await post(sample, admin)).status, 403);
});
test('permanent failures return a hospital ID; producer cannot inspect hospital', async () => {
  const response = await post('<bad>', token, 'http-bad');
  assert.equal(response.status, 422);
  const receipt = await response.json();
  assert.ok(receipt.hospitalId);
  assert.equal((await fetch(`${base}/v1/hospital`, { headers: { Authorization: `Bearer ${token}` } })).status, 403);
  const detail = await fetch(`${base}/v1/hospital/${receipt.hospitalId}`, { headers: { Authorization: `Bearer ${admin}` } });
  assert.equal(detail.status, 200);
  const serialized = JSON.stringify(await detail.json());
  assert.ok(!serialized.includes('payload_cipher'));
});
test('HTTP readiness and payload limit are enforced', async () => {
  assert.equal((await fetch(`${base}/health/ready`)).status, 200);
  assert.equal((await post('x'.repeat(128 * 1024 + 1))).status, 413);
});
test('operator must supply a reason to redrive a blocked message', async () => {
  const receipt = await (await post('<bad>', token, 'http-redrive')).json();
  const send = (reason: string) => fetch(`${base}/v1/hospital/${receipt.hospitalId}/retry`, {
    method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  });
  assert.equal((await send('')).status, 400);
  assert.equal((await send('Contrato corregido')).status, 202);
});
