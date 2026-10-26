import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Request, type Response, type NextFunction } from 'express';
import { authenticate, principalOf, type Config } from './config.js';
import type { IntegrationStore } from './store.js';
import type { Publisher } from './broker.js';
import type { Credential } from './domain.js';
import { MAX_XML_BYTES } from './xml.js';

class IntegrationModule {}
Module({})(IntegrationModule);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
export async function createApplication(settings: Config, store: IntegrationStore, broker: Publisher) {
  const server = express();
  server.disable('x-powered-by');
  const app = await NestFactory.create(IntegrationModule, new ExpressAdapter(server), { bodyParser: false, logger: ['error', 'warn'] });
  server.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  server.get('/health/ready', async (_req, res) => {
    try {
      await store.db.query('SELECT 1 FROM message_inbox LIMIT 0');
      res.status(broker.ready ? 200 : 503).json({ database: true, broker: broker.ready });
    } catch { res.status(503).json({ database: false, broker: broker.ready }); }
  });
  server.use('/v1', (req: Request, res: Response, next: NextFunction) => {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
    const credential = authenticate(token, settings.credentials);
    if (!credential) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }
    res.locals.credential = credential;
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const credential = (res: Response) => res.locals.credential as Credential;
  server.post('/v1/messages', express.text({ type: ['application/xml', 'text/xml'], limit: MAX_XML_BYTES, inflate: false }), async (req, res) => {
    const auth = credential(res);
    if (auth.role !== 'producer') { res.status(403).json({ error: 'PRODUCER_REQUIRED' }); return; }
    if (typeof req.body !== 'string') { res.status(415).json({ error: 'XML_REQUIRED' }); return; }
    const transportId = req.get('Idempotency-Key');
    if (!transportId || !identifier.test(transportId)) { res.status(400).json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }); return; }
    try {
      const receipt = await store.receive(req.body, principalOf(auth), transportId);
      res.status(receipt.status === 'hospital' ? receipt.retryable ? 202 : receipt.code.endsWith('_CONFLICT') ? 409 : 422 : 202).json(receipt);
    } catch { res.status(503).json({ error: 'NOT_PERSISTED', retryWithSameId: true }); }
  });
  server.get('/v1/messages/:eventId', async (req, res) => {
    if (!identifier.test(req.params.eventId)) { res.status(400).json({ error: 'INVALID_EVENT_ID' }); return; }
    const deliveries = await store.messageStatus(principalOf(credential(res)), req.params.eventId);
    res.status(deliveries.length ? 200 : 404).json({ deliveries, note: 'published means broker-confirmed, not business-processed' });
  });
  server.use('/v1/hospital', (_req, res, next) => {
    if (credential(res).role !== 'operator') { res.status(403).json({ error: 'OPERATOR_REQUIRED' }); return; }
    next();
  });
  server.get('/v1/hospital', async (req, res) => {
    const status = req.query.status;
    if (status !== undefined && (typeof status !== 'string' || !['pending','retrying','resolved','exhausted','blocked','discarded'].includes(status))) {
      res.status(400).json({ error: 'INVALID_STATUS' }); return;
    }
    res.json({ messages: await store.listHospital(principalOf(credential(res)), status), limit: 100 });
  });
  server.get('/v1/hospital/:id', async (req, res) => {
    if (!uuid.test(req.params.id)) { res.status(400).json({ error: 'INVALID_ID' }); return; }
    const record = await store.hospitalDetail(principalOf(credential(res)), req.params.id);
    res.status(record ? 200 : 404).json(record ?? { error: 'NOT_FOUND' });
  });
  server.post('/v1/hospital/:id/retry', express.json({ limit: '2kb', inflate: false }), async (req, res) => {
    if (!uuid.test(req.params.id) || typeof req.body?.reason !== 'string' || req.body.reason.trim().length < 5 || req.body.reason.length > 500) {
      res.status(400).json({ error: 'VALID_ID_AND_REASON_REQUIRED' }); return;
    }
    const updated = await store.redrive(principalOf(credential(res)), req.params.id, req.body.reason.trim());
    res.status(updated ? 202 : 409).json(updated ? { status: 'pending' } : { error: 'NOT_FOUND_OR_NOT_REDRIVABLE' });
  });
  server.use((error: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : error.status === 415 ? 415 : 503;
    res.status(status).json({ error: status === 413 ? 'BODY_TOO_LARGE' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INVALID_REQUEST' });
  });
  await app.init();
  return app;
}
