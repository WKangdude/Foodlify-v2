import type { CartItem, Extra, Product } from "./menu";

export type MenuSession = {
  id: string;
  branchId: string;
  branchSlug?: string;
  tableLabel: string;
  areaLabel: string;
  expiresAt: string;
};
export type SavedItem = Omit<CartItem, "extraIds"> & {
  productName: string;
  unitPrice: number;
  extras: Extra[];
};
export type SavedOrder = {
  id: string;
  idempotencyKey: string;
  status:
    | "pending_delivery"
    | "accepted_by_orders"
    | "accepted_by_kitchen"
    | "rejected"
    | "cancelled";
  total: number;
  createdAt: string;
  items: SavedItem[];
  rejectionReason?: string;
};
export type MenuCatalog = {
  branch: {
    id: string;
    slug: string;
    name: string;
    location: string;
    businessName: string;
    tagline: string;
    version: number;
    currency: string;
  };
  categories: string[];
  products: Product[];
};
export type SessionState = {
  session: MenuSession;
  orders: SavedOrder[];
  preferences: { favorites: string[]; vegetarian: boolean };
};
export const errorMessages: Record<string, string> = {
  INVALID_QR:
    "El código QR no es válido o ya venció. Pide uno nuevo al personal.",
  VISIT_CLOSED: "La visita de tu mesa terminó. Solicita un nuevo código QR.",
  INVALID_SESSION:
    "Tu sesión venció. Vuelve a escanear el código QR de tu mesa.",
  SESSION_LIMIT:
    "Se abrieron muchas sesiones en esta mesa. Consulta al personal.",
  ORDER_LIMIT: "Espera un minuto antes de enviar otro pedido.",
  PRICE_CHANGED:
    "El precio cambió. Actualiza el menú y revisa tu carrito antes de confirmar.",
  PRODUCT_UNAVAILABLE:
    "Un platillo ya no está disponible. Actualiza el menú y revisa tu carrito.",
  INVALID_EXTRAS:
    "Una opción ya no está disponible. Actualiza el menú y revisa tu pedido.",
  IDEMPOTENCY_CONFLICT:
    "Este intento corresponde a otro pedido. Revisa tus pedidos antes de volver a enviar.",
  MENU_UNAVAILABLE: "El menú no está disponible para pedidos en este momento.",
  BACKEND_UNAVAILABLE:
    "No pudimos conectar con el restaurante. Conservamos tu carrito; vuelve a intentarlo.",
};
export class MenuRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      errorMessages[code] ??
        "No pudimos completar la solicitud. Revisa tu pedido e inténtalo de nuevo.",
    );
  }
}
export async function menuRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/menu/${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new MenuRequestError(response.status, data.error);
  return data as T;
}

export type PendingOrder = {
  idempotencyKey: string;
  items: CartItem[];
  expectedTotal: number;
};
export function readPendingOrder(value: unknown): PendingOrder | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Partial<PendingOrder>;
  if (
    typeof p.idempotencyKey !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(p.idempotencyKey) ||
    !Number.isSafeInteger(p.expectedTotal) ||
    p.expectedTotal! < 0 ||
    !Array.isArray(p.items) ||
    !p.items.length ||
    p.items.length > 50
  )
    return null;
  if (
    !p.items.every(
      (i) =>
        i &&
        typeof i.id === "string" &&
        typeof i.productId === "string" &&
        Number.isInteger(i.quantity) &&
        i.quantity > 0 &&
        i.quantity <= 20 &&
        typeof i.note === "string" &&
        i.note.length <= 300 &&
        Array.isArray(i.extraIds) &&
        i.extraIds.every((id) => typeof id === "string"),
    )
  )
    return null;
  return p as PendingOrder;
}
