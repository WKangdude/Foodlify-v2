# Foodlify v2 — Planeación del producto

Fecha: 25 de octubre de 2026. Estado: propuesta de arquitectura y backlog inicial; no representa funcionalidad implementada.

## 1. Objetivo y alcance comercial

Construir un producto digital para restaurantes y negocios gastronómicos que permita operar salón, pedidos, cocina, cobros, catálogo, inventario, empleados y reportes mediante aplicaciones independientes. La caída de un módulo debe afectar lo menos posible a los demás y conservar las operaciones pendientes para recuperarlas.

El proyecto deja de tener alcance universitario: debe contemplar clientes reales, múltiples negocios y sucursales, suscripciones, soporte, seguridad, continuidad operativa y costos sostenibles. Las fechas de lanzamiento y los compromisos de disponibilidad se definirán después de validar un piloto y medir la infraestructura.

### Prioridades

1. Integridad de pedidos y dinero: no perder operaciones confirmadas ni duplicar tickets o cobros.
2. Operación rápida: entrega de pedidos a cocina en tiempo cercano al real.
3. Aislamiento: despliegues, procesos, credenciales y datos propios por aplicación de negocio.
4. Recuperación: outbox, inbox y hospital de mensajes en cada base de datos de aplicación.
5. Producto comercial: aislamiento entre negocios, permisos, incorporación de clientes y herramientas de soporte.

### Entrega inicial

- MVP comercial: identidad y administración del negocio, salón/hostess, menú digital, pedidos, cocina, caja, catálogo, integrador y reportes básicos.
- Siguiente entrega: recetas, inventario, compras, gastos y reportes ampliados.
- Evolución posterior: recomendaciones, canales externos, fidelización y operación local sin Internet, según validación comercial.
- Suscripciones y consola de plataforma: versión mínima antes de vender planes; automatizaciones adicionales después del piloto.
- No prometer facturación fiscal, pagos offline, hardware compatible o integraciones externas hasta validar requisitos y proveedores de los mercados de lanzamiento.

## 2. Base de la reconstrucción

Referencia funcional: [YukioYoko/Foodlify, rama main](https://github.com/YukioYoko/Foodlify/tree/main), revisada en el commit [e320debb3386a5a36143b6b889959828dadf795d](https://github.com/YukioYoko/Foodlify/commit/e320debb3386a5a36143b6b889959828dadf795d). La revisión previa fue estática; no se ejecutó la aplicación original.

Hallazgos que orientan el rediseño:

- Los paneles actuales comparten Next.js, Server Actions y acceso a PostgreSQL mediante Prisma.
- Hostess crea comandas y caja modifica mesas; las responsabilidades deben separarse.
- Socket.IO retransmite eventos sin un registro durable de entrega y procesamiento.
- Cocina anuncia cambios de estado antes de confirmar su persistencia.
- El envío de pedidos depende de contexto climático y escrituras analíticas que deben salir del camino crítico.
- Caja calcula importes con el precio actual del catálogo: v2 debe conservar el precio acordado en cada partida.
- La sesión actual utiliza una cookie con identidad y rol en JSON sin firma: sustituir por sesiones verificables y autorización en cada API.
- El esquema revisado no contiene modelos específicos de existencias, compras ni ingredientes; recetas e inventario requieren modelado nuevo y validación funcional.

No copiar la base de datos compartida ni trasladar íntegramente las Server Actions a todos los servicios. Reutilizar componentes y reglas verificadas cuando resulten adecuados.

## 3. Arquitectura objetivo

### Aplicaciones y propiedad de datos

| Aplicación | Datos y responsabilidad | Interfaz |
| --- | --- | --- |
| Identidad y administración | Usuarios, empleados, roles y permisos por negocio/sucursal | Panel administrativo y acceso |
| Salón / hostess | Mesas, plano, agrupaciones y visitas | Panel hostess |
| Menú digital | Sesiones del comensal, preferencias y proyección publicada del menú | Web pública por QR |
| Pedidos | Pedidos, partidas, precios acordados y versiones comerciales | Flujos en menú, salón y caja |
| Cocina | Tickets, estaciones y estados de preparación | KDS |
| Caja | Cuentas, cargos, pagos, devoluciones y cortes | Terminal de cobro |
| Catálogo | Productos, categorías, aditamentos, precios y publicación | Panel de catálogo |
| Inventario y recetas | Ingredientes, recetas, existencias, compras y mermas | Panel de inventario |
| Reportes y gastos | Gastos y proyecciones analíticas de operación | Dashboard |
| Integrador | Contratos, rutas, recepción, entregas y trazabilidad XML | Consola de integración |
| Plataforma comercial | Negocios, sucursales, planes, suscripciones y derechos de uso | Consola interna y portal del cliente |
| Recomendaciones, posterior al MVP | Modelos y proyecciones derivadas | Componentes opcionales en menú |

Cada aplicación de negocio tiene una API o backend propietario y su base de datos, con sus tablas `message_outbox`, `message_inbox`, `message_hospital` y `message_hospital_attempt`. Los frontends estáticos no guardan mensajes ni se conectan al broker: su backend es responsable de estas tablas. Pedidos puede comenzar sin interfaz independiente; sus actividades frontend son los flujos que expone en otras apps.

- Monorepo con compilación, despliegue y rollback independientes por aplicación.
- Frontends con Next.js App Router y TypeScript en todas las aplicaciones, conforme a la decisión de implementación. Backend TypeScript con un framework común, propuesto NestJS. Ratificar versiones y compatibilidad antes de implementar cada servicio.
- PostgreSQL por dominio; Prisma puede mantenerse con un esquema y migraciones por servicio.
- RabbitMQ para transporte AMQP de mensajes XML, con colas separadas por destinatario y procesamiento persistente.
- Socket.IO o SSE entre backend y navegador; API de recuperación al reconectar.
- Procesos permanentes para consumidores, outbox y hospital; no depender de peticiones HTTP ni de una función efímera para ejecutar workers.
- No compartir tablas, credenciales ni escrituras entre servicios. Compartir contratos y utilidades técnicas, sin un ORM global de negocio.
- Un PostgreSQL compartido con bases y usuarios separados es aceptable en desarrollo/piloto, pero conserva un dominio común de fallo. Lo mismo ocurre con contenedores en un único servidor.
- Subdominios y puertas de entrada deben permitir llegar a cada app sin depender del frontend administrativo. Un gateway, DNS, identidad, base de datos o broker compartidos también requieren estrategia de disponibilidad.

### Estructura propuesta, aún sin generar código

```text
apps/           # menu-web, hostess-web, kitchen-web, cashier-web, admin-web,
                # catalog-web, inventory-web, reports-web, integration-web, platform-web
services/       # identity, dining-room, menu, orders, kitchen, billing, catalog,
                # inventory, reporting, integration, platform, recommendations
packages/       # ui, contracts-xml, messaging, observability, configuración técnica
infrastructure/ # desarrollo local, entornos e infraestructura declarativa
tests/          # contratos, integración, recorridos completos y resiliencia
docs/           # decisiones, operación, seguridad y documentación del producto
```

## 4. Integrador y comunicación XML

### Flujo inicial

Para hacer explícito el módulo integrador y su almacenamiento, la primera versión utilizará este recorrido:

```text
Comensal → API Pedidos → [pedido + outbox, misma transacción]
→ publicador → RabbitMQ: entrada del integrador
→ Integrador → [inbox + mensaje XML + entregas/outbox, misma transacción]
→ publicador del integrador → RabbitMQ: colas por destinatario
→ Cocina / Caja / otros → [inbox + cambio local + outbox, misma transacción]
→ notificación a las pantallas
```

El integrador confirma la entrada al broker solamente después de persistirla. Sus publicaciones se confirman por el broker antes de marcarlas como enviadas. Cada destino confirma únicamente después de guardar su resultado o transferir durablemente el fallo a su hospital local.

El integrador puede ejecutar múltiples instancias sin estado local exclusivo. Su base de datos es una dependencia de esta ruta: debe tener backups, recuperación y disponibilidad acordes al producto. Si cae, los mensajes se conservan en las colas y outboxes; la comunicación queda retrasada, aunque las operaciones locales que no necesitan datos nuevos puedan continuar.

Una optimización futura es enrutar ciertos eventos internos directamente mediante el broker y auditar de forma asíncrona. Requiere una decisión documentada y mediciones; no mantener simultáneamente dos rutas para el mismo efecto.

### Contratos

- XML UTF-8 con XSD y ejemplos versionados por tipo de mensaje.
- Sobre: `eventId`, `eventType`, `schemaVersion`, `tenantId`, `branchId`, `source`, `occurredAt`, `correlationId`, `causationId`, `aggregateId` y `aggregateVersion`.
- Identificador estable para reenvíos del mismo evento; un cambio semántico genera un evento nuevo relacionado con el original.
- Separar comandos de eventos: solicitar una cancelación no equivale a confirmar que se canceló.
- Credenciales y permisos determinan los negocios y sucursales permitidos. No confiar únicamente en identificadores escritos en el XML.
- Validación XSD, tamaño máximo, límites de profundidad y entidades externas/DTD deshabilitados.
- Rechazar versiones no soportadas hacia hospital; soportar una ventana explícita de compatibilidad durante despliegues.
- Precios, aditamentos, impuestos, descuentos y moneda como valores acordados al aceptar el pedido; dinero con decimal exacto o unidades monetarias mínimas, nunca flotantes.

### Entrega y consistencia

- Outbox transaccional para no separar el guardado de negocio del evento pendiente.
- Entrega al menos una vez; inbox e idempotencia para efectos únicos. Clave única por negocio, consumidor y `eventId`.
- Colas por consumidor; una cola compartida entre cocina y caja repartiría mensajes en vez de entregar una copia a cada dominio.
- Publisher confirms, mensajes persistentes y confirmación manual del consumidor. Para rutas obligatorias, detectar mensajes no enrutables con `mandatory`/returns y configuración verificada de bindings.
- Versionado por agregado y control de concurrencia. Múltiples consumidores y reintentos pueden alterar el orden: detectar huecos y eventos antiguos, bloquear o reconciliar según contrato.
- Broker aceptó, destinatario persistió y operador atendió son estados diferentes. Emitir `KitchenTicketAccepted` para confirmar recepción de negocio en cocina.
- Reintentos de salida del integrador independientes por destinatario. Un fallo de reportes no debe retrasar cocina.
- Recuperación de pantallas mediante snapshot y cursor/versiones, sin asumir que los sockets conservan todos los eventos.

### Presupuesto inicial de rendimiento

Objetivos de ingeniería a verificar, no SLA publicados:

| Medición en condiciones normales | Objetivo inicial |
| --- | --- |
| Confirmar guardado local de pedido, p95 | ≤ 500 ms |
| Pedido confirmado → persistido y visible en cocina, p95 | ≤ 1 s |
| Mismo recorrido, p99 | ≤ 2 s |
| Operaciones confirmadas perdidas en pruebas de caída de procesos | 0 |
| Efectos duplicados por redelivery en pruebas | 0 |

Medir un perfil de carga declarado: sucursales concurrentes, pedidos/minuto, tamaño XML, destinatarios y acumulación tras una caída. Mantener conexiones abiertas, transacciones cortas y consumidores activos. Proponer sondeo de outbox de 50–200 ms inicialmente y ajustarlo al costo/latencia medidos; una notificación puede despertar el worker, pero la tabla durable y el barrido de recuperación siguen siendo necesarios.

## 5. Hospital de mensajes obligatorio por aplicación

### Regla funcional

Todo mensaje entrante o saliente que falle o no pueda procesarse se registra en `message_hospital` en la base de datos de la aplicación responsable. Esto incluye XML inválido, versión no soportada, rechazo de negocio, error interno, publicación fallida y dependencia no disponible. El registro conserva el mensaje, la causa, los límites y el calendario de reintentos. Los errores permanentes también ingresan, pero quedan bloqueados sin reintento automático hasta corregir la causa.

El hospital es local por aplicación, no una única tabla central. La consola del integrador ofrece una vista agregada mediante APIs/proyecciones; nunca escribe directamente en las bases de otros módulos. El historial central no sustituye el registro local.

### Modelo mínimo `message_hospital`

| Campo | Propósito |
| --- | --- |
| `id` | UUID del registro |
| `tenant_id`, `branch_id` | Aislamiento de negocio/sucursal; nullable solo al no poder identificar un mensaje inválido |
| `event_id`, `correlation_id`, `aggregate_id`, `aggregate_version` | Trazabilidad e idempotencia; nullable cuando el sobre es ilegible |
| `application`, `consumer`, `direction`, `destination` | Responsable, entrada/salida y destino |
| `transport_message_id`, `deduplication_key` | Identificación de transporte y deduplicación estable de fallos |
| `event_type`, `schema_version`, `content_type` | Contrato esperado |
| `payload`, `payload_hash`, `safe_headers` | XML original cifrado, huella y metadatos permitidos; excluir secretos |
| `status` | `pending`, `retrying`, `resolved`, `exhausted`, `blocked`, `discarded` |
| `error_category`, `error_code`, `last_error` | Clasificación y diagnóstico sanitizado |
| `retryable` | Autoriza o bloquea reintentos automáticos |
| `retry_count`, `max_retries` | Reintentos iniciados y máximo autorizado |
| `base_interval_seconds`, `backoff_multiplier`, `max_interval_seconds`, `jitter_percent` | Intervalo base y política de espera |
| `next_retry_at`, `last_retry_at` | Próxima ejecución y último inicio |
| `policy_version` | Política aplicada, capturada al crear el registro |
| `locked_by`, `locked_until`, `lease_token` | Reserva temporal y protección frente a workers obsoletos |
| `first_failed_at`, `updated_at`, `resolved_at` | Ciclo de vida |
| `resolution`, `resolved_by`, `redrive_generation` | Resolución, actor y reapertura autorizada |

`retry_count = 0` significa que falló el intento original y aún no comenzó ningún reintento. `max_retries = 5` permite cinco reintentos adicionales al original, seis ejecuciones como máximo para esa generación. Mostrar ambos conceptos claramente en la interfaz. Los intentos reservados que se interrumpen por caída cuentan de forma conservadora y quedan en el historial como interrumpidos.

Tabla complementaria `message_hospital_attempt`: `id`, `hospital_id`, `generation`, `attempt_number`, `started_at`, `finished_at`, `worker`, `outcome`, `error_code`, `safe_error`, `duration_ms` y `actor`. Índice único por hospital/generación/intento. Conservar auditoría de cambios de política, reenvíos manuales y descartes.

Índices: deduplicación por aplicación/consumidor/dirección/destino/clave estable; búsqueda de pendientes por `status,next_retry_at`; filtros por negocio/sucursal/correlación. Un XML ilegible debe recibir una identidad de ingreso estable antes de registrarlo; no fusionar mensajes legítimos distintos únicamente porque su payload coincide.

### Política inicial propuesta

- Errores transitorios: máximo 5 reintentos; intervalo base de 2 s, multiplicador 2, máximo 60 s y jitter ±20 %. Esperas nominales entre ejecuciones: 2, 4, 8, 16 y 32 s.
- Configuración por aplicación, tipo de mensaje y categoría de error. Documentar excepciones y revisar su efecto en pedidos urgentes.
- XML inválido, credenciales/permisos incorrectos, versión incompatible o rechazo de negocio permanente: `blocked`, sin ciclos automáticos; conservar para diagnóstico y corrección.
- Al agotar el máximo: `exhausted`, alerta y revisión humana; no seguir reintentando ni borrar el registro.
- Un mensaje antiguo puede dejar de ser aplicable. Antes de reintentar, verificar versión, cancelación y vigencia; un pedido cancelado no debe reaparecer en cocina.
- Abrir un circuito ante una dependencia caída y limitar el trabajo para no saturarla ni consumir todos los intentos en una caída prolongada. Mantener calendario y motivo de la pausa visibles.
- La deduplicación de publicaciones de salida se realiza por destinatario. Publicar de nuevo con el mismo `eventId` no debe generar efectos adicionales.

### Algoritmo de procesamiento

1. Recibir y procesar el mensaje en una transacción local; registrar inbox y efectos de negocio juntos. Distinguir inbox recibido de efecto completado: un fallo no puede quedar marcado como procesado.
2. Si falla, revertir esa transacción y guardar/actualizar hospital en otra transacción local. Solo después del commit confirmar la recepción al broker: el hospital asume la responsabilidad durable del mensaje.
3. Si la base está caída o falla el guardado del hospital, NO confirmar ni descartar el mensaje. Conservarlo en el broker, pausar consumo y reconectar con espera; usar una cola de aparcamiento durable si la política del broker lo requiere. Probar límites de redelivery y configuración de dead-lettering para impedir pérdidas accidentales.
4. El worker busca registros vencidos y los reclama de forma atómica, por ejemplo con `FOR UPDATE SKIP LOCKED`, incrementa `retry_count`, crea el intento y asigna lease. Liberar la transacción antes de hacer llamadas remotas.
5. Ejecutar el mismo manejador idempotente; en éxito, confirmar efectos/inbox y resolución local de forma atómica cuando compartan base. En publicaciones salientes, esperar publisher confirm y asumir posible duplicación si se pierde esa confirmación.
6. En fallo transitorio, registrar resultado, recalcular `next_retry_at` y pasar a `pending`; al alcanzar el máximo pasar a `exhausted`. En fallo permanente pasar a `blocked`.
7. Recuperar leases vencidos, registrar intentos interrumpidos y usar el token de lease para impedir que un worker antiguo sobrescriba el estado de otro. La idempotencia y las restricciones de negocio protegen los efectos externos.
8. Los reintentos manuales requieren permiso, motivo y auditoría. Una nueva generación y presupuesto deben autorizarse explícitamente; no reiniciar contadores silenciosamente. Conservar el mismo `eventId` si se repite el mismo efecto.

Una DLQ es una defensa del transporte y no sustituye el hospital. Si un mensaje llega a ella por caída o límite del broker, un proceso de conciliación lo importa al hospital local correspondiente antes de confirmar su traslado. Alertar sobre mensajes aparcados que todavía no pudieron registrarse.

### Operación y pruebas del hospital

- Mostrar fallos por app, negocio, sucursal, antigüedad y estado; intento actual/máximo, última causa y próxima ejecución.
- Acciones: inspección redactada, pausar, reintentar, resolver o descartar con motivo. Descartar un pedido o pago requiere un permiso específico y conciliación de negocio.
- No permitir edición libre del XML de pagos. Las correcciones semánticas se realizan mediante comandos de negocio auditados.
- Retención y purga configurables por categoría, con cifrado y acceso mínimo; no copiar datos de tarjeta, tokens ni credenciales a payloads o logs.
- Probar múltiples workers, caída durante un intento, pérdida de ACK/confirm, deduplicación, máximo, jitter, bloqueo permanente, lease vencido, DB caída y fallo parcial de un destinatario.

## 6. Reglas comerciales y continuidad

- `tenantId` representa el negocio; `branchId`, la sucursal. Separar pertenencia, permisos y contexto activo. Probar aislamiento en APIs, consultas, colas, sockets, archivos y exportaciones.
- Mesa, visita, pedido y cuenta son entidades diferentes. Agrupar mesas no fusiona automáticamente historiales ni pagos.
- Caja conserva cargos y precios localmente. Antes de liquidar exige una cuenta finalizada/versionada y todos sus cargos recibidos; no asumir que una proyección atrasada está completa.
- Si hostess falla, caja puede cobrar una cuenta finalizada y sincronizada; la liberación de mesas queda pendiente. Una cuenta incompleta necesita recuperar datos o un procedimiento manual autorizado.
- Para evitar carreras entre agregar consumos y cobrar, Pedidos cierra la versión comercial y rechaza nuevas partidas sobre esa versión; nuevos consumos requieren reapertura autorizada o nueva cuenta.
- Estados de pago, preparación, visita y entrega independientes. Pagar no implica que el platillo esté servido ni que la mesa esté lista para reasignarse.
- Anticipos, propinas, descuentos, cancelaciones, división de cuentas y reembolsos requieren reglas explícitas y auditoría.
- Idempotencia y control transaccional para cobros concurrentes. Para proveedores externos, conservar una clave estable y conciliar resultados desconocidos antes de repetir un cargo.
- Validar pagos externos desde backend/webhooks verificados. No considerar pagada una cuenta por un evento enviado únicamente desde el navegador.
- No convertir cada solicitud en una cadena síncrona de consultas a todos los módulos; mantener proyecciones locales con versión y frescura visibles.
- Sesiones verificables y autorización por servicio; contemplar validación local de tokens firmados con expiración y política de revocación. Una caída de identidad puede impedir nuevos accesos aunque las sesiones válidas sigan operando según esa política.
- Suscripción comercial y pagos del restaurante a sus comensales son dominios separados. Una falla del proveedor de suscripciones no debe cortar de inmediato una operación en curso; definir período de gracia y restricciones progresivas.
- Aislamiento de módulos no equivale a operación sin Internet. Un modo local/offline necesita un diseño adicional de almacenamiento, conciliación y límites de pago; queda fuera del MVP.

## 7. Backlog por aplicación

Cada actividad es pendiente. Las actividades transversales de la sección 8 son obligatorias para todas las aplicaciones. Prioridades: P0 = base para piloto; P1 = ampliación comercial; P2 = evolución.

### 7.1 Identidad, empleados y administración — P0

**Frontend**

- [ ] Acceso, recuperación de cuenta, sesiones y selector de negocio/sucursal.
- [ ] Gestión de empleados, invitaciones, roles y permisos por módulo/acción.
- [ ] Configuración del negocio, sucursales, horarios, moneda y zona horaria.
- [ ] Mostrar restricciones de permisos y sesiones vencidas sin perder formularios.

**Backend**

- [ ] Modelar usuarios, membresías, empleados, roles, permisos y auditoría.
- [ ] Implementar sesiones verificables, revocación, recuperación y límites de intentos; MFA para cuentas privilegiadas.
- [ ] Autorizar cada operación en servidor; publicar cambios de membresía y permisos mediante outbox.
- [ ] Incorporar inbox/hospital y reintentos para mensajes de negocio y sincronización de derechos.

**Despliegue**

- [ ] Desplegar frontend, API, workers y BD propia; gestionar claves y rotación de firma.
- [ ] Configurar dominios/cookies, TLS, backups, alertas de autenticación y auditoría de accesos.
- [ ] Probar continuidad con sesiones existentes y caída del proveedor de identidad.

### 7.2 Salón / hostess — P0

**Frontend**

- [ ] Plano editable, capacidad, estados, agrupación y separación de mesas.
- [ ] Abrir/cerrar visitas, asignar personal y generar QR de sesión.
- [ ] Mostrar liberaciones pendientes, ocupación y conflictos concurrentes.
- [ ] Incorporar acciones operativas desde otra terminal autorizada cuando hostess no esté disponible.

**Backend**

- [ ] Modelar mesas, áreas, plano, visitas y vínculos temporales de agrupación.
- [ ] Impedir doble ocupación con transacciones y control de versión.
- [ ] Publicar `VisitOpened`, `TablesGrouped`, `VisitClosed`; consumir cierre comercial/pago según política del salón.
- [ ] Aplicar inbox/hospital y no marcar una cuenta como pagada desde el dominio de mesas.

**Despliegue**

- [ ] Desplegar app, API, BD y workers separados; dimensionar conexiones de actualización.
- [ ] Probar caída de hostess sin detener pedidos existentes ni cobros de cuentas sincronizadas.
- [ ] Verificar recuperación de agrupaciones y eventos pendientes antes de reasignar mesas.

### 7.3 Menú digital — P0

**Frontend**

- [ ] Menú por negocio/sucursal, categorías, búsqueda, disponibilidad y detalles.
- [ ] Carrito con aditamentos, notas, importes claros y validación de sesión QR.
- [ ] Confirmación de pedido y estados distinguibles: guardado, pendiente de entrega y aceptado por cocina.
- [ ] Accesibilidad, uso móvil, carga de imágenes y recuperación del carrito.
- [ ] Resumen de cuenta y flujos de pago disponibles por configuración.

**Backend**

- [ ] Mantener proyección local de menú publicado y sesiones del comensal, con inbox/hospital para actualizaciones.
- [ ] Validar QR temporal, alcance de visita y permisos públicos; limitar abuso.
- [ ] Enviar comandos de pedido con clave de idempotencia y consultar resultado ante timeout.
- [ ] No aceptar precios suministrados por el navegador; resolver discrepancias con el precio validado por Pedidos.

**Despliegue**

- [ ] CDN de assets y frontend independiente; API/BD del menú y workers separados.
- [ ] Configurar dominios por negocio si se ofrecen, protección de tráfico y métricas de conversión/latencia.
- [ ] Probar menú legible con recomendaciones caídas y recuperación tras reconexión.

### 7.4 Pedidos — P0

**Frontend**

- [ ] Definir componentes y contratos de estado usados en menú, salón y caja.
- [ ] Flujos de agregar partidas, modificar notas, cancelar y consultar seguimiento con permisos.
- [ ] Mostrar rechazos, cambios de precio y conflictos de versión de forma recuperable.

**Backend**

- [ ] Modelar pedido, partidas, visita, snapshots de producto/precio, impuestos y aditamentos.
- [ ] Mantener catálogo y visitas necesarios como proyecciones locales con política de frescura.
- [ ] Implementar aceptación idempotente, transacciones, estados y control de concurrencia.
- [ ] Emitir `OrderPlaced`, `OrderUpdated`, `OrderCancelled`, `BillFinalized`; consumir aceptación y avances de cocina.
- [ ] Implementar outbox/inbox/hospital y proteger orden causal por pedido.
- [ ] Sacar clima y analítica del camino crítico; usar tiempo del servidor en UTC y zona de sucursal para presentación.

**Despliegue**

- [ ] API y workers persistentes con BD propia, escalado independiente y pool de conexiones limitado.
- [ ] Medir latencia hasta cocina y acumulación de outbox; alertar por pedidos sin aceptación.
- [ ] Probar crash entre commit y publicación, redelivery y carrera entre último consumo y cierre de cuenta.

### 7.5 Cocina — P0

**Frontend**

- [ ] KDS por estación, tiempos, notas, aditamentos, prioridades y avisos.
- [ ] Estados de preparación con confirmación persistida y recuperación de fallos.
- [ ] Indicadores de desconexión, última sincronización y pedidos atrasados.
- [ ] Recuperar snapshot al reconectar sin duplicar tickets ni perder cambios durante la carga.

**Backend**

- [ ] Modelar tickets y partidas de preparación como datos propios.
- [ ] Consumir pedidos/cancelaciones idempotentemente y emitir recepción/avances desde outbox.
- [ ] Persistir antes de anunciar cambios; validar transiciones y versiones.
- [ ] Implementar hospital local, reconciliación de pedidos tardíos y política de cancelaciones ya preparadas.

**Despliegue**

- [ ] Frontend/API/BD/consumidores propios; sesiones de pantalla y sockets autenticados por sucursal.
- [ ] Configurar alertas de cola y tickets no aceptados; evitar que escalado de sockets pierda difusión entre instancias.
- [ ] Probar cocina desconectada, recuperación de backlog y reinicio de pantallas.

### 7.6 Caja y pagos — P0

**Frontend**

- [ ] Buscar cuentas, escanear QR y mostrar partidas/versiones recibidas.
- [ ] Cobro en efectivo y medio electrónico inicial, propinas, cambio y comprobante.
- [ ] División de cuenta, descuentos, cancelaciones y devoluciones según política del MVP.
- [ ] Apertura/cierre de turno, cortes y conciliación; permisos de supervisor.
- [ ] Bloquear liquidación silenciosa de cuentas incompletas y mostrar operaciones pendientes de conciliación.

**Backend**

- [ ] Modelar cargos, cuentas finalizadas, pagos, aplicaciones de pago, devoluciones y cortes con dinero exacto.
- [ ] Consumir eventos de Pedidos y mantener copia local completa para cobro.
- [ ] Evitar doble cobro y sobreaplicación con claves idempotentes y restricciones transaccionales.
- [ ] Verificar webhooks, conciliar estados desconocidos y publicar pago registrado sin escribir en mesas.
- [ ] Implementar hospital de mensajes y reintentos seguros: nunca repetir ciegamente un cargo externo.
- [ ] Conservar comprobantes e historial financiero; definir cierre de día y zona horaria por sucursal.

**Despliegue**

- [ ] Aislar API, BD y secretos de pagos; usar checkout/tokenización del proveedor, sin almacenar datos de tarjeta.
- [ ] Separar sandbox/producción, comprobar webhooks y monitorear conciliaciones e intentos hospitalizados.
- [ ] Probar doble cajero, caída de hostess, proveedor con timeout y restauración de datos financieros.

### 7.7 Catálogo — P0

**Frontend**

- [ ] Productos, categorías, aditamentos, imágenes y disponibilidad por sucursal.
- [ ] Borradores, vista previa y publicación; mostrar cambios pendientes de propagación.
- [ ] Administrar precios y opciones con validación; carga inicial guiada para nuevos clientes.

**Backend**

- [ ] Modelar catálogo versionado, precios y asignación a sucursales.
- [ ] Publicar cambios con outbox; permitir snapshots y reconstrucción de proyecciones en menú/Pedidos.
- [ ] Archivar productos sin destruir historial; separar disponibilidad operativa del borrado.
- [ ] Implementar hospital y validación de importaciones/cambios recibidos.

**Despliegue**

- [ ] Desplegar frontend/API/BD/workers y almacenamiento de imágenes con permisos por negocio.
- [ ] Definir límites de archivo, caché e invalidación; monitorear desfase de publicación.
- [ ] Probar cambio de precio sin alterar cuentas abiertas y caída del catálogo durante operación con proyecciones válidas.

### 7.8 Recetas, inventario y compras — P1

**Frontend**

- [ ] Ingredientes, unidades, recetas y rendimiento por platillo.
- [ ] Existencias, entradas, transferencias, conteos, mermas y ajustes con motivo.
- [ ] Proveedores, compras y recepción; alertas de faltantes y costos.

**Backend**

- [ ] Libro de movimientos de inventario, conversiones de unidades y recetas versionadas.
- [ ] Definir cuándo reservar/descontar ingredientes y cómo compensar cancelaciones/devoluciones.
- [ ] Aplicar consumo idempotente por partida y versión de receta; política explícita de stock negativo.
- [ ] Modelar compras y costos; emitir movimientos y recibir eventos con inbox/hospital.

**Despliegue**

- [ ] BD y workers propios; respaldar movimientos y controlar concurrencia de ajustes.
- [ ] Probar retrasos de mensajes, conciliación de inventario, compensaciones y reconstrucción de saldos.
- [ ] Activar el módulo por cliente sin introducir dependencia síncrona obligatoria en caja.

### 7.9 Reportes y gastos — P0 básico / P1 ampliado

**Frontend**

- [ ] Ventas, cobros, devoluciones, tickets y cortes por rango/sucursal.
- [ ] Captura de gastos y categorías; comparativos e ingresos/gastos ampliados en P1.
- [ ] Mostrar fecha de actualización, definiciones de métricas y exportaciones autorizadas.

**Backend**

- [ ] Proyecciones analíticas idempotentes desde eventos; distinguir venta, cobro e ingreso.
- [ ] Modelar gastos y comprobantes; publicar sus eventos mediante outbox.
- [ ] Implementar hospital, checkpoints, reconciliación y reconstrucción sin duplicar indicadores.
- [ ] Aislar consultas pesadas de bases operativas y definir retención/agregación.

**Despliegue**

- [ ] Recursos y BD separados; limitar exportaciones, trabajos y consumo de memoria.
- [ ] Monitorear retraso analítico y conciliación con caja.
- [ ] Probar que una caída o una consulta pesada de reportes no ralentiza pedidos/cobros.

### 7.10 Integrador y consola de hospitales — P0

**Frontend**

- [ ] Vista de salud por módulo y sucursal; búsqueda por pedido, evento y correlación.
- [ ] Timeline de recepción/enrutamiento/procesamiento y estado por destinatario.
- [ ] Hospitales: filtros, mensaje redactado, error, reintentos usados/máximos, intervalo y próxima ejecución.
- [ ] Reintento, pausa, resolución y descarte con permisos, motivo y auditoría.
- [ ] Mostrar apps no disponibles y antigüedad de la información agregada.

**Backend**

- [ ] Persistir XML de ingreso, inbox y outbox de entregas por destino en una transacción.
- [ ] Implementar contratos/XSD, rutas versionadas, validación y adaptadores necesarios.
- [ ] Implementar biblioteca común de hospital/outbox/inbox con almacenamiento local y migraciones por app.
- [ ] Desarrollar scheduler de hospital, leases, concurrencia, backoff, jitter, máximos y circuitos.
- [ ] Exponer APIs seguras de hospital en cada app y proyección central de estado; no consultar bases ajenas.
- [ ] Distinguir estado de transporte, procesamiento y resultado de negocio; conciliar fallos de DLQ.
- [ ] Aplicar cuotas por negocio, límites de payload y aislamiento de consumidores para evitar vecinos ruidosos.

**Despliegue**

- [ ] Workers de entrada, salida, hospital y agregación escalables de forma independiente.
- [ ] RabbitMQ durable; planificar quorum queues y réplica en dominios de fallo distintos para producción.
- [ ] Configurar bindings, credenciales por app, TLS, límites de redelivery, aparcamiento y políticas de almacenamiento.
- [ ] Alertar por edad del mensaje más antiguo, colas crecientes, `exhausted`, BD caída y fallos por destino.
- [ ] Ensayar broker/DB/worker caídos, restauración y agotamiento de disco; documentar continuidad y recuperación.

### 7.11 Plataforma comercial y suscripciones — P0 mínimo / P1 ampliado

**Frontend**

- [ ] Incorporación guiada: negocio, sucursal, menú, mesas y primer pedido de prueba.
- [ ] Portal de plan/suscripción, límites, facturas comerciales y contacto de soporte.
- [ ] Consola interna de clientes, estado de servicios y acceso de soporte temporal y auditado.
- [ ] Exportación de datos y solicitud de cierre de cuenta con seguimiento.

**Backend**

- [ ] Modelar negocios, sucursales, planes, suscripciones, cuotas y derechos de uso por módulo.
- [ ] Provisionar recursos y datos iniciales idempotentemente; hospitalizar fallos parciales de incorporación.
- [ ] Integrar eventos de suscripción verificados, períodos de gracia y sincronización local de derechos.
- [ ] Separar cobros SaaS de cobros del restaurante; evitar suspensión abrupta de una operación en curso.
- [ ] Definir conservación/exportación/borrado, límites de soporte y auditoría de accesos entre negocios.

**Despliegue**

- [ ] Separar consola interna de interfaces de restaurante; MFA y mínimo privilegio.
- [ ] Medir costo por sucursal, consumo de recursos y margen por plan antes de fijar precios.
- [ ] Preparar entorno demo sin datos reales, piloto y rollout gradual por cliente.

### 7.12 Recomendaciones — P2

**Frontend**

- [ ] Sugerencias opcionales en menú con fallback inmediato y medición de conversión.
- [ ] Configuración por negocio y disponibilidad sin bloquear compra.

**Backend**

- [ ] Consumir historial permitido, generar recomendaciones y versionar modelos.
- [ ] Procesar clima/contexto fuera de aceptar pedidos; timeout, fallback e inbox/hospital local.
- [ ] Definir privacidad, calidad y actualización de datos; no sugerir productos no disponibles.

**Despliegue**

- [ ] Servicio y almacenamiento propios, con recursos limitados y versión reproducible del modelo.
- [ ] Probar apagado total del módulo sin impacto en menú, pedidos, cocina o caja.

## 8. Actividades transversales

### Frontend

- [ ] Sistema visual compartido, accesibilidad, estados de carga/error/desconexión y diseño para tablet/móvil.
- [ ] Identidad visual del negocio sin mezclar sesiones ni información de sucursales.
- [ ] Navegación entre apps sin un shell obligatorio que detenga todas las pantallas.
- [ ] Notificaciones de acciones pendientes y recuperación segura tras reconexión.

### Backend

- [ ] Contratos API y XML, catálogo de eventos, ownership y decisiones arquitectónicas documentados.
- [ ] Tenant/sucursal en autorización y consultas; pruebas negativas de aislamiento.
- [ ] Outbox/inbox/hospital en todas las BD de aplicación; políticas uniformes y excepciones explícitas.
- [ ] Restricciones de integridad, idempotencia, control de concurrencia, UTC y dinero exacto.
- [ ] Auditoría de operaciones sensibles; sanitización y cifrado de datos y diagnósticos.
- [ ] Pruebas de contrato y recorridos de negocio con infraestructura real efímera.

### Despliegue y operación

- [ ] Entornos separados de desarrollo, staging y producción; CI/CD por app y detección de paquetes afectados.
- [ ] Infraestructura declarativa, secretos fuera del repositorio y permisos mínimos por servicio.
- [ ] Migraciones compatibles mediante expandir/migrar/contraer; rollback de aplicación sin exigir revertir datos destructivamente.
- [ ] Checks de salud, readiness, reinicio gradual y cierre ordenado sin confirmar mensajes pendientes.
- [ ] Logs estructurados, métricas y trazas con correlación; no filtrar XML sensible a herramientas externas.
- [ ] Backups cifrados, recuperación a un punto en el tiempo cuando corresponda y ejercicios de restauración.
- [ ] Definir RPO/RTO por dominio y presupuesto; el objetivo de cero pérdidas en crash de proceso no implica cero pérdida ante desastre total.
- [ ] Definir retención de mensajes, disco, cuotas y protección contra saturación. No eliminar pedidos pendientes mediante TTL sin transferencia durable y conciliación.
- [ ] Runbooks de incidentes, responsables, escalamiento y procedimiento de soporte al restaurante.
- [ ] Verificar propiedad/licencias de código y assets; preparar términos, privacidad y compromisos de soporte para los mercados elegidos antes de comercializar.

## 9. Orden de ejecución y puertas de salida

| Etapa | Resultado | Condición para avanzar |
| --- | --- | --- |
| 0. Descubrimiento comercial | Segmento inicial, flujos, alcance MVP y mercados | Validar con negocios piloto: servicio en mesa, mostrador, hardware y medios de pago prioritarios |
| 1. Fundaciones | Monorepo, identidad, aislamiento, CI/CD y contratos | Desplegar dos apps independientemente y probar permisos entre negocios |
| 2. Mensajería y hospitales | Integrador, broker y patrón local en apps mínimas | Superar redelivery, DB caída, máximo de reintentos y recuperación de workers |
| 3. Recorrido vertical | Mesa 10 pide hamburguesa, cocina recibe y caja obtiene el cargo | Cumplir latencia medida sin perder ni duplicar operaciones en fallos inducidos |
| 4. Operación MVP | Catálogo, salón, menú, pedidos, cocina, caja y reportes básicos | Completar turnos, cancelaciones y conciliación con escenarios del piloto |
| 5. Preparación comercial | Incorporación, planes mínimos, soporte y recuperación | Restauración ensayada, monitoreo activo y costos por sucursal medidos |
| 6. Piloto controlado | Uso real con pocos negocios y soporte cercano | Conciliar ventas/pagos diariamente y resolver incidentes críticos antes de ampliar |
| 7. Ampliación | Inventario, compras, gastos y automatización comercial | Añadir módulos sin degradar el circuito de pedidos/cobro |
| 8. Evolución | IA, canales y posible operación local | Priorizar por demanda y rentabilidad demostradas |

Estimar cada etapa después del descubrimiento, indicando equipo, dedicación, dependencias y contingencia. No reutilizar la estimación académica como fecha de lanzamiento de un producto comercial.

## 10. Criterios de aceptación del producto inicial

- [ ] Hostess apagada: caja cobra una cuenta finalizada y sincronizada; liberación de mesa se recupera después.
- [ ] Cocina apagada: pedido queda guardado y pendiente, la UI no informa aceptación inexistente; al volver no se duplica.
- [ ] Broker o integrador caído: outboxes/colas conservan operaciones y la interfaz informa retraso; se recupera el backlog.
- [ ] BD local caída: no se pierde el mensaje por intentar guardarlo en un hospital inaccesible.
- [ ] Mensaje duplicado: una sola partida, ticket, aplicación de cargo o movimiento de inventario.
- [ ] Crash después del commit y antes del ACK: redelivery sin repetir efectos.
- [ ] Hospital cumple máximo, calendario, concurrencia, historial, bloqueo permanente y reapertura auditada.
- [ ] Fallo exclusivo de reportes no retrasa entrega a cocina ni caja.
- [ ] Evento fuera de orden o cancelado se reconcilia sin reactivar un pedido obsoleto.
- [ ] Dos cajeros concurrentes no cobran dos veces; un timeout del proveedor no provoca repetición ciega.
- [ ] Cambiar un precio no modifica el total de partidas ya aceptadas.
- [ ] Reconectar una pantalla recupera snapshot y cambios sin huecos ni duplicados.
- [ ] Un negocio no accede a APIs, colas, archivos, sockets ni hospitales de otro.
- [ ] Desplegar o revertir una app no obliga a detener las demás.
- [ ] Restauración y conciliación de pedidos/pagos ensayadas con RPO/RTO documentados.
- [ ] Latencia, capacidad, costos, manuales y procedimiento de soporte validados antes de prometer un SLA.

## 11. Decisiones por cerrar antes de implementación

1. Segmento inicial: restaurante con mesas, cafetería, comida rápida u otro; no abarcar todos los flujos en el primer piloto.
2. Países de venta, monedas, impuestos, comprobantes y proveedor de pagos inicial.
3. Volumen previsto, infraestructura, presupuesto, RPO/RTO y perfil de disponibilidad.
4. Si inventario limita pedidos o solo informa disponibilidad; reglas de sobreventa y vigencia del catálogo.
5. Política de cuenta finalizada, reapertura, división, propinas y devoluciones.
6. Límites y precios de planes, período de gracia, soporte y horario de atención.
7. Retención de XML, información de comensales, auditoría y eliminación por cliente.
8. Necesidad futura de operación sin Internet, impresión y otros dispositivos.

## 12. Referencias técnicas

- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html): atomicidad entre cambios locales y eventos pendientes.
- [RabbitMQ: confirmaciones](https://www.rabbitmq.com/docs/confirms): distinguir publicación confirmada y procesamiento del consumidor.
- [RabbitMQ: quorum queues](https://www.rabbitmq.com/docs/quorum-queues): colas replicadas y tolerancia a fallos.
- [Socket.IO: garantías de entrega](https://socket.io/docs/v4/delivery-guarantees/): recuperación adicional necesaria para clientes desconectados.
- [PostgreSQL: NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html): señal de activación del worker, complementaria a tablas durables.

Este documento define planificación, actividades y criterios verificables. No crea aún código de aplicaciones, infraestructura ni servicios externos.
