import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  createInitialState,
  parseStoredState,
  type Action,
} from "./dining-room";

const visit = {
  guest: "Familia de prueba",
  guests: 4,
  waiter: "Ana García",
  note: "",
};
const open: Action = { type: "open", tableIds: ["table-1"], visit };

test("abrir visita ocupa la mesa sin permitir doble ocupación", () => {
  const initial = createInitialState();
  const next = applyAction(initial, open, "visit-test");
  assert.equal(next.tables[0].status, "occupied");
  assert.equal(next.tables[0].visitId, "visit-test");
  assert.equal(initial.tables[0].status, "available");
  assert.throws(() => applyAction(next, open), /disponible/);
});

test("validar capacidad, personal y mesas de la misma área", () => {
  const initial = createInitialState();
  assert.throws(
    () => applyAction(initial, { ...open, visit: { ...visit, guests: 5 } }),
    /capacidad/,
  );
  assert.throws(
    () => applyAction(initial, { ...open, visit: { ...visit, guests: 1.5 } }),
    /capacidad/,
  );
  assert.throws(
    () =>
      applyAction(initial, {
        ...open,
        visit: { ...visit, waiter: "Desconocido" },
      }),
    /personal|equipo/,
  );
  assert.throws(
    () => applyAction(initial, { ...open, tableIds: ["table-1", "table-13"] }),
    /misma área/,
  );
  assert.throws(
    () => applyAction(initial, { ...open, tableIds: ["table-404"] }),
    /disponible/,
  );
});

test("agrupación comparte visita y no permite ocupar otra visita", () => {
  const initial = applyAction(createInitialState(), open, "visit-test");
  const next = applyAction(initial, {
    type: "group",
    tableId: "table-1",
    otherIds: ["table-4"],
  });
  assert.equal(next.tables[3].visitId, "visit-test");
  assert.throws(
    () =>
      applyAction(next, {
        type: "group",
        tableId: "table-1",
        otherIds: ["table-2"],
      }),
    /disponibles/,
  );
  const separated = applyAction(next, { type: "ungroup", tableId: "table-4" });
  assert.equal(separated.tables[3].status, "available");
  assert.equal(separated.tables[0].status, "occupied");
});

test("separación conserva capacidad suficiente para los comensales", () => {
  const next = applyAction(
    createInitialState(),
    {
      ...open,
      tableIds: ["table-1", "table-4"],
      visit: { ...visit, guests: 8 },
    },
    "visit-test",
  );
  assert.throws(
    () => applyAction(next, { type: "ungroup", tableId: "table-4" }),
    /capacidad/,
  );
});

test("liberación exige estado pendiente y pasa toda la agrupación a limpieza", () => {
  let state = applyAction(
    createInitialState(),
    { ...open, tableIds: ["table-1", "table-4"] },
    "visit-test",
  );
  assert.throws(
    () => applyAction(state, { type: "close", tableId: "table-1" }),
    /solicita/,
  );
  state = applyAction(state, { type: "pending", tableId: "table-1" });
  assert.equal(state.tables[3].status, "pending");
  state = applyAction(state, { type: "close", tableId: "table-4" });
  assert.equal(state.tables[0].status, "cleaning");
  assert.equal(state.tables[3].status, "cleaning");
  assert.ok(state.visits.find((v) => v.id === "visit-test")?.closedAt);
  assert.equal(state.tables[0].visitId, undefined);
  state = applyAction(state, { type: "clean", tableId: "table-1" });
  assert.equal(state.tables[0].status, "available");
});

test("mover una mesa impide colisiones y limita los bordes", () => {
  const initial = createInitialState();
  assert.throws(
    () =>
      applyAction(initial, { type: "move", tableId: "table-1", dx: 23, dy: 0 }),
    /posición/,
  );
  const next = applyAction(initial, {
    type: "move",
    tableId: "table-1",
    dx: -100,
    dy: -100,
  });
  assert.equal(next.tables[0].x, 10);
  assert.equal(next.tables[0].y, 16);
});

test("restauración rechaza datos corruptos y referencias de visita inválidas", () => {
  assert.equal(parseStoredState("not-json"), null);
  assert.equal(parseStoredState('{"version":1}'), null);
  const initial = createInitialState();
  assert.deepEqual(
    parseStoredState(JSON.stringify(initial)),
    JSON.parse(JSON.stringify(initial)),
  );
  initial.tables[1].visitId = "missing";
  assert.equal(parseStoredState(JSON.stringify(initial)), null);
});
