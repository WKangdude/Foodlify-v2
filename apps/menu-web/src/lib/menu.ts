export type Category =
  "Todos" | "Entradas" | "Platos fuertes" | "Ensaladas" | "Postres" | "Bebidas";
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
export const categories: Category[] = [
  "Todos",
  "Entradas",
  "Platos fuertes",
  "Ensaladas",
  "Postres",
  "Bebidas",
];
const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
export const products: Product[] = [
  {
    id: "rigatoni",
    name: "Rigatoni al pomodoro",
    description:
      "Rigatoni con salsa de tomate de la casa, albahaca fresca y queso parmesano.",
    category: "Platos fuertes",
    price: 18900,
    image: photo("photo-1608897013039-887f21d8c804"),
    tag: "Favorito de la casa",
    vegetarian: true,
    available: true,
    allergens: ["Leche", "Gluten", "Frutos secos"],
    extras: [{ id: "pan", name: "Pan de masa madre extra", price: 3500 }],
  },
  {
    id: "pasta",
    name: "Pasta artesanal al pesto",
    description:
      "Pasta artesanal, pesto de albahaca, parmesano y un toque de aceite de oliva.",
    category: "Platos fuertes",
    price: 23500,
    image: photo("photo-1473093295043-cdd812d0e601"),
    tag: "El más pedido",
    vegetarian: true,
    available: true,
    allergens: ["Gluten", "Leche", "Huevo", "Frutos secos"],
    extras: [
      { id: "pollo", name: "Pollo a la parrilla", price: 6500 },
      { id: "parmesano", name: "Parmesano extra", price: 2500 },
    ],
  },
  {
    id: "burger",
    name: "Hamburguesa del Olivo",
    description:
      "Res a la parrilla, queso cheddar, cebolla caramelizada y papas crujientes.",
    category: "Platos fuertes",
    price: 24900,
    image: photo("photo-1568901346375-23c9450c58cd"),
    available: true,
    allergens: ["Gluten", "Leche", "Huevo"],
    extras: [
      { id: "queso", name: "Queso cheddar extra", price: 2500 },
      { id: "tocino", name: "Tocino crujiente", price: 3500 },
    ],
  },
  {
    id: "salad",
    name: "Ensalada mediterránea",
    description:
      "Hojas frescas, tomates cherry, pepino, aceitunas, queso feta y vinagreta de limón.",
    category: "Ensaladas",
    price: 17500,
    image: photo("photo-1512621776951-a57141f2eefd"),
    vegetarian: true,
    available: true,
    allergens: ["Leche"],
    extras: [{ id: "pollo", name: "Pollo a la parrilla", price: 6500 }],
  },
  {
    id: "salmon",
    name: "Salmón a la parrilla",
    description:
      "Salmón con costra de hierbas, vegetales asados y mantequilla de limón.",
    category: "Platos fuertes",
    price: 32900,
    image: photo("photo-1467003909585-2f8a72700288"),
    tag: "Recomendación del chef",
    available: true,
    allergens: ["Pescado", "Leche"],
    extras: [{ id: "verduras", name: "Vegetales extra", price: 4500 }],
  },
  {
    id: "cake",
    name: "Pastel de chocolate",
    description:
      "Chocolate intenso, centro suave y frutos rojos. El final que te mereces.",
    category: "Postres",
    price: 11900,
    image: photo("photo-1578985545062-69928b1d9587"),
    vegetarian: true,
    available: true,
    allergens: ["Gluten", "Leche", "Huevo"],
    extras: [{ id: "helado", name: "Helado de vainilla", price: 3000 }],
  },
  {
    id: "lemonade",
    name: "Limonada de la casa",
    description:
      "Limón recién exprimido, hierbabuena y agua mineral. Fresca y natural.",
    category: "Bebidas",
    price: 6500,
    image: photo("photo-1544145945-f90425340c7e"),
    vegetarian: true,
    available: true,
    allergens: [],
    extras: [],
  },
  {
    id: "toast",
    name: "Tostada de aguacate",
    description:
      "Masa madre tostada, aguacate, huevo pochado y semillas de temporada.",
    category: "Entradas",
    price: 15900,
    image: photo("photo-1525351484163-7529414344d8"),
    vegetarian: true,
    available: false,
    allergens: ["Gluten", "Huevo", "Sésamo"],
    extras: [],
  },
];
export const money = (cents: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(cents / 100);
export function itemPrice(item: CartItem) {
  const product = products.find((p) => p.id === item.productId);
  if (!product) return 0;
  return (
    product.price +
    product.extras
      .filter((extra) => item.extraIds.includes(extra.id))
      .reduce((sum, extra) => sum + extra.price, 0)
  );
}
export function cartTotal(cart: CartItem[]) {
  return cart.reduce((sum, item) => sum + itemPrice(item) * item.quantity, 0);
}
export function readCart(value: string | null): CartItem[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CartItem => {
      if (!item || typeof item !== "object") return false;
      const product = products.find(
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
