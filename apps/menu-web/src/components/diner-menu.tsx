"use client";

import { MenuImage } from "@/components/menu-image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Heart,
  Leaf,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  UtensilsCrossed,
  WifiOff,
  X,
} from "lucide-react";
import {
  cartTotal as calculateTotal,
  itemPrice as calculatePrice,
  money,
  readCart as restoreCart,
  type CartItem,
  type Category,
  type Product,
} from "@/lib/menu";

import {
  menuRequest,
  MenuRequestError,
  readPendingOrder,
  type MenuCatalog,
  type MenuSession,
  type SavedOrder,
  type SessionState,
  type PendingOrder,
} from "@/lib/menu-backend";
type Panel = "cart" | "bill" | "help" | "filters" | null;

function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="dialog"
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Cerrar" onClick={close}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function DinerMenu({ catalog }: { catalog: MenuCatalog }) {
  const products = catalog.products;
  const categories = catalog.categories;
  const cartTotal = useCallback(
    (items: CartItem[]) => calculateTotal(items, products),
    [products],
  );
  const itemPrice = useCallback(
    (item: CartItem) => calculatePrice(item, products),
    [products],
  );
  const readCart = useCallback(
    (value: string | null) => restoreCart(value, products),
    [products],
  );
  const [session, setSession] = useState<MenuSession | null>(null);
  const [storageKey, setStorageKey] = useState("");
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [backendError, setBackendError] = useState("");
  const submitLock = useRef(false);

  const [category, setCategory] = useState<Category>("Todos");
  const [query, setQuery] = useState("");
  const [vegetarian, setVegetarian] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [online, setOnline] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function restore() {
      let data: SessionState | null = null;
      try {
        const url = new URL(window.location.href);
        const qrToken = url.searchParams.get("qr");
        if (qrToken) {
          url.searchParams.delete("qr");
          window.history.replaceState(
            null,
            "",
            url.pathname + url.search + url.hash,
          );
          await menuRequest("sessions", {
            method: "POST",
            body: JSON.stringify({ qrToken }),
          });
        }
        data = await menuRequest<SessionState>("session");
        if (data.session.branchId !== catalog.branch.id) {
          data = null;
          throw new Error(
            "El QR pertenece a otra sucursal. Abre el enlace completo que te compartió el restaurante.",
          );
        }
      } catch (error) {
        if (
          active &&
          !(
            error instanceof MenuRequestError &&
            error.code === "INVALID_SESSION"
          )
        )
          setBackendError(
            error instanceof Error
              ? error.message
              : "No pudimos recuperar tu sesión.",
          );
      }
      if (!active) return;
      const key = `foodlify:menu:v2:${catalog.branch.id}:${data?.session.id ?? "browse"}`;
      setSession(data?.session ?? null);
      setOrders(data?.orders ?? []);
      let saved: {
        cart?: unknown;
        favorites?: unknown;
        pendingOrder?: unknown;
      } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(key) ?? "null");
      } catch {
        setStorageError(true);
      }
      const pending = readPendingOrder(saved?.pendingOrder);
      const recovered =
        !!pending &&
        data?.orders.some((o) => o.idempotencyKey === pending.idempotencyKey);
      setCart(
        recovered
          ? []
          : (pending?.items ?? readCart(JSON.stringify(saved?.cart))),
      );
      setPendingOrder(recovered ? null : pending);
      setFavorites(
        data?.preferences.favorites ??
          (Array.isArray(saved?.favorites)
            ? saved.favorites.filter(
                (id): id is string =>
                  typeof id === "string" && products.some((p) => p.id === id),
              )
            : []),
      );
      setVegetarian(data?.preferences.vegetarian ?? false);
      setStorageKey(key);
      setHydrated(true);
      setOnline(navigator.onLine);
    }
    void restore();
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      active = false;
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [catalog.branch.id, products, readCart]);
  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ cart, favorites, pendingOrder }),
      );
    } catch {
      queueMicrotask(() => setStorageError(true));
    }
  }, [cart, favorites, pendingOrder, hydrated, storageKey]);
  useEffect(() => {
    if (!session || !hydrated || !online) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void menuRequest("preferences", {
        method: "PUT",
        body: JSON.stringify({ favorites, vegetarian }),
        signal: controller.signal,
      }).catch((error) => {
        if (!controller.signal.aborted)
          setNotice(
            error instanceof Error
              ? error.message
              : "No pudimos guardar tus preferencias.",
          );
      });
    }, 600);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [session, hydrated, online, favorites, vegetarian]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    async function refresh() {
      if (document.hidden || !navigator.onLine) return;
      try {
        const data = await menuRequest<SessionState>("session");
        if (active) {
          setOrders(data.orders);
          setBackendError("");
        }
      } catch (error) {
        if (active) {
          setBackendError(
            error instanceof Error
              ? error.message
              : "No pudimos actualizar tus pedidos.",
          );
          if (error instanceof MenuRequestError && error.status === 401)
            setSession(null);
        }
      }
    }
    const interval = setInterval(() => void refresh(), 15000);
    const visible = () => void refresh();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [session]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const normalized = query
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const visible = products.filter(
    (p) =>
      (category === "Todos" || p.category === category) &&
      (!vegetarian || p.vegetarian) &&
      (!onlyFavorites || favorites.includes(p.id)) &&
      `${p.name} ${p.description}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(normalized),
  );
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cartTotal(cart);
  const billTotal = orders
    .filter((o) => !["rejected", "cancelled"].includes(o.status))
    .reduce((sum, order) => sum + order.total, 0);
  const latest = orders.at(-1);
  function openProduct(p: Product) {
    setProduct(p);
    setExtraIds([]);
    setQuantity(1);
    setNote("");
  }
  function addProduct() {
    if (!product?.available || pendingOrder || submitting) return;
    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        quantity,
        extraIds,
        note: note.trim(),
      },
    ]);
    setProduct(null);
    setNotice(`${product.name} se agregó a tu pedido`);
  }
  function changeQuantity(id: string, delta: number) {
    if (pendingOrder || submitting) return;
    setCart((current) =>
      current.flatMap((item) =>
        item.id !== id
          ? [item]
          : item.quantity + delta <= 0
            ? []
            : [{ ...item, quantity: Math.min(20, item.quantity + delta) }],
      ),
    );
  }
  async function submitOrder() {
    if (!cart.length || !online || !hydrated || !session || submitLock.current)
      return;
    submitLock.current = true;
    setSubmitting(true);
    setBackendError("");
    const attempt = pendingOrder ?? {
      idempotencyKey: crypto.randomUUID(),
      items: cart,
      expectedTotal: total,
    };
    setPendingOrder(attempt);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ cart, favorites, pendingOrder: attempt }),
      );
    } catch {
      setStorageError(true);
    }
    try {
      const { order } = await menuRequest<{ order: SavedOrder }>("orders", {
        method: "POST",
        body: JSON.stringify(attempt),
        signal: AbortSignal.timeout(20000),
      });
      setOrders((current) => [
        ...current.filter((o) => o.id !== order.id),
        order,
      ]);
      setCart([]);
      setPendingOrder(null);
      setPanel("bill");
      setNotice("Pedido guardado en el restaurante. Pendiente de entrega.");
    } catch (error) {
      if (
        error instanceof MenuRequestError &&
        [400, 401, 403, 409, 429].includes(error.status) &&
        error.code !== "IDEMPOTENCY_CONFLICT"
      )
        setPendingOrder(null);
      if (error instanceof MenuRequestError && error.status === 401)
        setSession(null);
      setBackendError(
        error instanceof MenuRequestError
          ? error.message
          : "No pudimos confirmar el resultado. Reintenta el mismo envío: no se duplicará tu pedido.",
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  const cartContent = (
    <>
      <div className="order-table">
        <span>
          <UtensilsCrossed size={16} />{" "}
          {session ? `Mesa ${session.tableLabel}` : "Explorar menú"}
        </span>
        <span>{session?.areaLabel ?? catalog.branch.name}</span>
      </div>
      {cart.length ? (
        <div className="cart-items">
          {cart.map((item) => {
            const p = products.find((p) => p.id === item.productId)!;
            return (
              <div className="cart-item" key={item.id}>
                <MenuImage
                  unoptimized
                  src={p.image}
                  alt=""
                  width="58"
                  height="58"
                />
                <div className="cart-item-body">
                  <h3>{p.name}</h3>
                  {item.extraIds.length > 0 && (
                    <p>
                      {p.extras
                        .filter((e) => item.extraIds.includes(e.id))
                        .map((e) => e.name)
                        .join(", ")}
                    </p>
                  )}
                  {item.note && <p className="item-note">{item.note}</p>}
                  <div className="cart-item-bottom">
                    <div className="stepper small">
                      <button
                        disabled={!!pendingOrder || submitting}
                        aria-label={`Quitar una unidad de ${p.name}`}
                        onClick={() => changeQuantity(item.id, -1)}
                      >
                        <Minus size={13} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        disabled={
                          item.quantity >= 20 || !!pendingOrder || submitting
                        }
                        aria-label={`Agregar una unidad de ${p.name}`}
                        onClick={() => changeQuantity(item.id, 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <strong>{money(itemPrice(item) * item.quantity)}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-cart">
          <div className="empty-cart-icon">
            <ShoppingBag size={30} strokeWidth={1.3} />
          </div>
          <h3>Algo rico está por llegar</h3>
          <p>
            Elige tus favoritos del menú.
            <br />
            Aquí prepararemos tu pedido.
          </p>
          <button
            className="text-button mobile-only"
            onClick={() => setPanel(null)}
          >
            Explorar el menú <ArrowRight size={16} />
          </button>
        </div>
      )}
      <div className="cart-footer">
        <div className="total-line">
          <span>Subtotal</span>
          <strong>{money(total)}</strong>
        </div>
        <p className="tax-note">Precios en MXN. IVA incluido.</p>
        <button
          className="primary"
          disabled={
            !cart.length || !online || !hydrated || !session || submitting
          }
          onClick={() => void submitOrder()}
        >
          {submitting
            ? "Guardando pedido..."
            : pendingOrder
              ? "Reintentar envío"
              : "Confirmar pedido"}{" "}
          <ArrowRight size={18} />
        </button>
        <p className="demo-copy">
          {session
            ? "Guardamos tu pedido antes de enviarlo. La recepción por cocina se confirma por separado."
            : "Escanea el QR de tu mesa para poder pedir."}
        </p>
      </div>
    </>
  );

  return (
    <>
      <header className="site-header">
        <Link
          className="brand"
          href={`/?branch=${catalog.branch.slug}`}
          aria-label={`${catalog.branch.businessName}, inicio`}
        >
          <span className="brand-mark">
            <Sprout size={28} strokeWidth={1.6} />
          </span>
          <span>
            {catalog.branch.businessName.toLocaleLowerCase("es-MX")}
            <span className="brand-caption">{catalog.branch.tagline}</span>
          </span>
        </Link>
        <div className="header-right">
          <span className="location">
            <MapPin size={16} /> {catalog.branch.location}
          </span>
          <button className="table-pill" onClick={() => setPanel("help")}>
            <span className="status-dot" />{" "}
            {session ? `Mesa ${session.tableLabel}` : "Explorar menú"}{" "}
            <ChevronRight size={15} />
          </button>
        </div>
      </header>
      <div className="demo-banner">
        {session
          ? `Bienvenido a ${catalog.branch.businessName}. Estás en la mesa ${session.tableLabel}.`
          : "Explora nuestro menú. Escanea el código QR de tu mesa para hacer tu pedido."}
      </div>
      {backendError && (
        <div className="connection-banner" role="alert">
          {backendError}
          <a href={`/?branch=${catalog.branch.slug}`}>Actualizar menú</a>
        </div>
      )}
      {!online && (
        <div className="connection-banner" role="status">
          <WifiOff size={17} /> Sin conexión. Puedes explorar el menú; tu
          carrito se conserva en este dispositivo.
        </div>
      )}
      {storageError && (
        <div className="connection-banner" role="status">
          No podemos guardar los cambios en este navegador. Mantén esta pestaña
          abierta para conservar tu pedido.
        </div>
      )}
      <main className="page-shell">
        <div className="menu-column">
          <section className="hero">
            <MenuImage
              unoptimized
              width={1600}
              height={800}
              className="hero-photo"
              src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=85"
              alt="Mesa preparada para compartir en el restaurante"
              fetchPriority="high"
            />
            <div className="hero-shade" />
            <div className="hero-content">
              <span className="hero-welcome">
                <span /> De nuestra cocina a tu mesa
              </span>
              <h1>
                El gusto de
                <br />
                estar aquí.
              </h1>
              <p>
                Ingredientes frescos, buena compañía
                <br />y algo delicioso por descubrir.
              </p>
              <span className="hero-footnote">
                <Leaf size={15} /> Hecho con calma. Disfrutado contigo.
              </span>
            </div>
            <span className="hero-stamp">
              <Sprout size={23} />
              Fresco y<br />
              de temporada
            </span>
          </section>
          <div className="mobile-services">
            <button onClick={() => setPanel("bill")}>
              <CheckCheck size={16} /> Tu cuenta
              {orders.length > 0 && <span>{orders.length}</span>}
            </button>
            <button onClick={() => setPanel("help")}>
              <UtensilsCrossed size={15} /> Ayuda
            </button>
          </div>
          <div className="menu-intro">
            <div>
              <h2>¿Qué se te antoja hoy?</h2>
              <p>Encuentra tu próximo favorito.</p>
            </div>
            <button
              aria-label="Mis favoritos"
              className={`favorites-toggle ${onlyFavorites ? "selected" : ""}`}
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
            >
              <Heart size={17} fill={onlyFavorites ? "currentColor" : "none"} />
              <span>Mis favoritos</span>
            </button>
          </div>
          <div className="search-row">
            <label className="search">
              <Search size={19} />
              <input
                aria-label="Buscar en el menú"
                placeholder="Busca un platillo, ingrediente o bebida..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              )}
            </label>
            <button
              aria-label="Filtros del menú"
              className={`filter-button ${vegetarian ? "selected" : ""}`}
              onClick={() => setPanel("filters")}
            >
              <SlidersHorizontal size={18} />
              <span>Filtros{vegetarian ? " (1)" : ""}</span>
            </button>
          </div>
          <nav className="categories" aria-label="Categorías del menú">
            {categories.map((c) => (
              <button
                key={c}
                aria-pressed={category === c}
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                {c === "Todos" && <UtensilsCrossed size={16} />}
                {c}
              </button>
            ))}
          </nav>
          <div className="results-heading">
            <h2>
              {onlyFavorites
                ? "Tus favoritos"
                : query
                  ? "Resultados de búsqueda"
                  : category === "Todos"
                    ? "Para disfrutar, a tu manera"
                    : category}
            </h2>
            <span>
              {visible.length} {visible.length === 1 ? "platillo" : "platillos"}
            </span>
          </div>
          {visible.length ? (
            <div className="product-grid">
              {visible.map((p) => (
                <article
                  className={`product-card ${!p.available ? "unavailable" : ""}`}
                  key={p.id}
                >
                  <div className="product-image-wrap">
                    <button
                      className="product-image-button"
                      onClick={() => openProduct(p)}
                      aria-label={`Ver detalles de ${p.name}`}
                    >
                      <MenuImage
                        unoptimized
                        src={p.image}
                        alt={p.name}
                        width="600"
                        height="400"
                        loading="lazy"
                      />
                    </button>
                    {p.tag && (
                      <span
                        className={`product-tag ${p.id === "pasta" ? "popular" : ""}`}
                      >
                        {p.id === "pasta" ? (
                          <span>✦</span>
                        ) : (
                          <Sprout size={12} />
                        )}
                        {p.tag}
                      </span>
                    )}
                    {!p.available && (
                      <span className="sold-out">Agotado por hoy</span>
                    )}
                    <button
                      className={`favorite-button ${favorites.includes(p.id) ? "is-favorite" : ""}`}
                      aria-label={`${favorites.includes(p.id) ? "Quitar" : "Guardar"} ${p.name} en favoritos`}
                      aria-pressed={favorites.includes(p.id)}
                      onClick={() =>
                        setFavorites((current) =>
                          current.includes(p.id)
                            ? current.filter((id) => id !== p.id)
                            : [...current, p.id],
                        )
                      }
                    >
                      <Heart
                        size={17}
                        fill={
                          favorites.includes(p.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>
                  <div className="product-body">
                    <div className="product-name">
                      <h3>
                        <button onClick={() => openProduct(p)}>{p.name}</button>
                      </h3>
                      {p.vegetarian && (
                        <Leaf
                          size={16}
                          className="leaf"
                          aria-label="Vegetariano"
                        />
                      )}
                    </div>
                    <p>{p.description}</p>
                    <div className="product-bottom">
                      <strong>
                        {money(p.price)}
                        <span> MXN</span>
                      </strong>
                      <button
                        className="add-button"
                        disabled={!p.available || !!pendingOrder || submitting}
                        aria-label={`Agregar ${p.name}`}
                        onClick={() => openProduct(p)}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="no-results">
              <Search size={30} />
              <h3>No encontramos platillos</h3>
              <p>Prueba con otro ingrediente o cambia tus filtros.</p>
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setCategory("Todos");
                  setVegetarian(false);
                  setOnlyFavorites(false);
                }}
              >
                Ver todo el menú
              </button>
            </div>
          )}
          <div className="allergy-note">
            <Leaf size={19} />
            <p>
              Que disfrutes también es cuidarte.
              <span>
                Si tienes alergias o restricciones, consulta los detalles y
                avisa a nuestro equipo.
              </span>
            </p>
          </div>
          <footer className="menu-footer">
            <span>Preparado con cariño en {catalog.branch.businessName}.</span>
            <span className="powered">
              Menú por{" "}
              <strong>
                <Sprout size={14} /> foodlify
              </strong>
            </span>
          </footer>
        </div>
        <aside className="order-sidebar">
          <section className="order-card">
            <div className="order-heading">
              <h2>Tu pedido</h2>
              <span>
                {count} {count === 1 ? "producto" : "productos"}
              </span>
            </div>
            {cartContent}
          </section>
          <button className="service-row" onClick={() => setPanel("bill")}>
            <span className="service-icon">
              <CheckCheck size={20} />
            </span>
            <span>
              <strong>Tu cuenta</strong>
              <small>
                {orders.length
                  ? `${orders.length} pedido(s) · ${money(billTotal)}`
                  : "Consulta lo que has pedido"}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button className="service-row" onClick={() => setPanel("help")}>
            <span className="service-icon">
              <UtensilsCrossed size={18} />
            </span>
            <span>
              <strong>¿Necesitas ayuda?</strong>
              <small>Estamos para atenderte</small>
            </span>
            <ChevronRight size={17} />
          </button>
          <div className="sidebar-note">
            <Sprout size={24} strokeWidth={1.3} />
            <p>
              La buena comida se disfruta
              <br />
              mejor en buena compañía.
            </p>
          </div>
        </aside>
      </main>
      <div className="mobile-cart-bar">
        <button onClick={() => setPanel("cart")}>
          <span>
            <ShoppingBag size={18} />
            <span className="mobile-count">{count}</span> Ver mi pedido
          </span>
          <strong>{money(total)}</strong>
        </button>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {product && (
        <Dialog title="A tu gusto" close={() => setProduct(null)}>
          <MenuImage
            unoptimized
            className="detail-photo"
            src={product.image}
            alt={product.name}
            width="600"
            height="330"
          />
          <div className="detail-name">
            <h3>{product.name}</h3>
            <strong>{money(product.price)}</strong>
          </div>
          <p className="detail-description">{product.description}</p>
          {product.allergens.length > 0 && (
            <p className="allergens">
              Contiene: {product.allergens.join(", ")}. Consulta al equipo sobre
              contaminación cruzada.
            </p>
          )}
          {product.extras.length > 0 && (
            <fieldset className="extras">
              <legend>
                Hazlo tuyo <span>Opcional</span>
              </legend>
              {product.extras.map((extra) => (
                <label key={extra.id}>
                  <input
                    type="checkbox"
                    checked={extraIds.includes(extra.id)}
                    onChange={() =>
                      setExtraIds((current) =>
                        current.includes(extra.id)
                          ? current.filter((id) => id !== extra.id)
                          : [...current, extra.id],
                      )
                    }
                  />
                  <span>{extra.name}</span>
                  <strong>+{money(extra.price)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          <label className="notes-label" htmlFor="product-notes">
            ¿Alguna indicación?
          </label>
          <textarea
            id="product-notes"
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Por ejemplo: sin cebolla, salsa aparte..."
            rows={2}
          />
          <div className="detail-actions">
            <div className="stepper">
              <button
                aria-label="Reducir cantidad"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}
              >
                <Minus size={17} />
              </button>
              <span>{quantity}</span>
              <button
                aria-label="Aumentar cantidad"
                disabled={quantity >= 20}
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus size={17} />
              </button>
            </div>
            <button
              className="primary"
              onClick={addProduct}
              disabled={!product.available || !!pendingOrder || submitting}
            >
              {product.available
                ? `Agregar · ${money((product.price + product.extras.filter((e) => extraIds.includes(e.id)).reduce((sum, e) => sum + e.price, 0)) * quantity)}`
                : "Agotado por hoy"}
            </button>
          </div>
        </Dialog>
      )}
      {panel === "cart" && (
        <Dialog title="Tu pedido" close={() => setPanel(null)}>
          {cartContent}
        </Dialog>
      )}
      {panel === "filters" && (
        <Dialog title="A tu manera" close={() => setPanel(null)}>
          <p className="detail-description">
            Encuentra opciones que se adapten a lo que buscas.
          </p>
          <label className="filter-option">
            <Leaf size={20} />
            <span>Solo platillos vegetarianos</span>
            <input
              type="checkbox"
              checked={vegetarian}
              onChange={(event) => setVegetarian(event.target.checked)}
            />
          </label>
          <p className="allergens">
            Si tienes una alergia, revisa los ingredientes con el equipo del
            restaurante.
          </p>
          <button className="primary" onClick={() => setPanel(null)}>
            Ver platillos
          </button>
        </Dialog>
      )}
      {panel === "help" && (
        <Dialog title="Estamos para atenderte" close={() => setPanel(null)}>
          <div className="help-mark">
            <UtensilsCrossed size={35} />
          </div>
          <h3 className="help-title">
            Bienvenido a {catalog.branch.businessName}
          </h3>
          <p className="detail-description">
            Estás en {catalog.branch.name}. Para pedir ayuda, consulta
            directamente al personal del restaurante.
          </p>
          <div className="info-box">
            <MapPin size={18} />
            <div>
              <strong>
                {session ? `Mesa ${session.tableLabel}` : "Explorar menú"}
              </strong>
              <p>
                {session
                  ? "Tu sesión está vinculada a esta visita y tiene una vigencia limitada."
                  : "Escanea el código QR de tu mesa para iniciar una sesión y pedir."}
              </p>
            </div>
          </div>
          <button className="primary" onClick={() => setPanel(null)}>
            Seguir explorando
          </button>
        </Dialog>
      )}
      {panel === "bill" && (
        <Dialog title="Tus pedidos" close={() => setPanel(null)}>
          {orders.length ? (
            <>
              <div className="info-box">
                <Clock3 size={20} />
                <div>
                  <strong>
                    {latest?.status === "accepted_by_kitchen"
                      ? "Pedido aceptado por cocina"
                      : "Pedido guardado en el restaurante"}
                  </strong>
                  <p>
                    {latest?.status === "accepted_by_kitchen"
                      ? "La cocina confirmó la recepción de tu pedido."
                      : "Consulta el estado de cada pedido. Guardado no significa aceptado por cocina."}
                  </p>
                </div>
              </div>
              <ol className="order-progress">
                <li className="done">
                  <Check size={15} /> Guardado en Supabase
                </li>
                <li>
                  <Clock3 size={15} /> Pendiente de entrega
                </li>
                <li
                  className={
                    latest?.status === "accepted_by_kitchen" ? "done" : ""
                  }
                >
                  <UtensilsCrossed size={15} /> Aceptado por cocina
                </li>
              </ol>
              {orders.map((order, index) => (
                <section className="bill-order" key={order.id}>
                  <h3>Pedido {index + 1}</h3>
                  <p className="order-status">
                    {
                      {
                        pending_delivery: "Pendiente de entrega a Pedidos",
                        accepted_by_orders:
                          "Aceptado por Pedidos; esperando cocina",
                        accepted_by_kitchen: "Aceptado por cocina",
                        rejected: "Rechazado",
                        cancelled: "Cancelado",
                      }[order.status]
                    }
                  </p>
                  {order.items.map((item) => (
                    <div className="bill-line" key={item.id}>
                      <span>
                        {item.quantity} × {item.productName}
                      </span>
                      <strong>{money(item.unitPrice * item.quantity)}</strong>
                    </div>
                  ))}
                </section>
              ))}
              <div className="total-line bill-total">
                <strong>Total de tus pedidos</strong>
                <strong>{money(billTotal)}</strong>
              </div>
              <p className="tax-note">
                MXN · IVA incluido. El precio de cada pedido se conserva al
                guardarlo.
              </p>
              <p className="demo-copy payment-note">
                El pago estará disponible según la configuración del restaurante
                cuando se conecte el servicio de caja.
              </p>
            </>
          ) : (
            <div className="empty-cart">
              <ShoppingBag size={32} />
              <h3>Tu mesa empieza aquí</h3>
              <p>
                Aún no tienes pedidos guardados.
                <br />
                Explora el menú y encuentra algo rico.
              </p>
              <button className="text-button" onClick={() => setPanel(null)}>
                <ArrowLeft size={16} /> Volver al menú
              </button>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
