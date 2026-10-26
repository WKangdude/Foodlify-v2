# Menú de comensales

Primera implementación del frontend definido en `planning.md`, sección 7.3. Aplicación Next.js independiente del panel de hostess.

Desde la raíz del monorepo:

```sh
npm install
npm run dev:menu
```

Abrir http://localhost:3001. Hostess mantiene su comando y puerto existentes.

## Incluido

- Catálogo de ejemplo de El Olivo, sucursal Roma Norte; categorías, búsqueda sin distinción de acentos, favoritos y filtro vegetariano.
- Detalles, alérgenos, disponibilidad, extras, notas y cantidades.
- Carrito con importes en centavos y persistencia local, junto con favoritos y cuenta de ejemplo.
- Simulación explícita de pedido: guardado local, pendiente de entrega y aceptación de cocina como estados distintos. No se simula una aceptación inexistente.
- Diseño adaptable, diálogos con foco contenido y cierre por Escape, aviso de desconexión y errores de almacenamiento.

## Integración pendiente

No hay APIs, autenticación ni validación real de QR. La mesa 08 es ilustrativa. La aplicación no envía pedidos, solicita asistencia ni procesa pagos. El catálogo, los precios y la identidad del negocio son datos de demostración. Las fotografías se sirven desde Unsplash y las fuentes desde Google Fonts, con tipografía de respaldo local.

Antes de habilitar pedidos reales: resolver negocio/sucursal/visita desde la sesión QR verificada; reemplazar los datos de ejemplo por el menú publicado; enviar comandos con idempotencia; consultar el resultado después de timeout; validar importes en Pedidos; recuperar snapshots y estados de cocina; aislar la persistencia del carrito por sesión/visita. Los precios de este frontend nunca deben ser la fuente de verdad del backend.

El pago está pendiente de configuración y del servicio de caja. Los avisos de disponibilidad y almacenamiento actuales corresponden solo a este prototipo local.

## Verificación

```sh
npm run typecheck --workspace=@foodlify/menu-web
npm run lint --workspace=@foodlify/menu-web
npm run test --workspace=@foodlify/menu-web
npm run build --workspace=@foodlify/menu-web
```
