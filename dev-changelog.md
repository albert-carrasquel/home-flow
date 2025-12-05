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

**Pendiente:** Definir estructura y campos para el modelo de usuario, incluyendo autenticación y permisos.
