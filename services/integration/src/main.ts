import { config } from './config.js';
import { Postgres } from './database.js';
import { EventValidator } from './xml.js';
import { IntegrationStore } from './store.js';
import { RabbitBroker } from './broker.js';
import { IntegrationWorker } from './worker.js';
import { createApplication } from './http.js';

const settings = config();
const db = new Postgres(settings.databaseUrl, settings.databaseSchema);
const validator = await EventValidator.create();
const store = new IntegrationStore(db, settings.cipher, validator);
const broker = new RabbitBroker(settings.rabbitUrl, settings.credentials, store);
const worker = new IntegrationWorker(store, broker);
const app = await createApplication(settings, store, broker);
await app.listen(settings.port, settings.host);
console.log(JSON.stringify({ event: 'integration_listening', port: settings.port }));
const running = worker.run(() => broker.connect());
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  worker.stop();
  await app.close();
  await running;
  await broker.close();
  validator.close();
  await db.close();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void close().catch(() => { process.exitCode = 1; }); });
