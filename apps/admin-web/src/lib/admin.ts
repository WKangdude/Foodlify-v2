export const roles = ["Administrador", "Gerente", "Hostess", "Cocina", "Caja"] as const;
export type Role = typeof roles[number];
export type Employee = { id: string; name: string; email: string; role: Role; branch: string; status: "Activo" | "Invitación pendiente" | "Suspendido" };
export type Branch = { id: string; name: string; address: string; hours: string; active: boolean };
export type Activity = { id: string; text: string; at: string };
export type AdminState = { version: 1; business: { name: string; email: string; currency: string; timezone: string }; employees: Employee[]; branches: Branch[]; activity: Activity[] };
export const initialState: AdminState = {
  version: 1,
  business: { name: "Casa Oliva", email: "hola@casaoliva.example", currency: "MXN", timezone: "America/Mexico_City" },
  branches: [
    { id: "roma", name: "Roma Norte", address: "Colima 145, Roma Norte, Ciudad de México", hours: "Lun–Dom · 09:00–23:00", active: true },
    { id: "condesa", name: "Condesa", address: "Av. Michoacán 82, Condesa, Ciudad de México", hours: "Mar–Dom · 10:00–22:00", active: true },
    { id: "polanco", name: "Polanco", address: "Emilio Castelar 112, Polanco, Ciudad de México", hours: "Lun–Sáb · 09:00–22:00", active: false },
  ],
  employees: [
    { id: "1", name: "Andrea Martínez", email: "andrea@casaoliva.example", role: "Administrador", branch: "roma", status: "Activo" },
    { id: "2", name: "Daniel Romero", email: "daniel@casaoliva.example", role: "Gerente", branch: "roma", status: "Activo" },
    { id: "3", name: "Sofía Hernández", email: "sofia@casaoliva.example", role: "Hostess", branch: "roma", status: "Activo" },
    { id: "4", name: "Miguel Torres", email: "miguel@casaoliva.example", role: "Cocina", branch: "condesa", status: "Activo" },
    { id: "5", name: "Valentina Cruz", email: "valentina@casaoliva.example", role: "Caja", branch: "roma", status: "Activo" },
    { id: "6", name: "Carlos Mendoza", email: "carlos@casaoliva.example", role: "Cocina", branch: "roma", status: "Invitación pendiente" },
  ],
  activity: [
    { id: "a1", text: "Invitación de Carlos Mendoza creada", at: "2026-10-25T18:35:00-06:00" },
    { id: "a2", text: "Horario de Roma Norte actualizado", at: "2026-10-25T17:10:00-06:00" },
    { id: "a3", text: "Daniel Romero asignado al rol Gerente", at: "2026-10-25T10:20:00-06:00" },
  ],
};
export const permissionRows = [
  { name: "Administración", description: "Negocio, sucursales y equipo", allowed: ["Administrador"] },
  { name: "Salón", description: "Mesas, visitas y asignaciones", allowed: ["Administrador", "Gerente", "Hostess"] },
  { name: "Cocina", description: "Tickets y preparación", allowed: ["Administrador", "Gerente", "Cocina"] },
  { name: "Caja", description: "Cuentas, cobros y cortes", allowed: ["Administrador", "Gerente", "Caja"] },
  { name: "Catálogo", description: "Productos, precios y publicación", allowed: ["Administrador", "Gerente"] },
  { name: "Reportes", description: "Consulta de resultados", allowed: ["Administrador", "Gerente"] },
];
export function validateEmployee(state: AdminState, employee: Employee): string | null {
  if (!employee.name.trim()) return "Escribe el nombre del empleado.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) return "Escribe un correo electrónico válido.";
  if (state.employees.some(e => e.id !== employee.id && e.email.toLowerCase() === employee.email.toLowerCase())) return "Ya existe un empleado con este correo.";
  if (!state.branches.some(b => b.id === employee.branch)) return "Selecciona una sucursal válida.";
  if (!roles.includes(employee.role)) return "Selecciona un rol válido.";
  const previous = state.employees.find(e => e.id === employee.id);
  if (previous?.role === "Administrador" && previous.status === "Activo" && (employee.role !== "Administrador" || employee.status !== "Activo") && !state.employees.some(e => e.id !== employee.id && e.role === "Administrador" && e.status === "Activo")) return "Debe quedar al menos un administrador activo.";
  return null;
}
export function parseState(raw: string): AdminState {
  const value = JSON.parse(raw) as AdminState;
  if (!value || value.version !== 1 || !value.business || ![value.business.name, value.business.email, value.business.currency, value.business.timezone].every(field => typeof field === "string") || !Array.isArray(value.branches) || value.branches.length === 0 || !Array.isArray(value.employees) || !Array.isArray(value.activity)) throw new Error("Datos incompatibles");
  new Intl.DateTimeFormat("es-MX", { timeZone: value.business.timezone });
  if (!value.activity.every(a => a && typeof a.id === "string" && typeof a.text === "string" && typeof a.at === "string" && Number.isFinite(Date.parse(a.at)))) throw new Error("Datos incompatibles");
  if (!value.branches.every(b => typeof b.id === "string" && typeof b.name === "string" && typeof b.address === "string" && typeof b.hours === "string" && typeof b.active === "boolean") || !value.employees.every(e => typeof e.id === "string" && typeof e.name === "string" && typeof e.email === "string" && roles.includes(e.role) && value.branches.some(b => b.id === e.branch) && ["Activo", "Invitación pendiente", "Suspendido"].includes(e.status))) throw new Error("Datos incompatibles");
  return value;
}
