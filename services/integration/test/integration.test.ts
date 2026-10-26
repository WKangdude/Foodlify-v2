import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Cipher, defaultPolicy, delaySeconds, MessageError } from '../src/domain.js';
import { authenticate, config, equalSecret, signature } from '../src/config.js';
import { IntegrationWorker } from '../src/worker.js';
import { due, fixture, key, operator, producer, sample } from './support.js';
import type { Publisher } from '../src/broker.js';

let f: Awaited<ReturnType<typeof fixture>>;
before(async () => { f = await fixture(); });
after(async () => { await f?.close(); });
beforeEach(async () => {
  await f.db.query('TRUNCATE message_hospital_attempt,integration_audit,message_hospital,message_outbox,message_inbox,integration_receipt CASCADE');
});
const publisher = (publish: Publisher['publish'], ready = true): Publisher => ({ ready, publish });
const failure = new MessageError('BROKER_UNAVAILABLE', true, 'Broker unavailable.');

test('validates the namespace, XSD envelope, producer scope and event source', () => {
  assert.equal(f.validator.parse(sample, producer).eventId, 'evt-order-001');
  for (const xml of [sample.replace('schemaVersion="1"', 'schemaVersion="2"'), sample.replace('tenantId="demo"', 'tenantId="other"'),
    sample.replace('source="orders"', 'source="billing"'), sample.replace('aggregateVersion="1"', 'aggregateVersion="0"'),
    sample.replace('urn:foodlify:integration:v1', 'urn:invalid'), sample.replace('2026-10-26T02:00:00Z', '2026-10-26T02:00:00')]) {
    assert.throws(() => f.validator.parse(xml, producer), MessageError);
  }
});
test('rejects DTD, entity expansion, malformed, oversized and deeply nested XML', () => {
  for (const xml of ['<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>', '<x>', 'x'.repeat(128 * 1024 + 1),
    sample.replace('<VisitId>visit-001</VisitId>', '<n>'.repeat(35) + 'x' + '</n>'.repeat(35))]) {
    assert.throws(() => f.validator.parse(xml, producer), MessageError);
  }
});
test('persists inbox, receipt and distinct kitchen/billing deliveries atomically', async () => {
  const result = await f.store.receive(sample, producer, 'transport-001');
  assert.equal(result.status, 'accepted');
  assert.deepEqual((await f.store.messageStatus(producer, 'evt-order-001')).map(r => r.destination), ['billing','kitchen']);
  const inbox = (await f.db.query('SELECT * FROM message_inbox')).rows[0]!;
  assert.ok(!inbox.payload_cipher.includes('Hamburguesa'));
  assert.equal(f.cipher.decrypt(inbox.payload_cipher), sample);
});
test('redelivery and alternate transport IDs cannot duplicate business deliveries', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  assert.equal((await f.store.receive(sample, producer, 'transport-001')).status, 'duplicate');
  assert.equal((await f.store.receive(sample, producer, 'transport-002')).status, 'duplicate');
  assert.equal((await f.db.query('SELECT * FROM message_outbox')).rows.length, 2);
});
test('concurrent claims cannot reserve the same delivery or hospital attempt', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const [a, b] = await Promise.all([f.store.claimDelivery(), f.store.claimDelivery()]);
  assert.ok(a && b && a.id !== b.id);
  await f.store.deliveryFailed(a, producer, failure);
  await due(f.db);
  const retries = await Promise.all([f.store.claimRetry('a', true), f.store.claimRetry('b', true)]);
  assert.equal(retries.filter(Boolean).length, 1);
});
test('failure during routing rolls back inbox, receipt and all deliveries before hospitalizing', async () => {
  const original = f.db.transaction.bind(f.db);
  f.db.transaction = run => original(async tx => {
    let inserted = 0;
    return run({ query: async (sql, params) => {
      if (sql.includes('INSERT INTO message_outbox') && ++inserted === 2) throw failure;
      return tx.query(sql, params);
    } });
  });
  try {
    const receipt = await f.store.receive(sample, producer, 'transport-001');
    assert.equal(receipt.status, 'hospital');
    for (const table of ['message_inbox','message_outbox','integration_receipt']) {
      assert.equal((await f.db.query(`SELECT * FROM ${table}`)).rows.length, 0);
    }
    assert.equal((await f.store.listHospital(operator))[0]!.status, 'pending');
  } finally { f.db.transaction = original; }
});
test('event ID conflicts are hospitalized and never overwrite accepted data', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const result = await f.store.receive(sample.replace('Hamburguesa', 'Otro producto'), producer, 'transport-002');
  assert.ok(result.status === 'hospital' && result.code === 'EVENT_ID_CONFLICT');
  assert.equal((await f.db.query('SELECT * FROM message_inbox')).rows.length, 1);
  assert.equal((await f.db.query('SELECT * FROM integration_receipt')).rows.length, 1);
});
test('reusing a transport key for a new event is rejected', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const result = await f.store.receive(sample.replace('evt-order-001', 'evt-order-002'), producer, 'transport-001');
  assert.ok(result.status === 'hospital' && result.code === 'IDEMPOTENCY_CONFLICT');
});
test('invalid XML enters blocked hospital with zero automatic attempts and deduplicates', async () => {
  const a = await f.store.receive('<invalid>', producer, 'transport-bad');
  const b = await f.store.receive('<invalid>', producer, 'transport-bad');
  assert.deepEqual(a, b);
  const rows = await f.store.listHospital(operator);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, 'blocked');
  assert.equal(rows[0]!.retry_count, 0);
  assert.equal(rows[0]!.next_retry_at, null);
  assert.equal(await f.store.claimRetry('worker', true), undefined);
});
test('one recipient failure does not roll back a successful recipient', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const worker = new IntegrationWorker(f.store, publisher(async destination => { if (destination === 'kitchen') throw failure; }));
  await worker.tick(); await worker.tick();
  const states = await f.store.messageStatus(producer, 'evt-order-001');
  assert.equal(states.find(r => r.destination === 'billing')!.status, 'published');
  assert.equal(states.find(r => r.destination === 'kitchen')!.status, 'hospital');
});
test('transient retry succeeds, resolves hospital and marks outbox only after confirm', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const delivery = (await f.store.claimDelivery())!;
  await f.store.deliveryFailed(delivery, producer, failure);
  await due(f.db);
  const calls: string[] = [];
  const worker = new IntegrationWorker(f.store, publisher(async (_destination, _xml, id) => { calls.push(id); }));
  await worker.tick();
  const hospital = (await f.store.listHospital(operator))[0]!;
  assert.equal(hospital.status, 'resolved');
  assert.equal(hospital.retry_count, 1);
  assert.ok(calls.includes(delivery.id));
  const detail = await f.store.hospitalDetail(operator, hospital.id);
  assert.equal(detail!.attempts[0]!.outcome, 'succeeded');
});
test('automatic retries stop at configured maximum and retain attempt history', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const delivery = (await f.store.claimDelivery())!;
  await f.store.deliveryFailed(delivery, producer, failure);
  for (let i = 0; i < 2; i++) {
    await due(f.db);
    const retry = (await f.store.claimRetry('worker', true))!;
    assert.equal(retry.retry_count, i + 1);
    await f.store.retryFailed(retry, failure);
  }
  await due(f.db);
  assert.equal(await f.store.claimRetry('worker', true), undefined);
  const hospital = (await f.store.listHospital(operator))[0]!;
  assert.equal(hospital.status, 'exhausted');
  assert.equal(hospital.retry_count, 2);
  assert.equal(hospital.next_retry_at, null);
  assert.equal((await f.store.hospitalDetail(operator, hospital.id))!.attempts.length, 2);
});
test('broker outage pauses outbound retries without burning their budget', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  await f.store.deliveryFailed((await f.store.claimDelivery())!, producer, failure);
  await due(f.db);
  assert.equal(await f.store.claimRetry('worker', false), undefined);
  assert.equal((await f.store.listHospital(operator))[0]!.retry_count, 0);
});
test('interrupted attempts are recovered and stale workers cannot resolve new leases', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  await f.store.deliveryFailed((await f.store.claimDelivery())!, producer, failure);
  await due(f.db);
  const old = (await f.store.claimRetry('worker-a', true))!;
  assert.equal(await f.store.claimRetry('worker-b', true), undefined);
  await f.db.query("UPDATE message_hospital SET locked_until=now()-interval '1 second' WHERE id=$1", [old.id]);
  await f.store.recoverLeases(); await due(f.db);
  const current = (await f.store.claimRetry('worker-b', true))!;
  await assert.rejects(f.store.retrySucceeded(old), /lease expired/i);
  await f.store.retryFailed(old, failure);
  await f.store.retrySucceeded(current);
  const detail = await f.store.hospitalDetail(operator, old.id);
  assert.deepEqual(detail!.attempts.map(a => a.outcome), ['interrupted','succeeded']);
});
test('uncertain initial publications are hospitalized after lease expiry', async () => {
  await f.store.receive(sample, producer, 'transport-001');
  const claimed = (await f.store.claimDelivery())!;
  await f.db.query("UPDATE message_outbox SET locked_until=now()-interval '1 second' WHERE id=$1", [claimed.id]);
  await f.store.recoverLeases();
  await f.store.deliverySucceeded(claimed);
  const states = await f.store.messageStatus(producer, 'evt-order-001');
  assert.equal(states.find(s => s.destination === claimed.destination)!.status, 'hospital');
  assert.equal((await f.store.listHospital(operator))[0]!.error_code, 'PUBLISH_INTERRUPTED');
});
test('manual redrive is scoped, audited and starts a new generation', async () => {
  const receipt = await f.store.receive('<invalid>', producer, 'bad');
  assert.ok(receipt.status === 'hospital');
  assert.equal(await f.store.redrive({ ...operator, tenantId: 'other' }, receipt.hospitalId, 'Revisado'), false);
  assert.equal(await f.store.redrive(operator, receipt.hospitalId, 'Contrato corregido'), true);
  assert.equal(await f.store.redrive(operator, receipt.hospitalId, 'Doble clic'), false);
  const rows = await f.store.listHospital(operator);
  assert.equal(rows[0]!.redrive_generation, 1);
  assert.equal(rows[0]!.retry_count, 0);
  assert.equal((await f.db.query('SELECT * FROM integration_audit')).rows.length, 1);
});
test('hospital metadata, details and deliveries cannot cross tenant/branch boundaries', async () => {
  await f.store.receive(sample, producer, 'valid');
  const bad = await f.store.receive('<invalid>', producer, 'bad');
  assert.ok(bad.status === 'hospital');
  for (const scope of [{ ...operator, tenantId: 'other' }, { ...operator, branchId: 'other' }]) {
    assert.deepEqual(await f.store.listHospital(scope), []);
    assert.equal(await f.store.hospitalDetail(scope, bad.hospitalId), null);
    assert.deepEqual(await f.store.messageStatus(scope, 'evt-order-001'), []);
  }
  assert.ok(!JSON.stringify(await f.store.listHospital(operator)).includes('payload_cipher'));
});
test('failed durable hospital storage rejects instead of returning a false acknowledgment', async () => {
  const original = f.db.transaction;
  f.db.transaction = async () => { throw new Error('DB unavailable with secret'); };
  try { await assert.rejects(f.store.receive('<invalid>', producer, randomUUID()), /DB unavailable/); }
  finally { f.db.transaction = original; }
});
test('backoff, cap and jitter follow policy; ciphertext rejects tampering', () => {
  assert.deepEqual([0,1,2,3,4].map(i => delaySeconds(defaultPolicy, i, () => 0.5)), [2,4,8,16,32]);
  assert.equal(delaySeconds(defaultPolicy, 10, () => 1), 60);
  assert.equal(delaySeconds(defaultPolicy, 0, () => 0), 1.6);
  const cipher = new Cipher(key);
  const encrypted = cipher.encrypt('private payload');
  assert.equal(cipher.decrypt(encrypted), 'private payload');
  assert.throws(() => cipher.decrypt(encrypted.slice(0, -2) + 'xx'));
});
test('authentication and HMAC bind the producer, transport ID and exact payload', () => {
  const token = 'x'.repeat(32);
  const credential = { ...producer, token };
  assert.equal(authenticate(token, [credential])?.id, producer.id);
  assert.equal(authenticate('wrong', [credential]), undefined);
  assert.equal(equalSecret(signature(token, 'id', sample), signature(token, 'id2', sample)), false);
  assert.throws(() => config({ DATABASE_URL: 'postgres://x', RABBITMQ_URL: 'amqp://x', PAYLOAD_KEY: key, INTEGRATION_CREDENTIALS: JSON.stringify([{ ...credential, token: 'short' }]) }));
});
