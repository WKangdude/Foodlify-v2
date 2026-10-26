import { randomUUID } from 'node:crypto';
import type { Database, Sql } from './database.js';
import { Cipher, defaultPolicy, delaySeconds, hash, MessageError, routes, safeError, type Policy, type Principal } from './domain.js';
import type { EventValidator } from './xml.js';

export type HospitalRow = {
  id: string; tenant_id: string; branch_id: string; direction: 'inbound' | 'outbound'; destination: string;
  payload_cipher: string; payload_hash: string; principal: Principal; transport_message_id: string;
  outbox_id: string | null; event_id: string | null; status: string; lease_token: string;
  retry_count: number; max_retries: number; redrive_generation: number;
  base_interval_seconds: number; backoff_multiplier: number; max_interval_seconds: number; jitter_percent: number;
};
export type Delivery = {
  id: string; tenant_id: string; branch_id: string; event_id: string; destination: string;
  payload_cipher: string; payload_hash: string; lease_token: string;
};
export type Receipt = { status: 'accepted' | 'duplicate'; eventId: string } | { status: 'hospital'; hospitalId: string; code: string; retryable: boolean };
export type HospitalInput = { xml: string; principal: Principal; transportId: string; direction: 'inbound' | 'outbound'; destination: string; outboxId?: string; eventId?: string; error: unknown };
const metadata = `id, tenant_id, branch_id, direction, destination, event_id, status, retryable,
  retry_count, max_retries, base_interval_seconds, backoff_multiplier, max_interval_seconds, jitter_percent,
  next_retry_at, last_retry_at, error_code, last_error, first_failed_at, updated_at, resolved_at, redrive_generation`;
const policyOf = (row: HospitalRow): Policy => ({ maxRetries: row.max_retries, baseSeconds: row.base_interval_seconds, multiplier: row.backoff_multiplier, maxSeconds: row.max_interval_seconds, jitterPercent: row.jitter_percent });

export class IntegrationStore {
  constructor(public db: Database, public cipher: Cipher, private validator: EventValidator, private policy: Policy = defaultPolicy) {}

  async receive(xml: string, principal: Principal, transportId: string): Promise<Receipt> {
    try { return await this.accept(xml, principal, transportId); }
    catch (error) {
      const failure = safeError(error);
      const hospitalId = await this.db.transaction(tx => this.hospitalize(tx, { xml, principal, transportId, direction: 'inbound', destination: 'integration', error: failure }));
      return { status: 'hospital', hospitalId, code: failure.code, retryable: failure.retryable };
    }
  }

  async accept(xml: string, principal: Principal, transportId: string, retry?: HospitalRow): Promise<{ status: 'accepted' | 'duplicate'; eventId: string }> {
    const event = this.validator.parse(xml, principal);
    return this.db.transaction(async tx => {
      if (retry) await this.assertLease(tx, retry);
      await tx.query(`INSERT INTO integration_receipt (tenant_id,principal_id,transport_message_id,payload_hash)
        VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [principal.tenantId, principal.id, transportId, hash(xml)]);
      const receipt = await tx.query(`SELECT payload_hash FROM integration_receipt
        WHERE tenant_id=$1 AND principal_id=$2 AND transport_message_id=$3`, [principal.tenantId, principal.id, transportId]);
      if (receipt.rows[0]?.payload_hash !== hash(xml)) throw new MessageError('IDEMPOTENCY_CONFLICT', false, 'Transport ID was already used for a different message.');
      const id = randomUUID();
      const inserted = await tx.query(`INSERT INTO message_inbox
        (id,tenant_id,branch_id,event_id,event_type,source,aggregate_id,aggregate_version,correlation_id,payload_hash,payload_cipher)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (tenant_id,event_id) DO NOTHING RETURNING id`,
      [id, event.tenantId, event.branchId, event.eventId, event.eventType, event.source, event.aggregateId, event.aggregateVersion, event.correlationId, hash(xml), this.cipher.encrypt(xml)]);
      if (!inserted.rows.length) {
        const existing = await tx.query('SELECT payload_hash FROM message_inbox WHERE tenant_id=$1 AND event_id=$2', [event.tenantId, event.eventId]);
        if (existing.rows[0]?.payload_hash !== hash(xml)) throw new MessageError('EVENT_ID_CONFLICT', false, 'Event ID was already used for a different message.');
      } else {
        for (const destination of routes[event.eventType]!.destinations) {
          await tx.query(`INSERT INTO message_outbox (id,inbox_id,tenant_id,branch_id,event_id,destination) VALUES ($1,$2,$3,$4,$5,$6)`,
            [randomUUID(), id, event.tenantId, event.branchId, event.eventId, destination]);
        }
      }
      if (retry) await this.resolve(tx, retry);
      return { status: inserted.rows.length ? 'accepted' : 'duplicate', eventId: event.eventId };
    });
  }

  async hospitalize(tx: Sql, input: HospitalInput): Promise<string> {
    const failure = safeError(input.error);
    const id = randomUUID();
    const p = this.policy;
    const next = failure.retryable && p.maxRetries > 0 ? new Date(Date.now() + delaySeconds(p, 0) * 1000) : null;
    const status = !failure.retryable ? 'blocked' : next ? 'pending' : 'exhausted';
    const result = await tx.query<{ id: string }>(`INSERT INTO message_hospital
      (id,tenant_id,branch_id,direction,destination,event_id,transport_message_id,deduplication_key,outbox_id,
       payload_cipher,payload_hash,principal,status,retryable,max_retries,base_interval_seconds,backoff_multiplier,
       max_interval_seconds,jitter_percent,error_code,last_error,next_retry_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (deduplication_key) DO UPDATE SET updated_at=now() RETURNING id`,
    [id, input.principal.tenantId, input.principal.branchId, input.direction, input.destination, input.eventId ?? null, input.transportId,
      hash(JSON.stringify([input.principal.id, input.direction, input.destination, input.transportId, hash(input.xml)])), input.outboxId ?? null,
      this.cipher.encrypt(input.xml), hash(input.xml), JSON.stringify(input.principal), status, failure.retryable,
      p.maxRetries, p.baseSeconds, p.multiplier, p.maxSeconds, p.jitterPercent, failure.code, failure.message, next]);
    return result.rows[0]!.id;
  }

  async claimDelivery(): Promise<Delivery | undefined> {
    const token = randomUUID();
    const result = await this.db.query<Delivery>(`WITH candidate AS (
      SELECT id FROM message_outbox WHERE status='pending' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE message_outbox o SET status='publishing',lease_token=$1,locked_until=now()+interval '30 seconds'
      FROM candidate c WHERE o.id=c.id RETURNING o.*
    ) SELECT c.*,i.payload_cipher,i.payload_hash FROM claimed c JOIN message_inbox i ON i.id=c.inbox_id`, [token]);
    return result.rows[0];
  }

  async deliverySucceeded(row: Delivery): Promise<void> {
    await this.db.query(`UPDATE message_outbox SET status='published',published_at=now(),lease_token=NULL,locked_until=NULL
      WHERE id=$1 AND status='publishing' AND lease_token=$2 AND locked_until>now()`, [row.id, row.lease_token]);
  }

  async deliveryFailed(row: Delivery, principal: Principal, error: unknown): Promise<void> {
    await this.db.transaction(async tx => {
      const locked = await tx.query(`UPDATE message_outbox SET status='hospital',lease_token=NULL,locked_until=NULL
        WHERE id=$1 AND status='publishing' AND lease_token=$2 RETURNING id`, [row.id, row.lease_token]);
      if (!locked.rows.length) return;
      await this.hospitalize(tx, { xml: this.cipher.decrypt(row.payload_cipher), principal, transportId: row.id,
        direction: 'outbound', destination: row.destination, outboxId: row.id, eventId: row.event_id, error });
    });
  }

  async claimRetry(worker: string, outboundReady: boolean): Promise<HospitalRow | undefined> {
    return this.db.transaction(async tx => {
      const result = await tx.query<HospitalRow>(`WITH candidate AS (
        SELECT id FROM message_hospital WHERE status='pending' AND retryable AND retry_count<max_retries
        AND next_retry_at<=now() AND (direction='inbound' OR $1) ORDER BY next_retry_at,id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE message_hospital h SET status='retrying',retry_count=retry_count+1,last_retry_at=now(),
        lease_token=$2,locked_by=$3,locked_until=now()+interval '30 seconds',updated_at=now()
        FROM candidate c WHERE h.id=c.id RETURNING h.*`, [outboundReady, randomUUID(), worker]);
      const row = result.rows[0];
      if (row) await tx.query(`INSERT INTO message_hospital_attempt (id,hospital_id,generation,attempt_number,worker,outcome)
        VALUES ($1,$2,$3,$4,$5,'running')`, [randomUUID(), row.id, row.redrive_generation, row.retry_count, worker]);
      return row;
    });
  }

  private async assertLease(tx: Sql, row: HospitalRow): Promise<void> {
    const result = await tx.query(`SELECT id FROM message_hospital WHERE id=$1 AND status='retrying'
      AND lease_token=$2 AND locked_until>now() FOR UPDATE`, [row.id, row.lease_token]);
    if (!result.rows.length) throw new MessageError('LEASE_LOST', true, 'Processing lease expired.');
  }

  async retrySucceeded(row: HospitalRow): Promise<void> {
    await this.db.transaction(async tx => { await this.assertLease(tx, row); await this.resolve(tx, row); });
  }
  private async resolve(tx: Sql, row: HospitalRow): Promise<void> {
    if (row.outbox_id) await tx.query(`UPDATE message_outbox SET status='published',published_at=now() WHERE id=$1 AND status='hospital'`, [row.outbox_id]);
    await tx.query(`UPDATE message_hospital SET status='resolved',resolved_at=now(),updated_at=now(),next_retry_at=NULL,
      lease_token=NULL,locked_until=NULL,locked_by=NULL WHERE id=$1`, [row.id]);
    await tx.query(`UPDATE message_hospital_attempt SET outcome='succeeded',finished_at=now()
      WHERE hospital_id=$1 AND generation=$2 AND attempt_number=$3 AND outcome='running'`, [row.id, row.redrive_generation, row.retry_count]);
  }

  async retryFailed(row: HospitalRow, error: unknown): Promise<void> {
    const failure = safeError(error);
    await this.db.transaction(async tx => {
      // A stale worker must never finalize a newer generation or lease.
      const found = await tx.query(`SELECT id FROM message_hospital WHERE id=$1 AND status='retrying' AND lease_token=$2 FOR UPDATE`, [row.id, row.lease_token]);
      if (!found.rows.length) return;
      const status = !failure.retryable ? 'blocked' : row.retry_count >= row.max_retries ? 'exhausted' : 'pending';
      const next = status === 'pending' ? new Date(Date.now() + delaySeconds(policyOf(row), row.retry_count) * 1000) : null;
      await tx.query(`UPDATE message_hospital SET status=$2,retryable=$3,error_code=$4,last_error=$5,next_retry_at=$6,
        lease_token=NULL,locked_until=NULL,locked_by=NULL,updated_at=now() WHERE id=$1`, [row.id, status, failure.retryable, failure.code, failure.message, next]);
      await tx.query(`UPDATE message_hospital_attempt SET outcome='failed',finished_at=now(),error_code=$4
        WHERE hospital_id=$1 AND generation=$2 AND attempt_number=$3 AND outcome='running'`, [row.id, row.redrive_generation, row.retry_count, failure.code]);
    });
  }

  async recoverLeases(): Promise<void> {
    const expired = await this.db.query<Delivery>(`SELECT o.*,i.payload_cipher,i.payload_hash FROM message_outbox o
      JOIN message_inbox i ON i.id=o.inbox_id WHERE o.status='publishing' AND o.locked_until<=now() LIMIT 20`);
    for (const row of expired.rows) await this.deliveryFailed(row, {
      id: 'integration', tenantId: row.tenant_id, branchId: row.branch_id, source: 'integration', role: 'producer',
    }, new MessageError('PUBLISH_INTERRUPTED', true, 'Publication interrupted; destination must deduplicate.'));
    await this.db.transaction(async tx => {
      const rows = await tx.query<HospitalRow>(`SELECT * FROM message_hospital WHERE status='retrying' AND locked_until<=now() FOR UPDATE SKIP LOCKED LIMIT 20`);
      for (const row of rows.rows) {
        const exhausted = row.retry_count >= row.max_retries;
        await tx.query(`UPDATE message_hospital SET status=$2,next_retry_at=$3,lease_token=NULL,locked_until=NULL,
          locked_by=NULL,error_code='RETRY_INTERRUPTED',last_error='Worker lease expired.',updated_at=now() WHERE id=$1`,
        [row.id, exhausted ? 'exhausted' : 'pending', exhausted ? null : new Date(Date.now() + delaySeconds(policyOf(row), row.retry_count) * 1000)]);
        await tx.query(`UPDATE message_hospital_attempt SET outcome='interrupted',finished_at=now(),error_code='RETRY_INTERRUPTED'
          WHERE hospital_id=$1 AND generation=$2 AND attempt_number=$3 AND outcome='running'`, [row.id, row.redrive_generation, row.retry_count]);
      }
    });
  }

  async listHospital(principal: Principal, status?: string) {
    const result = await this.db.query(`SELECT ${metadata} FROM message_hospital WHERE tenant_id=$1 AND branch_id=$2
      AND ($3::text IS NULL OR status=$3) ORDER BY first_failed_at DESC,id LIMIT 100`, [principal.tenantId, principal.branchId, status ?? null]);
    return result.rows;
  }
  async hospitalDetail(principal: Principal, id: string) {
    const result = await this.db.query(`SELECT ${metadata} FROM message_hospital WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`, [id, principal.tenantId, principal.branchId]);
    if (!result.rows[0]) return null;
    const attempts = await this.db.query(`SELECT generation,attempt_number,started_at,finished_at,outcome,error_code FROM message_hospital_attempt WHERE hospital_id=$1 ORDER BY generation,attempt_number`, [id]);
    return { ...result.rows[0], attempts: attempts.rows };
  }
  async redrive(principal: Principal, id: string, reason: string): Promise<boolean> {
    return this.db.transaction(async tx => {
      const result = await tx.query(`UPDATE message_hospital SET status='pending',retryable=true,retry_count=0,
        redrive_generation=redrive_generation+1,next_retry_at=now(),updated_at=now(),resolved_at=NULL
        WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status IN ('blocked','exhausted') AND max_retries>0 RETURNING id`, [id, principal.tenantId, principal.branchId]);
      if (!result.rows.length) return false;
      await tx.query(`INSERT INTO integration_audit (id,hospital_id,tenant_id,branch_id,actor,action,reason)
        VALUES ($1,$2,$3,$4,$5,'redrive',$6)`, [randomUUID(), id, principal.tenantId, principal.branchId, principal.id, reason]);
      return true;
    });
  }
  async messageStatus(principal: Principal, eventId: string) {
    const result = await this.db.query(`SELECT o.event_id,o.destination,o.status,o.created_at,o.published_at
      FROM message_outbox o WHERE o.tenant_id=$1 AND o.branch_id=$2 AND o.event_id=$3 ORDER BY destination`, [principal.tenantId, principal.branchId, eventId]);
    return result.rows;
  }
}
