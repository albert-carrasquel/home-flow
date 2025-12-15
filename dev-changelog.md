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

**[2025-12-05] Rediseño de la portada y estructura multitarea**
- Se rediseñó la portada de la app: ahora al iniciar sesión solo se muestra la selección de sección (Inversiones, Gastos, Reportes).
- Eliminadas las métricas y el historial de transacciones de la portada y de la sección de inversiones.
- Se agregó estructura multitarea con pestañas para futuras funciones.
- Se preparó el esqueleto para gastos mensuales y reportes.
- Listo para escalar y agregar nuevas funcionalidades.

---

**[2025-12-05] Rediseño de la pestaña de inversiones y mejora del formulario**
- Rediseño de la pestaña de inversiones: header con imagen profesional y diseño moderno.
- Formulario responsive con bordes redondeados, validaciones avanzadas y campo para fecha de la transacción.
- El campo fecha de la transacción se guarda en la base de datos y se valida en el formulario.
- Listo para registrar compras y ventas de activos con toda la información relevante.

---

**[2025-12-15] Preparación para reestructura del formulario de inversiones**
- Estado antes de cambios: la pestaña de inversiones contiene un formulario funcional con validaciones básicas y el campo `fechaTransaccion` ya presente.
- Objetivo inmediato: reordenar campos del formulario y añadir validaciones estrictas por campo (activo solo letras, nombre solo letras, campos numéricos, selects para tipo de activo y exchange).
- Plan: (1) actualizar UI del formulario, (2) reforzar validaciones en `handleAddTransaction`, (3) usar el campo `totalOperacion` como monto oficial registrado según recibo (no calcular automáticamente), (4) documentar los cambios.

---

**[2025-12-15] Reestructura y validaciones del formulario de inversiones (implementado)**
- Se reordenaron los campos del formulario de inversiones en el siguiente orden: Fecha, Activo, Nombre del Activo, Tipo de Activo (select), Cantidad, Precio Unitario, Total (según recibo), Comisión, Exchange (select), Moneda, Notas.
- `Activo` ahora se normaliza a mayúsculas y solo acepta letras (A-Z, 2-10 caracteres).
- `Nombre del Activo` valida que contenga solo letras y espacios (2-50 caracteres).
- `Tipo de Activo` se convirtió en un `select` con opciones: Cripto, Acciones, Cedears, Lecap, Letra, Bono.
- `Exchange` se convirtió en un `select` con opciones: Invertir Online, Binance, BingX, Buenbit.
- Los campos numéricos (`Cantidad`, `Precio Unitario`, `Total (según recibo)`, `Comisión`) validan valores numéricos positivos.
- Se cambió la lógica para que `montoTotal` se registre usando `totalOperacion` (valor indicado en el recibo), en lugar de calcularlo automáticamente a partir de cantidad * precioUnitario.
- Se añadió `fechaTransaccion` al registro en la base de datos (guardada como `Date`) y se muestra preferentemente en el historial.
- Se probaron cambios manualmente (DEV_BYPASS_AUTH habilitado para facilitar pruebas locales).

---

**[2025-12-15] Validación inline por campo y placeholders en selects (implementado)**
- Se reemplazó la validación global por errores inline por campo (`fieldErrors`) y se muestran mensajes específicos debajo de cada input en la UI.
- Los `select` críticos (`tipoActivo`, `exchange`, `moneda`) ahora incluyen una opción placeholder deshabilitada (valor vacío) para forzar al usuario a seleccionar explícitamente una opción.
- La lógica de validación en `handleAddTransaction` fue adaptada para devolver errores por campo y no permitir envío hasta corregirlos.
- Se actualizó la inicialización y el reset del formulario para que los selects empiecen vacíos y obliguen selección manual.
- Pruebas: build de producción ejecutado exitosamente (`vite build`) y pruebas manuales de flujo de alta de transacción realizadas en entorno DEV.

---

**[2025-12-15] Reordenamiento: `moneda` entre `tipoActivo` y `cantidad` (implementado)**
- Se movió el `select` de `moneda` para que aparezca inmediatamente después de `tipoActivo` y antes de `cantidad` en el formulario de inversiones.
- Motivación: disminuir confusión visual al seleccionar la moneda asociada al activo antes de ingresar la cantidad y el precio.
- Validación y sanitización: la lógica existente de validación inline y sanitización se mantiene sin cambios.
- Tests/Validación: se verificó manualmente que el campo aparece en la nueva posición y que `npm run lint` no reporta errores.

---

**[2025-12-15] Bloqueo y sanitización de caracteres inválidos en inputs (implementado)**
- Se implementaron sanitizadores en el frontend para evitar que el usuario pueda escribir o pegar caracteres inválidos en los campos:
  - `activo`: solo letras A–Z, siempre en mayúsculas, longitud máxima 10.
  - `nombreActivo`: solo letras y espacios (acentos soportados), máximo 50 caracteres.
  - `cantidad`, `precioUnitario`: permiten solo números y punto decimal, sanitización al escribir y al pegar (hasta 8 decimales por defecto).
  - `totalOperacion`: permite solo números y punto decimal, máximo 2 decimales (valor oficial según recibo).
  - `comision`: números y punto decimal, hasta 4 decimales.
- Manejo robusto de entrada: sanitización en `onChange`, control de `onPaste` para evitar pegar texto inválido, y soporte para IME (entrada por composición) para no interferir con usuarios que usan teclados complejos.
- Se añadieron ayudas de accesibilidad/UX: `inputMode="decimal"` en inputs numéricos y placeholders descriptivos.
- La validación al enviar (`handleAddTransaction`) se mantiene como capa de seguridad adicional.

---

**[2025-12-15] Limpieza de código y extracción de utilidades (implementado)**
- Se creó `src/utils/formatters.js` con utilidades reutilizables: `formatCurrency`, `sanitizeDecimal`, `sanitizeActivo`, `sanitizeNombre`.
- Se eliminó código duplicado en `src/App.jsx` y se importa ahora desde `src/utils/formatters.js` (reducción de tamaño del componente y mejor reutilización).
- Se removieron logs de depuración transitorios (p. ej. `console.log` del path de Firestore), y se ajustaron llamadas a `setState` dentro de efectos para evitar advertencias de React (actualizaciones diferidas cuando procede).
- Se corrigieron múltiples advertencias de ESLint y se dejó `npm run lint` sin errores.

---

**[2025-12-15] Refactor: extracción de componentes (implementado)**
- Se extrajeron componentes UI a archivos separados para facilitar pruebas y mantenimiento:
  - `src/components/ConfirmationModal.jsx` (modal de confirmación de borrado)
  - `src/components/MetricCard.jsx` (tarjeta de métrica)
  - `src/components/TransactionItem.jsx` (elemento de la lista de transacciones)
- `ConfirmationModal` ahora se importa y se usa en `src/App.jsx`; los demás componentes quedan disponibles para reutilización futura y testing.

- Nota: `MetricCard` y `TransactionItem` fueron extraídos y quedan disponibles para uso/PRs futuros; no todos estaban activos en la UI actual pero su extracción simplifica añadir pruebas unitarias y reusar en futuras vistas.



---

**Pendiente:** Definir estructura y campos para el modelo de usuario, incluyendo autenticación y permisos.
