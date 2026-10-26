# Foodlify · Administración

Frontend independiente en Next.js App Router y TypeScript. Corresponde al inicio de la sección 7.1 de `planning.md`.

Desde la raíz del monorepo:

```sh
npm install
npm run dev:admin
```

Abre http://localhost:3004.

## Funcionalidad inicial

- Resumen de empleados activos, invitaciones y sucursales con selector de sucursal.
- Equipo con búsqueda, filtro por estado, edición de perfil, rol y sucursal, suspensión y exportación CSV de la vista filtrada.
- Invitaciones de demostración con validación de correo duplicado y protección del último administrador activo.
- Matriz informativa de roles por módulo.
- Alta y edición de sucursales, dirección, horario descriptivo y estado.
- Configuración de negocio, correo, moneda y zona horaria.
- Historial local de cambios y simulación de sesión vencida que conserva los formularios.
- Aviso de desconexión, diálogos con foco contenido, navegación por teclado y estilos adaptables.

Los datos son ficticios. Los cambios se guardan con esquema versionado en `localStorage`, clave `foodlify.admin.demo.v1`. No hay backend, autenticación, envío de correos ni autorización real. No introducir datos reales. La matriz describe plantillas iniciales por módulo; no implementa permisos por acción. La simulación de sesión vencida no representa una sesión verificada. La actividad es un registro local de demostración. La zona horaria y moneda son preferencias del negocio; su configuración por sucursal queda pendiente. El horario es descriptivo y aún no tiene calendario estructurado.

## Validación

```sh
npm run typecheck --workspace=@foodlify/admin-web
npm run lint --workspace=@foodlify/admin-web
npm run test --workspace=@foodlify/admin-web
npm run build:admin
```

Las pruebas cubren el último administrador, duplicación de correo, asignación de sucursal y recuperación del esquema local. Para reiniciar la demo, elimina únicamente la clave `foodlify.admin.demo.v1` del almacenamiento local del sitio.

## Siguiente implementación

Conectar el servicio de identidad: acceso, recuperación, invitaciones reales, sesiones verificables y revocables, autorización de cada acción por negocio/sucursal y auditoría del servidor. Incorporar selector de negocio basado en membresías, permisos granulares, horarios estructurados y configuración por sucursal. El almacenamiento local actual no es un mecanismo de seguridad ni una fuente de datos de producción.
