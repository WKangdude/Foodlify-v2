import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
import { config, signature } from '../src/config.js';
import { INGRESS_QUEUE } from '../src/broker.js';

const settings = config();
const producer = settings.credentials.find(c => c.source === 'orders' && c.role === 'producer');
if (!producer) throw new Error('Configure a demo orders producer credential.');
const xml = await readFile(new URL('../contracts/order-placed.xml', import.meta.url), 'utf8');
const messageId = randomUUID();
const connection = await amqp.connect(settings.rabbitUrl);
try {
  const channel = await connection.createConfirmChannel();
  await channel.checkQueue(INGRESS_QUEUE);
  let returned = false;
  channel.on('return', () => { returned = true; });
  await new Promise<void>((resolve, reject) => {
    channel.sendToQueue(INGRESS_QUEUE, Buffer.from(xml), {
      persistent: true, mandatory: true, contentType: 'application/xml', messageId,
      headers: { producerId: producer.id, signature: signature(producer.token, messageId, xml) },
    }, error => error ? reject(error) : returned ? reject(new Error('Ingress queue is unavailable.')) : resolve());
  });
  console.log(JSON.stringify({ status: 'broker-confirmed', messageId, eventId: 'evt-order-001' }));
} finally { await connection.close(); }
