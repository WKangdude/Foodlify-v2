export type Station = "Caliente" | "Fría" | "Bebidas";
export type Status = "pending" | "preparing" | "ready" | "delivered";
export type Item = { id: string; name: string; quantity: number; station: Station; modifiers?: string; note?: string; done: boolean };
export type Ticket = {
  id: string; number: number; table: string; server: string; guests: number;
  status: Status; createdAt: number; updatedAt: number; priority: boolean;
  takeaway?: boolean; note?: string; items: Item[];
};
export type KitchenSnapshot = { version: 1; tickets: Ticket[] };
export const STORAGE_KEY = "foodlify:kitchen:demo:v1";
export const statusLabels: Record<Status, string> = { pending: "Por preparar", preparing: "En preparación", ready: "Listos para servir", delivered: "Entregados" };

export function createDemoTickets(now: number): Ticket[] {
  const item = (id: string, name: string, quantity: number, station: Station, modifiers?: string, note?: string): Item => ({ id, name, quantity, station, modifiers, note, done: false });
  const ticket = (number: number, table: string, minutes: number, status: Status, items: Item[], extra: Partial<Ticket> = {}): Ticket => ({ id: `demo-${number}`, number, table, server: "Valeria M.", guests: 2, status, createdAt: now - minutes * 60_000, updatedAt: now, priority: false, items: items.map(i => ({ ...i, done: status === "ready" })), ...extra });
  return [
    ticket(1048, "Mesa 06", 3, "pending", [item("a1", "Hamburguesa de la casa", 2, "Caliente", "Término medio · Papas a la francesa", "Una sin cebolla"), item("a2", "Limonada natural", 2, "Bebidas", "Sin azúcar")], { guests: 3, note: "Alergia a los cacahuates. Evitar contaminación cruzada.", priority: true }),
    ticket(1049, "Mesa 12", 2, "pending", [item("b1", "Ensalada mediterránea", 1, "Fría", "Aderezo por separado"), item("b2", "Pasta al pesto", 1, "Caliente", "Agregar pollo +")], { server: "Diego R." }),
    ticket(1050, "Para llevar", 1, "pending", [item("c1", "Sándwich de pollo", 2, "Caliente", "Pan de masa madre"), item("c2", "Papas a la francesa", 1, "Caliente")], { takeaway: true, server: "Mostrador", guests: 0 }),
    ticket(1043, "Mesa 03", 18, "preparing", [item("d1", "Salmón a la plancha", 1, "Caliente", "Vegetales de temporada"), item("d2", "Risotto de hongos", 1, "Caliente", "Sin queso parmesano")], { priority: true, server: "Diego R.", note: "Servir los dos platillos al mismo tiempo." }),
    ticket(1045, "Mesa 08", 10, "preparing", [item("e1", "Tacos de arrachera", 3, "Caliente", "Tortilla de maíz · Salsa aparte"), item("e2", "Guacamole", 1, "Fría", "Con totopos")], { guests: 4 }),
    ticket(1046, "Mesa 02", 7, "preparing", [item("f1", "Pollo al limón", 1, "Caliente", "Puré de papa"), item("f2", "Té helado", 1, "Bebidas")], { server: "Sofía L." }),
    ticket(1040, "Mesa 05", 14, "ready", [item("g1", "Pasta a la boloñesa", 2, "Caliente"), item("g2", "Agua de jamaica", 2, "Bebidas")], { server: "Sofía L." }),
    ticket(1042, "Mesa 10", 11, "ready", [item("h1", "Bowl de quinoa", 1, "Fría", "Agregar aguacate +"), item("h2", "Crema de tomate", 1, "Caliente")], { server: "Diego R." }),
  ];
}

const nextStatus: Partial<Record<Status, Status>> = { pending: "preparing", preparing: "ready", ready: "delivered" };
export function advanceTicket(tickets: Ticket[], id: string, now: number): Ticket[] {
  return tickets.map(ticket => {
    const status = nextStatus[ticket.status];
    return ticket.id === id && status ? { ...ticket, status, updatedAt: now, items: ticket.items.map(item => ({ ...item, done: status === "ready" || status === "delivered" })) } : ticket;
  });
}
export function isDelayed(ticket: Ticket, now: number, threshold: number): boolean {
  return (ticket.status === "pending" || ticket.status === "preparing") && now - ticket.createdAt >= threshold * 60_000;
}
export function elapsedLabel(createdAt: number, now: number): string {
  const total = Math.max(0, Math.floor((now - createdAt) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function parseSnapshot(value: string): Ticket[] | null {
  try {
    const snapshot: unknown = JSON.parse(value);
    if (!snapshot || typeof snapshot !== "object" || !("version" in snapshot) || snapshot.version !== 1 || !("tickets" in snapshot) || !Array.isArray(snapshot.tickets)) return null;
    const ids = new Set<string>();
    for (const t of snapshot.tickets) {
      if (!t || typeof t.id !== "string" || ids.has(t.id) || !Number.isInteger(t.number) || typeof t.table !== "string" || typeof t.server !== "string" || !Number.isInteger(t.guests) || !["pending", "preparing", "ready", "delivered"].includes(t.status) || !Number.isFinite(t.createdAt) || !Number.isFinite(t.updatedAt) || typeof t.priority !== "boolean" || (t.note !== undefined && typeof t.note !== "string") || (t.takeaway !== undefined && typeof t.takeaway !== "boolean") || !Array.isArray(t.items) || t.items.length === 0) return null;
      ids.add(t.id);
      const itemIds = new Set<string>();
      for (const i of t.items) {
        if (!i || typeof i.id !== "string" || itemIds.has(i.id) || typeof i.name !== "string" || !Number.isInteger(i.quantity) || i.quantity < 1 || !["Caliente", "Fría", "Bebidas"].includes(i.station) || typeof i.done !== "boolean" || (i.modifiers !== undefined && typeof i.modifiers !== "string") || (i.note !== undefined && typeof i.note !== "string")) return null;
        itemIds.add(i.id);
      }
    }
    return snapshot.tickets as Ticket[];
  } catch { return null; }
}
