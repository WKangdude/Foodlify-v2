# Foodlify · Hostess

Primera implementación del frontend de salón definido en `planning.md`, secciones 7.2 y 8. Next.js App Router, React y TypeScript estricto. Aplicación independiente dentro de los workspaces npm del monorepo.

## Ejecutar

Desde la raíz del repositorio:

```sh
npm install
npm run dev
```

Abrir http://localhost:3000. Se requiere Node.js 22 o superior. Las dependencias están fijadas en el lockfile del monorepo.

```sh
npm run typecheck --workspace=@foodlify/hostess-web
npm run lint --workspace=@foodlify/hostess-web
npm run test --workspace=@foodlify/hostess-web
npm run build --workspace=@foodlify/hostess-web
npm run start --workspace=@foodlify/hostess-web
```

## Flujos disponibles

- Plano y listado de 18 mesas distribuidas en salón principal, terraza y privado.
- Búsqueda de mesas/comensales, filtros por estado y resumen de ocupación.
- Selección de mesa, capacidad, visita, tiempo transcurrido, notas y personal asignado.
- Abrir visitas en una o varias mesas disponibles de la misma área, validando capacidad.
- Reasignar personal, unir mesas y separar una mesa si la capacidad restante es suficiente.
- Solicitar liberación, confirmar verificación manual en caja, cerrar visita, pasar a limpieza y volver a disponible.
- Edición de posiciones mediante controles de dirección con límites y detección de colisiones.
- QR descargable con referencias de demostración de la visita.
- Vistas de visitas, equipo y actividad local reciente (hasta 30 movimientos).
- Persistencia local versionada, validación de datos guardados y actualización entre pestañas.
- Aviso de desconexión y bloqueo de cambios hasta recuperar conexión.
- Diálogos nativos con foco contenido y cierre con Escape, navegación por teclado y diseño adaptable.
- Tipografías locales DM Sans y Manrope; no requiere llamadas a servicios de fuentes.

## Alcance de la demostración

Casa Oliva, el equipo y las visitas iniciales son ficticios. El navegador almacena los datos en `foodlify:hostess:demo:v1`. Para reiniciar, eliminar esa clave del almacenamiento local y recargar. Usar solo datos de prueba.

No hay backend, autenticación, permisos reales, aislamiento entre negocios, eventos XML, hospital, caja ni sincronización entre dispositivos. Las comprobaciones de revisiones detectan cambios locales observados; **no sustituyen transacciones ni control de concurrencia de servidor**. Esta demostración no implementa operación offline ni promete conservar datos ante borrado del navegador. Si localStorage está bloqueado, muestra un aviso y funciona solo en memoria.

El QR codifica JSON de demostración, no un enlace al menú ni una credencial. La integración real deberá generar un token temporal firmado, autorizado por negocio, sucursal y visita desde el backend. Hostess no crea pedidos ni marca cuentas como pagadas.

## Conexión posterior con servicios

`src/lib/dining-room.ts` contiene tipos, datos de muestra y transiciones puras. `src/components/hostess-panel.tsx` conecta la interfaz con este estado local. Sustituir esta adaptación por la API propietaria de Salón, conservando las validaciones de servidor como autoridad:

1. Cargar snapshot autenticado con versión y cursor por sucursal.
2. Enviar comandos con idempotencia y versión esperada; mostrar rechazo y refrescar ante conflicto.
3. Consumir SSE/Socket.IO y recuperar snapshot/cambios al reconectar.
4. Esperar confirmación persistida de visitas y agrupaciones antes de informarlas como guardadas.
5. Consumir autorización de liberación desde el cierre comercial/pago conforme a la política del salón.
6. Generar QR de sesión en servidor y mostrar errores, pendientes y expiración.
7. Implementar operaciones desde terminales autorizadas en el servicio, sin depender de esta pantalla.

## Validación

Siete pruebas de dominio cubren doble ocupación, capacidad, agrupación, separación, liberación/limpieza, colisiones y restauración de datos corruptos. Se verificaron en Chrome los flujos principales, QR, persistencia, vistas, edición, búsqueda, desconexión, actualización entre pestañas y distribución a 390 px sin desbordamiento horizontal.
