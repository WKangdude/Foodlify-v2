export type AccountStatus = "ready" | "dining" | "pending";
export type Method = "cash" | "card";
export type Item = {
  name: string;
  quantity: number;
  unitPrice: number;
  note?: string;
};
export type Account = {
  id: string;
  table: string;
  area: string;
  guests: number;
  waiter: string;
  opened: string;
  status: AccountStatus;
  version: number;
  items: Item[];
};
export type Payment = {
  id: string;
  accountId: string;
  shiftId: string;
  amount: number;
  tip: number;
  method: Method;
  received: number;
  at: string;
};
export type Shift = {
  id: string;
  openedAt: string;
  opening: number;
  closedAt?: string;
  counted?: number;
};
export type BillingState = {
  schema: 1;
  accounts: Account[];
  payments: Payment[];
  shifts: Shift[];
};
export const storageKey = "foodlify:cashier:demo:v1";
export const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    cents / 100,
  );
export const total = (account: Account) =>
  account.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
export const paid = (state: BillingState, id: string) =>
  state.payments
    .filter((p) => p.accountId === id)
    .reduce((sum, p) => sum + p.amount, 0);
export const balance = (state: BillingState, account: Account) =>
  total(account) - paid(state, account.id);
export const activeShift = (state: BillingState) =>
  state.shifts.find((s) => !s.closedAt);
export const expectedCash = (state: BillingState, shift: Shift) =>
  shift.opening +
  state.payments
    .filter((p) => p.shiftId === shift.id && p.method === "cash")
    .reduce((sum, p) => sum + p.amount + p.tip, 0);
export function parseMoney(value: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(value.trim())) return NaN;
  const [whole, decimal = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : NaN;
}
export function createInitialState(): BillingState {
  const account = (
    id: string,
    table: string,
    area: string,
    guests: number,
    waiter: string,
    opened: string,
    status: AccountStatus,
    items: Item[],
  ): Account => ({
    id,
    table,
    area,
    guests,
    waiter,
    opened,
    status,
    version: 1,
    items,
  });
  return {
    schema: 1,
    accounts: [
      account(
        "1042",
        "Mesa 04",
        "Salón principal",
        3,
        "Mariana López",
        "14:05",
        "ready",
        [
          {
            name: "Hamburguesa de la casa",
            quantity: 2,
            unitPrice: 18500,
            note: "Una sin cebolla · papas incluidas",
          },
          { name: "Pasta al pesto", quantity: 1, unitPrice: 16500 },
          { name: "Limonada de hierbabuena", quantity: 3, unitPrice: 5500 },
          { name: "Brownie con helado", quantity: 1, unitPrice: 8500 },
        ],
      ),
      account(
        "1043",
        "Mesa 07",
        "Terraza",
        2,
        "Diego Ramírez",
        "14:12",
        "ready",
        [
          { name: "Tacos de arrachera", quantity: 2, unitPrice: 15500 },
          { name: "Agua de jamaica", quantity: 2, unitPrice: 4500 },
        ],
      ),
      account(
        "1044",
        "Mesa 02",
        "Salón principal",
        4,
        "Mariana López",
        "14:18",
        "dining",
        [
          { name: "Pizza margarita", quantity: 2, unitPrice: 22000 },
          { name: "Refresco", quantity: 4, unitPrice: 4000 },
        ],
      ),
      account(
        "1045",
        "Para llevar",
        "Mostrador",
        1,
        "Ana García",
        "14:24",
        "ready",
        [
          { name: "Hamburguesa de la casa", quantity: 1, unitPrice: 18500 },
          { name: "Limonada de hierbabuena", quantity: 1, unitPrice: 5500 },
        ],
      ),
      account(
        "1046",
        "Mesa 12",
        "Terraza",
        5,
        "Diego Ramírez",
        "14:28",
        "pending",
        [
          { name: "Corte de arrachera", quantity: 3, unitPrice: 28500 },
          { name: "Agua mineral", quantity: 5, unitPrice: 4500 },
        ],
      ),
      account(
        "1047",
        "Mesa 09",
        "Salón principal",
        2,
        "Mariana López",
        "14:32",
        "ready",
        [
          { name: "Ensalada mediterránea", quantity: 2, unitPrice: 14500 },
          { name: "Té helado", quantity: 2, unitPrice: 4500 },
        ],
      ),
      account(
        "1048",
        "Mesa 06",
        "Salón principal",
        3,
        "Ana García",
        "14:40",
        "dining",
        [
          { name: "Pasta al pesto", quantity: 3, unitPrice: 16500 },
          { name: "Limonada de hierbabuena", quantity: 3, unitPrice: 5500 },
        ],
      ),
      account(
        "1038",
        "Mesa 03",
        "Terraza",
        2,
        "Diego Ramírez",
        "13:20",
        "ready",
        [{ name: "Tacos de arrachera", quantity: 2, unitPrice: 15500 }],
      ),
    ],
    payments: [
      {
        id: "DEMO-001",
        accountId: "1038",
        shiftId: "turno-1",
        amount: 31000,
        tip: 3100,
        method: "card",
        received: 34100,
        at: "2026-10-25T20:35:00.000Z",
      },
    ],
    shifts: [
      { id: "turno-1", openedAt: "2026-10-25T19:00:00.000Z", opening: 100000 },
    ],
  };
}
function validCents(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}
export function parseStoredState(raw: string): BillingState {
  const state = JSON.parse(raw) as BillingState;
  if (
    state.schema !== 1 ||
    !Array.isArray(state.accounts) ||
    state.accounts.length === 0 ||
    !Array.isArray(state.payments) ||
    !Array.isArray(state.shifts)
  )
    throw new Error("Formato de demostración inválido.");
  const unique = (ids: string[]) =>
    ids.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(ids).size === ids.length;
  if (
    !unique(state.accounts.map((a) => a.id)) ||
    !unique(state.payments.map((p) => p.id)) ||
    !unique(state.shifts.map((s) => s.id))
  )
    throw new Error("Identificadores inválidos.");
  for (const a of state.accounts) {
    if (
      !["ready", "dining", "pending"].includes(a.status) ||
      !Number.isSafeInteger(a.version) ||
      a.version < 1 ||
      ![a.table, a.area, a.waiter, a.opened].every(
        (v) => typeof v === "string",
      ) ||
      !validCents(a.guests) ||
      !Array.isArray(a.items) ||
      !a.items.length ||
      a.items.some(
        (i) =>
          typeof i.name !== "string" ||
          (i.note !== undefined && typeof i.note !== "string") ||
          !validCents(i.unitPrice) ||
          !Number.isSafeInteger(i.quantity) ||
          i.quantity < 1,
      ) ||
      !validCents(total(a))
    )
      throw new Error("Cuenta inválida.");
  }
  if (state.shifts.filter((s) => !s.closedAt).length > 1)
    throw new Error("Hay más de un turno abierto.");
  for (const s of state.shifts)
    if (
      !validCents(s.opening) ||
      !Number.isFinite(Date.parse(s.openedAt)) ||
      (s.closedAt !== undefined &&
        (!Number.isFinite(Date.parse(s.closedAt)) || !validCents(s.counted)))
    )
      throw new Error("Turno inválido.");
  for (const p of state.payments)
    if (
      !["cash", "card"].includes(p.method) ||
      !validCents(p.amount) ||
      !p.amount ||
      !validCents(p.tip) ||
      !validCents(p.received) ||
      p.received < p.amount + p.tip ||
      !Number.isFinite(Date.parse(p.at)) ||
      !state.accounts.some((a) => a.id === p.accountId) ||
      !state.shifts.some((s) => s.id === p.shiftId)
    )
      throw new Error("Pago inválido.");
  if (state.accounts.some((a) => balance(state, a) < 0))
    throw new Error("La cuenta tiene pagos excedidos.");
  return state;
}
export function registerPayment(
  state: BillingState,
  input: Omit<Payment, "shiftId"> & { version: number },
): BillingState {
  if (state.payments.some((p) => p.id === input.id)) return state;
  const shift = activeShift(state);
  const account = state.accounts.find((a) => a.id === input.accountId);
  if (!shift) throw new Error("Abre un turno antes de cobrar.");
  if (!account || account.version !== input.version)
    throw new Error("La cuenta cambió. Revisa su versión antes de cobrar.");
  if (account.status !== "ready")
    throw new Error("Solo puedes cobrar una cuenta finalizada y completa.");
  if (
    !["cash", "card"].includes(input.method) ||
    !validCents(input.amount) ||
    input.amount === 0 ||
    input.amount > balance(state, account) ||
    !validCents(input.tip) ||
    !validCents(input.received) ||
    !validCents(input.amount + input.tip) ||
    input.received < input.amount + input.tip
  )
    throw new Error("Revisa el importe y el efectivo recibido.");
  const { version: _version, ...payment } = input;
  void _version;
  return {
    ...state,
    accounts: state.accounts.map((a) =>
      a.id === account.id ? { ...a, version: a.version + 1 } : a,
    ),
    payments: [...state.payments, { ...payment, shiftId: shift.id }],
  };
}
export function openShift(
  state: BillingState,
  opening: number,
  id: string,
  at: string,
): BillingState {
  if (activeShift(state)) throw new Error("Ya hay un turno abierto.");
  if (!validCents(opening))
    throw new Error("Introduce un fondo de caja válido.");
  return { ...state, shifts: [...state.shifts, { id, opening, openedAt: at }] };
}
export function closeShift(
  state: BillingState,
  counted: number,
  at: string,
): BillingState {
  const shift = activeShift(state);
  if (!shift) throw new Error("No hay un turno abierto.");
  if (!validCents(counted)) throw new Error("Introduce el efectivo contado.");
  if (
    state.accounts.some((a) => a.status === "pending" && balance(state, a) > 0)
  )
    throw new Error(
      "Hay cuentas por conciliar. Resuélvelas antes del corte definitivo.",
    );
  return {
    ...state,
    shifts: state.shifts.map((s) =>
      s.id === shift.id ? { ...s, closedAt: at, counted } : s,
    ),
  };
}
