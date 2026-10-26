import assert from "node:assert/strict";
import test from "node:test";
import {
  cartTotal as total,
  itemPrice as price,
  readCart as restore,
  type CartItem,
} from "./menu";
import { products } from "./menu-fixtures";
const cartTotal = (items: CartItem[]) => total(items, products);
const itemPrice = (item: CartItem) => price(item, products);
const readCart = (value: string | null) => restore(value, products);

const item: CartItem = {
  id: "line-1",
  productId: "pasta",
  quantity: 2,
  extraIds: ["pollo", "parmesano"],
  note: "Sin sal",
};

test("calcula extras por unidad y totales en centavos", () => {
  assert.equal(itemPrice(item), 32500);
  assert.equal(
    cartTotal([
      item,
      {
        ...item,
        id: "line-2",
        productId: "lemonade",
        quantity: 1,
        extraIds: [],
      },
    ]),
    71500,
  );
});

test("recupera un carrito válido sin confiar en precios almacenados", () => {
  const restored = readCart(JSON.stringify([{ ...item, price: 1 }]));
  assert.equal(restored.length, 1);
  assert.equal(cartTotal(restored), 65000);
});

test("descarta datos dañados, cantidades inválidas y productos no disponibles", () => {
  for (const value of [null, "invalid", "{}", "null"])
    assert.deepEqual(readCart(value), []);
  const invalid = [
    { ...item, quantity: -1 },
    { ...item, quantity: 1.5 },
    { ...item, quantity: 21 },
    { ...item, productId: "missing" },
    { ...item, productId: "toast" },
    { ...item, extraIds: ["missing"] },
    { ...item, note: "x".repeat(301) },
    null,
  ];
  assert.deepEqual(readCart(JSON.stringify([...invalid, item])), [item]);
});

test("un catálogo recibido del servidor reemplaza los precios del prototipo", () => {
  const catalog = products.map((p) =>
    p.id === "pasta" ? { ...p, price: 10000 } : p,
  );
  assert.equal(total([item], catalog), 38000);
  assert.deepEqual(restore(JSON.stringify([item]), []), []);
});
