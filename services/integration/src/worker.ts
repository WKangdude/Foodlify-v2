import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Publisher } from './broker.js';
import type { IntegrationStore } from './store.js';

export class IntegrationWorker {
  private stopped = false;
  private workerId = randomUUID();
  constructor(private store: IntegrationStore, private publisher: Publisher) {}

  async tick(): Promise<void> {
    await this.store.recoverLeases();
    const deliveries = await Promise.all(Array.from({ length: 8 }, () => this.store.claimDelivery()));
    await Promise.all(deliveries.map(async delivery => {
      if (!delivery) return;
      try {
        await this.publisher.publish(delivery.destination, this.store.cipher.decrypt(delivery.payload_cipher), delivery.id, delivery.event_id);
        await this.store.deliverySucceeded(delivery);
      } catch (error) {
        await this.store.deliveryFailed(delivery, {
          id: 'integration', tenantId: delivery.tenant_id, branchId: delivery.branch_id, source: 'integration', role: 'producer',
        }, error);
      }
    }));
    // Pause outbound retries while disconnected; initial failed attempts still enter hospital.
    const retry = await this.store.claimRetry(this.workerId, this.publisher.ready);
    if (!retry) return;
    try {
      const xml = this.store.cipher.decrypt(retry.payload_cipher);
      if (retry.direction === 'inbound') await this.store.accept(xml, retry.principal, retry.transport_message_id, retry);
      else {
        await this.publisher.publish(retry.destination, xml, retry.outbox_id!, retry.event_id!);
        await this.store.retrySucceeded(retry);
      }
    } catch (error) { await this.store.retryFailed(retry, error); }
  }
  async run(reconnect: () => Promise<void>): Promise<void> {
    while (!this.stopped) {
      try { await reconnect(); await this.tick(); }
      catch { console.error(JSON.stringify({ event: 'worker_cycle_failed' })); }
      await sleep(100);
    }
  }
  stop() { this.stopped = true; }
}
