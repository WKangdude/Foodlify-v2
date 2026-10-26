export type Area = "Salón principal" | "Terraza" | "Privado";
export type TableStatus = "available" | "occupied" | "pending" | "cleaning";
export type Table = {
  id: string;
  number: number;
  seats: number;
  area: Area;
  shape: "round" | "square";
  x: number;
  y: number;
  status: TableStatus;
  visitId?: string;
};
export type Visit = {
  id: string;
  guest: string;
  guests: number;
  waiter: string;
  startedAt: string;
  note: string;
  closedAt?: string;
};
export type Activity = { id: string; text: string; at: string };
export type DiningState = {
  version: 1;
  revision: number;
  tables: Table[];
  visits: Visit[];
  activity: Activity[];
};
export const areas: Area[] = ["Salón principal", "Terraza", "Privado"];
export const waiters = [
  "Ana García",
  "Diego López",
  "Mariana Ruiz",
  "Luis Torres",
];
export const statusLabels: Record<TableStatus, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  pending: "Por liberar",
  cleaning: "En limpieza",
};

export function createInitialState(): DiningState {
  const now = Date.now();
  const visits: Visit[] = [
    {
      id: "demo-1",
      guest: "Familia Martínez",
      guests: 4,
      waiter: waiters[0],
      startedAt: new Date(now - 42 * 60000).toISOString(),
      note: "Una persona con alergia a los frutos secos.",
    },
    {
      id: "demo-2",
      guest: "Sofía Hernández",
      guests: 2,
      waiter: waiters[1],
      startedAt: new Date(now - 18 * 60000).toISOString(),
      note: "",
    },
    {
      id: "demo-3",
      guest: "Carlos Mendoza",
      guests: 6,
      waiter: waiters[2],
      startedAt: new Date(now - 65 * 60000).toISOString(),
      note: "Visita de demostración pendiente de liberación.",
    },
    {
      id: "demo-4",
      guest: "Valeria Pérez",
      guests: 3,
      waiter: waiters[0],
      startedAt: new Date(now - 27 * 60000).toISOString(),
      note: "",
    },
    {
      id: "demo-5",
      guest: "Andrés Romero",
      guests: 2,
      waiter: waiters[3],
      startedAt: new Date(now - 12 * 60000).toISOString(),
      note: "",
    },
  ];
  const occupied: Record<number, string> = {
    2: "demo-1",
    5: "demo-2",
    8: "demo-3",
    10: "demo-4",
    14: "demo-5",
  };
  const tables: Table[] = Array.from({ length: 18 }, (_, i) => {
    const number = i + 1;
    const index = i < 12 ? i : i < 16 ? i - 12 : i - 16;
    return {
      id: `table-${number}`,
      number,
      seats: [4, 4, 2, 4, 2, 6, 4, 6, 2, 4, 4, 6, 4, 2, 4, 6, 8, 10][i],
      area: i < 12 ? "Salón principal" : i < 16 ? "Terraza" : "Privado",
      shape: [3, 5, 9, 14].includes(number) ? "round" : "square",
      x: 15 + (index % 4) * 23,
      y: 21 + Math.floor(index / 4) * 29,
      status:
        number === 8
          ? "pending"
          : occupied[number]
            ? "occupied"
            : number === 11
              ? "cleaning"
              : "available",
      visitId: occupied[number],
    };
  });
  return {
    version: 1,
    revision: 0,
    tables,
    visits,
    activity: [
      {
        id: "welcome",
        text: "El salón está listo para recibir a tus comensales.",
        at: new Date(now).toISOString(),
      },
    ],
  };
}

type VisitInput = Omit<Visit, "id" | "startedAt" | "closedAt">;
export type Action =
  | { type: "open"; tableIds: string[]; visit: VisitInput }
  | { type: "pending" | "close" | "clean"; tableId: string }
  | { type: "assign"; tableId: string; waiter: string }
  | { type: "group"; tableId: string; otherIds: string[] }
  | { type: "ungroup"; tableId: string }
  | { type: "move"; tableId: string; dx: number; dy: number };

export function applyAction(
  state: DiningState,
  action: Action,
  id = crypto.randomUUID(),
  at = new Date().toISOString(),
): DiningState {
  const tables = state.tables.map((t) => ({ ...t }));
  let visits = state.visits.map((v) => ({ ...v }));
  let text = "";
  const table =
    "tableId" in action
      ? tables.find((t) => t.id === action.tableId)
      : undefined;
  if ("tableId" in action && !table)
    throw new Error("La mesa ya no existe. Actualiza el salón.");
  const related = table?.visitId
    ? tables.filter((t) => t.visitId === table.visitId)
    : table
      ? [table]
      : [];
  switch (action.type) {
    case "open": {
      const selected = tables.filter((t) => action.tableIds.includes(t.id));
      if (
        !selected.length ||
        selected.length !== new Set(action.tableIds).size ||
        selected.some((t) => t.status !== "available")
      )
        throw new Error("Una de las mesas ya no está disponible.");
      if (new Set(selected.map((t) => t.area)).size > 1)
        throw new Error("Agrupa mesas de la misma área.");
      if (
        !Number.isInteger(action.visit.guests) ||
        action.visit.guests < 1 ||
        action.visit.guests > selected.reduce((n, t) => n + t.seats, 0)
      )
        throw new Error(
          "El número de personas supera la capacidad de las mesas.",
        );
      if (!action.visit.guest.trim() || !waiters.includes(action.visit.waiter))
        throw new Error(
          "Indica el nombre de la visita y una persona del equipo.",
        );
      visits.push({
        ...action.visit,
        guest: action.visit.guest.trim(),
        id,
        startedAt: at,
      });
      selected.forEach((t) => {
        t.status = "occupied";
        t.visitId = id;
      });
      text = `Visita de ${action.visit.guest.trim()} abierta en mesa ${selected.map((t) => t.number).join(" + ")}.`;
      break;
    }
    case "pending":
      if (table!.status !== "occupied")
        throw new Error(
          "Solo una visita activa puede quedar pendiente de liberación.",
        );
      related.forEach((t) => {
        t.status = "pending";
      });
      text = `Mesa ${table!.number}: liberación pendiente; valida el cierre en caja.`;
      break;
    case "close":
      if (table!.status !== "pending")
        throw new Error("Primero solicita la liberación de la visita.");
      visits = visits.map((v) =>
        v.id === table!.visitId ? { ...v, closedAt: at } : v,
      );
      related.forEach((t) => {
        t.status = "cleaning";
        delete t.visitId;
      });
      text = `Visita de mesa ${table!.number} cerrada. Mesas en limpieza.`;
      break;
    case "clean":
      if (table!.status !== "cleaning")
        throw new Error("Esta mesa no está en limpieza.");
      table!.status = "available";
      text = `Mesa ${table!.number} limpia y disponible.`;
      break;
    case "assign": {
      const visit = visits.find((v) => v.id === table!.visitId && !v.closedAt);
      if (!visit || !waiters.includes(action.waiter))
        throw new Error("Selecciona una visita activa y personal válido.");
      visit.waiter = action.waiter;
      text = `Mesa ${table!.number} asignada a ${action.waiter}.`;
      break;
    }
    case "group": {
      if (table!.status !== "occupied")
        throw new Error("Selecciona una mesa con visita activa para agrupar.");
      const others = tables.filter((t) => action.otherIds.includes(t.id));
      if (
        !others.length ||
        others.length !== new Set(action.otherIds).size ||
        others.some((t) => t.status !== "available" || t.area !== table!.area)
      )
        throw new Error("Solo puedes unir mesas disponibles de la misma área.");
      others.forEach((t) => {
        t.visitId = table!.visitId;
        t.status = "occupied";
      });
      text = `Mesa ${table!.number} agrupada con ${others.map((t) => t.number).join(", ")}.`;
      break;
    }
    case "ungroup": {
      const visit = visits.find((v) => v.id === table!.visitId);
      if (related.length < 2 || !visit || table!.status !== "occupied")
        throw new Error("Selecciona una agrupación con visita activa.");
      if (
        related
          .filter((t) => t.id !== table!.id)
          .reduce((n, t) => n + t.seats, 0) < visit.guests
      )
        throw new Error(
          "Las mesas restantes no tienen capacidad para la visita.",
        );
      delete table!.visitId;
      table!.status = "available";
      text = `Mesa ${table!.number} separada de la agrupación.`;
      break;
    }
    case "move":
      table!.x = Math.max(10, Math.min(88, table!.x + action.dx));
      table!.y = Math.max(16, Math.min(80, table!.y + action.dy));
      if (
        tables.some(
          (t) =>
            t.id !== table!.id &&
            t.area === table!.area &&
            Math.abs(t.x - table!.x) < 16 &&
            Math.abs(t.y - table!.y) < 20,
        )
      )
        throw new Error("Hay otra mesa en esa posición.");
      text = `Posición de mesa ${table!.number} actualizada.`;
  }
  return {
    ...state,
    revision: state.revision + 1,
    tables,
    visits,
    activity: [{ id, text, at }, ...state.activity].slice(0, 30),
  };
}

export const storageKey = "foodlify:hostess:demo:v1";

export function parseStoredState(raw: string): DiningState | null {
  try {
    const value = JSON.parse(raw) as DiningState;
    if (
      value.version !== 1 ||
      !Number.isInteger(value.revision) ||
      !Array.isArray(value.tables) ||
      value.tables.length !== 18 ||
      !Array.isArray(value.visits) ||
      !Array.isArray(value.activity)
    )
      return null;
    const ids = new Set<string>();
    for (const t of value.tables) {
      if (
        !t ||
        typeof t.id !== "string" ||
        ids.has(t.id) ||
        !Number.isInteger(t.number) ||
        !Number.isInteger(t.seats) ||
        t.seats < 1 ||
        !areas.includes(t.area) ||
        !["round", "square"].includes(t.shape) ||
        !Object.hasOwn(statusLabels, t.status) ||
        !Number.isFinite(t.x) ||
        !Number.isFinite(t.y)
      )
        return null;
      ids.add(t.id);
    }
    for (const v of value.visits)
      if (
        !v ||
        typeof v.id !== "string" ||
        typeof v.guest !== "string" ||
        typeof v.note !== "string" ||
        !waiters.includes(v.waiter) ||
        !Number.isInteger(v.guests) ||
        v.guests < 1 ||
        !Number.isFinite(Date.parse(v.startedAt)) ||
        (v.closedAt !== undefined && !Number.isFinite(Date.parse(v.closedAt)))
      )
        return null;
    for (const t of value.tables) {
      const active = value.visits.find(
        (v) => v.id === t.visitId && !v.closedAt,
      );
      if (
        t.status === "occupied" || t.status === "pending"
          ? !active
          : t.visitId !== undefined
      )
        return null;
    }
    for (const a of value.activity)
      if (
        !a ||
        typeof a.id !== "string" ||
        typeof a.text !== "string" ||
        !Number.isFinite(Date.parse(a.at))
      )
        return null;
    return value;
  } catch {
    return null;
  }
}
