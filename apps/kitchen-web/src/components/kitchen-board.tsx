"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useId, type ReactNode } from "react";
import { Activity, ArrowDownUp, ArrowLeft, ArrowRight, Bell, Check, CheckCheck, ChefHat, ChevronDown, CircleHelp, Clock3, Flame, History, LayoutDashboard, Maximize2, MoreHorizontal, Plus, Search, Settings2, ShoppingBag, SlidersHorizontal, Snowflake, Timer, Users, Utensils, Volume2, VolumeX, WifiOff, Wine, X } from "lucide-react";
import { advanceTicket, createDemoTickets, elapsedLabel, isDelayed, parseSnapshot, statusLabels, STORAGE_KEY, type Station, type Status, type Ticket } from "@/lib/kitchen";

type View = "board" | "history";
const stations = ["Todas las estaciones", "Caliente", "Fría", "Bebidas"] as const;
const columns: { status: Status; description: string; icon: typeof Clock3 }[] = [
  { status: "pending", description: "Cada gran plato comienza aquí", icon: ShoppingBag },
  { status: "preparing", description: "Manos a la obra", icon: Flame },
  { status: "ready", description: "El último paso hacia la mesa", icon: CheckCheck },
];
const actionLabels: Partial<Record<Status, string>> = { pending: "Comenzar preparación", preparing: "Marcar como listo", ready: "Confirmar entrega" };

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>{children}
  </dialog>;
}

export function KitchenBoard() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [now, setNow] = useState(0);
  const [view, setView] = useState<View>("board");
  const [station, setStation] = useState<string>(stations[0]);
  const [query, setQuery] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false);
  const [sort, setSort] = useState<"oldest" | "newest">("oldest");
  const [sound, setSound] = useState(false);
  const [online, setOnline] = useState(true);
  const [threshold, setThreshold] = useState(15);
  const [modal, setModal] = useState<"settings" | "help" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const time = Date.now();
      let saved: Ticket[] | null = null;
      try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { saved = parseSnapshot(raw); if (!saved) setToast("La sesión guardada no es válida. Se cargó una nueva demostración."); } } catch { setStorageFailed(true); }
      setTickets(saved ?? createDemoTickets(time));
      setNow(time);
      setOnline(navigator.onLine);
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const connect = () => setOnline(true);
    const disconnect = () => setOnline(false);
    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    return () => { clearTimeout(timer); clearInterval(clock); window.removeEventListener("online", connect); window.removeEventListener("offline", disconnect); };
  }, []);

  useEffect(() => {
    if (tickets === null) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tickets })); }
    catch { const timer = setTimeout(() => setStorageFailed(true), 0); return () => clearTimeout(timer); }
  }, [tickets]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); } }, [toast]);

  const all = tickets ?? [];
  const active = all.filter(t => t.status !== "delivered");
  const delayed = active.filter(t => isDelayed(t, now, threshold));
  const delivered = all.filter(t => t.status === "delivered");
  const filtered = all.filter(t => (station === stations[0] || t.items.some(i => i.station === station)) && (!onlyDelayed || isDelayed(t, now, threshold)) && `${t.number} ${t.table} ${t.items.map(i => i.name).join(" ")}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))).sort((a, b) => sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
  const detail = all.find(t => t.id === detailId);
  const preparing = active.filter(t => t.status === "preparing");
  const avgMinutes = preparing.length ? Math.round(preparing.reduce((sum, t) => sum + (now - t.createdAt) / 60_000, 0) / preparing.length) : 0;

  function advance(id: string) {
    const ticket = all.find(t => t.id === id);
    if (!ticket || ticket.status === "delivered") return;
    setTickets(current => advanceTicket(current ?? [], id, Date.now()));
    setToast(`Pedido #${ticket.number}: ${ticket.status === "pending" ? "preparación iniciada" : ticket.status === "preparing" ? "listo para servir" : "entrega confirmada"}. Guardado en este dispositivo.`);
  }
  function toggleItem(ticketId: string, itemId: string) {
    setTickets(current => current?.map(t => t.id === ticketId && t.status === "preparing" ? { ...t, items: t.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) } : t) ?? []);
  }
  function addDemo() {
    const time = Date.now();
    const number = Math.max(1050, ...all.map(t => t.number)) + 1;
    const demo: Ticket = { id: crypto.randomUUID(), number, table: "Mesa 04", guests: 2, server: "Valeria M.", status: "pending", priority: false, createdAt: time, updatedAt: time, items: [{ id: crypto.randomUUID(), name: "Hamburguesa de la casa", quantity: 2, station: "Caliente", modifiers: "Término medio · Papas a la francesa", done: false }] };
    setTickets(current => [...(current ?? []), demo]);
    setView("board"); setQuery(""); setOnlyDelayed(false); setStation(stations[0]);
    setToast(`Pedido de demostración #${number} agregado.`);
    if (sound) {
      try {
        const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.08, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35); oscillator.start(); oscillator.stop(context.currentTime + 0.35); oscillator.onended = () => { void context.close(); };
      } catch { setToast(`Pedido #${number} agregado. El navegador no permitió reproducir el aviso.`); }
    }
  }
  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setToast("La pantalla completa no está disponible en este navegador."); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label="Foodlify inicio"><span className="brand-icon"><Utensils size={23} strokeWidth={2.4} /></span>foodlify<span className="brand-dot">.</span></Link>
      <div className="workspace"><span className="restaurant-icon"><ChefHat size={20} /></span><div><strong>La Mesa</strong><span>Sucursal Centro</span></div><span className="workspace-tag">LM</span></div>
      <div className="sidebar-caption">Espacio de trabajo</div>
      <nav aria-label="Navegación de cocina">
        <button className={`nav-link ${view === "board" ? "selected" : ""}`} onClick={() => setView("board")}><LayoutDashboard size={19} />Tablero de cocina<span className="nav-count">{active.length}</span></button>
        <button className={`nav-link ${view === "history" ? "selected" : ""}`} onClick={() => { setView("history"); setOnlyDelayed(false); }}><History size={19} />Historial<span className="history-count">{delivered.length}</span></button>
        <button className="nav-link" onClick={() => setModal("settings")}><Settings2 size={19} />Configuración</button>
      </nav>
      <div className="sidebar-bottom"><div className="service-card"><span className="service-symbol"><Flame size={19} /></span><strong>Todo listo para el servicio</strong><p>Tu equipo, al mismo ritmo.</p><span className="shift-dot" /> Turno de comida</div>
        <button className="nav-link help-link" onClick={() => setModal("help")}><CircleHelp size={19} />Ayuda y atajos</button>
        <div className="profile"><span className="avatar">AC</span><div><strong>Alex Castillo</strong><span>Jefe de cocina · Demo</span></div><ChefHat size={18} /></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Operación <span>/</span> <strong>Cocina</strong></div><div className="topbar-right"><span className={`connection ${online ? "" : "offline"}`}>{online ? <span className="live-dot" /> : <WifiOff size={14} />}{online ? "Demo local" : "Sin conexión"}</span><span className="topbar-divider" /><time className="live-time" suppressHydrationWarning>{now ? new Date(now).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" }) : "--:--"}</time><button className={`icon-button ${sound ? "sound-on" : ""}`} aria-label={sound ? "Desactivar sonido" : "Activar sonido"} aria-pressed={sound} onClick={() => setSound(s => !s)}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button fullscreen" aria-label="Pantalla completa" onClick={() => void toggleFullscreen()}><Maximize2 size={18} /></button></div></header>
      <main>
        <div className="page-heading"><div><div className="heading-kicker"><span className="purple-dot" /> Cocina en movimiento</div><h1>{view === "board" ? "Un buen servicio empieza aquí." : "Cada pedido, bien entregado."}</h1><p>{view === "board" ? "Cada pedido en su punto. Todo tu equipo en sintonía." : "Consulta los pedidos que tu equipo completó en esta demostración."}</p></div><button className="primary-button add-order" onClick={addDemo} disabled={!tickets}><Plus size={17} />Pedido de prueba</button></div>
        <section className="overview" aria-label="Resumen de cocina"><div className="overview-title"><span className="overview-icon"><Activity size={20} /></span><div><strong>Así va tu cocina</strong><span>Resumen del servicio demo</span></div></div><div className="metric"><span>Pedidos activos</span><strong>{active.length.toString().padStart(2, "0")}<small>en cocina</small></strong></div><div className="metric"><span>Tiempo en preparación</span><strong>{avgMinutes}<small>min de antigüedad media</small></strong></div><button className={`metric delay-metric ${onlyDelayed ? "metric-selected" : ""}`} onClick={() => { setOnlyDelayed(v => !v); setView("board"); }} aria-pressed={onlyDelayed}><span><span className="amber-dot" />Pedidos atrasados</span><strong>{delayed.length.toString().padStart(2, "0")}<small>más de {threshold} min</small></strong></button><div className="metric ready-metric"><span>Listos para servir</span><strong>{active.filter(t => t.status === "ready").length.toString().padStart(2, "0")}<small>¡a la mesa!</small></strong></div></section>
        <div className="board-toolbar"><div className="view-tabs" role="group" aria-label="Vista"><button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><LayoutDashboard size={16} />Pedidos en curso<span>{active.length}</span></button><button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); setOnlyDelayed(false); }}><History size={16} />Entregados<span>{delivered.length}</span></button></div><div className="toolbar-actions"><label className="station-select"><SlidersHorizontal size={15} /><span className="sr-only">Estación</span><select value={station} onChange={e => setStation(e.target.value)}>{stations.map(s => <option key={s}>{s}</option>)}</select><ChevronDown size={13} /></label><button className="sort-button" onClick={() => setSort(s => s === "oldest" ? "newest" : "oldest")} title="Cambiar orden"><ArrowDownUp size={15} />{sort === "oldest" ? "Más antiguos" : "Más recientes"}</button></div></div>
        <div className="search-row"><label className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por pedido, mesa o platillo…" aria-label="Buscar pedidos" />{query ? <button className="clear-search" onClick={() => setQuery("")} aria-label="Limpiar búsqueda"><X size={15} /></button> : null}</label><span className="board-hint"><Timer size={14} /> Cada segundo cuenta. Tú tienes el control.</span></div>
        {!online || storageFailed ? <div className="warning-banner" role="status"><WifiOff size={17} />{storageFailed ? "No se pudo guardar la sesión. Los cambios se conservarán solo mientras esta página permanezca abierta." : "Sin Internet. Puedes continuar esta demostración local; no hay conexión con el servicio de cocina."}</div> : null}
        {onlyDelayed ? <div className="filter-banner">Mostrando pedidos con más de {threshold} minutos<button onClick={() => setOnlyDelayed(false)}>Quitar filtro <X size={14} /></button></div> : null}
        {!tickets ? <div className="loading-state"><ChefHat size={30} /><p>Preparando tu espacio de cocina…</p></div> : view === "board" ? <div className="kanban">{columns.map(({ status, description, icon: Icon }) => {
          const orders = filtered.filter(t => t.status === status);
          return <section className={`kanban-column ${status}`} key={status} aria-label={statusLabels[status]}><div className="column-heading"><div className="column-title"><span className="column-dot" /><h2>{statusLabels[status]}</h2><span className="column-count">{orders.length}</span></div><Icon size={18} /></div><p className="column-description">{description}</p><div className="ticket-list">{orders.map(ticket => <TicketCard key={ticket.id} ticket={ticket} now={now} threshold={threshold} onAdvance={advance} onToggleItem={toggleItem} onDetail={setDetailId} />)}{orders.length === 0 ? <div className="empty-column"><Icon size={26} /><strong>{query || station !== stations[0] || onlyDelayed ? "Sin coincidencias" : "Todo al día"}</strong><p>{query || station !== stations[0] || onlyDelayed ? "Prueba con otro filtro o búsqueda." : "Los pedidos aparecerán aquí al cambiar de estado."}</p></div> : null}</div></section>;
        })}</div> : <section className="history-panel"><div className="history-heading"><h2>Pedidos entregados</h2><span>{filtered.filter(t => t.status === "delivered").length} pedidos</span></div>{filtered.filter(t => t.status === "delivered").length ? filtered.filter(t => t.status === "delivered").map(t => <button className="history-row" key={t.id} onClick={() => setDetailId(t.id)}><span className="history-check"><CheckCheck size={19} /></span><div><strong>#{t.number} · {t.table}</strong><span>{t.items.reduce((sum, i) => sum + i.quantity, 0)} productos · {t.server}</span></div><time>{new Date(t.updatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" })}</time><ArrowRight size={16} /></button>) : <div className="empty-history"><CheckCheck size={35} /><h3>Aquí termina un buen servicio</h3><p>{query || station !== stations[0] ? "No hay entregas que coincidan con estos filtros." : "Confirma la entrega de un pedido listo y aparecerá en tu historial."}</p><button className="secondary-button" onClick={() => setView("board")}><ArrowLeft size={16} />Volver a cocina</button></div>}</section>}
        <footer className="page-footer"><span><ChefHat size={15} /> Hecho para el ritmo de tu cocina.</span><span>Datos de demostración <span className="footer-dot" /> {storageFailed ? "Guardado no disponible" : "Cambios guardados en este dispositivo"}</span></footer>
      </main>
    </div>
    <div className="toast-region" role="status" aria-live="polite">{toast ? <div className="toast"><Check size={18} />{toast}<button onClick={() => setToast("")} aria-label="Cerrar aviso"><X size={16} /></button></div> : null}</div>
    {modal === "settings" ? <Modal title="Configuración de cocina" onClose={() => setModal(null)}><p className="modal-copy">Ajusta la visualización para este servicio de demostración.</p><label className="setting-field">Avisar de pedidos atrasados después de <div><input type="number" min={1} max={120} value={threshold} onChange={e => setThreshold(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} /><span>minutos</span></div></label><label className="setting-toggle"><span><strong>Avisos de sonido</strong><small>Al agregar un pedido de prueba</small></span><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} /></label><p className="settings-note">Los tiempos y el sonido se ajustan durante esta sesión. Los pedidos se guardan en este navegador.</p><button className="primary-button modal-done" onClick={() => setModal(null)}>Listo <Check size={17} /></button></Modal> : null}
    {modal === "help" ? <Modal title="Tu cocina, en orden" onClose={() => setModal(null)}><div className="help-step"><ShoppingBag size={22} /><div><strong>1. Recibe y revisa</strong><p>Revisa notas, aditamentos y alergias antes de comenzar la preparación.</p></div></div><div className="help-step"><Flame size={22} /><div><strong>2. Prepara a tu ritmo</strong><p>Marca los platillos mientras los preparas. Los filtros muestran pedidos que incluyen esa estación; el botón avanza el ticket completo.</p></div></div><div className="help-step"><CheckCheck size={22} /><div><strong>3. Lleva a la mesa</strong><p>Marca el pedido como listo y confirma su entrega para moverlo al historial.</p></div></div><p className="settings-note">Usa Tab para navegar y Enter para activar botones. Escape cierra los detalles. Esta es una demo: no recibe pedidos reales ni sincroniza con otros dispositivos.</p></Modal> : null}
    {detail ? <Modal title={`Pedido #${detail.number}`} onClose={() => setDetailId(null)}><div className="detail-meta"><strong>{detail.table}</strong><span>{statusLabels[detail.status]}</span></div><p className="modal-copy">Atiende {detail.server}{detail.guests ? ` · ${detail.guests} comensales` : " · Para llevar"}</p>{detail.items.map(i => <div className="detail-item" key={i.id}><span className="item-quantity">{i.quantity}</span><div><strong>{i.name}</strong><p>{i.station}{i.modifiers ? ` · ${i.modifiers}` : ""}</p>{i.note ? <span className="item-note">{i.note}</span> : null}</div></div>)}{detail.note ? <div className="order-note"><Bell size={16} /><p>{detail.note}</p></div> : null}<div className="detail-actions"><button className="secondary-button" onClick={() => setTickets(current => current?.map(t => t.id === detail.id ? { ...t, priority: !t.priority } : t) ?? [])}><Flame size={16} />{detail.priority ? "Quitar prioridad" : "Dar prioridad"}</button>{detail.status !== "delivered" ? <button className="primary-button" onClick={() => { advance(detail.id); setDetailId(null); }}>{actionLabels[detail.status]}<ArrowRight size={16} /></button> : null}</div></Modal> : null}
  </div>;
}

function TicketCard({ ticket, now, threshold, onAdvance, onToggleItem, onDetail }: { ticket: Ticket; now: number; threshold: number; onAdvance: (id: string) => void; onToggleItem: (ticketId: string, itemId: string) => void; onDetail: (id: string) => void }) {
  const late = isDelayed(ticket, now, threshold);
  const ready = ticket.status === "ready";
  const stationSet = [...new Set(ticket.items.map(i => i.station))];
  const stationIcons: Record<Station, typeof Flame> = { Caliente: Flame, Fría: Snowflake, Bebidas: Wine };
  return <article className={`ticket ${late ? "is-late" : ""} ${ready ? "is-ready" : ""}`}>
    {late ? <div className="late-strip"><Clock3 size={12} />Este pedido necesita tu atención</div> : null}
    <div className="ticket-top"><span className="ticket-number">#{ticket.number}</span><span title="Tiempo desde la recepción del pedido" className={`elapsed ${late ? "late" : ""}`}><Clock3 size={13} />{elapsedLabel(ticket.createdAt, now)}</span><button className="ticket-menu" onClick={() => onDetail(ticket.id)} aria-label={`Ver detalles del pedido ${ticket.number}`}><MoreHorizontal size={19} /></button></div>
    <div className="ticket-place"><h3>{ticket.takeaway ? <ShoppingBag size={17} /> : <Utensils size={16} />}{ticket.table}</h3>{ticket.priority ? <span className="priority"><Flame size={11} />Prioridad</span> : null}{ticket.takeaway ? <span className="takeaway">Para llevar</span> : null}</div>
    <div className="ticket-server"><span>{ticket.server}</span>{ticket.guests ? <span><Users size={12} />{ticket.guests} personas</span> : null}</div>
    <div className="ticket-items">{ticket.items.map(item => <div className={`ticket-item ${item.done ? "item-done" : ""}`} key={item.id}><button className={`item-quantity ${ticket.status === "preparing" ? "checkable" : ""}`} disabled={ticket.status !== "preparing"} onClick={() => onToggleItem(ticket.id, item.id)} aria-label={`${item.done ? "Desmarcar" : "Completar"} ${item.quantity} ${item.name}`} aria-pressed={item.done}>{item.quantity}</button><div className="item-body"><strong>{item.name}</strong>{item.modifiers ? <p>{item.modifiers}</p> : null}{item.note ? <span className="item-note">{item.note}</span> : null}</div>{item.done ? <Check className="ready-item-check" size={14} /> : null}</div>)}</div>
    {ticket.note ? <div className={`order-note ${ticket.note.startsWith("Alergia") ? "allergy-note" : ""}`}><Bell size={13} /><p>{ticket.note}</p></div> : null}
    <div className="ticket-stations">{stationSet.map(s => { const Icon = stationIcons[s]; return <span key={s}><Icon size={11} />{s}</span>; })}<span className="product-count">{ticket.items.reduce((sum, i) => sum + i.quantity, 0)} productos</span></div>
    <button className={`ticket-action ${ticket.status}`} onClick={() => onAdvance(ticket.id)}>{ticket.status === "preparing" ? <Check size={16} /> : ready ? <CheckCheck size={16} /> : <Flame size={16} />}{actionLabels[ticket.status]}{ticket.status === "pending" ? <ArrowRight className="action-arrow" size={15} /> : null}</button>
  </article>;
}
