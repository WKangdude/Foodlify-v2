import assert from "node:assert/strict";
import test from "node:test";
import { initialState, parseState, validateEmployee } from "./admin";

test("no permite quitar el último administrador activo", () => {
  const admin = initialState.employees[0];
  assert.match(validateEmployee(initialState, { ...admin, status: "Suspendido" })!, /administrador activo/);
  assert.match(validateEmployee(initialState, { ...admin, role: "Cocina" })!, /administrador activo/);
  const state = { ...initialState, employees: [...initialState.employees, { ...admin, id: "second", email: "second@example.com" }] };
  assert.equal(validateEmployee(state, { ...admin, role: "Cocina" }), null);
});

test("rechaza correos duplicados sin distinguir mayúsculas y sucursales ajenas", () => {
  const employee = { ...initialState.employees[1], email: initialState.employees[0].email.toUpperCase() };
  assert.match(validateEmployee(initialState, employee)!, /Ya existe/);
  assert.match(validateEmployee(initialState, { ...initialState.employees[1], branch: "unknown" })!, /sucursal válida/);
});

test("recupera el esquema local y rechaza datos incompatibles", () => {
  assert.deepEqual(parseState(JSON.stringify(initialState)), initialState);
  assert.throws(() => parseState('{"version":2}'));
  assert.throws(() => parseState(JSON.stringify({ ...initialState, employees: [{ role: "invalid" }] })));
});
