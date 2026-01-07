# 📋 Plan de Testing - HomeFlow MVP

**Fecha:** 6 de enero de 2026  
**Rama:** `feature/enable-auth`  
**Objetivo:** Verificar funcionalidad completa antes de mergear a main

---

## ✅ **Checklist de Testing**

### **1. Autenticación y Login**

#### Usuario 1: Albert Carrasquel
- [ ] Abrir app en navegador limpio (modo incógnito)
- [ ] Verificar que muestra pantalla de login
- [ ] Login con email: `albert@email.com` (ajustar según tu Firebase)
- [ ] Login exitoso → Redirige a Dashboard
- [ ] Nombre mostrado correctamente: "Albert"
- [ ] Verificar que aparece botón de logout

#### Usuario 2: Haydee Macias
- [ ] Abrir app en otro navegador o modo incógnito
- [ ] Login con email: `haydee@email.com` (ajustar según tu Firebase)
- [ ] Login exitoso → Redirige a Dashboard
- [ ] Nombre mostrado correctamente: "Haydee"

#### Casos de error
- [ ] Probar login con credenciales incorrectas
- [ ] Verificar mensaje de error claro
- [ ] Probar con email inválido
- [ ] Verificar que no se puede acceder sin login

---

### **2. Dashboard (Vista Principal)**

#### Métricas de Inversiones
- [ ] Total Invertido muestra valor correcto (no NaN)
- [ ] P&L Realizado muestra valor correcto
- [ ] Posiciones Abiertas muestra número correcto

#### Métricas de Cashflow
- [ ] Total Ingresos del mes muestra valor correcto (no NaN)
- [ ] Total Gastos del mes muestra valor correcto (no NaN)
- [ ] Balance muestra cálculo correcto (Ingresos - Gastos)

#### Visualizaciones
- [ ] Gráfico de tendencia mensual se renderiza
- [ ] Top 5 activos se muestra correctamente
- [ ] Top 5 categorías de gastos se muestra correctamente

#### Navegación
- [ ] Botones de acceso rápido funcionan:
  - [ ] Portfolio
  - [ ] Inversiones
  - [ ] Gastos
  - [ ] Reportes

#### Super Admin (solo Albert y Haydee)
- [ ] Zona de Peligro visible
- [ ] Botones de eliminación masiva presentes:
  - [ ] Eliminar Todas las Inversiones
  - [ ] Eliminar Todos los Gastos/Ingresos
  - [ ] Eliminar TODO

---

### **3. Inversiones**

#### Agregar Compra
- [ ] Seleccionar tipo: "compra"
- [ ] Llenar todos los campos:
  - Activo: "Bitcoin"
  - Símbolo: "BTC"
  - Cantidad: 0.5
  - Precio: 42000
  - Moneda: USD
  - Comisión: 50
  - Tipo de activo: Cripto
  - Exchange: Binance
  - Fecha: (hoy)
- [ ] Click en "Agregar Transacción"
- [ ] Verificar que aparece en la lista
- [ ] Verificar que muestra quién la registró (Albert o Haydee)

#### Agregar Venta
- [ ] Seleccionar tipo: "venta"
- [ ] Seleccionar usuario que hizo la compra
- [ ] Verificar que aparecen activos disponibles
- [ ] Seleccionar activo comprado anteriormente
- [ ] Llenar cantidad, precio, comisión
- [ ] Agregar transacción
- [ ] Verificar que se calcula P&L correctamente

#### Anular Transacción
- [ ] Click en ícono de anular (🗑️)
- [ ] Confirmar en modal
- [ ] Verificar que cambia a "❌ ANULADA"
- [ ] Verificar que no afecta cálculos

---

### **4. Gastos e Ingresos**

#### Agregar Gasto
- [ ] Seleccionar tipo: "gasto"
- [ ] Llenar campos:
  - Monto: 5000
  - Moneda: ARS
  - Categoría: Alimentación
  - Descripción: "Supermercado"
  - Medio de pago: Tarjeta de Crédito
  - Fecha: (hoy)
- [ ] Click en "Agregar"
- [ ] Verificar que aparece en la lista
- [ ] Verificar que suma a "Total Gastos" del Dashboard

#### Agregar Ingreso
- [ ] Seleccionar tipo: "ingreso"
- [ ] Llenar campos (ej: Salario)
- [ ] Agregar
- [ ] Verificar que suma a "Total Ingresos"

#### Checklist Mensual
- [ ] Verificar que aparece lista de gastos recurrentes:
  - Alquiler, Luz, Gas, Agua, Internet, Expensas, Celular
- [ ] Ingresar monto en un item (ej: Alquiler 50000)
- [ ] Click en "Registrar"
- [ ] Verificar que se tacha el item
- [ ] Verificar que aparece en "Últimos 5 registros"
- [ ] Verificar que aparece en la lista principal de gastos

#### Modificar Gasto del Checklist
- [ ] Click en "Modificar" en item completado
- [ ] Cambiar monto
- [ ] Confirmar
- [ ] Verificar que actualiza en todos lados

#### Historial de Meses Anteriores
- [ ] Expandir "Historial de Meses Anteriores"
- [ ] Verificar que muestra meses pasados
- [ ] Verificar que detecta gastos faltantes
- [ ] Probar "Pagar ahora" en un gasto atrasado

#### Anular Gasto
- [ ] Click en ícono de anular
- [ ] Confirmar
- [ ] Verificar que se anula correctamente

---

### **5. Portfolio**

#### Vista General
- [ ] Verificar métricas:
  - Total Invertido
  - Total Posiciones
  - Activos Únicos
- [ ] Gráfico de diversificación por tipo se renderiza
- [ ] Gráfico de diversificación por moneda se renderiza

#### Tabla de Posiciones
- [ ] Tabla muestra todas las posiciones abiertas
- [ ] Columnas correctas:
  - Activo/Símbolo
  - Cantidad
  - Precio Promedio
  - Monto Invertido
  - Tipo
  - Moneda
  - Usuario
- [ ] Datos correctos para cada posición

---

### **6. Reportes**

#### Reporte de Inversiones
- [ ] Aplicar filtros:
  - [ ] Por usuario
  - [ ] Por activo
  - [ ] Por rango de fechas
  - [ ] Por tipo de activo
  - [ ] Por exchange
- [ ] Click en "Generar Reporte"
- [ ] Verificar que muestra:
  - Métricas (Total Invertido, Recuperado, P&L)
  - Gráfico de P&L por activo
  - Lista de transacciones filtradas
  - Análisis FIFO

#### Exportar a Excel (Inversiones)
- [ ] Click en "Exportar a Excel"
- [ ] Verificar que descarga archivo .xlsx
- [ ] Abrir archivo en Excel/LibreOffice
- [ ] Verificar hojas:
  - [ ] Resumen
  - [ ] Análisis FIFO
  - [ ] Detalle Transacciones
- [ ] Verificar que datos son correctos

#### Reporte de Cashflow
- [ ] Aplicar filtros (usuario, categoría, fechas)
- [ ] Generar reporte
- [ ] Verificar métricas y lista

#### Exportar a Excel (Cashflow)
- [ ] Click en "Exportar a Excel"
- [ ] Verificar archivo descargado
- [ ] Verificar hojas:
  - [ ] Resumen
  - [ ] Detalle Movimientos

---

### **7. Funcionalidad Multi-Usuario**

#### Datos Compartidos
- [ ] Albert agrega una inversión
- [ ] Haydee hace login
- [ ] Verificar que Haydee ve la inversión de Albert
- [ ] Haydee agrega un gasto
- [ ] Albert hace refresh
- [ ] Verificar que Albert ve el gasto de Haydee

#### Identificación de Usuario
- [ ] Verificar que en todas las listas se muestra quién registró cada operación
- [ ] Verificar que en Dashboard y Portfolio se consolidan datos de ambos

---

### **8. Zona de Peligro (Super Admin)**

⚠️ **IMPORTANTE: Hacer backup de datos antes de probar**

#### Eliminar Todas las Inversiones
- [ ] Click en "Eliminar Todas las Inversiones"
- [ ] Verificar modal de confirmación claro
- [ ] Confirmar eliminación
- [ ] Verificar que se eliminan todas las transacciones
- [ ] Verificar que Dashboard y Portfolio se actualizan

#### Eliminar Todos los Gastos
- [ ] Click en "Eliminar Todos los Gastos/Ingresos"
- [ ] Confirmar
- [ ] Verificar eliminación completa

#### Eliminar TODO
- [ ] Click en "Eliminar TODO"
- [ ] Verificar advertencia fuerte
- [ ] Confirmar
- [ ] Verificar que todo se elimina (inversiones, gastos, checklist)

---

### **9. Rendimiento y UX**

#### Tiempos de Carga
- [ ] Dashboard carga en < 2 segundos
- [ ] Portfolio carga en < 2 segundos
- [ ] Reportes generan en < 3 segundos

#### Estados de Carga
- [ ] Dashboard muestra spinner/mensaje mientras carga
- [ ] Portfolio muestra loading state
- [ ] No se muestran datos vacíos antes de cargar

#### Responsive
- [ ] Probar en móvil (inspeccionar con DevTools)
- [ ] Verificar que la UI se adapta
- [ ] Verificar que gráficos se redimensionan

---

### **10. Casos de Error**

#### Validaciones de Formularios
- [ ] Intentar agregar inversión sin llenar campos requeridos
- [ ] Intentar agregar cantidad negativa
- [ ] Intentar agregar precio 0
- [ ] Verificar que muestra errores claros

#### Conexión
- [ ] Desactivar Wi-Fi momentáneamente
- [ ] Verificar que muestra error de conexión
- [ ] Reactivar Wi-Fi
- [ ] Verificar que se recupera

#### Consola del Navegador
- [ ] Abrir DevTools (F12)
- [ ] Verificar que NO hay errores en console
- [ ] Verificar que console.error muestra mensajes útiles si hay problemas

---

## 🚀 **Pasos para Deployment**

Si todos los tests pasan:

```bash
# 1. Volver a rama main
git checkout main

# 2. Mergear feature branch
git merge feature/enable-auth

# 3. Push a GitHub
git push origin main

# 4. Deploy a Firebase Hosting
npm run build
firebase deploy
```

---

## 📝 **Notas de Testing**

**Testers:** Albert y Haydee  
**Fecha inicio:** _______________  
**Fecha fin:** _______________

**Bugs encontrados:**
1. 
2. 
3. 

**Mejoras sugeridas:**
1. 
2. 
3. 

**Decisión final:**
- [ ] ✅ Aprobar merge a main y deployment
- [ ] ❌ Requiere fixes antes de deployment
- [ ] 🔄 Requiere más testing

---

**Firma testers:**  
Albert: _______________  
Haydee: _______________
