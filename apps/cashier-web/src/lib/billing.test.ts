import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balance,
  closeShift,
  createInitialState,
  expectedCash,
  openShift,
  parseMoney,
  parseStoredState,
  registerPayment,
} from "./billing";

const payment = {
  id: "test-payment",
  accountId: "1042",
  amount: 50000,
  tip: 5000,
  method: "cash" as const,
  received: 100000,
  at: "2026-10-25T21:00:00.000Z",
  version: 1,
};
test("money is parsed into exact cents and rejects invalid or fractional-cent inputs", () => {
  assert.equal(parseMoney("185.50"), 18550);
  assert.equal(parseMoney("0.01"), 1);
  for (const input of [
    "-1",
    "1.001",
    "NaN",
    "Infinity",
    "",
    "1e5",
    "9007199254740992",
  ])
    assert.ok(Number.isNaN(parseMoney(input)));
});
test("partial payment preserves the remaining balance and counts cash including tip, excluding change", () => {
  const state = registerPayment(createInitialState(), payment);
  assert.equal(balance(state, state.accounts[0]), 28500);
  assert.equal(expectedCash(state, state.shifts[0]), 155000);
  assert.equal(state.accounts[0].version, 2);
});
test("a repeated payment key does not duplicate the payment", () => {
  const first = registerPayment(createInitialState(), payment);
  assert.strictEqual(registerPayment(first, payment), first);
});
test("stale versions, overpayments and insufficient cash are rejected", () => {
  const state = createInitialState();
  assert.throws(
    () => registerPayment(state, { ...payment, version: 2 }),
    /cambió/,
  );
  assert.throws(
    () => registerPayment(state, { ...payment, amount: 999999 }),
    /importe/,
  );
  assert.throws(
    () => registerPayment(state, { ...payment, received: 1000 }),
    /importe/,
  );
  assert.throws(
    () => registerPayment(state, { ...payment, amount: 1.5 }),
    /importe/,
  );
});
test("incomplete and unfinalized accounts cannot be collected", () => {
  for (const id of ["1044", "1046"])
    assert.throws(
      () =>
        registerPayment(createInitialState(), { ...payment, accountId: id }),
      /finalizada y completa/,
    );
});
test("settling an account removes its balance and disallows a second payment", () => {
  const state = registerPayment(createInitialState(), {
    ...payment,
    amount: 78500,
    tip: 0,
  });
  assert.equal(balance(state, state.accounts[0]), 0);
  assert.throws(
    () => registerPayment(state, { ...payment, id: "second", version: 2 }),
    /importe/,
  );
});
test("a cut is blocked by unresolved accounts and records cash differences after reconciliation", () => {
  const state = createInitialState();
  assert.throws(() => closeShift(state, 100000, payment.at), /conciliar/);
  const reconciled = {
    ...state,
    accounts: state.accounts.map((a) => ({ ...a, status: "ready" as const })),
  };
  const closed = closeShift(reconciled, 99000, payment.at);
  assert.equal(closed.shifts[0].counted, 99000);
  assert.throws(() => registerPayment(closed, payment), /turno/);
  assert.throws(() => openShift(state, 0, "new", payment.at), /abierto/);
  assert.equal(openShift(closed, 50000, "new", payment.at).shifts.length, 2);
});
test("persisted data is validated and corrupt balances or versions are rejected", () => {
  const state = registerPayment(createInitialState(), payment);
  assert.deepEqual(parseStoredState(JSON.stringify(state)), state);
  assert.throws(() => parseStoredState('{"schema":2}'));
  assert.throws(() =>
    parseStoredState(
      JSON.stringify({
        ...state,
        payments: [...state.payments, { ...state.payments[0] }],
      }),
    ),
  );
  assert.throws(() =>
    parseStoredState(
      JSON.stringify({
        ...state,
        accounts: state.accounts.map((a) => ({ ...a, items: [] })),
      }),
    ),
  );
  assert.throws(() =>
    parseStoredState(
      JSON.stringify({
        ...state,
        payments: [{ ...state.payments[1], amount: 999999 }],
      }),
    ),
  );
});
