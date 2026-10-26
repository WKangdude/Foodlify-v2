"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  CreditCard,
  Download,
  History,
  LayoutGrid,
  List,
  LockKeyhole,
  LogOut,
  MapPin,
  QrCode,
  ReceiptText,
  Search,
  ShieldCheck,
  Split,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
  WifiOff,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  activeShift,
  balance,
  closeShift,
  createInitialState,
  expectedCash,
  money,
  openShift,
  paid,
  parseMoney,
  parseStoredState,
  registerPayment,
  storageKey,
  total,
  type Account,
  type BillingState,
  type Method,
  type Payment,
} from "@/lib/billing";

type View = "Cuentas" | "Movimientos" | "Turno y corte" | "Por conciliar";
type Modal = "qr" | "shift" | "help" | "receipt" | "payment" | null;
const navigation = [
  { name: "Cuentas", icon: LayoutGrid },
  { name: "Movimientos", icon: History },
  { name: "Turno y corte", icon: Wallet },
  { name: "Por conciliar", icon: ShieldCheck },
] as const;
const labels = {
  ready: "Lista para cobrar",
  dining: "En consumo",
  pending: "Por conciliar",
};
const time = (at: string) =>
  new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(at));

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-heading">
        <div>
          <span className="muted small">Foodlify · Caja de demostración</span>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar diálogo"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function CashierPanel() {
  const [state, setState] = useState<BillingState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("Cuentas");
  const [selectedId, setSelectedId] = useState("1042");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [area, setArea] = useState("Todas las áreas");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [modal, setModal] = useState<Modal>(null);
  const [method, setMethod] = useState<Method>("cash");
  const [tipRate, setTipRate] = useState(0);
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [split, setSplit] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const paymentId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) setState(parseStoredState(stored));
      } catch {
        setStorageFailed(true);
        setNotice(
          "No se pudieron recuperar los datos locales. Revisa el almacenamiento antes de continuar.",
        );
      }
      setOffline(!navigator.onLine);
      setHydrated(true);
    });
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      try {
        if (!event.newValue) throw new Error("Datos eliminados");
        setState(parseStoredState(event.newValue));
        setModal(null);
        setNotice(
          "La demostración cambió en otra pestaña. Revisa la cuenta antes de cobrar.",
        );
      } catch {
        setStorageFailed(true);
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("storage", onStorage);
    return () => {
      mounted = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function commit(next: BillingState) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setState(next);
    } catch {
      setStorageFailed(true);
      throw new Error(
        "No se pudo guardar la operación. Revisa el almacenamiento del navegador.",
      );
    }
  }
  const shift = activeShift(state);
  const currentPayments = state.payments.filter((p) => p.shiftId === shift?.id);
  const openAccounts = state.accounts.filter((a) => balance(state, a) > 0);
  const pending = openAccounts.filter((a) => a.status === "pending");
  const ready = openAccounts.filter((a) => a.status === "ready");
  const selected =
    state.accounts.find((a) => a.id === selectedId) ?? state.accounts[0];
  const due = balance(state, selected);
  const collection = split ? parseMoney(amount) : due;
  const tip = Number.isSafeInteger(collection)
    ? Math.round((collection * tipRate) / 100)
    : 0;
  const toPay = collection + tip;
  const cashReceived = parseMoney(received);
  const canPay =
    hydrated &&
    !storageFailed &&
    !offline &&
    !!shift &&
    selected.status === "ready" &&
    due > 0;
  const validPayment =
    canPay &&
    Number.isSafeInteger(collection) &&
    collection > 0 &&
    collection <= due &&
    (method === "card" ||
      (Number.isSafeInteger(cashReceived) && cashReceived >= toPay));
  const filtered = openAccounts.filter((a) => {
    const text = `${a.id} ${a.table} ${a.waiter} ${a.area}`.toLocaleLowerCase(
      "es-MX",
    );
    return (
      text.includes(search.toLocaleLowerCase("es-MX")) &&
      (area === "Todas las áreas" || a.area === area) &&
      (filter === "Todas" ||
        (filter === "Listas para cobrar" && a.status === "ready") ||
        (filter === "En consumo" && a.status === "dining") ||
        (filter === "Por conciliar" && a.status === "pending"))
    );
  });
  function selectAccount(a: Account) {
    setSelectedId(a.id);
    setTipRate(0);
    setReceived("");
    setAmount("");
    setSplit(false);
    setError("");
    paymentId.current = null;
  }
  function showModal(value: Modal) {
    setError("");
    setModal(value);
  }
  function pay() {
    try {
      if (!validPayment || !paymentId.current)
        throw new Error("Revisa el importe antes de confirmar.");
      // Compare with the latest local snapshot; real concurrency requires the billing API.
      const stored = localStorage.getItem(storageKey);
      const latest = stored ? parseStoredState(stored) : state;
      const payment = {
        id: paymentId.current,
        accountId: selected.id,
        amount: collection,
        tip,
        method,
        received: method === "cash" ? cashReceived : toPay,
        at: new Date().toISOString(),
      };
      const next = registerPayment(latest, {
        ...payment,
        version: selected.version,
      });
      commit(next);
      setReceipt(next.payments.find((p) => p.id === payment.id)!);
      setModal("receipt");
      setReceived("");
      setSplit(false);
      setTipRate(0);
      paymentId.current = null;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function downloadReceipt(p: Payment) {
    const a = state.accounts.find((a) => a.id === p.accountId)!;
    const text = [
      "FOODLIFY · COMPROBANTE DE DEMOSTRACIÓN",
      "La Buena Mesa · Sucursal Centro",
      `Cuenta #${a.id} · ${a.table}`,
      `Fecha: ${new Date(p.at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`,
      "",
      ...a.items.map(
        (i) => `${i.quantity} × ${i.name}  ${money(i.unitPrice * i.quantity)}`,
      ),
      "",
      `Total de consumo: ${money(total(a))}`,
      `Abono de este comprobante: ${money(p.amount)}`,
      `Propina: ${money(p.tip)}`,
      `Total recibido: ${money(p.amount + p.tip)}`,
      `Medio: ${p.method === "cash" ? "Efectivo" : "Tarjeta simulada"}`,
      `Cambio: ${money(p.received - p.amount - p.tip)}`,
      `Referencia: ${p.id}`,
      "",
      "Sin validez fiscal. No acredita un pago real.",
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `comprobante-demo-${p.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }
  function shiftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = parseMoney(String(data.get("cash")));
    try {
      const stored = localStorage.getItem(storageKey);
      const latest = stored ? parseStoredState(stored) : state;
      if (activeShift(latest)?.id !== shift?.id)
        throw new Error(
          "El turno cambió en otra pestaña. Recarga para revisarlo.",
        );
      commit(
        shift
          ? closeShift(latest, value, new Date().toISOString())
          : openShift(
              latest,
              value,
              crypto.randomUUID(),
              new Date().toISOString(),
            ),
      );
      setModal(null);
      setNotice(
        shift
          ? "Corte de demostración guardado. El turno está cerrado."
          : "Turno de demostración abierto.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Foodlify Caja">
          <span className="brand-icon">
            <UtensilsCrossed size={23} />
          </span>
          <span className="brand-text">
            foodlify<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="restaurant-icon">
            <Store size={18} />
          </span>
          <div>
            <strong>La Buena Mesa</strong>
            <span>Sucursal Centro</span>
          </div>
          <ChevronDown size={13} className="workspace-chevron" />
        </div>
        <p className="nav-caption">Espacio de trabajo</p>
        <nav aria-label="Navegación de caja">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              title={name}
              onClick={() => setView(name)}
              className={`nav-link ${view === name ? "selected" : ""}`}
              aria-current={view === name ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Cuentas" && (
                <b className="nav-count">{openAccounts.length}</b>
              )}
              {name === "Por conciliar" && pending.length > 0 && (
                <b className="nav-warning">{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="shift-card">
            <span className="shift-card-icon">
              <Wallet size={19} />
            </span>
            <strong>
              {shift ? "Tu caja está abierta" : "Tu caja está cerrada"}
            </strong>
            <p>
              {shift
                ? `Turno desde las ${time(shift.openedAt)}`
                : "Abre un turno para cobrar"}
            </p>
            <button
              onClick={() => {
                setView("Turno y corte");
              }}
            >
              <i className={shift ? "status-dot" : "status-dot amber"} />
              {shift ? "Ver mi turno" : "Ir a turnos"}
              <ChevronRight size={12} />
            </button>
          </div>
          <button
            className="nav-link help"
            title="Ayuda de caja"
            onClick={() => showModal("help")}
          >
            <CircleHelp size={18} />
            <span>Ayuda de caja</span>
          </button>
          <div className="profile">
            <span className="avatar">AG</span>
            <div>
              <strong>Ana García</strong>
              <span>Cajera · sesión demo</span>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Operación <ChevronRight size={12} />
            <strong>Caja</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">Modo demostración</span>
            <span className={`connection ${offline ? "warning" : ""}`}>
              {offline ? <WifiOff size={13} /> : <i className="status-dot" />}
              {offline ? "Sin conexión" : "Datos locales"}
            </span>
            <span className="topbar-divider" />
            <MapPin size={14} />
            <span className="location">Centro</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="heading-kicker">
                <span className="purple-dot" /> Terminal de cobro
              </div>
              <h1>
                {view === "Cuentas"
                  ? "Cada cuenta, en orden."
                  : view === "Movimientos"
                    ? "Tus cobros, al día."
                    : view === "Por conciliar"
                      ? "Nada queda en el aire."
                      : "Un turno que cuadra."}
              </h1>
              <p>
                {view === "Cuentas"
                  ? "Todo listo para cerrar una buena experiencia."
                  : view === "Movimientos"
                    ? "Consulta los pagos y recupera sus comprobantes."
                    : view === "Por conciliar"
                      ? "Revisa las cuentas que necesitan atención antes de cobrar."
                      : "Controla tu fondo, el efectivo y el cierre de caja."}
              </p>
            </div>
            <button
              className="secondary-button"
              onClick={() => showModal(view === "Cuentas" ? "qr" : "shift")}
              disabled={!hydrated || storageFailed}
            >
              {view === "Cuentas" ? <QrCode size={16} /> : <Wallet size={16} />}
              {view === "Cuentas"
                ? "Buscar por QR"
                : shift
                  ? "Cerrar turno"
                  : "Abrir turno"}
            </button>
          </div>
          {(!shift || offline || storageFailed) && (
            <div className="alert" role="status">
              <AlertTriangle size={17} />
              <span>
                {storageFailed
                  ? "Almacenamiento no disponible. Los cobros están bloqueados para evitar perder operaciones."
                  : offline
                    ? "Sin conexión. Puedes consultar las cuentas; los cobros están pausados."
                    : "El turno está cerrado. Abre uno para comenzar a cobrar."}
              </span>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <CheckCheck size={17} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Ocultar aviso"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <section className="overview" aria-label="Resumen de caja">
            <div className="overview-title">
              <span className="overview-icon">
                <Wallet size={22} />
              </span>
              <div>
                <strong>Tu turno de hoy</strong>
                <span>
                  {shift ? "Caja 01 · Ana García" : "Sin turno activo"}
                </span>
              </div>
            </div>
            <div className="metric">
              <span>Cobrado en el turno</span>
              <strong>
                {money(currentPayments.reduce((s, p) => s + p.amount, 0))}
              </strong>
              <small>{currentPayments.length} cobros registrados</small>
            </div>
            <div className="metric">
              <span>Cuentas abiertas</span>
              <strong>{openAccounts.length.toString().padStart(2, "0")}</strong>
              <small>
                {money(openAccounts.reduce((s, a) => s + balance(state, a), 0))}{" "}
                por cobrar
              </small>
            </div>
            <div className="metric ready-metric">
              <span>
                <i className="status-dot" /> Listas para cobrar
              </span>
              <strong>{ready.length.toString().padStart(2, "0")}</strong>
              <small>Completas y finalizadas</small>
            </div>
            <button
              className="metric pending-metric"
              onClick={() => setView("Por conciliar")}
            >
              <span>
                <i className="status-dot amber" /> Por conciliar
              </span>
              <strong>{pending.length.toString().padStart(2, "0")}</strong>
              <small>
                Requieren revisión <ChevronRight size={10} />
              </small>
            </button>
          </section>
          {view === "Cuentas" && (
            <div className="cashier-layout">
              <section
                className="accounts-section"
                aria-label="Cuentas abiertas"
              >
                <div className="section-heading">
                  <h2>
                    Cuentas abiertas <span>{openAccounts.length}</span>
                  </h2>
                  <div className="layout-switch" aria-label="Vista de cuentas">
                    <button
                      aria-label="Vista de cuadrícula"
                      aria-pressed={layout === "grid"}
                      onClick={() => setLayout("grid")}
                      className={layout === "grid" ? "active" : ""}
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      aria-label="Vista de lista"
                      aria-pressed={layout === "list"}
                      onClick={() => setLayout("list")}
                      className={layout === "list" ? "active" : ""}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
                <div className="filters">
                  {[
                    "Todas",
                    "Listas para cobrar",
                    "En consumo",
                    "Por conciliar",
                  ].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "active" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                      {f === "Todas" && <span>{openAccounts.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="search-row">
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar mesa, cuenta o mesero…"
                      aria-label="Buscar cuentas"
                    />
                    {search && (
                      <button
                        aria-label="Limpiar búsqueda"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <select
                    aria-label="Filtrar por área"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  >
                    {[
                      "Todas las áreas",
                      "Salón principal",
                      "Terraza",
                      "Mostrador",
                    ].map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div
                  className={`account-grid ${layout === "list" ? "list-view" : ""}`}
                >
                  {filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => selectAccount(a)}
                      className={`account-card ${selectedId === a.id ? "is-selected" : ""}`}
                      aria-pressed={selectedId === a.id}
                    >
                      <div className="account-top">
                        <span className={`table-icon ${a.status}`}>
                          {a.area === "Mostrador" ? (
                            <Coffee size={20} />
                          ) : (
                            <UtensilsCrossed size={19} />
                          )}
                        </span>
                        <span className={`badge ${a.status}`}>
                          {labels[a.status]}
                        </span>
                      </div>
                      <div className="account-name">
                        <h3>{a.table}</h3>
                        <span>#{a.id}</span>
                      </div>
                      <div className="account-meta">
                        <span>
                          <MapPin size={11} />
                          {a.area}
                        </span>
                        <span>
                          <Users size={12} />
                          {a.guests} pers.
                        </span>
                      </div>
                      <div className="account-waiter">
                        <span className="mini-avatar">
                          {a.waiter
                            .split(" ")
                            .map((s) => s[0])
                            .join("")}
                        </span>
                        {a.waiter}
                        <span className="account-time">
                          <Clock3 size={11} />
                          {a.opened}
                        </span>
                      </div>
                      <div className="account-bottom">
                        <div>
                          <span>
                            {paid(state, a.id) > 0
                              ? "Saldo pendiente"
                              : `${a.items.reduce((s, i) => s + i.quantity, 0)} productos`}
                          </span>
                          <strong>{money(balance(state, a))}</strong>
                        </div>
                        <span className="account-arrow">
                          {selectedId === a.id ? (
                            <Check size={15} />
                          ) : (
                            <ArrowRight size={15} />
                          )}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="empty-state">
                    <Search size={28} />
                    <h3>No hay cuentas en esta vista</h3>
                    <p>Prueba con otra mesa o cambia los filtros.</p>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setFilter("Todas");
                        setSearch("");
                        setArea("Todas las áreas");
                      }}
                    >
                      Ver todas las cuentas
                    </button>
                  </div>
                )}
                <div className="accounts-footnote">
                  <ShieldCheck size={14} />
                  Los precios corresponden al pedido aceptado.
                </div>
              </section>
              <aside
                className="bill-panel"
                aria-label="Detalle y cobro de cuenta"
              >
                <div className="bill-heading">
                  <div>
                    <span className="small muted">Detalle de cuenta</span>
                    <h2>
                      {selected.table}
                      <span>#{selected.id}</span>
                    </h2>
                  </div>
                  <span className="receipt-icon">
                    <ReceiptText size={22} />
                  </span>
                </div>
                <div className="bill-meta">
                  <span>
                    <Users size={12} />
                    {selected.guests} personas
                  </span>
                  <span>
                    <Clock3 size={12} />
                    {selected.opened}
                  </span>
                  <span>Versión {selected.version}</span>
                </div>
                <div className="bill-server">
                  Atendió <strong>{selected.waiter}</strong>
                </div>
                <div className="receipt-rule" />
                <div className="bill-items-heading">
                  <span>Producto</span>
                  <span>Importe</span>
                </div>
                <div className="bill-items">
                  {selected.items.map((item, index) => (
                    <div className="bill-item" key={index}>
                      <span className="quantity">{item.quantity}</span>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{money(item.unitPrice)} c/u</span>
                        {item.note && <small>{item.note}</small>}
                      </div>
                      <b>{money(item.quantity * item.unitPrice)}</b>
                    </div>
                  ))}
                </div>
                <div className="receipt-rule" />
                <div className="bill-totals">
                  <div>
                    <span>
                      Consumo <small>(impuestos incluidos)</small>
                    </span>
                    <span>{money(total(selected))}</span>
                  </div>
                  {paid(state, selected.id) > 0 && (
                    <div className="green">
                      <span>Pagos aplicados</span>
                      <span>−{money(paid(state, selected.id))}</span>
                    </div>
                  )}
                  <div className="bill-total">
                    <strong>Saldo por cobrar</strong>
                    <strong>{money(due)}</strong>
                  </div>
                </div>
                {selected.status !== "ready" ? (
                  <div className="bill-blocked">
                    <LockKeyhole size={18} />
                    <div>
                      <strong>
                        {selected.status === "pending"
                          ? "Cuenta incompleta"
                          : "La cuenta sigue en consumo"}
                      </strong>
                      <p>
                        {selected.status === "pending"
                          ? "Faltan partidas por recibir. Revisa la conciliación antes de cobrar."
                          : "Pedidos debe finalizar la cuenta antes del cobro."}
                      </p>
                    </div>
                  </div>
                ) : due === 0 ? (
                  <div className="paid-banner">
                    <CheckCheck size={20} />
                    <strong>Cuenta pagada</strong>
                    <span>El cobro de demostración quedó registrado.</span>
                  </div>
                ) : (
                  <>
                    <button
                      className={`split-button ${split ? "active" : ""}`}
                      onClick={() => {
                        setSplit(!split);
                        setAmount("");
                        setReceived("");
                      }}
                      aria-pressed={split}
                    >
                      <Split size={14} />
                      {split ? "Cobrar saldo completo" : "Dividir por importe"}
                      <ChevronRight size={13} />
                    </button>
                    {split && (
                      <label className="field split-field">
                        Importe de esta parte (MXN)
                        <input
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                        />
                        <small>
                          El resto permanecerá pendiente en la cuenta.
                        </small>
                      </label>
                    )}
                    <div className="payment-section">
                      <h3>Medio de pago</h3>
                      <div className="method-options">
                        <button
                          className={method === "cash" ? "active" : ""}
                          aria-pressed={method === "cash"}
                          onClick={() => {
                            setMethod("cash");
                            setReceived("");
                          }}
                        >
                          <Banknote size={18} />
                          Efectivo{method === "cash" && <Check size={12} />}
                        </button>
                        <button
                          className={method === "card" ? "active" : ""}
                          aria-pressed={method === "card"}
                          onClick={() => setMethod("card")}
                        >
                          <CreditCard size={18} />
                          Tarjeta{method === "card" && <Check size={12} />}
                        </button>
                      </div>
                      <div className="tip-heading">
                        <h3>Propina</h3>
                        <span>Opcional · no incluida</span>
                      </div>
                      <div className="tip-options">
                        {[0, 10, 15, 20].map((rate) => (
                          <button
                            key={rate}
                            className={tipRate === rate ? "active" : ""}
                            onClick={() => setTipRate(rate)}
                            aria-pressed={tipRate === rate}
                          >
                            {rate ? `${rate}%` : "Sin propina"}
                          </button>
                        ))}
                      </div>
                      {method === "cash" ? (
                        <>
                          <label className="field cash-field">
                            <span>
                              Efectivo recibido <span>MXN</span>
                            </span>
                            <div>
                              <span>$</span>
                              <input
                                inputMode="decimal"
                                value={received}
                                onChange={(e) => setReceived(e.target.value)}
                                placeholder="0.00"
                                aria-label="Efectivo recibido"
                              />
                            </div>
                          </label>
                          <div className="quick-cash">
                            {[
                              toPay,
                              Math.ceil(toPay / 10000) * 10000,
                              Math.ceil(toPay / 50000) * 50000,
                            ]
                              .filter(
                                (v, i, all) =>
                                  Number.isSafeInteger(v) &&
                                  v > 0 &&
                                  all.indexOf(v) === i,
                              )
                              .map((value, index) => (
                                <button
                                  key={value}
                                  onClick={() =>
                                    setReceived((value / 100).toFixed(2))
                                  }
                                >
                                  {index === 0 ? "Exacto" : money(value)}
                                </button>
                              ))}
                          </div>
                          <div className="change-row">
                            <span>Cambio a entregar</span>
                            <strong>
                              {Number.isSafeInteger(cashReceived) &&
                              Number.isSafeInteger(toPay)
                                ? money(Math.max(0, cashReceived - toPay))
                                : money(0)}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <p className="card-disclaimer">
                          <CreditCard size={15} />
                          Pago simulado. No se conectará a una terminal ni se
                          realizará un cargo.
                        </p>
                      )}
                      <button
                        className="pay-button"
                        disabled={!validPayment}
                        onClick={() => {
                          paymentId.current = crypto.randomUUID();
                          showModal("payment");
                        }}
                      >
                        <LockKeyhole size={16} />
                        <span>
                          Cobrar{" "}
                          {Number.isSafeInteger(toPay) && toPay > 0
                            ? money(toPay)
                            : money(0)}
                        </span>
                        <ArrowRight size={17} />
                      </button>
                      {tip > 0 && (
                        <p className="tip-summary">
                          Incluye {money(tip)} de propina
                        </p>
                      )}
                      <p className="safe-payment">
                        <ShieldCheck size={12} />
                        Simulación guardada en este navegador
                      </p>
                    </div>
                  </>
                )}
              </aside>
            </div>
          )}
          {view === "Movimientos" && (
            <section className="content-panel">
              <div className="section-heading">
                <h2>
                  Historial de cobros <span>{state.payments.length}</span>
                </h2>
                <span className="muted small">Importes en MXN</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Cuenta</th>
                      <th>Fecha y hora</th>
                      <th>Medio</th>
                      <th>Consumo</th>
                      <th>Propina</th>
                      <th>Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.payments
                      .slice()
                      .reverse()
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>
                              {
                                state.accounts.find((a) => a.id === p.accountId)
                                  ?.table
                              }
                            </strong>
                            <small>#{p.accountId}</small>
                          </td>
                          <td>
                            {new Date(p.at).toLocaleDateString("es-MX", {
                              timeZone: "America/Mexico_City",
                            })}
                            <small>{time(p.at)}</small>
                          </td>
                          <td>
                            <span className="payment-method">
                              {p.method === "cash" ? (
                                <Banknote size={15} />
                              ) : (
                                <CreditCard size={15} />
                              )}
                              {p.method === "cash"
                                ? "Efectivo"
                                : "Tarjeta demo"}
                            </span>
                          </td>
                          <td>{money(p.amount)}</td>
                          <td>{money(p.tip)}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => {
                                setReceipt(p);
                                showModal("receipt");
                              }}
                            >
                              <ReceiptText size={14} />
                              Ver comprobante
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!state.payments.length && (
                <div className="empty-state">
                  <History size={28} />
                  <h3>Aún no hay movimientos</h3>
                  <p>Los cobros aparecerán aquí cuando los registres.</p>
                </div>
              )}
            </section>
          )}
          {view === "Por conciliar" && (
            <section className="content-panel">
              <div className="section-heading">
                <h2>Cuentas pendientes de recepción</h2>
                <span className="badge pending">
                  {pending.length} pendientes
                </span>
              </div>
              <p className="panel-description">
                Una cuenta incompleta no se puede liquidar. En producción, la
                recuperación debe confirmar las partidas y versiones desde
                Pedidos.
              </p>
              {pending.map((a) => (
                <div className="reconciliation-row" key={a.id}>
                  <span className="alert-icon">
                    <AlertTriangle size={22} />
                  </span>
                  <div>
                    <h3>
                      {a.table} <span>#{a.id}</span>
                    </h3>
                    <p>
                      Falta confirmar la copia completa de la cuenta · versión{" "}
                      {a.version}
                    </p>
                    <small>El importe visible puede estar incompleto.</small>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={!hydrated || storageFailed || offline}
                    onClick={() => {
                      try {
                        const stored = localStorage.getItem(storageKey);
                        const latest = stored
                          ? parseStoredState(stored)
                          : state;
                        commit({
                          ...latest,
                          accounts: latest.accounts.map((item) =>
                            item.id === a.id
                              ? {
                                  ...item,
                                  status: "ready",
                                  version: item.version + 1,
                                }
                              : item,
                          ),
                        });
                        setNotice(
                          "Se simuló la recepción completa de la cuenta. Ya puedes probar el cobro.",
                        );
                      } catch (e) {
                        setNotice((e as Error).message);
                      }
                    }}
                  >
                    Simular recepción completa
                  </button>
                </div>
              ))}
              {!pending.length && (
                <div className="empty-state">
                  <ShieldCheck size={32} />
                  <h3>Todo está en orden</h3>
                  <p>
                    No hay cuentas pendientes de conciliación en esta
                    demostración.
                  </p>
                </div>
              )}
            </section>
          )}
          {view === "Turno y corte" && (
            <section className="content-panel">
              <div className="section-heading">
                <h2>{shift ? "Turno en curso" : "Caja cerrada"}</h2>
                <button
                  className="primary-button"
                  disabled={!hydrated || storageFailed || offline}
                  onClick={() => showModal("shift")}
                >
                  {shift ? <LogOut size={15} /> : <Wallet size={15} />}
                  {shift ? "Preparar corte" : "Abrir turno"}
                </button>
              </div>
              {shift ? (
                <>
                  <div className="shift-summary">
                    <div>
                      <span>Fondo de apertura</span>
                      <strong>{money(shift.opening)}</strong>
                    </div>
                    <div>
                      <span>Cobros en efectivo</span>
                      <strong>
                        {money(
                          currentPayments
                            .filter((p) => p.method === "cash")
                            .reduce((s, p) => s + p.amount + p.tip, 0),
                        )}
                      </strong>
                      <small>Incluye propinas en efectivo</small>
                    </div>
                    <div>
                      <span>Efectivo esperado</span>
                      <strong className="purple-text">
                        {money(expectedCash(state, shift))}
                      </strong>
                    </div>
                  </div>
                  <div className="shift-info">
                    <ShieldCheck size={20} />
                    <div>
                      <h3>Un cierre con todo a la vista</h3>
                      <p>
                        Captura el efectivo contado para registrar la
                        diferencia.{" "}
                        {pending.length > 0
                          ? "El corte definitivo está bloqueado por cuentas pendientes de conciliación."
                          : "Las cuentas abiertas quedarán disponibles para el siguiente turno."}{" "}
                        La autorización de supervisor se integrará con el
                        backend.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <Wallet size={32} />
                  <h3>Todo listo para un nuevo turno</h3>
                  <p>Registra el fondo inicial antes de recibir pagos.</p>
                </div>
              )}
              <h3 className="subheading">Cortes anteriores</h3>
              {state.shifts
                .filter((s) => s.closedAt)
                .map((s) => (
                  <div className="closed-shift" key={s.id}>
                    <span>
                      <strong>Turno de Ana García</strong>
                      <small>
                        {new Date(s.closedAt!).toLocaleString("es-MX", {
                          timeZone: "America/Mexico_City",
                        })}
                      </small>
                    </span>
                    <span>
                      Esperado <b>{money(expectedCash(state, s))}</b>
                    </span>
                    <span>
                      Contado <b>{money(s.counted!)}</b>
                    </span>
                    <span
                      className={
                        s.counted === expectedCash(state, s)
                          ? "green"
                          : "warning"
                      }
                    >
                      Diferencia{" "}
                      <b>{money(s.counted! - expectedCash(state, s))}</b>
                    </span>
                  </div>
                ))}
              {!state.shifts.some((s) => s.closedAt) && (
                <p className="muted panel-description">
                  Los cortes guardados aparecerán aquí.
                </p>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              <span className="purple-dot" />
              Foodlify Caja <span className="footer-separator">/</span> Una
              buena experiencia, hasta el final.
            </span>
            <span>Demo local · Sin pagos reales</span>
          </footer>
        </main>
      </div>
      {modal === "qr" && (
        <Dialog title="Buscar cuenta por QR" onClose={() => setModal(null)}>
          <div className="qr-placeholder">
            <QrCode size={64} strokeWidth={1.3} />
            <p>Entrada manual de demostración</p>
          </div>
          <p className="dialog-description">
            Introduce el folio que contiene el QR de la cuenta. Por ejemplo,
            1042. El acceso a cámara se integrará más adelante.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const id = String(new FormData(e.currentTarget).get("folio"))
                .trim()
                .replace(/^#/, "");
              const a = state.accounts.find((a) => a.id === id);
              if (!a) {
                setError("No se encontró esa cuenta. Revisa el folio.");
                return;
              }
              selectAccount(a);
              setView("Cuentas");
              setModal(null);
            }}
          >
            <label className="field">
              Folio de cuenta
              <input
                name="folio"
                required
                placeholder="1042"
                inputMode="numeric"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full-width">
              Buscar cuenta
              <ArrowRight size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {modal === "payment" && (
        <Dialog
          title="Confirmar cobro de demostración"
          onClose={() => setModal(null)}
        >
          <div className="confirmation-total">
            {money(toPay)}
            <span>
              {selected.table} · Cuenta #{selected.id}
            </span>
          </div>
          <div className="confirm-lines">
            <p>
              <span>Abono a la cuenta</span>
              <strong>{money(collection)}</strong>
            </p>
            <p>
              <span>Propina</span>
              <strong>{money(tip)}</strong>
            </p>
            <p>
              <span>Medio de pago</span>
              <strong>
                {method === "cash" ? "Efectivo" : "Tarjeta simulada"}
              </strong>
            </p>
            {method === "cash" && (
              <p>
                <span>Cambio a entregar</span>
                <strong>{money(cashReceived - toPay)}</strong>
              </p>
            )}
            <p>
              <span>Saldo después del cobro</span>
              <strong>{money(due - collection)}</strong>
            </p>
          </div>
          <p className="dialog-description">
            Esta acción registra una simulación en tu navegador. No procesa
            dinero real.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button full-width"
            disabled={!validPayment}
            onClick={pay}
          >
            <Check size={17} />
            Confirmar cobro simulado
          </button>
        </Dialog>
      )}
      {modal === "receipt" && receipt && (
        <Dialog title="Comprobante de cobro" onClose={() => setModal(null)}>
          <div className="success-icon">
            <CheckCheck size={29} />
          </div>
          <div className="confirmation-total">
            {money(receipt.amount + receipt.tip)}
            <span>Cobro de demostración registrado</span>
          </div>
          <div className="confirm-lines">
            <p>
              <span>Cuenta</span>
              <strong>#{receipt.accountId}</strong>
            </p>
            <p>
              <span>Consumo abonado</span>
              <strong>{money(receipt.amount)}</strong>
            </p>
            <p>
              <span>Propina</span>
              <strong>{money(receipt.tip)}</strong>
            </p>
            <p>
              <span>Medio</span>
              <strong>
                {receipt.method === "cash" ? "Efectivo" : "Tarjeta simulada"}
              </strong>
            </p>
            <p>
              <span>Cambio</span>
              <strong>
                {money(receipt.received - receipt.amount - receipt.tip)}
              </strong>
            </p>
          </div>
          <p className="dialog-description">
            Sin validez fiscal. El archivo descargado contiene el detalle de
            este abono.
          </p>
          <button
            className="primary-button full-width"
            onClick={() => downloadReceipt(receipt)}
          >
            <Download size={16} />
            Descargar comprobante
          </button>
          <button
            className="secondary-button full-width"
            onClick={() => setModal(null)}
          >
            Volver a caja
          </button>
        </Dialog>
      )}
      {modal === "shift" && (
        <Dialog
          title={shift ? "Preparar corte de caja" : "Abrir nuevo turno"}
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">
            {shift
              ? "Cuenta el efectivo físico, incluyendo fondo inicial y propinas. Este cierre es una simulación sin autorización real de supervisor."
              : "Introduce el fondo con el que iniciarás tu turno de demostración."}
          </p>
          {shift && (
            <div className="expected-total">
              <span>Efectivo esperado</span>
              <strong>{money(expectedCash(state, shift))}</strong>
            </div>
          )}
          {shift && pending.length > 0 && (
            <div className="alert">
              <AlertTriangle size={18} />
              <span>
                Hay {pending.length} cuenta por conciliar. Simula su recepción
                desde «Por conciliar» antes de cerrar.
              </span>
            </div>
          )}
          <form onSubmit={shiftSubmit}>
            <label className="field">
              {shift ? "Efectivo contado (MXN)" : "Fondo de apertura (MXN)"}
              <input
                name="cash"
                inputMode="decimal"
                required
                placeholder="0.00"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary-button full-width"
              disabled={
                !hydrated ||
                storageFailed ||
                offline ||
                (!!shift && pending.length > 0)
              }
            >
              {shift
                ? "Guardar corte y cerrar turno"
                : "Abrir turno de demostración"}
            </button>
          </form>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog title="Tu terminal de caja" onClose={() => setModal(null)}>
          <div className="help-steps">
            <p>
              <ReceiptText size={21} />
              <span>
                <strong>Selecciona una cuenta</strong>Solo las cuentas
                finalizadas y completas están listas para cobrar.
              </span>
            </p>
            <p>
              <Split size={21} />
              <span>
                <strong>Elige cómo cobrar</strong>Recibe el saldo completo o
                divide por importe. La propina se calcula sobre cada abono.
              </span>
            </p>
            <p>
              <ArrowDownLeft size={21} />
              <span>
                <strong>Revisa y confirma</strong>Captura el efectivo recibido,
                entrega el cambio y descarga el comprobante.
              </span>
            </p>
            <p>
              <ShieldCheck size={21} />
              <span>
                <strong>Demostración local</strong>Los datos se guardan en este
                navegador. Pagos, permisos, descuentos, cancelaciones,
                devoluciones y sincronización real requieren el backend.
              </span>
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
