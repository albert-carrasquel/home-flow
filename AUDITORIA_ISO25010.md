# 🔍 Auditoría de Calidad ISO/IEC 25010 - HomeFlow
**Fecha**: 11 de febrero de 2026  
**Auditor**: QA Senior & Arquitecto de Software  
**Severidad**: ⚠️ CRÍTICO donde hay riesgo de pérdida de datos o errores financieros

---

## 📊 Resumen Ejecutivo

### Calificación General: 5.5/10
**Estado**: La aplicación funciona pero tiene vulnerabilidades críticas que pueden causar pérdida de datos y errores en balances financieros.

### Riesgos Críticos Identificados:
1. ⚠️ **CRÍTICO**: Lógica FIFO puede fallar con ventas en corto (datos perdidos silenciosamente)
2. ⚠️ **CRÍTICO**: Credenciales de Firebase expuestas en código fuente
3. ⚠️ **CRÍTICO**: No hay validación de concurrencia - race conditions en actualizaciones
4. ⚠️ **ALTO**: Archivo App.jsx monolítico (3117 líneas) - inmantenible
5. ⚠️ **ALTO**: Sin manejo de transacciones atómicas en Firestore
6. ⚠️ **ALTO**: Cálculos financieros con precisión flotante (errores de redondeo)

---

## 1️⃣ ADECUACIÓN FUNCIONAL (Functional Suitability)
**Calificación: 6/10**

### ✅ Fortalezas:
- Lógica FIFO implementada correctamente para casos básicos
- Cálculo de P&L bien estructurado
- Sistema de anulación con registro de auditoría

### ❌ ERRORES CRÍTICOS - Pérdida de Datos:

#### 🚨 CRÍTICO: Ventas en Corto Ignoradas Silenciosamente
**Ubicación**: `src/utils/reporting.js:145-148`
```javascript
if (cantidadPorVender > 0.0001) {
  console.warn(`Venta sin compra previa detectada: ${tx.activo}, cantidad: ${cantidadPorVender}`);
}
```
**Problema**: Si un usuario vende más de lo que compró, la cantidad excedente simplemente se ignora. Solo un `console.warn` - no hay error, no hay registro en BD.
**Impacto**: 
- Pérdida de datos financieros
- Balances incorrectos
- Usuario no es notificado
**Solución**: Lanzar excepción, guardar en BD como "venta pendiente de reconciliación", o bloquear la operación.

#### 🚨 ALTO: Precisión Flotante en Cálculos Financieros
**Ubicación**: Múltiples lugares
```javascript
const montoTotal = cantidad * precioUnitario; // Sin redondeo
const pnlNeto = montoRecuperadoTrade - montoInvertidoTrade - comisionVenta;
```
**Problema**: JavaScript usa IEEE 754 (flotantes). Ejemplo: `0.1 + 0.2 !== 0.3`
**Impacto**: Errores acumulativos en balances, especialmente con criptomonedas de 8 decimales
**Solución**: Usar biblioteca como `decimal.js` o `big.js`, o trabajar con centavos/satoshis (enteros).

#### 🚨 MEDIO: Validación de Fechas Insuficiente
**Ubicación**: `src/App.jsx:1106`
```javascript
if (!newTransaction.fechaTransaccion) {
  errors.fechaTransaccion = 'Debes indicar la fecha de la transacción.';
}
```
**Problema**: No valida fechas futuras, fechas imposibles (año 2100), o formato incorrecto
**Impacto**: Cálculos FIFO incorrectos si las fechas están mal
**Solución**: Validar rango razonable (ej: 2020-presente), formato ISO

#### 🚨 MEDIO: Comisiones Null vs 0
**Ubicación**: `src/App.jsx:1166`
```javascript
comision: newTransaction.comision ? parseFloat(newTransaction.comision) : null,
```
**Problema**: `null` vs `0` tienen significados diferentes pero se mezclan
**Impacto**: En sumas puede causar `NaN` si no se maneja bien el `null`
**Solución**: Usar siempre `0` o manejar `null` explícitamente en todos los cálculos

---

## 2️⃣ SEGURIDAD (Security)
**Calificación: 3/10** ⚠️ **MUY CRÍTICO**

### 🚨 CRÍTICO: Credenciales Expuestas en Código
**Ubicación**: `src/config/firebase.js:17-23`
```javascript
const firebaseConfig = {
  apiKey: 'AIzaSyDqQN-Lf4xZInlqysBaFIwNG2uCGQ1Vde4',
  authDomain: 'investment-manager-e47b6.firebaseapp.com',
  projectId: 'investment-manager-e47b6',
  // ...
};
```
**Problema**: API key y config públicas en repositorio GitHub
**Impacto**: 
- Cualquiera puede acceder al proyecto Firebase
- Posible abuso de cuotas (costoso)
- Exposición de datos si las reglas de Firestore fallan
**Solución**: 
1. Usar variables de entorno (`.env.local`)
2. Regenerar API keys comprometidas
3. Implementar App Check de Firebase

### 🚨 ALTO: Reglas de Firestore Demasiado Permisivas
**Ubicación**: `firestore.rules:18-24`
```javascript
match /artifacts/{appId}/public/data/{document=**} {
  allow read, write: if isSuperAdmin();
}
```
**Problema**: 
- Solo 2 UIDs hardcodeados como admins
- Si un admin pierde su cuenta, datos bloqueados para siempre
- No hay roles diferenciados (admin vs usuario normal)
**Solución**: Sistema de roles en Firestore con permisos granulares

### 🚨 ALTO: Sin Rate Limiting
**Problema**: No hay protección contra ataques de fuerza bruta en login
**Impacto**: Cuentas pueden ser comprometidas
**Solución**: Implementar Firebase reCAPTCHA o rate limiting

### 🚨 MEDIO: Bypass de Autenticación en DEV
**Ubicación**: `src/config/constants.js` (asumido)
```javascript
export const DEV_BYPASS_AUTH = true;
```
**Problema**: Si se despliega accidentalmente en producción, es acceso sin autenticación
**Solución**: 
- Usar `import.meta.env.DEV` automático de Vite
- CI/CD debe verificar que esta flag NO esté en producción

### 🚨 MEDIO: Sin Validación de Entrada en Backend
**Problema**: Firestore acepta cualquier dato que pase las reglas
**Solución**: Cloud Functions para validar estructura de datos antes de guardar

---

## 3️⃣ MANTENIBILIDAD (Maintainability)
**Calificación: 4/10** ⚠️ **CRÍTICO**

### 🚨 CRÍTICO: Código Espagueti - App.jsx Monolítico
**Ubicación**: `src/App.jsx` (3117 líneas)
**Problema**: 
- Todo en un solo archivo: lógica, UI, estado, handlers
- 30+ estados locales
- Imposible de testear unitariamente
- Modificar una cosa rompe 5 más
**Impacto**: 
- Bugs inevitables con cada cambio
- Onboarding de nuevos devs: imposible
- Regresiones constantes
**Solución**: 
```
src/
  features/
    investments/
      InvestmentsPage.jsx
      useInvestments.hook.js
      investmentsService.js
    cashflow/
    checklist/
  hooks/
    useFirebase.js
    useAuth.js
  services/
    firestoreService.js
```

### 🚨 ALTO: Sin Tests Unitarios
**Ubicación**: Solo existe `formatters.test.js`
**Problema**: 
- FIFO logic sin tests
- Cálculos de P&L sin tests
- Validaciones sin tests
**Impacto**: Refactoring = terror, cada cambio puede romper cálculos financieros
**Solución**: Cobertura mínima 80% en lógica de negocio crítica

### 🚨 ALTO: useEffect Hell
**Ubicación**: 7+ useEffect en App.jsx
**Problema**: Dependencias complejas, ejecución impredecible, race conditions
**Solución**: 
- Usar React Query o SWR para data fetching
- Custom hooks para lógica específica
- Reducir estados derivados

### 🚨 MEDIO: Magic Numbers Everywhere
```javascript
if (lote.cantidad <= 0.0001) { // ¿Por qué 0.0001?
for (let i = 1; i <= 3; i++) { // ¿Por qué 3 meses?
```
**Solución**: Constantes con nombres descriptivos

### 🚨 MEDIO: Sin Logging Estructurado
```javascript
console.log('✅ Loading monthly checklist for:', detectedMonth);
```
**Problema**: Imposible debuggear en producción, no hay niveles de log
**Solución**: Usar biblioteca como `winston` o servicio como Sentry

---

## 4️⃣ USABILIDAD (Usability)
**Calificación: 7/10**

### ✅ Fortalezas:
- Validaciones de formulario claras
- Mensajes de error descriptivos
- Confirmaciones antes de eliminar

### ❌ Validaciones Faltantes:

#### 🚨 ALTO: Sin Confirmación en Operaciones Destructivas
**Ubicación**: `handleUpdateMonthlyExpense`
```javascript
await updateDoc(cashflowRef, {
  monto: newAmount,
  anulada: false, // Des-anula automáticamente ⚠️
});
```
**Problema**: Modificar un gasto anulado lo des-anula sin avisar
**Solución**: Mostrar warning "Este gasto fue anulado. ¿Deseas reactivarlo?"

#### 🚨 MEDIO: Sin Límites de Cantidad/Precio
**Problema**: Usuario puede ingresar 999999999 BTC a $0.01
**Solución**: Validar rangos razonables por tipo de activo

#### 🚨 MEDIO: Sin Prevención de Doble Click
**Problema**: Usuario puede hacer doble click en "Registrar" y crear duplicados
**Solución**: Deshabilitar botón mientras se procesa (loading state)

#### 🚨 BAJO: Sin Indicador de Cambios No Guardados
**Problema**: Si cierras el navegador mientras editas, pierdes cambios
**Solución**: `beforeunload` event listener

---

## 5️⃣ FIABILIDAD (Reliability)
**Calificación: 5/10**

### 🚨 CRÍTICO: Sin Manejo de Race Conditions
**Ubicación**: Múltiples handlers async
**Problema**:
```javascript
// Usuario 1 y 2 editan el mismo gasto simultáneamente
await updateDoc(cashflowRef, { monto: 1000 });
await updateDoc(cashflowRef, { monto: 2000 }); // Sobrescribe sin merge
```
**Impacto**: Pérdida de datos por sobrescritura
**Solución**: 
- Usar Firestore Transactions
- Optimistic locking con versiones
- Mostrar warning si documento cambió

### 🚨 ALTO: Sin Retry Logic
**Problema**: Si Firestore falla temporalmente, operación se pierde
**Solución**: Retry exponencial con backoff (3 intentos)

### 🚨 ALTO: Sin Offline Support
**Problema**: Sin internet = app inútil
**Solución**: Firestore enablePersistence() + service worker

### 🚨 MEDIO: Error Handling Inconsistente
```javascript
} catch (err) {
  console.error('Error registering monthly expense:', err);
  setError(`Error al registrar ${template.nombre}.`); // Mensaje genérico
}
```
**Problema**: Usuario no sabe qué pasó (¿red? ¿permisos? ¿datos inválidos?)
**Solución**: Mensajes específicos según tipo de error

---

## 6️⃣ EFICIENCIA DE DESEMPEÑO (Performance Efficiency)
**Calificación: 6/10**

### 🚨 MEDIO: Query sin Índices
**Ubicación**: Múltiples `getDocs` sin índices
```javascript
const checklistSnapshot = await getDocs(collection(db, checklistPath));
```
**Problema**: Si hay 1000+ documentos, consulta lenta
**Solución**: Crear índices en Firestore, usar `where()` con límites

### 🚨 MEDIO: Cálculos en Cliente (Re-render Pesados)
**Problema**: Dashboard recalcula TODO en cada cambio de cashflows
**Solución**: 
- Memoización con `useMemo`
- Cálculos en Cloud Functions
- Caching en Firestore

### 🚨 BAJO: Bundle Size Grande
**Problema**: 1.28 MB de JS (según build output)
**Solución**: Code splitting, lazy loading de rutas

---

## 7️⃣ COMPATIBILIDAD (Compatibility)
**Calificación: 7/10**

### ✅ Fortalezas:
- React moderno
- Firebase SDK actualizado

### 🚨 MEDIO: Sin Manejo de Zona Horaria
**Problema**: `new Date()` usa zona horaria local
**Impacto**: Usuario en NY vs Buenos Aires ven diferentes fechas
**Solución**: Usar UTC o guardar timezone en cada transacción

### 🚨 BAJO: Sin Progressive Web App
**Solución**: Agregar manifest.json y service worker

---

## 8️⃣ PORTABILIDAD (Portability)
**Calificación: 8/10**

### ✅ Fortalezas:
- Dependencias estándar
- Firebase es multi-plataforma

### 🚨 BAJO: Vendor Lock-in con Firebase
**Solución**: Abstraer servicios en interfaces (Repository pattern)

---

## 📋 TO-DO LIST PRIORITIZADA

### 🔴 CRÍTICO - INMEDIATO (Antes de próximo deploy)

#### Seguridad:
- [ ] **Mover credenciales Firebase a variables de entorno**
  - Crear `.env.local` y `.env.production`
  - Usar `import.meta.env.VITE_FIREBASE_API_KEY`
  - Regenerar API keys en Firebase Console
  - Agregar `.env*` a `.gitignore`
  - Tiempo estimado: 30 min
  
- [ ] **Implementar Firebase App Check**
  - Evita abuso de API
  - Docs: https://firebase.google.com/docs/app-check
  - Tiempo estimado: 1 hora

#### Lógica de Negocio:
- [ ] **Bloquear ventas en corto**
  ```javascript
  if (cantidadPorVender > 0.0001) {
    throw new Error(`No tienes suficiente ${activo} para vender`);
  }
  ```
  - Agregar validación en frontend ANTES de enviar
  - Agregar validación en Firestore Rules
  - Tiempo estimado: 1 hora

- [ ] **Agregar manejo de transacciones Firestore**
  ```javascript
  await runTransaction(db, async (transaction) => {
    // Leer, validar, escribir atómicamente
  });
  ```
  - Usar en: actualizar checklist + cashflow
  - Prevenir race conditions
  - Tiempo estimado: 2 horas

### 🟠 ALTO - Esta Semana

#### Mantenibilidad:
- [ ] **Refactorizar App.jsx (Fase 1)**
  - Extraer `InvestmentsPage.jsx` (hooks + UI)
  - Extraer `CashflowPage.jsx`
  - Extraer `ChecklistPage.jsx`
  - Objetivo: App.jsx < 500 líneas
  - Tiempo estimado: 1 día

- [ ] **Crear tests para FIFO logic**
  ```javascript
  describe('calculateInvestmentReport', () => {
    it('should handle basic buy-sell scenario', () => {
      // Test con datos mock
    });
  });
  ```
  - Cobertura mínima: 80% en `reporting.js`
  - Tiempo estimado: 4 horas

- [ ] **Implementar logging estructurado**
  - Instalar Sentry o LogRocket
  - Reemplazar `console.log` con niveles (error, warn, info, debug)
  - Tiempo estimado: 2 horas

#### Fiabilidad:
- [ ] **Agregar retry logic**
  ```javascript
  async function withRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await sleep(2 ** i * 1000); // Exponential backoff
      }
    }
  }
  ```
  - Tiempo estimado: 1 hora

- [ ] **Mejorar error handling**
  - Crear función `handleFirestoreError(error)` que retorna mensajes user-friendly
  - Diferenciar: permisos, red, validación
  - Tiempo estimado: 2 horas

### 🟡 MEDIO - Próximas 2 Semanas

#### Cálculos Financieros:
- [ ] **Usar decimal.js para cálculos**
  ```bash
  npm install decimal.js-light
  ```
  ```javascript
  import Decimal from 'decimal.js-light';
  const total = new Decimal(cantidad).times(precioUnitario);
  ```
  - Reemplazar en: reporting.js, validaciones, UI
  - Tiempo estimado: 1 día

- [ ] **Validar rangos razonables**
  - BTC: max 21M, min 0.00000001
  - Precios: > 0, < 1B
  - Fechas: 2020 - presente
  - Tiempo estimado: 3 horas

#### Usabilidad:
- [ ] **Prevenir doble submit**
  ```javascript
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Deshabilitar botón mientras isSubmitting === true
  ```
  - Tiempo estimado: 1 hora

- [ ] **Warning en cambios no guardados**
  ```javascript
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);
  ```
  - Tiempo estimado: 1 hora

### 🟢 BAJO - Backlog

- [ ] Implementar offline support (Firestore persistence)
- [ ] Code splitting y lazy loading
- [ ] PWA con service worker
- [ ] Índices Firestore para queries optimizadas
- [ ] Sistema de roles granular
- [ ] Abstraer Firebase (Repository pattern)
- [ ] Manejo de zonas horarias con luxon/dayjs

---

## 🎯 Métricas de Éxito

### Antes de Next Release:
- ✅ 0 credenciales expuestas
- ✅ 0 operaciones sin validación de inventario (venta en corto bloqueada)
- ✅ 80%+ cobertura de tests en lógica FIFO
- ✅ App.jsx < 1000 líneas
- ✅ Transacciones atómicas en operaciones críticas

### En 1 Mes:
- ✅ Decimal.js implementado (precisión perfecta)
- ✅ App.jsx refactorizado completamente (< 500 líneas)
- ✅ Sentry configurado (0 errores sin loggear)
- ✅ Firestore Rules con roles granulares

---

## 💬 Comentarios Finales

### Lo Bueno:
- La lógica FIFO es sólida para casos comunes
- Separación de utilidades (formatters, reporting) es correcta
- Sistema de anulación con auditoría es profesional

### Lo Malo:
- **Seguridad es preocupante**: credenciales expuestas, reglas muy básicas
- **Mantenibilidad crítica**: 3117 líneas en un archivo es insostenible
- **Pérdida de datos silenciosa**: ventas en corto ignoradas sin error

### Lo Feo:
- **Flotantes en finanzas**: esto SIEMPRE termina mal
- **Race conditions**: dos usuarios editando lo mismo = desastre
- **Sin tests**: refactorear = jugar ruleta rusa

### Recomendación:
**No desplegar más features hasta resolver CRÍTICOS**. Una pérdida de datos financieros o brecha de seguridad destruye la confianza del usuario para siempre.

---

**Auditor**: Experto QA & Arquitecto Senior  
**Próxima revisión**: Después de implementar tareas CRÍTICAS
