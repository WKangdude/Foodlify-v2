# Cocina · Foodlify

Frontend independiente del KDS descrito en `planning.md` (sección 7.5), construido con Next.js App Router, React y TypeScript.

Desde la raíz del monorepo:

```sh
npm install
npm run dev:kitchen
```

Abre http://localhost:3002. El comando `npm run dev` existente conserva la aplicación de hostess.

## Incluido

- Tablero de pedidos por preparar, en preparación y listos para servir.
- Transiciones de pedido, marcado de platillos e historial de entregas.
- Búsqueda por pedido, mesa y platillo; filtros por estación y atraso; orden por antigüedad.
- Notas, aditamentos, alergias, prioridad, comensales y responsable.
- Contadores y tiempos desde recepción; umbral de atraso configurable durante la sesión.
- Pedidos de prueba, sonido opcional, pantalla completa y ayuda.
- Diseño adaptable: tres columnas en escritorio y tablero con desplazamiento horizontal en pantallas pequeñas.
- Diálogos accesibles con cierre mediante Escape y navegación por teclado.
- Persistencia versionada en localStorage, validación al recuperar y avisos de fallos de almacenamiento o conexión del navegador.

## Alcance de la demostración

No incluye API, autenticación, negocio/sucursal reales, confirmación persistida en servidor, sockets, recuperación por cursor ni sincronización entre dispositivos o pestañas. El indicador de red representa la conexión del navegador, no la salud de un backend. Los pedidos se guardan únicamente en este navegador y sus tiempos siguen contando al recargar. No usar con pedidos reales.

Las estaciones filtran tickets que contengan al menos un platillo de esa estación. Se conserva visible el pedido completo y las acciones avanzan el ticket completo. Los platillos se marcan individualmente durante la preparación; marcar listo confirma que todo el pedido está preparado.

La tipografía DM Sans se solicita a Google Fonts; hay fuentes de sistema de respaldo si no hay red.

## Verificación

```sh
npm run lint --workspace=@foodlify/kitchen-web
npm run typecheck --workspace=@foodlify/kitchen-web
npm run test --workspace=@foodlify/kitchen-web
npm run build:kitchen
```

Las pruebas cubren las transiciones, el umbral de atraso y la recuperación/rechazo de sesiones guardadas. Al conectar el backend, sustituir las mutaciones locales por comandos idempotentes confirmados y recuperar snapshot/versiones antes de anunciar avances, como exige `planning.md`.
