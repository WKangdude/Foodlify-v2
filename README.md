# Foodlify-v2
Foodlify app distributed

## Frontend de cocina

El KDS vive de forma independiente en `apps/kitchen-web` y usa Next.js con TypeScript.

```sh
npm install
npm run dev:kitchen
```

Disponible en http://localhost:3002. Incluye tablero, estaciones, preparación, entregas e historial con datos de demostración guardados en el navegador. No está conectado al backend. Consulta `apps/kitchen-web/README.md` para alcance y verificaciones.

## Frontend de administración

La app administrativa vive en `apps/admin-web`. Iníciala con `npm run dev:admin` y abre http://localhost:3004. Incluye equipo, invitaciones de demostración, roles, sucursales, configuración y actividad con persistencia local. El servicio de identidad y la autenticación real están pendientes. Consulta `apps/admin-web/README.md` para alcance y verificaciones.

## Frontend de caja

La terminal independiente vive en `apps/cashier-web`. Ejecuta `npm run dev:cashier` y abre http://localhost:3003. Incluye cuentas, cobros simulados, abonos parciales, propinas, cambio, comprobantes, movimientos y turnos con persistencia local. No procesa pagos reales ni está conectada al backend. Consulta `apps/cashier-web/README.md` para el alcance y las verificaciones.
