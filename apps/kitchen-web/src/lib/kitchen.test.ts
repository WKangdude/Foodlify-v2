import assert from "node:assert/strict";
import test from "node:test";
import { advanceTicket, createDemoTickets, elapsedLabel, isDelayed, parseSnapshot } from "./kitchen";

const now = 1_800_000_000_000;
test("un ticket recorre preparación, listo y entregado sin modificar los demás", () => {
  const initial = createDemoTickets(now);
  const id = initial[0].id;
  let tickets = advanceTicket(initial, id, now);
  assert.equal(tickets[0].status, "preparing");
  assert.equal(initial[0].status, "pending");
  assert.equal(tickets[1], initial[1]);
  tickets = advanceTicket(tickets, id, now + 1);
  assert.equal(tickets[0].status, "ready");
  assert.ok(tickets[0].items.every(i => i.done));
  tickets = advanceTicket(tickets, id, now + 2);
  assert.equal(tickets[0].status, "delivered");
  assert.deepEqual(advanceTicket(tickets, id, now + 3), tickets);
});
test("la alerta respeta el umbral y excluye pedidos listos", () => {
  const tickets = createDemoTickets(now);
  assert.equal(isDelayed(tickets[3], now, 15), true);
  assert.equal(isDelayed(tickets[0], now, 15), false);
  assert.equal(isDelayed(tickets[6], now, 5), false);
  assert.equal(elapsedLabel(now + 1000, now), "00:00");
});
test("recupera una sesión válida y rechaza datos dañados o duplicados", () => {
  const tickets = createDemoTickets(now);
  assert.deepEqual(parseSnapshot(JSON.stringify({ version: 1, tickets })), JSON.parse(JSON.stringify(tickets)));
  for (const value of ["no-json", "null", '{"version":2,"tickets":[]}', JSON.stringify({version: 1, tickets: [tickets[0], tickets[0]]}), JSON.stringify({ version: 1, tickets: [{ ...tickets[0], items: [null] }] })]) assert.equal(parseSnapshot(value), null);
});
