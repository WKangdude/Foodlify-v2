import assert from "node:assert/strict";
import test from "node:test";
import { readPendingOrder } from "./menu-backend";
const pending = {
  idempotencyKey: "11d16fd9-aa9d-4f64-8bc8-8c86bc7f4de0",
  items: [
    {
      id: "1",
      productId: "pasta",
      quantity: 2,
      extraIds: ["pollo"],
      note: "Salsa aparte",
    },
  ],
  expectedTotal: 60000,
};
test("restaura el mismo intento aunque cambie el catálogo para no duplicar pedidos", () => {
  assert.deepEqual(
    readPendingOrder(JSON.parse(JSON.stringify(pending))),
    pending,
  );
});
test("descarta intentos pendientes corruptos", () => {
  for (const value of [
    null,
    {},
    "x",
    { ...pending, expectedTotal: -1 },
    { ...pending, idempotencyKey: "x" },
    { ...pending, items: [] },
    { ...pending, items: [{ ...pending.items[0], quantity: 21 }] },
  ])
    assert.equal(readPendingOrder(value), null);
});
