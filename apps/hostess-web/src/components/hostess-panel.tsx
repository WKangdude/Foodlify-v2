"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Armchair,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  DoorOpen,
  Download,
  Grid2X2,
  LayoutDashboard,
  Link2,
  List,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Unlink,
  Users,
  UtensilsCrossed,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  applyAction,
  areas,
  createInitialState,
  parseStoredState,
  statusLabels,
  storageKey,
  waiters,
  type Action,
  type Area,
  type DiningState,
  type TableStatus,
} from "@/lib/dining-room";

type View = "Salón" | "Visitas" | "Equipo" | "Actividad";
type Modal = "visit" | "group" | "qr" | "close" | "help" | null;
const icons = {
  Salón: LayoutDashboard,
  Visitas: Users,
  Equipo: UtensilsCrossed,
  Actividad: Clock3,
};
const statuses: TableStatus[] = [
  "available",
  "occupied",
  "pending",
  "cleaning",
];
const formatTime = (at: string) =>
  new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
const elapsed = (at: string, now: number) =>
  `${Math.max(0, Math.floor((now - Date.parse(at)) / 60000))} min`;

function ModalShell({
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
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <div>
          <span className="muted small">Foodlify · Hostess</span>
          <h2 id="modal-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Cerrar diálogo"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function HostessPanel() {
  const [state, setState] = useState<DiningState | null>(null);
  const [area, setArea] = useState<Area>("Salón principal");
  const [view, setView] = useState<View>("Salón");
  const [selectedId, setSelectedId] = useState("table-2");
  const [filter, setFilter] = useState<TableStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState<"map" | "list">("map");
  const [editing, setEditing] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [now, setNow] = useState(0);
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      let initial = createInitialState();
      try {
        const raw = localStorage.getItem(storageKey);
        const saved = raw ? parseStoredState(raw) : null;
        if (saved) initial = saved;
        else {
          localStorage.setItem(storageKey, JSON.stringify(initial));
          if (raw)
            setToast(
              "Los datos locales eran inválidos. Se restauró la demostración.",
            );
        }
      } catch {
        setStorageAvailable(false);
      }
      setState(initial);
      setOnline(navigator.onLine);
      setNow(Date.now());
    }, 0);
    const connected = () => setOnline(navigator.onLine);
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const next = event.newValue ? parseStoredState(event.newValue) : null;
      if (next) {
        setState(next);
        setToast(
          "El salón se actualizó desde otra pestaña. Revisa la mesa antes de continuar.",
        );
      }
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    window.addEventListener("storage", storageChanged);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(hydration);
      clearInterval(timer);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!state)
    return (
      <div className="loading">
        <div className="brand-mark">
          <UtensilsCrossed />
        </div>
        <h1>
          Foodlify<span>.</span>
        </h1>
        <p>
          <LoaderCircle className="spin" size={16} /> Preparando el salón…
        </p>
      </div>
    );

  const selected = state.tables.find((t) => t.id === selectedId)!;
  const visit = state.visits.find(
    (v) => v.id === selected.visitId && !v.closedAt,
  );
  const grouped = visit
    ? state.tables.filter((t) => t.visitId === visit.id)
    : [];
  const areaTables = state.tables.filter((t) => t.area === area);
  const visible = areaTables.filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      `mesa ${t.number} ${state.visits.find((v) => v.id === t.visitId)?.guest ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const count = (status: TableStatus) =>
    state.tables.filter((t) => t.status === status).length;
  const activeVisits = state.visits.filter((v) => !v.closedAt);
  const guests = activeVisits.reduce((n, v) => n + v.guests, 0);
  const occupied = count("occupied") + count("pending");
  const capacity = state.tables
    .filter((t) => chosen.includes(t.id))
    .reduce((n, t) => n + t.seats, 0);
  const openModal = (next: Modal) => {
    setError("");
    setChosen(
      next === "visit" && selected.status === "available" ? [selected.id] : [],
    );
    setModal(next);
  };
  const run = (action: Action) => {
    if (!online) {
      setError("Sin conexión. Espera a reconectar para modificar el salón.");
      return false;
    }
    try {
      if (storageAvailable) {
        const raw = localStorage.getItem(storageKey);
        const latest = raw ? parseStoredState(raw) : null;
        if (!latest)
          throw new Error(
            "Los datos locales ya no están disponibles. Recarga para recuperar la demostración.",
          );
        if (latest.revision !== state.revision) {
          setState(latest);
          throw new Error(
            "La mesa cambió en otra pestaña. Revisa su estado e inténtalo de nuevo.",
          );
        }
      }
      const next = applyAction(state, action);
      if (storageAvailable)
        localStorage.setItem(storageKey, JSON.stringify(next));
      setState(next);
      setError("");
      setToast(next.activity[0].text);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar el cambio. Inténtalo de nuevo.",
      );
      return false;
    }
  };
  const toggleChosen = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const submitVisit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (
      run({
        type: "open",
        tableIds: chosen,
        visit: {
          guest: String(data.get("guest") ?? ""),
          guests: Number(data.get("guests")),
          waiter: String(data.get("waiter")),
          note: String(data.get("note") ?? ""),
        },
      })
    ) {
      setSelectedId(chosen[0]);
      setModal(null);
    }
  };
  const showQr = async () => {
    openModal("qr");
    setQr("");
    setQrError(false);
    try {
      const QRCode = await import("qrcode");
      setQr(
        await QRCode.toDataURL(
          JSON.stringify({
            mode: "demo",
            visitId: visit!.id,
            tables: grouped.map((t) => t.number),
          }),
          {
            width: 300,
            margin: 2,
            color: { dark: "#164d3f", light: "#ffffff" },
          },
        ),
      );
    } catch {
      setQrError(true);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Foodlify, inicio">
          <span className="brand-mark">
            <UtensilsCrossed size={21} />
          </span>
          foodlify<span className="brand-dot">.</span>
        </Link>
        <div className="workspace">
          <div className="restaurant-avatar">
            C<span>•</span>
          </div>
          <div>
            <strong>Casa Oliva</strong>
            <span>Sucursal Centro</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">Tu espacio de trabajo</div>
        <nav aria-label="Navegación principal">
          {(Object.keys(icons) as View[]).map((item) => {
            const Icon = icons[item];
            return (
              <button
                key={item}
                aria-label={item === "Salón" ? "Salón 18" : item}
                aria-current={view === item ? "page" : undefined}
                className={`nav-item ${view === item ? "active" : ""}`}
                onClick={() => {
                  setView(item);
                  setError("");
                }}
              >
                <Icon size={19} />
                <span>{item}</span>
                {item === "Salón" ? (
                  <span className="nav-count">18</span>
                ) : item === "Actividad" ? (
                  <span className="nav-dot" />
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="shift-card">
            <span className="shift-icon">
              <Sparkles size={18} />
            </span>
            <strong>
              Un gran servicio
              <br />
              empieza aquí.
            </strong>
            <p>Cada mesa, una buena experiencia.</p>
            <span className="shift-label">
              <span className="dot" /> Turno de demostración
            </span>
          </div>
          <button className="help-button" onClick={() => openModal("help")}>
            <CircleHelp size={18} /> Centro de ayuda <ChevronRight size={15} />
          </button>
          <div className="profile">
            <span className="avatar">AM</span>
            <div>
              <strong>Alejandra Morales</strong>
              <span>Hostess</span>
            </div>
            <button
              className="icon-button"
              aria-label="Información del entorno"
              onClick={() => openModal("help")}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Operación <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${online ? "" : "offline"}`}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {online ? "Demo local" : "Sin conexión"}
            </span>
            <span className="top-divider" />
            <span className="date-label">
              {new Intl.DateTimeFormat("es-MX", {
                day: "numeric",
                month: "long",
              }).format(new Date(now))}
            </span>
            <button
              className="notification-button"
              aria-label={`Ver actividad, ${count("pending")} liberaciones pendientes`}
              onClick={() => setView("Actividad")}
            >
              <Bell size={19} />
              <span />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="greeting">
                Todo listo para un buen servicio <span>☀</span>
              </div>
              <h1>
                {view === "Salón"
                  ? "Tu salón, de un vistazo"
                  : view === "Visitas"
                    ? "Cada visita cuenta"
                    : view === "Equipo"
                      ? "El equipo en el salón"
                      : "Lo que pasa en tu salón"}
              </h1>
              <p>
                {view === "Salón"
                  ? "Recibe, asigna y acompaña cada mesa desde un solo lugar."
                  : view === "Visitas"
                    ? "Consulta las visitas abiertas y el historial de este turno."
                    : view === "Equipo"
                      ? "Distribuye la atención y consulta las mesas de cada persona."
                      : "Un registro de los movimientos de esta demostración."}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => openModal("visit")}
              disabled={!online}
            >
              <Plus size={18} /> Nueva visita
            </button>
          </div>

          {!online || !storageAvailable ? (
            <div className="warning-banner" role="status">
              <WifiOff size={18} />
              {!online
                ? "Sin conexión. Puedes consultar el salón; las acciones se habilitarán al reconectar."
                : "El almacenamiento no está disponible. Los cambios durarán solo en esta sesión."}
            </div>
          ) : null}
          <section className="stats" aria-label="Resumen del salón">
            <div className="stat">
              <span className="stat-icon green">
                <Grid2X2 size={20} />
              </span>
              <div>
                <span>Mesas disponibles</span>
                <strong>
                  {count("available")}
                  <small> / {state.tables.length}</small>
                </strong>
              </div>
              <span className="stat-tag">Listas para recibir</span>
            </div>
            <div className="stat">
              <span className="stat-icon red">
                <UtensilsCrossed size={20} />
              </span>
              <div>
                <span>Mesas ocupadas</span>
                <strong>
                  {occupied}
                  <small> mesas</small>
                </strong>
              </div>
              <span className="mini-bars">
                {Array.from({ length: 10 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < Math.round((occupied / state.tables.length) * 10)
                        ? "filled"
                        : ""
                    }
                  />
                ))}
              </span>
            </div>
            <div className="stat">
              <span className="stat-icon violet">
                <Users size={20} />
              </span>
              <div>
                <span>Comensales en el salón</span>
                <strong>
                  {guests}
                  <small> personas</small>
                </strong>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon amber">
                <Clock3 size={20} />
              </span>
              <div>
                <span>Por liberar</span>
                <strong>
                  {count("pending")}
                  <small> {count("pending") === 1 ? "mesa" : "mesas"}</small>
                </strong>
              </div>
              <span className="status-pulse" />
            </div>
          </section>

          {view === "Salón" ? (
            <div className="operation-layout">
              <section className="floor-section">
                <div className="floor-heading">
                  <div>
                    <h2>
                      Plano de mesas{" "}
                      <span className="subtle-tag">
                        {state.tables.length} mesas
                      </span>
                    </h2>
                    <p>Un lugar para cada momento.</p>
                  </div>
                  <div className="segmented" aria-label="Vista del salón">
                    <button
                      aria-label="Vista de plano"
                      aria-pressed={layout === "map"}
                      className={layout === "map" ? "selected" : ""}
                      onClick={() => setLayout("map")}
                    >
                      <Grid2X2 size={17} />
                    </button>
                    <button
                      aria-label="Vista de lista"
                      aria-pressed={layout === "list"}
                      className={layout === "list" ? "selected" : ""}
                      onClick={() => setLayout("list")}
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>
                <div
                  className="area-tabs"
                  role="tablist"
                  aria-label="Áreas del restaurante"
                >
                  {areas.map((a) => (
                    <button
                      role="tab"
                      id={`area-tab-${areas.indexOf(a)}`}
                      aria-controls="floor-panel"
                      tabIndex={area === a ? 0 : -1}
                      onKeyDown={(e) => {
                        if (
                          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                            e.key,
                          )
                        )
                          return;
                        e.preventDefault();
                        const index =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? areas.length - 1
                              : (areas.indexOf(a) +
                                  (e.key === "ArrowRight" ? 1 : -1) +
                                  areas.length) %
                                areas.length;
                        setArea(areas[index]);
                        setChosen([]);
                        setSelectedId(
                          state.tables.find((t) => t.area === areas[index])!.id,
                        );
                        document.getElementById(`area-tab-${index}`)?.focus();
                      }}
                      aria-selected={area === a}
                      key={a}
                      onClick={() => {
                        setArea(a);
                        setChosen([]);
                        setSelectedId(
                          state.tables.find((t) => t.area === a)!.id,
                        );
                      }}
                      className={area === a ? "active" : ""}
                    >
                      {a}
                      <span>
                        {state.tables.filter((t) => t.area === a).length}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="floor-toolbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Buscar mesa o comensal"
                      placeholder="Buscar mesa o comensal"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                      <button
                        className="icon-button"
                        onClick={() => setSearch("")}
                        aria-label="Limpiar búsqueda"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </label>
                  <button
                    className={`button text-button ${editing ? "editing" : ""}`}
                    onClick={() => setEditing(!editing)}
                  >
                    <Pencil size={15} />
                    {editing ? "Terminar edición" : "Editar plano"}
                  </button>
                </div>
                <div
                  className="floor-wrap"
                  id="floor-panel"
                  role="tabpanel"
                  aria-labelledby={`area-tab-${areas.indexOf(area)}`}
                >
                  {layout === "map" ? (
                    <div className="floor-plan">
                      <div className="windows">
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className="floor-note">
                        <span />
                        {area === "Salón principal"
                          ? "Ventanal"
                          : area === "Terraza"
                            ? "Jardín exterior"
                            : "Área reservada"}
                        <span />
                      </div>
                      <div className="room-label">{area}</div>
                      {visible.map((t) => {
                        const tv = state.visits.find(
                          (v) => v.id === t.visitId && !v.closedAt,
                        );
                        const isGroup =
                          !!tv &&
                          state.tables.filter((x) => x.visitId === tv.id)
                            .length > 1;
                        return (
                          <button
                            key={t.id}
                            className={`table-position ${t.status} ${selectedId === t.id ? "is-selected" : ""}`}
                            style={{ left: `${t.x}%`, top: `${t.y}%` }}
                            onClick={() => {
                              setSelectedId(t.id);
                              setError("");
                            }}
                            aria-label={`Mesa ${t.number}, ${t.seats} lugares, ${statusLabels[t.status]}${isGroup ? ", agrupada" : ""}`}
                            aria-pressed={selectedId === t.id}
                          >
                            <span className={`table-furniture ${t.shape}`}>
                              <i className="chair top left" />
                              <i className="chair top right" />
                              <i className="chair bottom left" />
                              <i className="chair bottom right" />
                              {t.seats > 4 ? (
                                <>
                                  <i className="chair side left" />
                                  <i className="chair side right" />
                                </>
                              ) : null}
                              <span className="table-surface">
                                {isGroup ? (
                                  <Link2
                                    className="table-group-icon"
                                    size={12}
                                  />
                                ) : null}
                                <strong>
                                  {String(t.number).padStart(2, "0")}
                                </strong>
                                <span>
                                  <Users size={10} />{" "}
                                  {tv
                                    ? `${tv.guests} pers.`
                                    : `${t.seats} lugares`}
                                </span>
                              </span>
                              {selectedId === t.id ? (
                                <span className="selection-check">
                                  <Check size={10} />
                                </span>
                              ) : null}
                            </span>
                            <span className="table-caption">
                              {tv
                                ? elapsed(tv.startedAt, now)
                                : t.status === "cleaning"
                                  ? "En limpieza"
                                  : "Disponible"}
                            </span>
                          </button>
                        );
                      })}
                      {visible.length === 0 ? (
                        <div className="empty-state">
                          <Search size={28} />
                          <strong>No hay mesas con esos filtros</strong>
                          <button
                            className="button"
                            onClick={() => {
                              setSearch("");
                              setFilter("all");
                            }}
                          >
                            Mostrar todas
                          </button>
                        </div>
                      ) : null}
                      <div className="entrance">
                        <DoorOpen size={15} /> Entrada principal
                      </div>
                      <div className="floor-compass">
                        <ArrowUp size={13} />
                        <span>N</span>
                      </div>
                    </div>
                  ) : (
                    <div className="table-list">
                      {visible.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedId(t.id);
                            setError("");
                          }}
                          className={`table-list-row ${t.id === selectedId ? "selected" : ""}`}
                        >
                          <span className={`list-table-icon ${t.status}`}>
                            <Armchair size={20} />
                          </span>
                          <strong>
                            Mesa {String(t.number).padStart(2, "0")}
                          </strong>
                          <span>{t.seats} lugares</span>
                          <span className={`badge ${t.status}`}>
                            {statusLabels[t.status]}
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                      {!visible.length ? (
                        <p className="empty-copy">
                          No hay mesas con esos filtros.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="floor-legend">
                  <button
                    className={filter === "all" ? "active" : ""}
                    onClick={() => setFilter("all")}
                  >
                    Todas
                  </button>
                  {statuses.map((s) => (
                    <button
                      key={s}
                      aria-pressed={filter === s}
                      className={filter === s ? "active" : ""}
                      onClick={() => setFilter(filter === s ? "all" : s)}
                    >
                      <span className={`legend-dot ${s}`} />
                      {statusLabels[s]}
                    </button>
                  ))}
                </div>
                <div className="floor-footer">
                  <span>
                    <MapPin size={13} /> Casa Oliva · Centro
                  </span>
                  <span>
                    {editing
                      ? "Selecciona una mesa y usa las flechas para moverla"
                      : "Selecciona una mesa para ver sus detalles"}
                  </span>
                </div>
              </section>

              <aside className="detail-panel" aria-label="Detalle de mesa">
                <div className="detail-top">
                  <span>Detalle de mesa</span>
                  <MoreHorizontal size={20} />
                </div>
                <div className="detail-title">
                  <div>
                    <h2>Mesa {String(selected.number).padStart(2, "0")}</h2>
                    <span>
                      <MapPin size={13} /> {selected.area}
                    </span>
                  </div>
                  <div className={`detail-table-icon ${selected.status}`}>
                    <Armchair size={27} />
                  </div>
                </div>
                <div className="detail-badges">
                  <span className={`badge ${selected.status}`}>
                    <span className="dot" />
                    {statusLabels[selected.status]}
                  </span>
                  <span className="capacity-label">
                    <Users size={14} />
                    {selected.seats} lugares
                  </span>
                </div>
                {error && !modal ? (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                ) : null}
                {editing ? (
                  <div className="edit-controls">
                    <h3>Posición en el plano</h3>
                    <p>Desplaza la mesa sin encimarla con otras.</p>
                    <div className="arrow-controls">
                      {[
                        {
                          icon: ArrowLeft,
                          dx: -4,
                          dy: 0,
                          label: "Mover a la izquierda",
                        },
                        { icon: ArrowUp, dx: 0, dy: -4, label: "Mover arriba" },
                        { icon: ArrowDown, dx: 0, dy: 4, label: "Mover abajo" },
                        {
                          icon: ArrowRight,
                          dx: 4,
                          dy: 0,
                          label: "Mover a la derecha",
                        },
                      ].map(({ icon: Icon, dx, dy, label }) => (
                        <button
                          key={label}
                          className="button"
                          aria-label={label}
                          disabled={!online}
                          onClick={() =>
                            run({ type: "move", tableId: selected.id, dx, dy })
                          }
                        >
                          <Icon size={16} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {visit ? (
                  <>
                    <div className="detail-divider" />
                    <div className="visit-title">
                      <h3>Visita actual</h3>
                      <span className="subtle-tag">En curso</span>
                    </div>
                    <div className="guest-block">
                      <span className="guest-avatar">
                        {visit.guest
                          .split(" ")
                          .slice(0, 2)
                          .map((s) => s[0])
                          .join("")}
                      </span>
                      <div>
                        <strong>{visit.guest}</strong>
                        <span>
                          {visit.guests} comensales
                          {grouped.length > 1
                            ? ` · Mesas ${grouped.map((t) => t.number).join(" + ")}`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div className="visit-facts">
                      <div>
                        <Clock3 size={16} />
                        <span>Hora de llegada</span>
                        <strong>{formatTime(visit.startedAt)}</strong>
                      </div>
                      <div>
                        <Clock3 size={16} />
                        <span>Tiempo en mesa</span>
                        <strong>{elapsed(visit.startedAt, now)}</strong>
                      </div>
                    </div>
                    <label className="field-label waiter-label">
                      Personal asignado
                      <select
                        value={visit.waiter}
                        disabled={!online}
                        onChange={(e) =>
                          run({
                            type: "assign",
                            tableId: selected.id,
                            waiter: e.target.value,
                          })
                        }
                      >
                        {waiters.map((w) => (
                          <option key={w}>{w}</option>
                        ))}
                      </select>
                    </label>
                    {visit.note ? (
                      <div className="guest-note">
                        <span>Nota de la visita</span>
                        <p>{visit.note}</p>
                      </div>
                    ) : null}
                    <button className="button qr-button" onClick={showQr}>
                      <QrCode size={17} /> Ver QR de la visita{" "}
                      <ChevronRight size={15} />
                    </button>
                    <div className="detail-divider" />
                    <h3>Acciones de mesa</h3>
                    <div className="detail-actions">
                      {selected.status === "occupied" ? (
                        <>
                          <button
                            className="button"
                            onClick={() => openModal("group")}
                            disabled={!online}
                          >
                            <Link2 size={16} /> Agrupar mesas
                          </button>
                          {grouped.length > 1 ? (
                            <button
                              className="button"
                              onClick={() =>
                                run({ type: "ungroup", tableId: selected.id })
                              }
                              disabled={!online}
                            >
                              <Unlink size={16} /> Separar esta mesa
                            </button>
                          ) : null}
                          <button
                            className="button amber-button"
                            onClick={() =>
                              run({ type: "pending", tableId: selected.id })
                            }
                            disabled={!online}
                          >
                            <DoorOpen size={16} /> Solicitar liberación
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="action-note">
                            Valida el cierre comercial en caja antes de cerrar
                            esta visita.
                          </p>
                          <button
                            className="button primary"
                            onClick={() => openModal("close")}
                            disabled={!online}
                          >
                            <Check size={16} /> Confirmar liberación
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="available-detail">
                    <span className={`large-status-icon ${selected.status}`}>
                      {selected.status === "cleaning" ? (
                        <Sparkles size={31} />
                      ) : (
                        <Armchair size={31} />
                      )}
                    </span>
                    <h3>
                      {selected.status === "cleaning"
                        ? "Un momento para dejarla lista"
                        : "Aquí empieza una nueva visita"}
                    </h3>
                    <p>
                      {selected.status === "cleaning"
                        ? "Confirma que la mesa está limpia antes de recibir a los siguientes comensales."
                        : `Esta mesa tiene espacio para ${selected.seats} personas. Recibe a tus comensales y asígnales atención.`}
                    </p>
                    <button
                      className="button primary"
                      disabled={!online}
                      onClick={() =>
                        selected.status === "cleaning"
                          ? run({ type: "clean", tableId: selected.id })
                          : openModal("visit")
                      }
                    >
                      {selected.status === "cleaning" ? (
                        <Check size={17} />
                      ) : (
                        <Plus size={17} />
                      )}
                      {selected.status === "cleaning"
                        ? "Marcar como disponible"
                        : "Abrir visita"}
                    </button>
                  </div>
                )}
                <div className="detail-bottom">
                  <span className="dot" /> Datos de demostración · Guardado
                  local
                </div>
              </aside>
            </div>
          ) : null}

          {view === "Visitas" ? (
            <section className="content-card">
              <div className="section-heading">
                <h2>Visitas del turno</h2>
                <span className="subtle-tag">
                  {activeVisits.length} abiertas
                </span>
              </div>
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Comensal</th>
                      <th>Mesa</th>
                      <th>Personas</th>
                      <th>Personal</th>
                      <th>Llegada</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.visits
                      .slice()
                      .reverse()
                      .map((v) => (
                        <tr key={v.id}>
                          <td>
                            <strong>{v.guest}</strong>
                          </td>
                          <td>
                            {v.closedAt
                              ? "—"
                              : state.tables
                                  .filter((t) => t.visitId === v.id)
                                  .map((t) => t.number)
                                  .join(" + ")}
                          </td>
                          <td>{v.guests}</td>
                          <td>{v.waiter}</td>
                          <td>{formatTime(v.startedAt)}</td>
                          <td>
                            <span
                              className={`badge ${v.closedAt ? "cleaning" : "occupied"}`}
                            >
                              {v.closedAt ? "Cerrada" : "En curso"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          {view === "Equipo" ? (
            <section className="team-grid">
              {waiters.map((w, i) => {
                const visits = activeVisits.filter((v) => v.waiter === w);
                const tables = state.tables.filter((t) =>
                  visits.some((v) => v.id === t.visitId),
                );
                return (
                  <article className="team-card" key={w}>
                    <span className={`team-avatar color-${i}`}>
                      {w
                        .split(" ")
                        .map((s) => s[0])
                        .join("")}
                    </span>
                    <h2>{w}</h2>
                    <p>Atención en salón</p>
                    <div className="team-numbers">
                      <span>
                        <strong>{tables.length}</strong> mesas
                      </span>
                      <span>
                        <strong>
                          {visits.reduce((n, v) => n + v.guests, 0)}
                        </strong>{" "}
                        comensales
                      </span>
                    </div>
                    <div className="team-tables">
                      {tables.length ? (
                        tables.map((t) => (
                          <button
                            className="button"
                            key={t.id}
                            onClick={() => {
                              setArea(t.area);
                              setSelectedId(t.id);
                              setView("Salón");
                            }}
                          >
                            Mesa {t.number}
                            <ChevronRight size={13} />
                          </button>
                        ))
                      ) : (
                        <p>Sin mesas asignadas</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}
          {view === "Actividad" ? (
            <section className="content-card">
              <div className="section-heading">
                <h2>Actividad del turno</h2>
                <span className="subtle-tag">Historial local</span>
              </div>
              {state.activity.map((a) => (
                <div className="activity-row" key={a.id}>
                  <span className="activity-icon">
                    <Check size={17} />
                  </span>
                  <p>{a.text}</p>
                  <time dateTime={a.at}>{formatTime(a.at)}</time>
                </div>
              ))}
            </section>
          ) : null}
          <footer className="page-footer">
            <span>
              <span className="dot" /> Hecho para que el servicio fluya.
            </span>
            <span>
              Foodlify <span className="footer-dot">/</span> Hostess{" "}
              <span className="subtle-tag">Vista de demostración</span>
            </span>
          </footer>
        </main>
      </div>
      {toast ? (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {modal ? (
        <ModalShell
          title={
            modal === "visit"
              ? "Recibe una nueva visita"
              : modal === "group"
                ? "Más espacio, una misma visita"
                : modal === "qr"
                  ? "QR de la visita"
                  : modal === "close"
                    ? "Confirmar liberación"
                    : "Tu panel de hostess"
          }
          onClose={() => {
            setModal(null);
            setError("");
          }}
        >
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}
          {modal === "visit" ? (
            <form onSubmit={submitVisit}>
              <div className="form-grid">
                <label className="field-label full">
                  Nombre de la visita
                  <input
                    name="guest"
                    placeholder="Ej. Familia Martínez"
                    required
                    maxLength={80}
                    autoFocus
                  />
                </label>
                <label className="field-label">
                  Comensales
                  <input
                    name="guests"
                    type="number"
                    min={1}
                    max={capacity || 100}
                    defaultValue={2}
                    required
                  />
                </label>
                <label className="field-label">
                  Personal asignado
                  <select name="waiter" required>
                    {waiters.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Mesas disponibles · {area}</legend>
                <p className="small muted">
                  Puedes unir varias mesas. Capacidad seleccionada: {capacity}{" "}
                  personas.
                </p>
                <div className="table-choices">
                  {areaTables
                    .filter((t) => t.status === "available")
                    .map((t) => (
                      <label
                        key={t.id}
                        className={chosen.includes(t.id) ? "checked" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={chosen.includes(t.id)}
                          onChange={() => toggleChosen(t.id)}
                        />
                        <strong>Mesa {t.number}</strong>
                        <span>{t.seats} lugares</span>
                      </label>
                    ))}
                </div>
                {!areaTables.some((t) => t.status === "available") ? (
                  <p>
                    No hay mesas disponibles en esta área. Cambia de área en el
                    plano.
                  </p>
                ) : null}
              </fieldset>
              <label className="field-label">
                Nota de la visita <span className="muted">(opcional)</span>
                <textarea
                  name="note"
                  placeholder="Algo que el equipo deba saber…"
                  maxLength={400}
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  type="submit"
                  disabled={!chosen.length || !online}
                >
                  <Plus size={17} />
                  Abrir visita
                </button>
              </div>
            </form>
          ) : null}
          {modal === "group" ? (
            <>
              <p className="modal-copy">
                Une mesas disponibles de {selected.area} a la visita de{" "}
                <strong>{visit?.guest}</strong>. Compartirán personal, visita y
                QR.
              </p>
              <div className="table-choices">
                {state.tables
                  .filter(
                    (t) => t.area === selected.area && t.status === "available",
                  )
                  .map((t) => (
                    <label
                      key={t.id}
                      className={chosen.includes(t.id) ? "checked" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={chosen.includes(t.id)}
                        onChange={() => toggleChosen(t.id)}
                      />
                      <strong>Mesa {t.number}</strong>
                      <span>{t.seats} lugares</span>
                    </label>
                  ))}
              </div>
              {!state.tables.some(
                (t) => t.area === selected.area && t.status === "available",
              ) ? (
                <p>No hay mesas disponibles para agrupar.</p>
              ) : null}
              <div className="modal-actions">
                <button className="button" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={!chosen.length || !online}
                  onClick={() => {
                    if (
                      run({
                        type: "group",
                        tableId: selected.id,
                        otherIds: chosen,
                      })
                    )
                      setModal(null);
                  }}
                >
                  <Link2 size={17} />
                  Agrupar mesas
                </button>
              </div>
            </>
          ) : null}
          {modal === "close" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (run({ type: "close", tableId: selected.id }))
                  setModal(null);
              }}
            >
              <p className="modal-copy">
                La visita de <strong>{visit?.guest}</strong> se cerrará y{" "}
                {grouped.length > 1
                  ? `las mesas ${grouped.map((t) => t.number).join(", ")} pasarán`
                  : `la mesa ${selected.number} pasará`}{" "}
                a limpieza.
              </p>
              <div className="warning-banner">
                Este prototipo no consulta caja ni registra pagos.
              </div>
              <label className="confirmation">
                <input type="checkbox" required /> He verificado el cierre
                comercial de la visita en caja.
              </label>
              <div className="modal-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
                <button className="button primary" disabled={!online}>
                  Cerrar visita y limpiar
                </button>
              </div>
            </form>
          ) : null}
          {modal === "qr" ? (
            <div className="qr-content">
              <p>
                {visit?.guest} · Mesa {grouped.map((t) => t.number).join(" + ")}
              </p>
              {qr ? (
                <Image
                  unoptimized
                  src={qr}
                  alt="Código QR de demostración de la visita"
                  width={260}
                  height={260}
                />
              ) : qrError ? (
                <p role="alert">
                  No se pudo generar el QR. Cierra el diálogo e inténtalo de
                  nuevo.
                </p>
              ) : (
                <LoaderCircle className="spin" />
              )}
              <p className="muted small">
                QR de demostración. Contiene la referencia de esta visita; aún
                no abre un menú ni autoriza pedidos.
              </p>
              {qr ? (
                <a
                  className="button primary"
                  href={qr}
                  download={`foodlify-mesa-${selected.number}.png`}
                >
                  <Download size={17} /> Descargar QR
                </a>
              ) : null}
            </div>
          ) : null}
          {modal === "help" ? (
            <div className="help-content">
              <p>
                Selecciona una mesa para abrir visitas, asignar personal, unir
                mesas y consultar su QR.
              </p>
              <h3>Un cierre en dos pasos</h3>
              <p>
                Solicita la liberación y valida el cierre en caja. Después
                confirma la liberación y marca la mesa como disponible cuando
                esté limpia.
              </p>
              <h3>Acerca de esta demostración</h3>
              <p>
                Los datos se guardan en este navegador. Las pestañas comparten
                cambios, pero todavía no hay sincronización entre dispositivos,
                autenticación ni conexión con caja. Usa únicamente datos de
                prueba.
              </p>
              <p>
                Para editar el plano, activa «Editar plano», selecciona una mesa
                y usa las flechas del panel.
              </p>
              <button className="button primary" onClick={() => setModal(null)}>
                Entendido
              </button>
            </div>
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
