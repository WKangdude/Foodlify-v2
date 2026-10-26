import { readFile } from 'node:fs/promises';
import { ParseOption, XmlDocument, XsdValidator } from 'libxml2-wasm';
import { MessageError, routes, type Principal } from './domain.js';

export const MAX_XML_BYTES = 128 * 1024;
export type Envelope = {
  eventId: string; eventType: string; tenantId: string; branchId: string;
  source: string; aggregateId: string; aggregateVersion: number; correlationId: string;
};
export class EventValidator {
  private constructor(private schema: XmlDocument, private validator: XsdValidator) {}
  static async create() {
    const schema = XmlDocument.fromString(await readFile(new URL('../contracts/event-v1.xsd', import.meta.url), 'utf8'));
    try { return new EventValidator(schema, XsdValidator.fromDoc(schema)); }
    catch (error) { schema.dispose(); throw error; }
  }
  parse(xml: string, principal: Principal): Envelope {
    if (Buffer.byteLength(xml) > MAX_XML_BYTES) throw new MessageError('XML_TOO_LARGE', false, 'XML exceeds the size limit.');
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || xml.includes('\0') || /<\?xml[^?]*encoding\s*=\s*["'](?!utf-8["'])/i.test(xml)) {
      throw new MessageError('UNSAFE_XML', false, 'DTD, entities and non-UTF-8 encodings are not allowed.');
    }
    let doc: XmlDocument | undefined;
    try {
      doc = XmlDocument.fromString(xml, { option: ParseOption.XML_PARSE_NO_XXE | ParseOption.XML_PARSE_NONET });
      const elements = doc.find('//*');
      if (elements.length > 4096) throw new MessageError('XML_COMPLEXITY', false, 'Too many XML elements.');
      for (const element of elements) {
        let depth = 0;
        for (let node = element.parent; node; node = node.parent) {
          if (++depth > 32) throw new MessageError('XML_COMPLEXITY', false, 'XML nesting exceeds the limit.');
        }
      }
      this.validator.validate(doc);
      const get = (name: string) => doc!.root.attr(name)!.content;
      const envelope: Envelope = {
        eventId: get('eventId'), eventType: get('eventType'), tenantId: get('tenantId'), branchId: get('branchId'),
        source: get('source'), aggregateId: get('aggregateId'), aggregateVersion: Number(get('aggregateVersion')), correlationId: get('correlationId'),
      };
      if (envelope.tenantId !== principal.tenantId || envelope.branchId !== principal.branchId || envelope.source !== principal.source || principal.role !== 'producer') {
        throw new MessageError('SCOPE_MISMATCH', false, 'Message does not match the authenticated producer scope.');
      }
      if (!Number.isSafeInteger(envelope.aggregateVersion) || envelope.aggregateVersion > 2147483647) {
        throw new MessageError('INVALID_VERSION', false, 'Aggregate version is outside the supported range.');
      }
      if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(get('occurredAt'))) throw new MessageError('TIMEZONE_REQUIRED', false, 'occurredAt requires a timezone.');
      const route = routes[envelope.eventType];
      if (!route || route.source !== envelope.source) throw new MessageError('UNSUPPORTED_EVENT', false, 'No route exists for this event and source.');
      return envelope;
    } catch (error) {
      if (error instanceof MessageError) throw error;
      // Native parser diagnostics may contain user data. Never return or log them.
      throw new MessageError('INVALID_XML', false, 'XML does not match event-v1.xsd.');
    } finally { doc?.dispose(); }
  }
  close() { this.validator.dispose(); this.schema.dispose(); }
}
