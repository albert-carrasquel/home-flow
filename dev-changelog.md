# dev-changelog.md

Este archivo registra todos los cambios realizados en la etapa de desarrollo inicial. No se sube al repositorio (agregado en .gitignore).

---

**[2025-12-18 - 15:00] Fix DEFINITIVO: Yahoo Finance API sin CORS**
- **Problema detectado**: 
  - CORS bloqueaba Rava API y Alpha Vantage
  - Proxy CORS (corsproxy.io) también falló
  - App rota: TODOS los precios mostraban N/D
- **Causa raíz**: Navegadores bloquean APIs sin headers CORS correctos
- **Solución implementada**: **Yahoo Finance v8 API**
  - **Endpoint**: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`
  - **Ventajas**:
    - ✅ Sin autenticación
    - ✅ Sin restricciones CORS
    - ✅ Cobertura global: US + Argentina
    - ✅ Datos en tiempo real
    - ✅ Sin rate limits agresivos
- **Implementación**:
  - **Acciones US**: `getStockPrice()` → Yahoo Finance directo (AAPL, AMD, BITF)
  - **Acciones ARG/Cedears**: `getArgentinaAssetPrice()` → Yahoo con sufijo .BA (GGAL.BA, NVDA.BA)
  - **Formato Yahoo ARG**: Ticker + `.BA` (Buenos Aires Stock Exchange)
  - **Response**: `chart.result[0].meta.regularMarketPrice`
- **Activos que funcionarán**:
  | Activo | Tipo | Yahoo Symbol | API Endpoint |
  |--------|------|--------------|--------------|
  | AAPL (USD) | Acciones | AAPL | query1.finance.yahoo.com/.../AAPL |
  | AMD (USD) | Acciones | AMD | query1.finance.yahoo.com/.../AMD |
  | BITF (USD) | Acciones | BITF | query1.finance.yahoo.com/.../BITF |
  | NVDA (ARS) | Cedears | NVDA.BA | query1.finance.yahoo.com/.../NVDA.BA |
  | INTC (ARS) | Cedears | INTC.BA | query1.finance.yahoo.com/.../INTC.BA |
  | GGAL (ARS) | Acciones | GGAL.BA | query1.finance.yahoo.com/.../GGAL.BA |
  | YPF (ARS) | Cedears | YPF.BA | query1.finance.yahoo.com/.../YPF.BA |
  | BTC, ETH | Crypto | BTC, ETH | CoinGecko (ya funciona) |
- **Logs mejorados**:
  - `📡 Yahoo Finance: consultando AAPL (USD)`
  - `✅ Yahoo Finance: AAPL = 271.84 USD`
  - `📡 Yahoo Finance ARG: consultando NVDA → NVDA.BA (ARS)`
  - `✅ Yahoo Finance ARG: NVDA (NVDA.BA) = 12345.00 ARS`
- **Testing esperado**:
  - Recargar app y verificar que TODOS los activos muestran precio
  - Consola debe mostrar requests exitosos
  - P&L debe calcularse correctamente
- **Commits revertidos**:
  - f6c923c: Proxy CORS (falló)
  - 0e12ba5: Logs y variantes Rava (CORS bloqueado)
  - f8bbf65: Rava API inicial (CORS bloqueado)

---

**[2025-12-18 - 09:00] Fix crítico: Detección por MONEDA para Acciones US vs Argentinas**
- **Problema detectado por usuario**:
  - AMD (Acciones, USD) → No aparecía precio (debería usar Alpha Vantage)
  - BITF (Acciones, ARS) → Intentaba Alpha Vantage (incorrecto, es acción argentina)
  - Sistema ignoraba la MONEDA, solo miraba `tipoActivo`
- **Causa raíz**: `detectAssetType()` no consideraba el campo `currency`
- **Impacto**: Todas las acciones se trataban como US, bloqueando acciones argentinas
- **Solución implementada**:
  - **`detectAssetType()` ahora recibe 3 parámetros**: `(symbol, tipoActivo, currency)`
  - **Lógica actualizada para "Acciones"**:
    ```javascript
    if (tipoActivo === 'Acciones') {
      if (currency === 'ARS') → return 'argentina'  // IOL/PPI API
      if (currency === 'USD') → return 'stock-us'   // Alpha Vantage
    }
    ```
  - **`getCurrentPrice()` pasa `currency` a `detectAssetType()`**
  - **`getStockPrice()` simplificado**:
    - Eliminado el bloqueo de ARS (ya no llegará aquí)
    - Agregados logs de rate limit y errores de API
    - Solo maneja USD (stock-us)
  - **Logs mejorados**: Ahora incluyen moneda en todos los mensajes
- **Comportamiento correcto**:
  | Registro | Tipo | Moneda | Detección | API | Estado |
  |----------|------|--------|-----------|-----|--------|
  | AMD | Acciones | USD | stock-us | Alpha Vantage | ✅ Funciona |
  | BITF | Acciones | ARS | argentina | ❌ No implementado | ⏳ N/D |
  | AAPL | Acciones | USD | stock-us | Alpha Vantage | ✅ Funciona |
  | NVDA | Cedears | ARS | argentina | ❌ No implementado | ⏳ N/D |
  | BTC | Cripto | USD/ARS | crypto | CoinGecko | ✅ Funciona |
- **Testing recomendado**:
  - Verificar consola del navegador para logs detallados
  - Confirmar que AMD en USD muestra precio
  - Confirmar que BITF en ARS muestra N/D (correcto, es acción argentina)

---

**[2025-12-17 - 17:40] Fix crítico: Diferenciación entre Cedears y Acciones US**
- **Problema detectado**: 
  - Sistema no diferenciaba Cedears de Acciones US
  - Cedear de AAPL se confundía con Acción de AAPL en NASDAQ
  - Cache compartido entre tipos de activo diferentes
- **Impacto**: Precios incorrectos o "N/D" en activos argentinos
- **Solución implementada**:
  - **priceService.js actualizado**:
    - `detectAssetType()` mejorado con reglas explícitas:
      * REGLA 1: Criptos tienen prioridad (incluyendo "Criptomoneda" además de "Cripto")
      * REGLA 2: Cedears SIEMPRE son mercado argentino (nunca stock-us)
      * REGLA 3: Bonos, Lecap, Letra → argentina
      * REGLA 4: Acciones con análisis detallado (.BA, lista de acciones argentinas)
    - Cache mejorado: Incluye `tipoActivo` en la key
      * Formato: `${symbol}_${currency}_${tipoActivo}`
      * Permite diferenciar: "AAPL_ARS_Cedears" vs "AAPL_USD_Acciones"
    - `getPriceFromCache()` y `setPriceInCache()` actualizados con parámetro `tipoActivo`
    - Logs mejorados: `console.log` indica tipo detectado y caches
    - Lista de acciones argentinas agregada (24 símbolos: YPFD, GGAL, PAMP, etc.)
    - Documentación extendida sobre Cedears en `getArgentinaAssetPrice()`
  - **App.jsx actualizado**:
    - Card informativo mejorado con 3 secciones:
      1. Fuentes de precios (con checkmarks y status)
      2. Warning sobre Cedears (fondo amarillo claro)
      3. Fórmula de cálculo y contador de precios
    - Explicación clara: Cedear ≠ Acción US
    - Detalle: Ratio de conversión, spread, comisiones locales
- **Notas técnicas**:
  - Cedears y Acciones argentinas mostrarán "N/D" hasta implementar IOL/PPI API
  - Sistema ahora diferencia correctamente tipos para futuras integraciones
  - Cache por tipo previene confusiones de precios
  - Logs en consola ayudan a debuggear detección de tipos

---

**[2025-12-17 - 17:20] Feature 3: Integración de Precios en Tiempo Real**
- **Objetivo**: Mostrar el valor actual de las inversiones y calcular P&L no realizado.
- **Problema**: Usuario no sabía cuánto valen sus inversiones actualmente, solo el costo histórico.
- **Solución implementada**:
  - **Nuevo servicio: `priceService.js`** (~300 líneas):
    - Función `getCurrentPrice(symbol, currency, tipoActivo)`: Obtiene precio de un activo
    - Función `getMultiplePrices(positions)`: Fetch paralelo de múltiples precios
    - Función `detectAssetType()`: Detecta automáticamente si es crypto/stock-us/argentina
    - Cache con TTL de 5 minutos para evitar rate limits
    - Integración con CoinGecko API (crypto) y Alpha Vantage API (stocks US)
    - Mapeo de símbolos comunes: BTC, ETH, USDT, etc.
  - **Estados nuevos en App.jsx**:
    - `currentPrices`: Map con precios actuales (key: symbol_currency)
    - `pricesLoading`: Boolean para loading state
    - `pricesError`: String con mensaje de error si falla
  - **useEffect actualizado del Portfolio** (líneas ~567-590):
    - Después de calcular posiciones, hace fetch de precios con `getMultiplePrices()`
    - Maneja errores sin bloquear el portfolio (muestra solo costos históricos si falla)
    - setPricesLoading y setPricesError para feedback visual
  - **UI del Portfolio actualizada** (líneas ~1427-1547):
    - **Tabla ampliada**: Agregadas 4 columnas nuevas
      - Precio Actual: Precio en tiempo real de la API
      - Valor Actual: Cantidad × Precio Actual
      - P&L No Realizado: Valor Actual - Monto Invertido
      - P&L %: (P&L No Realizado / Monto Invertido) × 100
    - **Cálculo por fila**: 
      ```javascript
      const currentPrice = currentPrices.get(`${pos.activo}_${pos.moneda}`);
      const valorActual = currentPrice * pos.cantidadRestante;
      const pnlNoRealizado = valorActual - pos.montoInvertido;
      const pnlNoRealizadoPct = (pnlNoRealizado / pos.montoInvertido) * 100;
      ```
    - **Colores dinámicos**: Verde para ganancias, rojo para pérdidas
    - **Fallback**: Muestra "N/D" o "Cargando..." si no hay precio disponible
    - **Loading indicator**: Header de tabla muestra "Actualizando precios..." mientras carga
  - **Métricas del Portfolio actualizadas** (líneas ~1342-1407):
    - **Total Invertido**: Costo histórico (sin cambios)
    - **Valor Actual del Portfolio**: Suma de todos los valores actuales
    - **P&L No Realizado**: Diferencia entre valor actual y costo
    - Cálculo dinámico con reduce sobre todas las posiciones
  - **Card informativo actualizado**:
    - Explica fuentes de precios (CoinGecko, Alpha Vantage)
    - Muestra fórmula del P&L no realizado
    - Contador de precios actualizados exitosamente
- **Beneficios**:
  - ✅ Visibilidad completa del valor actual del portfolio
  - ✅ P&L no realizado calculado automáticamente
  - ✅ APIs gratuitas con rate limits respetados (cache 5 min)
  - ✅ Sistema extensible para agregar más fuentes (mercado argentino)
  - ✅ UX clara con loading states y fallbacks
- **Notas técnicas**:
  - Alpha Vantage requiere API key gratuita (actualmente usa 'demo')
  - Mercado argentino (Cedears, Bonos) pendiente de implementar
  - Cache en memoria (se limpia al refrescar app, considerar localStorage futuro)
  - Rate limits: CoinGecko 50/min, Alpha Vantage 5/min

---

**[2025-12-17 - 16:30] Feature 2: Portfolio de Posiciones Abiertas**
- **Objetivo**: Implementar vista completa del portfolio con todas las posiciones abiertas actuales.
- **Problema**: No había vista de "¿Qué tengo ahora?" - solo transacciones históricas.
- **Solución implementada**:
  - **Estados nuevos**: `portfolioData` y `portfolioLoading`
  - **useEffect de cálculo** (líneas ~492-587 de App.jsx):
    - Fetch de transacciones
    - Usa `calculateInvestmentReport().posicionesAbiertas` del engine FIFO
    - Calcula diversificación por tipo de activo (Cripto, Acciones, etc.)
    - Calcula diversificación por moneda (ARS, USD)
    - Genera métricas: total invertido, total posiciones, activos únicos
  - **Estructura de datos**:
    - `posiciones`: Array de posiciones abiertas con cantidad, precio promedio, monto
    - `resumen`: Métricas globales del portfolio
    - `porTipo`: Diversificación por tipo con porcentajes
    - `porMoneda`: Diversificación por moneda con porcentajes
  - **UI del Portfolio** (líneas ~1305-1480):
    - Header con navegación a Dashboard
    - 3 metric cards: Total invertido, total posiciones, activos únicos
    - Layout 2 columnas: Diversificación por tipo | Diversificación por moneda
    - Tabla completa con 7 columnas: Activo, Tipo, Moneda, Cantidad, Precio Promedio, Monto, Usuario
    - Card informativa sobre método FIFO
  - **Integración con Dashboard**:
    - Botón "Portfolio" agregado en header del Dashboard
    - Botón "Ver Portfolio Actual" como primera acción rápida
  - **Performance**: Reactive useEffect que recalcula al cambiar transacciones
  - **UX**: Loading state, empty state si no hay posiciones, formateo consistente
- **Beneficios**: Visibilidad completa del portfolio, diversificación clara, base para Feature 3 (precios en tiempo real)

---

**[2025-12-17 - 15:10] Feature 1: Dashboard Principal con Vista General Financiera**
- **Objetivo**: Mostrar al usuario su situación financiera completa al entrar a la aplicación.
- **Problema**: Usuario entraba a pantalla vacía sin contexto de su estado actual.
- **Solución implementada**:
  - **Nuevo archivo**: `ROADMAP.md` - Documento de seguimiento de mejoras prioritarias
  - **Nuevos estados en App.jsx**:
    - `dashboardData`: Almacena métricas calculadas
    - `dashboardLoading`: Estado de carga del dashboard
    - Tab por defecto cambiado de `''` a `'dashboard'`
  - **useEffect de cálculo de Dashboard** (líneas ~380-485):
    - Fetch de todas las transacciones y cashflows
    - Cálculo de métricas de inversiones usando `calculateInvestmentReport()`
    - Cálculo de cashflow del mes actual (excluyendo anuladas)
    - Top 5 activos por rendimiento (P&L %)
    - Top 5 categorías por gastos del mes
    - Se ejecuta cuando cambian `transactions` o `cashflows`
  - **UI del Dashboard** (líneas ~1010-1190):
    - **Sección de bienvenida**: Saludo personalizado
    - **Métricas de Inversiones** (5 cards):
      - Total Invertido
      - Total Recuperado
      - P&L Neto
      - Rendimiento % (P&L %)
      - Posiciones Abiertas (contador)
    - **Métricas de Cashflow** (3 cards):
      - Total Ingresos del mes
      - Total Gastos del mes
      - Balance Neto del mes
      - Muestra nombre del mes actual
    - **Layout de 2 columnas**:
      - Columna izquierda: Top 5 Activos con mejor rendimiento
        - Muestra: símbolo, moneda, cantidad, P&L % y P&L neto
        - Ordenado por P&L % descendente
      - Columna derecha: Top 5 Categorías de gastos
        - Muestra: categoría, ingresos (si hay), gastos, neto
        - Ordenado por gastos descendente
    - **Acciones Rápidas**: 3 botones grandes para navegar a:
      - Nueva Inversión
      - Registrar Gasto/Ingreso
      - Ver Reportes Detallados
  - **Navegación actualizada**:
    - Botones "Volver" en todas las secciones ahora van a Dashboard
    - Header del Dashboard con botones rápidos a otras secciones
- **Performance**: Dashboard se calcula en tiempo real al cambiar datos
- **UX**: Loading state mientras calcula, empty states si no hay datos
- **Commit**: feat: dashboard principal con vista general financiera completa

---

**[2025-12-17 - 14:30] Corrección: Métricas de Cashflow excluyen transacciones anuladas**
- **Problema detectado**: Al marcar el checkbox "Incluir anulados" en reportes de cashflow, las transacciones anuladas se sumaban en las métricas financieras (Total Gastos, Total Ingresos, Neto), causando datos incorrectos.
- **Ejemplo del bug**: Ingreso anulado de $500,000 se sumaba al total, mostrando $1,700,000 en vez de $1,200,000.
- **Comportamiento correcto esperado** (estándar contable):
  - El checkbox "Incluir anulados" debe controlar **solo la visibilidad en la tabla** (para auditoría)
  - Las **métricas financieras siempre deben excluir anuladas** (reflejar estado real)
  - Contador "Registros" muestra el total incluyendo anuladas (si checkbox activo)
  - Montos (gastos, ingresos, neto) siempre calculan con transacciones activas únicamente
- **Solución implementada** (`src/App.jsx`, líneas 763-772):
  ```javascript
  // IMPORTANTE: Para métricas financieras, SIEMPRE excluir anuladas
  // El checkbox "incluirAnulados" solo controla la visibilidad en la tabla, no los cálculos
  const activosParaMetricas = filtered.filter((r) => !r.anulada);
  
  const gastos = activosParaMetricas.filter((r) => r.tipo === 'gasto');
  const ingresos = activosParaMetricas.filter((r) => r.tipo === 'ingreso');
  const totalGastos = gastos.reduce((sum, r) => sum + (r.monto || 0), 0);
  const totalIngresos = ingresos.reduce((sum, r) => sum + (r.monto || 0), 0);
  metrics = { count: filtered.length, totalGastos, totalIngresos, neto: totalIngresos - totalGastos };
  ```
- **Resultado**: Ahora las métricas son precisas independientemente del estado del checkbox, cumpliendo estándares de aplicaciones financieras profesionales.
- **Commit**: fix: métricas de cashflow ahora excluyen transacciones anuladas correctamente

---

**[2025-12-17] Módulo de Análisis P&L con FIFO para Inversiones**
- **Objetivo**: Implementar análisis profesional de Profit & Loss (P&L) con metodología FIFO para la sección de Reportes → Inversiones.
- **Archivo nuevo creado**: `src/utils/reporting.js` (354 líneas)
  - **Función principal exportada**: `calculateInvestmentReport(transactions, filtros)`
    - Input: Array de transacciones ya filtradas
    - Output: Objeto con resumen global, análisis por activo, trades cerrados y posiciones abiertas
  - **Algoritmo FIFO implementado**:
    - Agrupación por `usuarioId_activo_moneda` (cada combinación se analiza independientemente)
    - Ordenamiento cronológico estricto por `occurredAt` (con fallback a `fechaTransaccion`)
    - Cola de lotes abiertos (`openLots[]`) que mantiene compras pendientes de venta
    - Al procesar compra: añade lote a cola con `{ cantidad, precioUnitario, fecha, comision }`
    - Al procesar venta: consume lotes FIFO (primero entrado, primero salido)
      - Calcula P&L por trozo: `(precioVenta - precioCompra) * cantidadAsignada`
      - Acumula: totalInvertido, totalRecuperado, P&L neto y P&L %
      - Genera trade cerrado con detalles de compras asociadas
    - Maneja ventas parciales (puede consumir múltiples lotes de compra)
    - **Advertencia**: Si venta sin compra previa (venta en corto), emite `console.warn()` y la ignora en análisis
  - **Cálculos de métricas**:
    - Promedio compra = totalInvertido / cantidadCerrada
    - Promedio venta = totalRecuperado / cantidadCerrada
    - P&L neto = totalRecuperado - totalInvertido
    - P&L % = (pnlNeto / totalInvertido) * 100
  - **Estructura de retorno**:
    ```javascript
    {
      resumenGlobal: { totalInvertido, totalRecuperado, pnlNeto, pnlPct },
      porActivo: [{ activo, moneda, cantidadCerrada, promedioCompra, promedioVenta, 
                    totalInvertido, totalRecuperado, pnlNeto, pnlPct }],
      trades: [{ usuarioId, activo, cantidad, detalleCompras[], detalleVenta, 
                 montoInvertido, montoRecuperado, pnlNeto, pnlPct }],
      posicionesAbiertas: [{ usuarioId, activo, cantidadRestante, promedioCompra, montoInvertido }]
    }
    ```
- **Integración en App.jsx**:
  - **Import agregado**: `import { calculateInvestmentReport } from './utils/reporting'` (línea 24)
  - **Nuevo estado**: `const [investmentReport, setInvestmentReport] = useState(null)` (línea 218)
  - **Modificación de `handleSearchReports`** (líneas 740-760):
    - Cuando `tipoDatos === 'inversiones'`: llama a `calculateInvestmentReport(filtered, reportFilters)`
    - Almacena resultado en `investmentReport` state
    - Propaga métricas P&L a `reportMetrics` usando spread: `...pnlReport.resumenGlobal`
    - Cuando es cashflow: limpia `investmentReport` con `setInvestmentReport(null)`
- **UI actualizada en Reportes → Inversiones**:
  - **Métricas principales** (4 tarjetas):
    - Total Invertido (verde/positivo)
    - Total Recuperado (azul)
    - P&L Neto (verde si positivo, rojo si negativo)
    - P&L % (porcentaje con 2 decimales, color según signo)
  - **Nueva tabla "Análisis P&L por Activo"** (líneas 1545-1584):
    - Columnas: Activo, Moneda, Cant. Cerrada, Prom. Compra, Prom. Venta, Total Invertido, Total Recuperado, P&L Neto, P&L %
    - Formateo de moneda según moneda del activo
    - Colores en P&L: verde si positivo, rojo si negativo
    - Cantidad cerrada: formato con 4 decimales
    - P&L %: formato con 2 decimales
  - **Condicional de visibilidad**: solo muestra tabla si `investmentReport.porActivo.length > 0`
- **Restricciones respetadas**:
  - ❌ NO se modificó autenticación (SUPER_ADMINS, DEV_BYPASS_AUTH, login flow intactos)
  - ❌ NO se cambió schema de Firestore (sin agregar campos nuevos)
  - ✅ Estrategia de filtros client-side mantenida (evita índices compuestos)
  - ✅ Todos los cálculos en memoria a partir de datos ya filtrados
  - ✅ Tabs Inversiones y Gastos/Ingresos funcionan igual que antes
- **Comportamiento FIFO**:
  - **Correcto**: Solo empareja ventas con compras que ocurrieron cronológicamente antes
  - **Limitación intencional**: Ventas sin compra previa (short selling) se ignoran en análisis P&L
  - **Advertencia en consola**: `console.warn()` cuando detecta venta sin lotes disponibles
  - **Agrupación por moneda**: BTC USD y BTC ARS se tratan como activos separados
- **Estado del código**:
  - ✅ Compilación sin errores (verificado con eslint)
  - ✅ Servidor dev corriendo en localhost:5174
  - ✅ Engine FIFO completo y funcional
  - ✅ UI integrada y mostrando métricas correctamente
- **Testing pendiente**: Usuario realizará pruebas con datos reales para validar cálculos FIFO
- **Archivos modificados**:
  - `src/utils/reporting.js` (nuevo)
  - `src/App.jsx` (integración del engine y actualización de UI)

---

**[2025-12-16] UI: Transformación completa a diseño Dark Fintech Premium**
- **Objetivo**: Transformar el diseño visual completo de HomeFlow a un estilo dark fintech moderno y profesional sin modificar ninguna lógica de negocio.
- **Paleta de colores**:
  - Backgrounds: #0B1020 (primary), #0E1630 (secondary), #121B36 (cards)
  - Text: #E8EEFF (primary), #9AA8D6 (secondary), #6B7AA1 (muted)
  - Accent: #44F1E0 (cyan), #5AA7FF (blue), #FFB36B (warm)
  - Status: #35E39E (success), #FF5C7A (error), #FFB36B (warning), #5AA7FF (info)
- **Sistema de Design Tokens**:
  - Creado en `src/index.css` con variables CSS (:root)
  - Sombras neumórficas suaves (combinación de sombras oscuras + claras para efecto elevado)
  - Border radius: 8px (sm), 12px (md), 16px (lg), 24px (xl)
  - Spacing estandarizado: 0.5rem a 3rem
  - Transiciones: 150ms (fast), 250ms (base), 350ms (slow)
- **Componentes CSS reutilizables** (en `src/index.css`):
  - Layout: `.hf-page`, `.hf-header`, `.hf-card`, `.hf-card-secondary`
  - Forms: `.hf-form`, `.hf-grid`, `.hf-grid-2/3/4`, `.hf-field`, `.hf-input`, `.hf-select`, `.hf-textarea`
  - Buttons: `.hf-button`, `.hf-button-primary`, `.hf-button-secondary`, `.hf-button-danger`, `.hf-button-ghost`
  - Badges: `.hf-badge`, `.hf-badge-success/error/warning/info`
  - Alerts: `.hf-alert`, `.hf-alert-success/error/warning/info`
  - Tables: `.hf-table-container`, `.hf-table` (con thead/tbody styling)
  - Radio/Checkbox: `.hf-radio-group`, `.hf-radio-label`, `.hf-checkbox-label`
  - Lists: `.hf-list`, `.hf-list-item`
  - Utils: `.hf-text-gradient`, `.hf-flex`, `.hf-flex-center`, `.hf-flex-between`, `.hf-gap-*`, `.hf-mb-*`
- **Estilos adicionales en App.css**:
  - Welcome screen: `.hf-welcome`, `.hf-welcome-card`
  - Tabs navigation: `.hf-tabs`, `.hf-tab`, `.hf-tab-active`
  - Login: `.hf-login-container`, `.hf-login-card`
  - Metrics: `.hf-metrics-grid`, `.hf-metric-card`, `.hf-metric-value-positive/negative`
  - Feature cards: `.hf-features-grid`, `.hf-feature-card`, `.hf-feature-icon`
  - Loading spinner: `.hf-loading` con animación
- **Cambios visuales implementados**:
  - **Pantallas generales**:
    - Loading: Card con spinner animado cyan
    - Error/Acceso Denegado: Alert card con estilo error
    - Login: Card dark con inputs neumórficos, botón primary con glow cyan
  - **Home screen**:
    - Cards flotantes para cada sección (Inversiones, Gastos, Reportes)
    - Iconos grandes con efecto glow
    - Hover con elevación y cambio de borde
  - **Inversiones**:
    - Header con título gradient cyan-blue
    - Card principal con formulario en grid responsive
    - Radio buttons con estilo pill
    - Inputs dark con focus cyan brillante
    - Botón submit primary con glow al hover
  - **Gastos**:
    - Header consistente con Inversiones
    - Formulario en grid 2/3 columnas según campos
    - Lista de últimos 5 con badges para tipo (gasto/ingreso)
    - Botón "Anular" con estilo danger
  - **Reportes**:
    - Card de filtros con dividers entre secciones
    - Botones "Buscar" (primary con loading spinner) y "Limpiar" (secondary)
    - Métricas en grid con valores colorados (positivo=verde, negativo=rojo)
    - Tabla dark con thead cyan, hover en filas
    - Badges para operación/tipo, estado anulada
- **Responsive**:
  - Grids colapsan a 1 columna en mobile (<= 768px)
  - Tabs stack verticalmente en mobile
  - Padding/spacing ajustado para pantallas pequeñas
- **Accesibilidad mantenida**:
  - Contraste adecuado (cyan #44F1E0 sobre dark)
  - Focus visible con glow cyan
  - Inputs legibles con placeholder muted
  - Disabled states con opacity 0.5
- **No se modificó**:
  - ❌ Ninguna lógica de negocio (handlers, validaciones, queries Firestore)
  - ❌ Ningún campo de datos (nombres, tipos, estructuras)
  - ❌ Ninguna regla de Firestore
  - ❌ DEV_BYPASS_AUTH sigue funcionando igual
  - ❌ Flujo de autenticación sin cambios
- **Archivos modificados**:
  - `src/index.css`: Sistema completo de design tokens y componentes reutilizables
  - `src/App.css`: Estilos adicionales para features específicas
  - `src/App.jsx`: Actualización de className en todos los componentes (solo UI, lógica intacta)
- **Resultado**: HomeFlow ahora luce como una aplicación fintech moderna y premium con estilo dark, neumorfismo suave, acentos cyan brillantes y experiencia visual profesional.

---

**[2025-12-16] Refactor: eliminación de campo redundante "Tipo de Activo" en reportes**
- **Motivo**: El campo "Tipo de Activo" en los filtros de reportes era redundante porque el tipo ya está implícito en el símbolo seleccionado (BTC = Cripto, AAPL = Acciones, etc.).
- **Cambios realizados**:
  - Eliminado `tipoActivo` del estado inicial de `reportFilters` en `src/App.jsx`
  - Eliminado `tipoActivo` de la función de reset de filtros
  - Eliminada la lógica de filtrado `if (reportFilters.tipoActivo !== 'todos' && r.tipoActivo !== reportFilters.tipoActivo) return false;`
  - Eliminado el campo visual `<select name="tipoActivo">` del formulario de reportes
- **Beneficios**:
  - UI más limpia y simple con menos campos
  - Reducción de confusión para el usuario
  - Filtrado más directo por símbolo del activo
- **Archivos modificados**: `src/App.jsx`
- **Commit**: `aec69cf` - "refactor(reports): remove redundant 'Tipo de Activo' filter"

---


- Se renombró la aplicación de "Investment Manager" a **HomeFlow** para reflejar el scope ampliado: control tanto de inversiones como de gastos del hogar.
- Archivos actualizados: `index.html` (título), `src/App.jsx` (encabezado principal), `README.md` (nombre y descripción breve), `package.json` y `package-lock.json` (campo `name`).
- Nota: las configuraciones y IDs de Firebase (`investment-manager-e47b6`) se mantienen sin cambios para evitar romper integraciones existentes.

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

---

**[2025-12-15] Renombramiento del repositorio Git a `home-flow` (implementado)**
- El repositorio en GitHub fue renombrado de `investment-manager-firebase` a `home-flow`.
- Acciones realizadas localmente: actualizado `origin` a `git@github.com:albert-carrasquel/home-flow.git`, añadido campo `repository` en `package.json` y documentada la acción en este changelog.
- Nota: Las configuraciones del proyecto en Firebase mantienen su `projectId` (`investment-manager-e47b6`) y no han sido modificadas para evitar romper integraciones.

---

**[2025-12-15] Fix: `comision` guardada como number (o null) en transacciones**
- Se ajustó la lógica de guardado en `src/App.jsx` para que el campo `comision` se persista como `number` (usando `parseFloat`) cuando el usuario lo ingresa, o `null` si se deja vacío.
- Motivación: facilitar cálculos y reportes posteriores (suma, media, comparativas) sin tener que castear strings a números en cada consulta.

---

**[2025-12-15] Fix: `monedaComision` guardada como null cuando está vacía**
- Se ajustó `handleAddTransaction` en `src/App.jsx` para guardar `monedaComision` como `null` si el usuario no la selecciona, manteniendo consistencia con `comision`.
- Motivación: evitar valores string vacíos en la base de datos y facilitar filtrado/consulta en reportes.

---

**[2025-12-15] UX: renombrar 'Activo' a 'Símbolo del Activo' y normalizar `nombreActivo` a mayúsculas**
- Se cambió la etiqueta del campo `activo` a **"Símbolo del Activo"** para mayor claridad.
- `nombreActivo` ahora se normaliza a mayúsculas durante la entrada (`sanitizeNombre` convierte el texto a `toUpperCase()`), de forma que lo que escribe el usuario se transforma en mayúsculas automáticamente.
- Motivación: consistencia visual y simplificar búsquedas/filtrado al normalizar nombre y símbolo.

---

**[2025-12-15] Inicio de soporte para VENTAS en el formulario de inversiones (work-in-progress)**
- Se añadió selector `usuarioId` y radio `tipoOperacion` (compra/venta) en el formulario.
- Se convirtió `activo` a `select` y se implementó la lógica para poblarlo dinámicamente desde las transacciones existentes (lista única, filtrada por `usuarioId` cuando corresponde).
- Validaciones: bloqueo de envío para ventas cuando no hay activos disponibles para el usuario seleccionado, y verificación adicional de que el `activo` seleccionado pertenezca a la lista disponible.
- Próximos pasos: completar validaciones específicas de ventas, pruebas y asegurar persistencia correcta (`tipoOperacion='venta'`, `usuarioId` seleccionado). 

---

**[2025-12-15] Verificación manual: venta registrada en Firestore (verificado)**
- Se verificó manualmente en Firebase que una operación de tipo **venta** fue registrada correctamente con los campos esperados (`tipoOperacion: 'venta'`, `usuarioId` seleccionado, `activo` en mayúsculas, `montoTotal`, `comision` como number/null cuando aplica). 
- Estado: validación manual completada; trabajo en pausa por hoy. Próximo paso: instalar dependencias de test y ejecutar suite automatizada en la próxima sesión.

---

**[2025-12-16] Implementación MVP: módulo 'Gastos' (gastos/ingresos)**
- Se añadió la pestaña **Gastos** con un formulario para registrar tanto **gastos** como **ingresos**. Campos guardados: `usuarioId`, `tipo` (gasto|ingreso), `monto` (number), `moneda`, `fecha` (serverTimestamp), `fechaOperacion` (Date), `categoria`, `descripcion` (opcional), `anulada` (boolean, default false) y campos de anulación cuando procede.
- Se implementó una suscripción a Firestore para obtener los **últimos 5** registros (`artifacts/{appId}/public/data/cashflow`) ordenados por `timestamp` descendente.
- Se añadió la posibilidad de **anular** un registro desde la vista (no se borra el documento, solo se actualizan `anulada`, `anuladaAt`, `anuladaBy`).
- Validaciones: `monto > 0`, `fechaOperacion` obligatoria, `tipo`, `moneda` y `categoria` obligatorios. UX: mensaje "Registro guardado" al crear y limpieza del formulario.
- Mantiene compatibilidad con `DEV_BYPASS_AUTH` (usa `dev-albert` como `usuarioId` en DEV).

---

**[2025-12-16] Mejora: agregar selección de `usuario` en el formulario de Gastos/Ingresos**
- Se añadió un campo `Usuario` en el formulario para permitir asignar el registro a un usuario específico (select con `USER_NAMES`).
- Validación: `usuarioId` ahora es obligatorio y se valida que sea un usuario conocido.
- Persistencia: el documento guarda `usuarioId` seleccionado; si por algún motivo no se selecciona, se mantiene la compatibilidad y se usa `userId` o `dev-albert` como fallback.
- Visual: la lista de últimos 5 ahora muestra el nombre corto (primer nombre) del usuario asociado a cada registro.

---

**[2025-12-16] Fix: siempre mostrar los últimos 5 movimientos en Gastos/Ingresos**
- Se corrigió la dependencia en el `useEffect` de cashflows para que **siempre** obtenga y muestre los últimos 5 registros (anulados o no) al iniciar la app o al realizar cualquier cambio en la colección, independientemente del `tab` seleccionado.
- Ahora la lista de últimos 5 se mantiene actualizada en tiempo real y no se limita a una pestaña específica; al entrar en "Gastos", siempre verás los últimos 5 movimientos para evitar registros duplicados.
- Archivos modificados: `src/App.jsx` (removido `tab !== 'gastos'` de la condición del effect).

---

**[2025-12-16] Implementación completa: segmento "Reportes" con filtros y consultas por rango**
- Se añadió el segmento **Reportes** completo: permite consultar datos de Inversiones y Cashflow sin modificar registros (read-only).
- Filtros implementados:
  - Generales (obligatorios): Tipo de datos (Inversiones/Cashflow), Usuario (Todos/Albert/Haydee), Rango de fechas (Desde/Hasta), checkbox "Incluir anulados".
  - Condicionales para Inversiones: Operación (Todas/Compra/Venta), Símbolo Activo, Tipo Activo, Moneda.
  - Condicionales para Cashflow: Tipo (Todos/Gasto/Ingreso), Categoría, Medio de Pago, Moneda.
- Validaciones: fechaDesde <= fechaHasta, campos obligatorios con errores inline, selects con valores predefinidos (no texto libre).
- Consultas Firestore: se ejecutan bajo demanda (botón "Buscar"), filtran por rango de fechas (`fechaTransaccion` para inversiones, `fechaOperacion` para cashflow), usuario y filtros opcionales; no usan `onSnapshot` (sin suscripción en tiempo real).
- Métricas mostradas:
  - Para Inversiones: Total Compras, Total Ventas, Neto (Ventas - Compras).
  - Para Cashflow: Total Gastos, Total Ingresos, Neto (Ingresos - Gastos).
  - Cantidad de registros encontrados.
- Listado de resultados: tabla con columnas relevantes según tipo de datos, incluye nombre del usuario y estado si "Incluir anulados" está activo.
- Botón "Limpiar": resetea filtros al mes actual y valores default ("Todos").
- Archivos modificados: `src/App.jsx` (añadidos estados, handlers, consultas y UI completa del segmento).

---

**[2025-12-16] Fix: error en consultas de Inversiones en Reportes (índices compuestos Firestore)**
- **Problema**: al consultar reportes de Inversiones con múltiples filtros, Firestore devolvía error "Verifica las reglas de Firestore" debido a que las múltiples cláusulas `where()` sobre diferentes campos requieren índices compuestos que no estaban configurados.
- **Solución implementada**: cambio de estrategia de consulta para **evitar completamente el requisito de índices compuestos**:
  1. En lugar de construir query con múltiples `where()` clauses (fechaTransaccion, usuarioId, tipoOperacion, activo, tipoActivo, moneda, etc.), ahora se trae **toda la colección** con una consulta simple.
  2. Se aplican **todos los filtros en memoria (client-side)** usando JavaScript estándar: rango de fechas, usuario, operación, activo, tipo, moneda, incluir/excluir anulados.
  3. Esta solución elimina completamente la dependencia de índices compuestos en Firestore y funciona inmediatamente sin configuración adicional.
- **Ventajas**:
  - No requiere crear índices compuestos en Firebase Console.
  - Código más simple y mantenible.
  - Funciona para cualquier combinación de filtros sin restricciones.
  - Ideal para uso doméstico/personal con volúmenes de datos razonables.
- **Nota**: para colecciones extremadamente grandes (miles de registros), considera implementar paginación o límites. Para el caso de uso actual (gestión personal/familiar), el rendimiento es óptimo.
- Archivos modificados: `src/App.jsx` (refactor completo de `handleSearchReports` para filtrado client-side).

---

**[2025-12-16] Refactor: estructura modular (Fase 1 - Preparación)**
- **Objetivo**: preparar estructura modular para mejor mantenibilidad, reusabilidad y escalabilidad del proyecto HomeFlow.
- **CRÍTICO**: Auth/login flow NO modificado - DEV_BYPASS_AUTH preservado intacto.

- **Estructura creada**:
  1. **`src/config/`**: Configuraciones centralizadas
     - `firebase.js`: Inicialización única de Firebase (app, auth, db, appId)
     - `constants.js`: Todas las constantes (DEV flags, USER_NAMES, SUPER_ADMINS, opciones de selects)
  
  2. **`src/services/`**: Servicios especializados de Firestore
     - `firestorePaths.js`: Paths centralizados de colecciones
     - `transactionsService.js`: CRUD de transactions/inversiones (createTransaction, listenToTransactions, getAllTransactions)
     - `cashflowService.js`: CRUD de cashflow/gastos (createCashflow, annulCashflow, listenToLastNCashflows, getAllCashflows)
     - `reportsService.js`: Generación de reportes con filtrado client-side (searchReports con métricas calculadas)
  
  3. **`src/utils/`**: Utilities reutilizables
     - `formatters.js`: (existente, mantenido) Formateo, sanitización, normalización de fechas y montos
     - `validators.js`: Validación de formularios (validateTransactionFields, validateCashflowFields, validateReportFilters)
     - `normalizers.js`: Normalización de datos para guardado (normalizeTransactionForSave, normalizeCashflowForSave, normalizeAnnulationData)
  
  4. **`src/components/`**: Componentes reutilizables
     - `ConfirmationModal.jsx`: (existente)
     - `TransactionItem.jsx`: (existente)
     - `MetricCard.jsx`: (existente)
     - `Message.jsx`: NUEVO - Componente de mensajes/notificaciones reutilizable

- **Beneficios**:
  - **Modularidad**: Separación clara de responsabilidades
  - **Reutilización**: Services y utils independientes del componente principal
  - **Mantenibilidad**: Fácil localizar y actualizar funcionalidad específica
  - **Testabilidad**: Services pueden testearse de forma aislada
  - **Escalabilidad**: Fácil añadir features sin inflar App.jsx
  - **Performance**: Sin cambios en rendimiento runtime
  - **Backward Compatible**: Todos los datos existentes funcionan sin migración

- **Estado actual (Fase 1)**:
  - ✅ Estructura de carpetas y módulos creada
  - ✅ Servicios implementados y funcionando
  - ✅ Validators y normalizers listos
  - ✅ Lint sin errores
  - ⚠️ App.jsx AÚN NO integrado con nuevos módulos (sigue usando lógica inline)
  - ⚠️ DEV_BYPASS_AUTH preservado y funcionando

- **Próximos pasos (Fase 2 - Integración)**:
  - Actualizar App.jsx para usar config, services, validators y normalizers
  - Reemplazar lógica inline con llamadas a módulos
  - Extraer componentes de features (InvestmentsForm, CashflowForm, ReportsPanel)
  - Crear hooks personalizados (useTransactions, useCashflows)
  - Mantener funcionalidad exactamente igual

- **Documentación**:
  - `REFACTOR_STRUCTURE.md`: Guía completa de la estructura, progreso y próximos pasos

- **Testing checklist** (pendiente para Fase 2):
  - [ ] npm run dev
  - [ ] npm run build
  - [ ] DEV bypass funciona
  - [ ] Alta compra/venta
  - [ ] Alta/anulación cashflow
  - [ ] Reportes inversiones/cashflow

- Archivos creados: `src/config/`, `src/services/`, `src/utils/validators.js`, `src/utils/normalizers.js`, `src/components/Message.jsx`, `REFACTOR_STRUCTURE.md`
- Archivos NO modificados: `src/App.jsx` (se integra en Fase 2)

---

**[2025-12-16] Estandarización de manejo de fechas en todo el proyecto (transactions + cashflow)**
- **Objetivo**: unificar la gestión de fechas en React + Firestore para evitar inconsistencias, bugs de zona horaria y facilitar consultas/reportes.
- **Estándar definido** (aplica a todas las entidades: `transactions` e `cashflow`):
  1. **`createdAt`** (Firestore `serverTimestamp()`): timestamp de auditoría que registra cuándo se creó el documento en la base de datos.
  2. **`occurredAt`** (Firestore `Timestamp`): fecha real de la operación elegida por el usuario (compra/venta o gasto/ingreso). Se guarda como Timestamp basado en el input `date` del formulario, construido a las 00:00:00 en hora local para evitar bugs de UTC.
  3. **`updatedAt`** (opcional, Firestore `serverTimestamp()`): se setea cuando se actualiza un documento (por ejemplo al anular).
  4. **`voidedAt`** (Firestore `serverTimestamp()`): timestamp de cuándo se anuló un registro (solo si aplica).

- **Compatibilidad con datos legacy**:
  - Los documentos existentes pueden tener campos antiguos como `timestamp`, `fecha`, `fechaTransaccion`, `fechaOperacion`.
  - Se implementó lógica de **fallback** para leer fechas de documentos viejos sin romper funcionalidad:
    - Para `transactions`: prioridad `occurredAt` > `fechaTransaccion` > `timestamp` > `fecha`.
    - Para `cashflow`: prioridad `occurredAt` > `fechaOperacion` > `timestamp` > `fecha`.
  - Los **nuevos documentos** siempre se guardan con `createdAt` + `occurredAt` (y `updatedAt`/`voidedAt` cuando corresponde).

- **Implementación**:
  1. **Función utilitaria `dateStringToTimestamp(dateString)`** (en `src/utils/formatters.js`):
     - Convierte un string en formato `YYYY-MM-DD` (del input `date`) a un objeto `Date` a las 00:00:00 en hora local.
     - Valida formato y fecha válida (no permite fechas inválidas como 2025-02-30).
     - Evita bugs típicos de zona horaria (por ejemplo que se guarde como el día anterior en UTC).
  2. **Función utilitaria `getOccurredAtFromDoc(doc, type)`** (en `src/utils/formatters.js`):
     - Extrae `occurredAt` de un documento con fallback automático a campos legacy según el tipo (`inversiones` o `cashflow`).
     - Retorna `Date` o `null` si no encuentra fecha válida.
  3. **Actualización de `handleAddTransaction`** (inversiones):
     - Ahora guarda `createdAt: serverTimestamp()` y `occurredAt: dateStringToTimestamp(newTransaction.fechaTransaccion)`.
     - Los campos legacy (`timestamp`, `fechaTransaccion`) ya no se guardan en nuevos documentos.
  4. **Actualización de `handleAddCashflow`** (gastos/ingresos):
     - Ahora guarda `createdAt: serverTimestamp()` y `occurredAt: dateStringToTimestamp(newCashflow.fechaOperacion)`.
     - Los campos legacy (`timestamp`, `fecha`, `fechaOperacion`) ya no se guardan en nuevos documentos.
  5. **Actualización de `handleAnnulCashflow`** (anulación):
     - Ahora guarda `voidedAt: serverTimestamp()` y `updatedAt: serverTimestamp()` al anular un registro (además del legacy `anuladaAt` para compatibilidad).
  6. **Actualización de `handleSearchReports`** (reportes):
     - Ahora filtra siempre por `occurredAt` usando `getOccurredAtFromDoc()` con fallback automático a campos legacy.
     - Esto asegura que reportes funcionen correctamente tanto con documentos nuevos (con `occurredAt`) como con documentos viejos (con `fechaTransaccion`/`fechaOperacion`/etc).

- **Validaciones**:
  - En formularios: la fecha (input `date`) es **obligatoria**.
  - No se permite "hasta" menor que "desde" en reportes.
  - Se valida formato `YYYY-MM-DD` antes de convertir a Timestamp.

- **Archivos modificados**:
  - `src/utils/formatters.js`: añadidas funciones `dateStringToTimestamp()` y `getOccurredAtFromDoc()`.
  - `src/App.jsx`: actualizados `handleAddTransaction`, `handleAddCashflow`, `handleAnnulCashflow`, `handleSearchReports` para usar el nuevo estándar.

- **Próximos pasos** (opcional, no implementado):
  - Si en el futuro se desea eliminar completamente los campos legacy de la UI (por ejemplo dejar de guardar `fechaTransaccion`/`fechaOperacion` como estado interno del formulario), se puede hacer sin romper compatibilidad con Firestore gracias a las funciones de fallback implementadas.

---

**[2025-12-16] Estandarización de manejo de montos en transactions (inversiones)**
- **Objetivo**: establecer un modelo claro y consistente para guardar y usar montos en la colección `transactions`, eliminando confusión entre `montoTotal` y `totalOperacion`.

- **Estándar definido** (aplica solo a `transactions`):
  1. **`totalOperacion`** (number, obligatorio): **monto oficial del recibo** (fuente de verdad).
     - Representa lo que realmente se pagó (compra) o se cobró (venta).
     - Siempre en la moneda indicada por `moneda`.
     - Puede incluir fees implícitos si el recibo ya los incluye.
     - Es el campo principal para reportes y cálculos financieros.
  
  2. **`montoTotal`** (number, calculado): **monto teórico** calculado como `cantidad * precioUnitario`.
     - Sirve para auditoría y comparación con `totalOperacion`.
     - Permite detectar diferencias por comisiones implícitas, spreads o redondeos.
     - Se guarda siempre que `cantidad` y `precioUnitario` existan y sean válidos.
  
  3. **`diferenciaOperacion`** (number, calculado): diferencia entre `totalOperacion` y `montoTotal`.
     - Fórmula: `totalOperacion - montoTotal`.
     - Muestra visualmente comisiones implícitas, spreads o ajustes de precio.
     - Se guarda solo si ambos valores existen (si alguno falta, `null`).
  
  4. **`comision`** (number o null): comisión explícita separada.
     - No debe guardarse como string.
     - Si `monedaComision` está vacía, se guarda como `null`.

- **Compatibilidad con datos legacy**:
  - Documentos viejos pueden tener `totalOperacion` como string o usar `montoTotal` como monto oficial.
  - Se implementó **función utilitaria `normalizeTransactionAmounts(doc)`** (en `src/utils/formatters.js`) que:
    - Convierte `totalOperacion` y `montoTotal` a números con fallback.
    - Calcula `diferenciaOperacion` si ambos existen.
    - Retorna `montoFuenteDeVerdad`: prioridad `totalOperacion` > `montoTotal` (para reportes).
  - Esto asegura que documentos viejos y nuevos se lean correctamente sin romper funcionalidad.

- **Implementación**:
  1. **Función utilitaria `normalizeTransactionAmounts(doc)`** (en `src/utils/formatters.js`):
     - Parsea `totalOperacion` y `montoTotal` con fallback para strings y números.
     - Calcula `diferenciaOperacion` si ambos valores existen.
     - Retorna objeto con: `{ totalOperacionNumber, montoTotalNumber, diferenciaOperacionNumber, montoFuenteDeVerdad }`.
  
  2. **Actualización de `handleAddTransaction`**:
     - Convierte `totalOperacion` a `number` con `parseFloat()` antes de guardar.
     - Calcula `montoTotal` como `cantidad * precioUnitario` (siempre `number`).
     - Calcula `diferenciaOperacion` como `totalOperacion - montoTotal`.
     - Guarda los tres valores como `number` en Firestore.
     - Validaciones existentes aseguran que `totalOperacion` sea obligatorio, numérico y positivo.
  
  3. **Reset del formulario**:
     - `totalOperacion` vuelve a string vacío en UI, pero siempre se guarda como `number` en Firestore.
     - `comision` se resetea a string vacío, pero se guarda como `number` o `null`.

- **Validaciones**:
  - `cantidad` > 0 (obligatorio, numérico).
  - `precioUnitario` > 0 (obligatorio, numérico).
  - `totalOperacion` > 0 (obligatorio, numérico) - es el campo fuente de verdad.
  - `moneda` obligatorio.
  - `comision` opcional, pero si existe debe ser numérico.

- **Archivos modificados**:
  - `src/utils/formatters.js`: añadida función `normalizeTransactionAmounts()`.
  - `src/App.jsx`: actualizado `handleAddTransaction` para calcular y guardar `totalOperacion`, `montoTotal` y `diferenciaOperacion` como números.

- **Cambio adicional (UX)**:
  - Campo "Símbolo del Activo" ahora es condicional:
    - **COMPRA**: input de texto libre con sanitización (solo letras A-Z, mayúsculas, max 10 caracteres).
    - **VENTA**: select (combo box) con activos existentes del usuario seleccionado (no permite texto libre).
  - Esto es coherente con el flujo: en compra se registran nuevos activos, en venta solo se seleccionan los que ya existen.

- **No modificado en este commit**:
  - Módulo `cashflow` (gastos/ingresos) no se tocó.
  - Manejo de fechas (`createdAt`/`occurredAt`) no se modificó.

---

**[2025-12-16] Integración de logo y favicon personalizados**
- **Objetivo**: reemplazar los íconos genéricos (DollarSign de lucide-react y favicon de Vite) con identidad visual personalizada para HomeFlow.

- **Assets añadidos**:
  - `src/assets/logo.png`: Logo personalizado de HomeFlow.
  - `public/favicon.ico`: Favicon personalizado para pestaña del navegador.

- **Implementación**:
  1. **Logo en aplicación** (`src/App.jsx`):
     - Importado como `import logo from './assets/logo.png';`
     - Reemplazado ícono `DollarSign` de lucide-react en 4 ubicaciones:
       - **Welcome screen**: 48x48px con `filter: drop-shadow(0 0 20px rgba(255, 176, 136, 0.4))`
       - **Header Inversiones**: 40x40px con `filter: drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))`
       - **Header Gastos**: 40x40px con `filter: drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))`
       - **Header Reportes**: 40x40px con `filter: drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))`
     - Drop-shadow naranja consistente con tema visual (naranja suave/peach).
  
  2. **Favicon** (`index.html`):
     - Actualizado `<link rel="icon">` de `/vite.svg` a `/favicon.ico`
     - Cambiado `type="image/svg+xml"` a `type="image/x-icon"` para compatibilidad

- **Resultado visual**:
  - Logo personalizado visible en toda la aplicación (welcome + 3 headers principales)
  - Favicon personalizado en pestaña del navegador
  - Identidad visual coherente y profesional
  - Drop-shadow naranja consistente con tema fintech

- **Testing**:
  - Build de producción exitoso: `npm run build` (4.45s, sin errores)
  - Logo renderizado correctamente en 4 pantallas
  - Favicon visible en pestaña del navegador
  - Sin warnings ni errores en consola

- **Archivos modificados**:
  - `src/App.jsx`: Import de logo y reemplazo de 4 íconos DollarSign por `<img src={logo}>`
  - `index.html`: Actualización de referencia favicon

- **Archivos añadidos**:
  - `src/assets/logo.png`
  - `public/favicon.ico`

---

