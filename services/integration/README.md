# Integrador Foodlify

Primera versión del backend de integración. Usa NestJS/Express, TypeScript, PostgreSQL y RabbitMQ. Todavía no incluye consola visual ni conecta los frontends de demostración existentes.

## Funcionalidad incluida

- Recepción de XML por HTTP o por una cola RabbitMQ.
- Credenciales de servicio acotadas a un negocio, sucursal, origen y rol. HMAC para mensajes entrantes del broker.
- Validación real del sobre mediante XSD, límites de tamaño/profundidad y bloqueo de DTD/entidades externas.
- Registro atómico de recepción, inbox y outbox por destinatario, con idempotencia tanto por evento como por ID de transporte.
- Payload cifrado en PostgreSQL con AES-256-GCM. Las APIs del hospital no exponen el XML, las credenciales ni el ciphertext.
- Publicación persistente con confirmación y detección de mensajes no enrutables.
- Hospital local, historial de intentos, máximo de reintentos, backoff, jitter, leases, recuperación de intentos interrumpidos y redrive auditado.
- Estado de entregas, consulta de hospitales, liveness y readiness.
- Migración versionada, Dockerfile, Compose local, datos XML de ejemplo y pruebas.

## Arranque local

Requisitos: Node.js 24 LTS recomendado, npm y Docker con Compose. Los comandos siguientes parten de la raíz del monorepo.

```sh
npm install
npm run setup:local --workspace=@foodlify/integration
docker compose -f services/integration/compose.yaml --env-file services/integration/.env up -d postgres rabbitmq
npm run migrate:integration
npm run dev:integration
```

`setup:local` genera contraseñas y claves aleatorias en `services/integration/.env`, con permisos de archivo restringidos. Se niega a sobrescribir un archivo existente. Guardar el archivo de forma segura: perder `PAYLOAD_KEY` impide recuperar los mensajes cifrados. `.env` está ignorado por Git y excluido del contexto Docker.

Puertos locales:

| Recurso | Dirección |
| --- | --- |
| API | `http://127.0.0.1:3010` |
| PostgreSQL | `127.0.0.1:5433` |
| AMQP | `127.0.0.1:5673` |
| Administración RabbitMQ | `http://127.0.0.1:15673` |

Las credenciales generadas para el ejemplo corresponden a `tenantId=demo`, `branchId=main` y `source=orders`. El token de operador es diferente al del productor. No se imprimen en consola.

### Servicio completo en Docker

```sh
docker compose -f services/integration/compose.yaml --env-file services/integration/.env up -d postgres rabbitmq
docker compose -f services/integration/compose.yaml --env-file services/integration/.env run --rm migrate
docker compose -f services/integration/compose.yaml --env-file services/integration/.env up -d --build integration
```

El archivo `Dockerfile.dockerignore` junto al Dockerfile filtra el contexto del monorepo. La imagen compila únicamente el integrador y ejecuta como usuario sin privilegios. Las migraciones son un paso explícito: no se ejecutan automáticamente en cada réplica de la API.

Para detener conservando mensajes y datos:

```sh
docker compose -f services/integration/compose.yaml --env-file services/integration/.env down
```

No eliminar volúmenes para resolver fallos de procesamiento: contienen PostgreSQL y las colas persistentes.

## Enviar el primer pedido

Con el integrador activo:

```sh
npm run send:http --workspace=@foodlify/integration
npm run send:broker --workspace=@foodlify/integration
```

Ambos usan `contracts/order-placed.xml`: mesa 10 pide una hamburguesa. El primer envío crea entregas para `kitchen` y `billing`. Repetir el ejemplo devuelve un duplicado sin generar nuevos tickets; para un pedido nuevo cambiar `eventId`, `aggregateId` y los datos correspondientes.

El ejemplo publicado por broker requiere que el integrador haya creado la cola de entrada. Su confirmación solo acredita aceptación del broker; consultar el estado del evento para ver el avance del integrador.

No hay consumidores de cocina/caja implementados aquí: las entregas permanecen en sus colas. No se deben confirmar desde un consumidor de prueba si se quieren conservar para los futuros servicios.

## API v1

Todos los endpoints `/v1` requieren `Authorization: Bearer <token>`. Los ejemplos usan nombres de campos de la API; sus mensajes de diagnóstico son códigos estables.

| Método | Ruta | Rol y comportamiento |
| --- | --- | --- |
| GET | `/health/live` | Público, proceso activo |
| GET | `/health/ready` | Público, BD/esquema accesibles y broker conectado; 503 en caso contrario |
| POST | `/v1/messages` | Productor; `Content-Type: application/xml`, XML UTF-8 y `Idempotency-Key` obligatorios |
| GET | `/v1/messages/:eventId` | Productor u operador; solo su negocio/sucursal |
| GET | `/v1/hospital?status=blocked` | Operador; hasta 100 registros recientes de su negocio/sucursal |
| GET | `/v1/hospital/:id` | Operador; metadatos e historial de intentos |
| POST | `/v1/hospital/:id/retry` | Operador; JSON `{"reason":"Contrato corregido"}`, sobre `blocked` o `exhausted` |

Resultados de recepción:

- `202 accepted`: inbox y todas las entregas quedaron guardados; la publicación es asíncrona.
- `202 duplicate`: el mismo evento ya estaba guardado.
- `202 hospital`: fallo transitorio guardado y pendiente de reintento; no equivale a pedido procesado.
- `422 hospital`: mensaje inválido o error permanente guardado con `hospitalId`.
- `409`: reutilización conflictiva de evento o clave de transporte; fallo conservado en hospital.
- `503 NOT_PERSISTED`: no se pudo conservar la responsabilidad; reenviar con la misma clave y el mismo XML.
- `401/403/413/415`: solicitud rechazada en el borde; no fue admitida como mensaje durable y no crea registro hospital. Esto evita almacenar cargas anónimas o ilimitadas. El productor debe conservar su outbox ante rechazos y corregir la causa.

`published` significa confirmación del broker. **No significa que cocina preparó o aceptó el pedido.** Esa confirmación corresponde al futuro consumidor y a un evento `KitchenTicketAccepted`.

La deduplicación compara el XML exacto, no una normalización: reutilizar un `eventId` cambiando espacios o atributos produce conflicto. Conservar el payload original en la outbox del productor.

## Contrato y rutas

El esquema `contracts/event-v1.xsd` valida el sobre común: identificadores, namespace, versión, fecha con zona horaria, origen y agregado/versiones. Acepta exactamente un elemento dentro de `Payload`.

**El contenido de negocio dentro de Payload es opaco en esta entrega.** Los futuros servicios deben validar sus propios contratos de partidas, dinero, cancelaciones y pagos antes de aplicar efectos. El integrador no calcula importes, no ordena estados comerciales ni decide liberar mesas. Conserva `aggregateId`/`aggregateVersion` para los controles del destinatario; todavía no implementa una secuencia global de eventos.

Las rutas iniciales están versionadas en código, en `src/domain.ts`:

| Origen | Evento | Destinatarios |
| --- | --- | --- |
| orders | OrderPlaced, OrderUpdated, OrderCancelled | kitchen, billing |
| orders | BillFinalized | billing |
| kitchen | KitchenTicketAccepted, KitchenStatusChanged | orders |
| billing | PaymentRecorded | dining-room, reporting |
| dining-room | VisitOpened, VisitClosed | orders, menu |
| catalog | CatalogPublished | orders, menu |

Publicar otro tipo u origen se conserva como `blocked`. Agregar una ruta exige contrato y pruebas; no se admiten destinos arbitrarios suministrados en el XML.

### Transporte RabbitMQ

- Entrada: `foodlify.integration.inbound`.
- Salida: `foodlify.<destination>.inbound`, una cola durable por servicio destinatario.
- Productor: `messageId` estable, `headers.producerId` y `headers.signature`.
- Firma: HMAC-SHA256 del texto `messageId + "\n" + xml`, usando el token del productor, en hexadecimal. `scripts/send-broker.ts` muestra la implementación.
- Salida del integrador: XML original, `messageId` estable por entrega, `headers.eventId`, `persistent=true`, `mandatory=true` y publisher confirm.
- La confianza de salida depende de permisos del broker: solo el integrador debe poder escribir en colas de destinatarios. El Compose comparte un usuario solo para desarrollo; antes de producción crear usuarios/vhost/permisos por servicio.
- Entradas sin firma válida van al hospital `quarantine/quarantine`, sin confiar en los IDs del XML. Su inspección requiere una credencial de operador expresamente acotada a ese espacio, ausente del ejemplo por defecto.

El límite local del broker es 128 KiB por mensaje. Los mensajes inválidos admitidos en la cola se conservan cifrados antes del ACK. Si la BD falla se cierra la conexión y quedan sin confirmar para redelivery, con reconexión cada 5 s.

## Hospital y calendario

Tablas: `message_hospital`, `message_hospital_attempt` e `integration_audit`. Se suman a `integration_receipt`, `message_inbox`, `message_outbox` y el registro de migración.

Política inicial capturada en cada registro:

```text
max_retries = 5
base_interval_seconds = 2
backoff_multiplier = 2
max_interval_seconds = 60
jitter_percent = 20
esperas nominales: 2, 4, 8, 16, 32 segundos
```

`retry_count=0` indica que falló el intento original y no empezó ningún reintento. El máximo permite cinco reintentos adicionales; no seis reintentos.

- Error permanente → `blocked`, sin ejecución automática.
- Error transitorio → `pending`, con `next_retry_at`.
- Reserva → `retrying`, lease de 30 s y número de intento incrementado.
- Éxito → `resolved`; en salida la entrega pasa a `published`.
- Último fallo → `exhausted`, sin borrar historial ni continuar automáticamente.
- Caída del worker → intento `interrupted`; cuenta dentro del presupuesto y se recupera la reserva vencida.
- Redrive manual → nueva generación, contador reiniciado de forma explícita y auditoría del actor/motivo. No edita el XML ni borra intentos anteriores.

Las reservas usan `FOR UPDATE SKIP LOCKED`. La finalización verifica el token para impedir que un worker obsoleto sobrescriba otro intento. Los destinatarios también necesitan inbox y efectos idempotentes: perder una confirmación puede provocar una publicación repetida.

Mientras el broker está desconectado se pausan reintentos salientes sin consumir presupuesto. Las primeras publicaciones que fallen sí ingresan al hospital. Este es un circuito básico por disponibilidad, no un circuito completo por cada dependencia.

## Pruebas

```sh
npm run typecheck --workspace=@foodlify/integration
npm run test:integration
npm run build:integration
```

Por defecto se usa PostgreSQL embebido con PGlite para ejecutar SQL real, más un adaptador de transporte controlado para simular confirmaciones, returns y desconexiones. Las pruebas HTTP levantan una API efímera en localhost.

Para ejecutar la misma suite contra PostgreSQL de servidor, proporcionar una base **exclusiva de pruebas**:

```sh
TEST_DATABASE_URL=postgresql://usuario:password@127.0.0.1:5433/integration_test npm run test:integration
```

Cada archivo crea y elimina su propio esquema temporal; el usuario de pruebas necesita permiso para crear esquemas. Esto comprueba migraciones, transacciones concurrentes y reservas en conexiones separadas. No ejecutar contra producción.

El broker de las pruebas automatizadas es simulado. La validación completa de RabbitMQ real, persistencia tras reinicio, contenedores y latencia bajo carga requiere el entorno Compose; no se considera realizada únicamente por pasar la suite.

## Límites y próximos pasos

Esta entrega es una base ejecutable de desarrollo. Antes de comercializar:

1. Conectar servicios de pedidos/cocina/caja con sus propias BD, inbox, outbox y hospital; los mocks frontend siguen independientes.
2. Crear consola de integración en Next.js usando las APIs de metadatos, con autenticación de personas y permisos; no exponer tokens de servicio al navegador.
3. Incorporar XSD de negocio, política de vigencia y reconciliación de versiones en destinatarios.
4. Configurar TLS, broker por servicio, colas quorum replicadas y aparcamiento/dead-lettering durable; el Compose actual usa colas classic de un nodo sin límite de redelivery para no descartar entrada silenciosamente.
5. Añadir cuotas/rate limiting, paginación del hospital, métricas/alertas, circuitos por destino y acciones de pausa/descarte con conciliación. Esas acciones todavía no tienen endpoints.
6. Versionar y rotar claves de cifrado, establecer retención, backups, recuperación y acceso de soporte auditado.
7. Probar RabbitMQ real y medir p95/p99, throughput, recuperación de backlog y fallos de nodos. El worker procesa lotes acotados de ocho entregas y un reintento por ciclo de 100 ms; esos límites aún no están dimensionados para producción.
8. Externalizar políticas de reintento/rutas si la operación lo requiere. Actualmente se definen en código y se capturan por registro, sin endpoint de edición.

## Decisiones técnicas

### Esquema privado en Supabase Foodlify

El proyecto conectado es `otapwfryrvzadqeryfuw`. La migración de Supabase está en `supabase/migrations/20261026031134_integration_backend.sql`. Crea siete tablas en el esquema `integration`, independientes de los hospitales del menú en `public`:

- `integration_receipt`: deduplicación de solicitudes de transporte.
- `message_inbox`: XML aceptados y metadatos de evento.
- `message_outbox`: entregas por destinatario y reservas de publicación.
- `message_hospital`: fallos, presupuesto y calendario de reintentos.
- `message_hospital_attempt`: historial de ejecuciones.
- `integration_audit`: motivos y actores de reenvíos manuales.
- `integration_migration`: versión del esquema del servicio.

Todas tienen RLS habilitado y no conceden acceso a `anon`, `authenticated` ni `service_role`. No se registró el esquema en la Data API y no se crearon roles o políticas de acceso nuevos. La conexión administrativa utilizada para desplegar las tablas no es una credencial disponible para ejecutar la aplicación.

Para conectar el proceso del integrador, configurar de forma privada en su entorno:

```dotenv
DATABASE_URL=CONEXION_POSTGRESQL_DEL_BACKEND_OBTENIDA_EN_SUPABASE_CONNECT
DATABASE_SCHEMA=integration
```

`DATABASE_URL` debe ser una conexión PostgreSQL con TLS y una identidad de backend autorizada; la URL HTTPS del proyecto y las claves de la Data API no sustituyen esa conexión. Nunca usar una variable `NEXT_PUBLIC_` para estas credenciales. El aprovisionamiento del login y sus permisos es un paso administrativo separado, pendiente de autorización.

El cliente aplica `SET LOCAL search_path` dentro de cada transacción para apuntar a `integration` sin dejar configuración de sesión en conexiones reutilizadas. Si `DATABASE_SCHEMA` está vacío, se conserva el comportamiento local original. No se cambió el `.env` local para fingir una conexión remota sin credenciales.

La migración remota también registra la versión 1 del esquema del servicio: no es necesario volver a ejecutar la migración inicial del servicio con un usuario de aplicación limitado. Los futuros cambios de Supabase deben tener nuevas migraciones versionadas.

La prueba completa de la migración Supabase requiere un clúster PostgreSQL desechable y vacío, porque crea roles de prueba que imitan a Supabase. Se activa expresamente con `RUN_SUPABASE_MIGRATION_TEST=1`, junto con `TEST_DATABASE_URL`; no activarla en el proyecto remoto ni en un servidor compartido. Las demás pruebas PostgreSQL usan esquemas temporales aislados como se describe arriba.

### Implementación del servicio

- Se usa SQL explícito parametrizado en este servicio para controlar transacciones, reservas y fencing. No se introduce un esquema Prisma compartido entre aplicaciones.
- NestJS compone la aplicación HTTP con el adaptador Express; el núcleo de mensajes y workers es independiente del framework para poder probar las reglas sin un servidor completo.
- El integrador persiste cada entrada antes de enrutar, conforme al planning. Su BD es una dependencia de la entrega: ante caída conserva pendientes en broker/orígenes y no promete comunicación inmediata.
- Se fija un override de `multer >=2.5.0` en el monorepo para sustituir la dependencia vulnerable de la versión inicial de NestJS. No se habilita carga de archivos en este servicio.

Referencias: [RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms), [transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html), [libxml2-wasm](https://github.com/jameslan/libxml2-wasm).
