# dev-changelog.md

Este archivo registra todos los cambios realizados en la etapa de desarrollo inicial. No se sube al repositorio (agregado en .gitignore).

---

**[2025-12-05] Creación del archivo de seguimiento de cambios**
- Se crea `dev-changelog.md` para registrar cada ajuste relevante.
- Se acordó registrar fecha, descripción, archivos afectados y estado anterior/nuevo si aplica.
- Se agregará a `.gitignore`.

---

**[2025-12-05] Validación de campos requeridos para modelo de transacción de trading**
- Se acuerda usar nombres de campos en español.
- El campo `usuarioId` se guarda automáticamente según el usuario autenticado, no se ingresa manualmente.
- Campos mínimos recomendados por registro:
  - id: string (generado por Firestore)
  - usuarioId: string (id del usuario autenticado)
  - fecha: Timestamp (fecha y hora de la operación)
  - activo: string (ejemplo: 'BTC', 'INTC', 'AAPL')
  - nombreActivo: string (opcional, nombre descriptivo)
  - tipoActivo: string (opcional, 'cripto', 'acción', 'cedear', etc.)
  - cantidad: number (cantidad de activos)
  - precioUnitario: number (precio por unidad)
  - montoTotal: number (cantidad * precioUnitario)
  - moneda: string (ejemplo: 'USD', 'ARS')
  - tipoOperacion: 'compra' | 'venta'
  - comision: number (opcional)
  - monedaComision: string (opcional)
  - exchange: string (opcional)
  - notas: string (opcional)
- Se recomienda agregar índices en Firestore para consultas por usuario, activo y fecha.
- Si se requiere trazabilidad avanzada (P&L, ventas parciales), considerar campos adicionales para vincular compras y ventas.

---

**[2025-12-05] Checkpoint antes de cambios de autenticación y modelo de datos**
- Estado actual:
  - Proyecto funcional con registro de transacciones básicas (tipo, monto, nombre, usuarioId, fecha).
  - Autenticación anónima activa.
  - No hay restricción de acceso por usuario/super admin.
  - Modelo de transacción aún no incluye campos avanzados (activo, cantidad, precio unitario, etc.).
  - Archivo `dev-changelog.md` creado y registrado en `.gitignore`.
  - Validación de campos requeridos completada y registrada.
- Próximos cambios:
  1. Implementar autenticación privada (solo 2 super admins).
  2. Actualizar reglas de Firestore para restringir acceso.
  3. Ampliar modelo de transacción con campos en español.
  4. Actualizar UI para nuevos campos y validaciones.

---

**[2025-12-05] Inicio de implementación de autenticación privada y modelo de usuario**
- Se define la estructura del modelo de usuario:
  - usuarioId: string (UID de Firebase)
  - email: string
  - nombre: string (opcional)
  - esSuperAdmin: boolean
- Se acuerda que solo los UIDs de los super admins podrán acceder y operar en la app.
- Se preparará una constante en el frontend con los UIDs permitidos.
- Se actualizará la lógica de autenticación para email/password (o custom token) y validación de super admin.
- Se propondrá la regla de Firestore para restringir acceso solo a los UIDs permitidos.
- Próximo paso: modificar App.jsx para implementar la autenticación privada y validación de super admin.

---

**[2025-12-05] Implementación de validación de super admin y restricción de acceso**
- Se agrega la constante `SUPER_ADMINS` con los UIDs permitidos en App.jsx.
- Se valida el UID del usuario autenticado y solo permite acceso si está en la lista de super admins.
- Si el usuario no es super admin, se muestra mensaje de acceso denegado y no se permite operar.
- Próximo paso: actualizar reglas de Firestore para restringir acceso solo a los UIDs permitidos.

---

**[2025-12-05] Checkpoint tras integración de login y eliminación de autenticación anónima**
- Se elimina la autenticación anónima y custom token.
- Se integra el formulario de login con email/contraseña y Google (pendiente de habilitar en Firebase).
- El formulario de login se muestra correctamente si no hay usuario autenticado.
- Próximo cambio: mostrar nombre de usuario en vez de UID en la UI principal.

---

**[2025-12-05] Ampliación del modelo de transacción y actualización de la UI**
- Se amplía el modelo de transacción para incluir los campos: activo, nombreActivo, tipoActivo, cantidad, precioUnitario, montoTotal, moneda, tipoOperacion, comision, monedaComision, exchange, notas.
- Se actualiza el formulario de nueva transacción para capturar todos los campos definidos.
- Se valida y guarda la transacción con los nuevos datos.
- Próximo paso: mostrar los nuevos campos en el historial de transacciones y métricas.

---

**[2025-12-05] Inicio de implementación de consultas avanzadas**
- Se inicia la implementación de consultas por fecha, por activo, por usuario y consultas generales.
- Próximos pasos: agregar filtros en la UI y lógica para realizar las consultas en Firestore.
- Pendiente: validación de campos y mejoras de diseño tras consultas.
---

**[2025-12-05] Mejora de consultas y normalización de usuario/token**
- Se asignan nombres personalizados a los usuarios según su UID.
- En los filtros de consulta, el campo usuario es ahora un combo box para seleccionar entre los dos usuarios o ambos.
- El filtro de token (activo) es un combo box con los tokens registrados, normalizados a mayúsculas.
- Se actualiza la UI y la lógica para mostrar el nombre en vez del email y para normalizar los tokens.
---

**[2025-12-05] Mejora de reporte de operaciones y moneda por defecto**
- El reporte de cada transacción ahora muestra el tipo de operación (compra o venta).
- Se cambia la moneda por defecto de USD a ARS en el formulario y en la visualización.
- Se mantiene la opción de cambiar la moneda en cada operación.
---

**Pendiente:** Definir estructura y campos para el modelo de usuario, incluyendo autenticación y permisos.
