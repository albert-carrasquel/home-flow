# 🗺️ HomeFlow - Roadmap de Mejoras

Documento de seguimiento para implementación de mejoras prioritarias en HomeFlow.

---

## 🚀 **MEJORAS CRÍTICAS (Alta Prioridad)**

### ✅ 1. Dashboard / Vista General ⭐⭐⭐⭐⭐
**Estado**: ✅ COMPLETADO
**Problema**: Al entrar, el usuario no ve su situación financiera actual.
**Solución**: Agregar una vista principal con:
- [x] Total invertido (todas las inversiones activas)
- [x] P&L total de cartera
- [x] Balance cashflow del mes actual
- [x] Top 5 activos con mejor/peor rendimiento
- [x] Top 5 categorías de gastos del mes
- [x] Botones de acceso rápido a secciones
- [x] Posiciones abiertas (contador)
**Fecha inicio**: 2025-12-17 14:45
**Fecha fin**: 2025-12-17 15:10
**Implementación**:
- Nuevo estado `dashboardData` y `dashboardLoading`
- useEffect que calcula métricas en tiempo real
- UI con métricas de inversiones (5 cards)
- UI con métricas de cashflow del mes (3 cards)
- Layout de 2 columnas con Top 5 activos y Top 5 categorías
- Acciones rápidas para navegar a otras secciones
- Tab por defecto cambiado a 'dashboard' 

---

### ✅ 2. Posiciones Abiertas / Portfolio Actual ⭐⭐⭐⭐⭐
**Estado**: ✅ COMPLETADO
**Problema**: No hay vista de "¿Qué tengo ahora?"
**Solución**: Pantalla de Portfolio que muestre:
- [x] Por cada activo: cantidad actual, precio promedio de compra, moneda
- [x] Tabla completa con posiciones abiertas
- [x] Agrupación por tipo de activo (Cripto, Acciones, Cedears)
- [x] Diversificación en % del portfolio por tipo
- [x] Diversificación en % del portfolio por moneda
- [x] Métricas: Total invertido, total posiciones, activos únicos
- [x] Integración con engine FIFO existente
**Fecha inicio**: 2025-12-17 16:00
**Fecha fin**: 2025-12-17 16:30
**Implementación**:
- Nuevos estados `portfolioData` y `portfolioLoading`
- useEffect que usa `calculateInvestmentReport().posicionesAbiertas`
- Cálculos de diversificación por tipo y moneda
- UI con 3 metric cards de resumen
- Layout de 2 columnas con gráficos de diversificación
- Tabla completa de posiciones con detalles
- Botón en Dashboard y navegación integrada

---

### ❌ 3. Integración de Precios en Tiempo Real ⭐⭐⭐⭐
**Estado**: ❌ CANCELADO
**Decisión**: Eliminada la feature completa por complejidad innecesaria
**Problema original**: No había forma de saber el valor actual de las inversiones.
**Por qué se canceló**:
- APIs externas con problemas de CORS (Rava, Alpha Vantage)
- Proxies CORS también fallaban
- Rate limits restrictivos
- Datos en tiempo real NO son necesarios para la gestión de inversiones
- HomeFlow es una herramienta de **registro contable**, no trading en vivo
**Nueva filosofía**:
- El P&L se calcula SOLO cuando hay una venta (P&L realizado)
- Portfolio muestra posiciones abiertas sin precios actuales
- Focus en matemáticas simples: compra vs venta
- Sin dependencias externas = mayor confiabilidad
**Fecha cancelación**: 2025-12-18 15:30
**Cambios implementados**:
- [x] Eliminado `priceService.js` completo (~400 líneas)
- [x] Eliminados estados de precios en `App.jsx`
- [x] Simplificada tabla Portfolio: 7 columnas (antes 11)
- [x] Eliminadas columnas: Precio Actual, Valor Actual, P&L No Realizado, P&L %
- [x] Eliminadas métricas: Valor Actual Total, P&L No Realizado Total
- [x] Mantenidas: Total Invertido, Total Posiciones, Activos Únicos
**Beneficios de la cancelación**:
- ✅ Código más simple y mantenible
- ✅ Sin dependencias de APIs externas
- ✅ Sin problemas de CORS
- ✅ Carga instantánea (sin llamadas HTTP)
- ✅ Focus en datos reales y confiables

---

### ✅ 4. Gráficos y Visualizaciones ⭐⭐⭐⭐
**Estado**: ✅ COMPLETADO
**Problema**: Solo tablas, difícil entender tendencias.
**Solución**: Implementación con `recharts`:
- [x] Portfolio: Gráficos de torta para diversificación (por tipo y por moneda)
- [x] Dashboard: Gráfico de barras del cashflow mensual (últimos 12 meses)
- [x] Reportes Inversiones: Gráfico de barras del P&L por activo
**Fecha inicio**: 2025-12-18 16:15
**Fecha fin**: 2025-12-18 16:45
**Implementación**:
- Instalación de librería: `recharts` (156 packages)
- Componentes utilizados: PieChart, BarChart, ResponsiveContainer, Tooltip, Legend
- Portfolio: 2 gráficos de torta (tipo y moneda) con datos ya calculados
- Dashboard: Gráfico de barras con datos mensuales calculados (últimos 12 meses)
  - Nuevo cálculo: `monthlyTrend` en dashboardData
  - Muestra ingresos (verde) vs gastos (rojo) mes a mes
- Reportes: Gráfico de barras con P&L por activo (top 10)
- Paleta de colores: #10b981 (verde), #3b82f6 (azul), #f59e0b (naranja), #ef4444 (rojo), #8b5cf6 (morado)
**Decisión de Stack**: Recharts (más React-friendly, componentes declarativos)

---

### ✅ 5. Exportación de Datos ⭐⭐⭐⭐
**Estado**: ✅ COMPLETADO
**Problema**: Para impuestos/contabilidad necesitas los datos fuera.
**Solución**: Exportación a Excel con múltiples hojas
- [x] Botón "Exportar a Excel" en reportes (inversiones y cashflow)
- [x] Incluir: resumen ejecutivo, detalle de trades, cálculos FIFO
- [x] Librería: `xlsx` (genera archivos .xlsx profesionales)
**Fecha inicio**: 2025-12-18 17:00
**Fecha fin**: 2025-12-18 17:30
**Implementación**:
- Instalación de librería: `xlsx` (9 packages)
- Funciones de exportación:
  - `exportInvestmentsToExcel()`: 3 hojas (Resumen, Análisis FIFO, Detalle Transacciones)
  - `exportCashflowToExcel()`: 2 hojas (Resumen, Detalle Movimientos)
- Botón en UI: Aparece en sección Métricas después de generar reporte
- Formato Excel incluye:
  - Filtros aplicados documentados
  - Métricas principales
  - Análisis FIFO completo (solo inversiones)
  - Detalle de todas las transacciones con todos los campos
- Nombre de archivo: `HomeFlow_[Tipo]_YYYY-MM-DD.xlsx`

---

## 📊 **MEJORAS IMPORTANTES (Media Prioridad)**

### 6. Importador de Transacciones desde IOL ⭐⭐⭐⭐
**Estado**: ⏳ PENDIENTE (Removido temporalmente - 2026-01-05)
**Problema**: Carga manual de transacciones históricas es muy tedioso (100+ operaciones).
**Solución Propuesta**: Importador automático desde archivo Excel de IOL
- [ ] Parser de archivos XLS/XLSX de IOL (formato HTML table)
- [ ] Mapeo automático de columnas IOL → HomeFlow
- [ ] Detección inteligente de tipo de activo
- [ ] UI con preview editable antes de importar
- [ ] Batch insert con progress bar
- [ ] Manejo de errores por transacción
**Nota**: Feature removida temporalmente por problemas de parsing. Se reintegrará en el futuro con testing más robusto.

### 7. Filtros Avanzados en Portfolio
**Estado**: ⏳ PENDIENTE
- [ ] Por rango de fechas de compra
- [ ] Por rentabilidad (mostrar solo ganadores/perdedores)
- [ ] Por exchange

### 8. Alertas y Notificaciones
**Estado**: ⏳ PENDIENTE
- [ ] Recordatorio de dividendos/cupones
- [ ] Alertas de precio (si activo sube/baja X%)
- [ ] Resumen mensual automático

### 9. Análisis por Período Fiscal
**Estado**: ⏳ PENDIENTE
- [ ] Vista anual para declaración de impuestos
- [ ] Separación de ganancias de capital vs dividendos
- [ ] Cálculo automático de impuestos (configurable por país)

### 10. Búsqueda y Filtrado Rápido
**Estado**: ⏳ PENDIENTE
- [ ] Barra de búsqueda global (por activo, descripción, monto)
- [ ] Filtros persistentes (guardar búsquedas favoritas)

### ✅ 11. Checklist de Gastos Mensuales ⭐⭐⭐⭐⭐
**Estado**: ✅ COMPLETADO (2026-01-06)
**Commit base**: `2ceb75f` (fix: permitir números en símbolos y nombres de activos)
**Commit final**: `e8c1845` (feat: agregar botón Modificar y sincronización con últimos registros)
**Problema**: Gastos recurrentes mensuales requieren carga manual repetitiva cada mes.
**Solución**: Lista de templates hardcodeados con checklist mensual + historial
- [x] Templates hardcodeados (7 gastos comunes)
- [x] UI en tab Gastos/Ingresos con lista mensual
- [x] Sistema de registro rápido (monto + click)
- [x] Items se tachan al completar
- [x] Botón "Modificar" para corregir montos erróneos
- [x] Sincronización con "Últimos 5 registros"
- [x] Reset automático al cambiar de mes
- [x] Estado compartido entre usuarios (Albert y Haydee)
- [x] Restricción: un gasto solo una vez por mes
- [x] Historial colapsable de meses anteriores con detección de faltantes
**Fecha inicio**: 2026-01-06 (tarde)
**Fecha fin**: 2026-01-06 (tarde)
**Implementación**:
- Collection Firestore: `monthly-checklist-{YYYY-MM}/{templateId}`
- Templates: Alquiler, Luz, Gas, Agua, Internet, Expensas, Celular
- Estados: `monthlyChecklist`, `checklistLoading`, `currentMonth`, `monthlyExpenseAmounts`, `editingChecklistItem`, `checklistHistory`, `showHistory`
- useEffect: Detecta cambio de mes cada minuto y resetea automáticamente
- UI Mes actual: Lista con items pendientes/completados
- UI Historial: Sección colapsable con últimos 3 meses
  - Detecta pagos faltantes automáticamente
  - Permite pagar atrasados con botón "Pagar ahora"
  - Badge con contador de pendientes totales
- Handlers:
  - `handleRegisterMonthlyExpense`: Registra gasto del mes actual
  - `handleEditMonthlyExpense`: Activa modo edición
  - `handleUpdateMonthlyExpense`: Actualiza monto en cashflow y checklist
  - `handlePayOverdue`: Registra pago atrasado de mes anterior
- Validación: monto > 0, no permite duplicados en el mismo mes

---

## 🔧 **MEJORAS TÉCNICAS (Media-Baja Prioridad)**

### 12. Performance y Escalabilidad
**Estado**: ⏳ PENDIENTE
- [ ] Paginación en reportes (si tienes >1000 transacciones)
- [ ] Índices compuestos en Firestore para queries frecuentes
- [ ] Lazy loading de datos históricos

### 13. Modo Offline
**Estado**: ⏳ PENDIENTE
- [ ] Service Worker para PWA
- [ ] Guardar datos localmente con IndexedDB
- [ ] Sincronizar cuando vuelve conexión

### 14. Seguridad Mejorada
**Estado**: ⏳ PENDIENTE
- [ ] Audit log completo (quién modificó qué y cuándo)
- [ ] Backup automático mensual
- [ ] Encriptación de datos sensibles

### 15. Testing
**Estado**: ⏳ PENDIENTE
- [ ] Tests unitarios del engine FIFO (`reporting.js`)
- [ ] Tests de integración para flows críticos
- [ ] Tests E2E con Playwright/Cypress

---

## 💡 **FEATURES AVANZADAS (Baja Prioridad - "Nice to Have")**

### 15. Comparación de Performance
**Estado**: ⏳ PENDIENTE
- [ ] Benchmark contra índices (S&P500, MERVAL, Bitcoin)
- [ ] Calculadora de "¿Qué hubiera pasado si...?"

### 16. Gestión de Múltiples Carteras
**Estado**: ⏳ PENDIENTE
- [ ] Separar portfolio personal vs inversión de largo plazo
- [ ] Vista consolidada y por cartera individual

### 17. Integración Bancaria
**Estado**: ⏳ PENDIENTE
- [ ] Importar movimientos desde CSV de bancos
- [ ] Parsers para extractos comunes (Santander, Galicia, etc.)

### 18. Análisis de Riesgo
**Estado**: ⏳ PENDIENTE
- [ ] Volatilidad del portfolio
- [ ] Sharpe Ratio, Max Drawdown
- [ ] Correlación entre activos

### 19. Modo Multi-Usuario Mejorado
**Estado**: ⏳ PENDIENTE
- [ ] Permisos granulares (admin, viewer, editor)
- [ ] Vista familiar consolidada
- [ ] Chat/comentarios en transacciones

### 20. Integraciones con Exchanges
**Estado**: ⏳ PENDIENTE
- [ ] Importar trades automáticamente desde Binance API
- [ ] Sincronización en tiempo real

---

## 🎨 **DETALLES DE UX (Mejoras Menores)**

- [ ] Breadcrumbs (Home > Reportes > Inversiones)
- [ ] Loading states mejores (Skeletons en vez de spinners)
- [ ] Confirmaciones más claras (Modal con resumen)
- [ ] Feedback visual (Animaciones suaves)
- [ ] Modo oscuro completo consistente
- [ ] Shortcuts de teclado (Ctrl+K búsqueda, Esc cerrar)
- [ ] Tooltips explicativos (sobre "P&L", "FIFO", etc.)

---

## 📈 **MÉTRICAS DE ÉXITO**

- [x] Tiempo de carga inicial < 2 segundos
- [x] 100% de features críticas implementadas (5/5: Dashboard, Portfolio, Gráficos, Exportación)
- [ ] 0 errores en consola de producción
- [ ] Cobertura de tests > 70%
- [ ] Lighthouse score > 90

---

## 📝 **NOTAS Y DECISIONES**

### Decisión de Stack para Gráficos
- **Opción 1**: Recharts (más React-friendly, componentes declarativos) ✅ ELEGIDO
- **Opción 2**: Chart.js (más ligero, más control)
- **Decisión**: Recharts implementado en Feature 4 - perfecto para casos de uso de HomeFlow

### Rollback de Importador IOL (2026-01-05)
- **Razón**: Problemas de parsing y estabilidad en producción
- **Decisión**: Feature removida temporalmente para estabilizar la aplicación
- **Estado**: Aplicación funcional con entrada manual de transacciones
- **Plan futuro**: Reintegrar con testing más robusto y validación exhaustiva

---

**Última actualización**: 2026-01-05
**Próxima revisión**: Después de estabilizar entrada manual de transacciones
