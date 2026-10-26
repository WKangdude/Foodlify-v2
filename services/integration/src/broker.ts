import amqp, { type ChannelModel, type Channel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { destinations, MessageError, type Credential, type Principal } from './domain.js';
import { equalSecret, principalOf, signature } from './config.js';
import type { IntegrationStore } from './store.js';
import { MAX_XML_BYTES } from './xml.js';

export const INGRESS_QUEUE = 'foodlify.integration.inbound';
export const queueFor = (destination: string) => `foodlify.${destination}.inbound`;
export interface Publisher {
  readonly ready: boolean;
  publish(destination: string, xml: string, messageId: string, eventId: string): Promise<void>;
}
export class RabbitBroker implements Publisher {
  ready = false;
  private connection?: ChannelModel;
  private consumer?: Channel;
  private publisher?: ConfirmChannel;
  private nextConnect = 0;
  private stopped = false;
  private returned = new Set<string>();
  private receiving = new Set<Promise<void>>();
  constructor(private url: string, private credentials: Credential[], private store: IntegrationStore,
    private openConnection: (url: string) => Promise<ChannelModel> = url => amqp.connect(url, { timeout: 3000, noDelay: true })) {}

  async connect(): Promise<void> {
    if (this.stopped || this.ready || Date.now() < this.nextConnect) return;
    this.nextConnect = Date.now() + 5000;
    await this.disconnect();
    let connection: ChannelModel | undefined;
    try {
      connection = await this.openConnection(this.url);
      this.connection = connection;
      connection.on('error', () => console.error(JSON.stringify({ event: 'broker_connection_error' })));
      connection.on('close', () => { this.ready = false; });
      const consumer = await connection.createChannel();
      const publisher = await connection.createConfirmChannel();
      consumer.on('error', () => { this.ready = false; void this.disconnect(); });
      publisher.on('error', () => { this.ready = false; void this.disconnect(); });
      consumer.on('close', () => { this.ready = false; });
      publisher.on('close', () => { this.ready = false; });
      publisher.on('return', message => {
        if (message.properties.messageId) this.returned.add(message.properties.messageId);
      });
      // Local topology uses classic durable queues: no redelivery limit that can silently discard input.
      // Production quorum/parking policies must be provisioned before changing queue types.
      for (const queue of [INGRESS_QUEUE, ...destinations.map(queueFor)]) await consumer.assertQueue(queue, { durable: true, arguments: { 'x-queue-type': 'classic' } });
      await consumer.prefetch(16);
      this.consumer = consumer; this.publisher = publisher;
      await consumer.consume(INGRESS_QUEUE, message => {
        if (!message) { this.ready = false; void this.disconnect(); return; }
        const work = this.receive(message, consumer).finally(() => this.receiving.delete(work));
        this.receiving.add(work);
      }, { noAck: false });
      this.ready = true;
    } catch {
      this.ready = false;
      await connection?.close().catch(() => undefined);
      console.error(JSON.stringify({ event: 'broker_unavailable', retryInSeconds: 5 }));
    }
  }

  private async receive(message: ConsumeMessage, channel: Channel): Promise<void> {
    const transportId = message.properties.messageId ?? randomUUID();
    const credential = this.credentials.find(c => c.id === message.properties.headers?.producerId && c.role === 'producer');
    let xml: string;
    try { xml = new TextDecoder('utf-8', { fatal: true }).decode(message.content); }
    catch { xml = `invalid-utf8:${message.content.toString('base64')}`; }
    const suppliedSignature = message.properties.headers?.signature;
    const authenticated = credential && typeof suppliedSignature === 'string' && message.properties.messageId &&
      equalSecret(suppliedSignature, signature(credential.token, transportId, xml));
    const principal: Principal = authenticated ? principalOf(credential) : {
      id: 'quarantine', tenantId: 'quarantine', branchId: 'quarantine', source: 'unknown', role: 'producer',
    };
    try {
      const ingressError = !authenticated ? new MessageError('AUTH_FAILED', false, 'Broker message signature or producer is invalid.') :
        message.content.length > MAX_XML_BYTES ? new MessageError('XML_TOO_LARGE', false, 'XML exceeds the size limit.') : undefined;
      if (ingressError) {
        await this.store.db.transaction(tx => this.store.hospitalize(tx, {
          xml, principal, transportId, direction: 'inbound', destination: 'integration', error: ingressError,
        }));
      } else await this.store.receive(xml, principal, transportId);
      channel.ack(message);
    } catch {
      // Closing requeues unacked input. Wait before reconnecting instead of a hot nack/requeue loop.
      this.nextConnect = Date.now() + 5000;
      this.ready = false;
      await this.disconnect();
      console.error(JSON.stringify({ event: 'ingress_not_persisted', messageId: transportId }));
    }
  }

  async publish(destination: string, xml: string, messageId: string, eventId: string): Promise<void> {
    const channel = this.publisher;
    if (!channel || !this.ready) throw new MessageError('BROKER_UNAVAILABLE', true, 'Broker is unavailable.');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ready = false;
        void this.disconnect();
        reject(new MessageError('CONFIRM_TIMEOUT', true, 'Publication confirmation timed out.'));
      }, 5000);
      const finish = (error?: unknown) => {
        clearTimeout(timeout);
        const unroutable = this.returned.delete(messageId);
        if (error) reject(new MessageError('PUBLISH_FAILED', true, 'Broker did not confirm publication.'));
        else if (unroutable) reject(new MessageError('UNROUTABLE', true, 'Destination queue is unavailable.'));
        else resolve();
      };
      try {
        channel.sendToQueue(queueFor(destination), Buffer.from(xml), {
          persistent: true, mandatory: true, messageId, contentType: 'application/xml', contentEncoding: 'utf-8',
          headers: { eventId }, appId: 'foodlify.integration',
        }, finish);
      } catch (error) { finish(error); }
    });
  }
  private async disconnect() {
    const connection = this.connection;
    this.connection = undefined; this.publisher = undefined; this.consumer = undefined;
    await connection?.close().catch(() => undefined);
  }
  async close() {
    this.stopped = true; this.ready = false;
    await this.disconnect();
    await Promise.allSettled(this.receiving);
  }
}
