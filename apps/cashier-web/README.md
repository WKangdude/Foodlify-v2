# Foodlify · Caja

Frontend independiente con Next.js App Router, React y TypeScript, basado en la sección 7.6 de `planning.md` y en la identidad visual de las apps existentes.

Desde la raíz del monorepo:

```sh
npm install
npm run dev:cashier
```

Abre http://localhost:3003. Para producción local: `npm run build:cashier` y `npm run start --workspace=@foodlify/cashier-web`.

## Alcance de esta primera entrega

- Cuentas por mesa o para llevar; búsqueda por folio, mesa o mesero, filtros por estado y área, vista de lista/cuadrícula.
- Detalle de partidas, precios acordados, notas, versión, pagos aplicados y saldo pendiente.
- Cobro **simulado** en efectivo o tarjeta, propina opcional, cambio y división por importe mediante abonos parciales.
- Confirmación de cobro, historial y comprobante descargable en texto, sin validez fiscal.
- Apertura de turno, fondo inicial, efectivo esperado incluyendo propinas, corte con diferencia y archivo de cortes.
- Cuentas incompletas o aún en consumo bloqueadas; conciliación con recepción simulada explícita. El corte definitivo se bloquea mientras existan cuentas por conciliar.
- Persistencia versionada en `localStorage`, validación de datos recuperados, aviso de cambios en otra pestaña y bloqueo ante desconexión o fallo de almacenamiento.
- Interfaz adaptable y diálogos nativos con Escape, foco y navegación por teclado.

Los importes se almacenan en centavos enteros. Cada pago tiene una clave estable y verifica la versión de la cuenta. Esto ayuda a probar el flujo local; **no constituye control transaccional ni garantiza exclusión entre cajeros**. La autorización, idempotencia durable y concurrencia deben implementarse en la API de Caja.

La demo arranca con un turno abierto, siete cuentas abiertas y un pago de ejemplo. Los cambios se guardan solamente en este navegador bajo `foodlify:cashier:demo:v1`. No usa los datos locales de otras apps ni modifica las mesas del salón. El estado inicial es ficticio y no representa un turno real de la fecha actual.

## Pendiente de integración

API y autenticación con permisos por negocio/sucursal, autorización real de supervisor, proveedor de pagos y conciliación de estados desconocidos, recepción de versiones desde Pedidos, QR con cámara, descuentos, cancelaciones, devoluciones y división por productos/personas. No se almacenan datos de tarjetas. La tarjeta es una simulación, sin terminal ni cargo externo. No se implementa cobro offline.

La recepción simulada solo marca el escenario ficticio como completo; no debe sustituir la verificación de snapshot/versiones en el backend. Las cuentas en consumo no se pueden finalizar desde Caja.

## Verificaciones

```sh
npm run typecheck --workspace=@foodlify/cashier-web
npm run lint --workspace=@foodlify/cashier-web
npm run test --workspace=@foodlify/cashier-web
npm run build:cashier
```

Las pruebas cubren dinero exacto, abonos, efectivo, idempotencia, versiones obsoletas, sobrecobros, cuentas incompletas, turnos y datos locales corruptos.
