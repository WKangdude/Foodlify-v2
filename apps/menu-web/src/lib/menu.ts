export type Category = string;
export type Extra = { id: string; name: string; price: number };
export type Product = {
  id: string;
  name: string;
  description: string;
  category: Category;
  price: number;
  image: string;
  tag?: string;
  vegetarian?: boolean;
  available: boolean;
  allergens: string[];
  extras: Extra[];
};
export type CartItem = {
  id: string;
  productId: string;
  quantity: number;
  extraIds: string[];
  note: string;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(cents / 100);
export function itemPrice(item: CartItem, catalog: Product[]) {
  const product = catalog.find((p) => p.id === item.productId);
  if (!product) return 0;
  return (
    product.price +
    product.extras
      .filter((extra) => item.extraIds.includes(extra.id))
      .reduce((sum, extra) => sum + extra.price, 0)
  );
}
export function cartTotal(cart: CartItem[], catalog: Product[]) {
  return cart.reduce(
    (sum, item) => sum + itemPrice(item, catalog) * item.quantity,
    0,
  );
}
export function readCart(value: string | null, catalog: Product[]): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItem => {
      if (!item || typeof item !== "object") return false;
      const product = catalog.find(
        (p) => p.id === item.productId && p.available,
      );
      return (
        !!product &&
        typeof item.id === "string" &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 20 &&
        typeof item.note === "string" &&
        item.note.length <= 300 &&
        Array.isArray(item.extraIds) &&
        item.extraIds.every(
          (id: unknown) =>
            typeof id === "string" &&
            product.extras.some((extra) => extra.id === id),
        )
      );
    });
  } catch {
    return [];
  }
}
