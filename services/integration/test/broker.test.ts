import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import type { ChannelModel, ConsumeMessage, Options } from 'amqplib';
import { RabbitBroker } from '../src/broker.js';
import { signature } from '../src/config.js';
import { fixture, operator, producer, sample } from './support.js';

class FakeTransport extends EventEmitter {
  acked = 0;
  closed = false;
  returnNext = false;
  nackNext = false;
  received?: (message: ConsumeMessage) => void;
  published: Options.Publish[] = [];
  async createChannel() { return this; }
  async createConfirmChannel() { return this; }
  async assertQueue() {}
  async prefetch() {}
  async consume(_queue: string, listener: (message: ConsumeMessage) => void) { this.received = listener; }
  ack() { this.acked++; }
  async close() { this.closed = true; this.emit('close'); }
  sendToQueue(_queue: string, _content: Buffer, options: Options.Publish, callback: (error: Error | null) => void) {
    this.published.push(options);
    if (this.returnNext) this.emit('return', { properties: { messageId: options.messageId } });
    callback(this.nackNext ? new Error('nack') : null);
    return true;
  }
}
let f: Awaited<ReturnType<typeof fixture>>;
const token = 'x'.repeat(40);
before(async () => { f = await fixture(); });
after(async () => { await f?.close(); });
beforeEach(async () => { await f.db.query('TRUNCATE message_hospital_attempt,integration_audit,message_hospital,message_outbox,message_inbox,integration_receipt CASCADE'); });
async function broker() {
  const transport = new FakeTransport();
  const rabbit = new RabbitBroker('amqp://unused', [{ ...producer, token }], f.store, async () => transport as unknown as ChannelModel);
  await rabbit.connect();
  return { transport, rabbit };
}
const message = (signed = true) => ({
  content: Buffer.from(sample),
  fields: { consumerTag: 'test', deliveryTag: 1, redelivered: false, exchange: '', routingKey: 'foodlify.integration.inbound' },
  properties: { messageId: 'transport-001', headers: { producerId: producer.id, signature: signed ? signature(token, 'transport-001', sample) : 'bad' } },
} as unknown as ConsumeMessage);
async function settled(predicate: () => boolean) {
  for (let i = 0; i < 200 && !predicate(); i++) await setImmediate();
  assert.ok(predicate(), 'Expected transport operation to finish');
}
test('publisher requires broker confirm and uses persistent mandatory delivery', async () => {
  const { transport, rabbit } = await broker();
  try {
    await rabbit.publish('kitchen', sample, 'delivery-001', 'evt-order-001');
    assert.equal(transport.published[0]?.persistent, true);
    assert.equal(transport.published[0]?.mandatory, true);
    assert.equal(transport.published[0]?.messageId, 'delivery-001');
    transport.returnNext = true;
    await assert.rejects(rabbit.publish('kitchen', sample, 'delivery-002', 'evt-order-001'), /unavailable/);
    transport.returnNext = false; transport.nackNext = true;
    await assert.rejects(rabbit.publish('kitchen', sample, 'delivery-003', 'evt-order-001'), /not confirm/);
  } finally { await rabbit.close(); }
});
test('valid signed input is acknowledged only after durable persistence', async () => {
  const { transport, rabbit } = await broker();
  try {
    transport.received!(message());
    assert.equal(transport.acked, 0);
    await settled(() => transport.acked === 1);
    assert.equal((await f.store.messageStatus(producer, 'evt-order-001')).length, 2);
  } finally { await rabbit.close(); }
});
test('invalid broker signatures are quarantined instead of trusting XML tenant', async () => {
  const { transport, rabbit } = await broker();
  try {
    transport.received!(message(false));
    await settled(() => transport.acked === 1);
    assert.deepEqual(await f.store.listHospital(operator), []);
    const records = await f.store.listHospital({ ...operator, tenantId: 'quarantine', branchId: 'quarantine' });
    assert.equal(records[0]!.error_code, 'AUTH_FAILED');
    assert.equal(records[0]!.status, 'blocked');
  } finally { await rabbit.close(); }
});
test('DB failure closes the consumer without ACK so the broker can redeliver', async () => {
  const { transport, rabbit } = await broker();
  const original = f.db.transaction;
  f.db.transaction = async () => { throw new Error('DB down'); };
  try {
    transport.received!(message());
    await settled(() => transport.closed);
    assert.equal(transport.acked, 0);
    assert.equal(rabbit.ready, false);
  } finally { f.db.transaction = original; await rabbit.close(); }
});
