# 🏠 HomeFlow

**HomeFlow** es una aplicación web completa para gestión financiera personal que permite rastrear inversiones y gastos del hogar en un solo lugar. Diseñada para uso familiar, ofrece visualizaciones en tiempo real, reportes detallados y análisis de portfolio con cálculo FIFO.

[![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2.6-646CFF?logo=vite)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase)](https://firebase.google.com/)

🔗 **Repositorio:** [github.com/albert-carrasquel/home-flow](https://github.com/albert-carrasquel/home-flow)

---

## ✨ **Features Principales**

### 💼 Gestión de Inversiones
- ✅ Registro de compras y ventas de activos (Criptomonedas, Acciones, Cedears, Bonos, Letras)
- ✅ Soporte para múltiples exchanges (IOL, Binance, BingX, Buenbit)
- ✅ Cálculo automático de P&L (Profit & Loss) con método **FIFO** (First In, First Out)
- ✅ Tracking de comisiones por operación
- ✅ Posiciones abiertas con precio promedio de compra
- ✅ Historial completo de transacciones con filtros

### 💰 Gestión de Gastos e Ingresos
- ✅ Registro rápido de gastos e ingresos categorizados
- ✅ **Checklist mensual** para gastos recurrentes (alquiler, servicios, etc.)
- ✅ Detección automática de gastos faltantes
- ✅ Soporte para múltiples monedas (ARS, USD)
- ✅ Medios de pago configurables (efectivo, tarjetas, transferencias)
- ✅ Sistema de anulación para correcciones

### 📊 Dashboard y Visualizaciones
- ✅ **Dashboard principal** con métricas en tiempo real:
  - Total invertido y P&L realizado
  - Balance de cashflow del mes actual
  - Top 5 activos con mejor/peor rendimiento
  - Top 5 categorías de gastos
- ✅ **Portfolio visual** con:
  - Diversificación por tipo de activo (gráfico de torta)
  - Diversificación por moneda (gráfico de torta)
  - Tabla completa de posiciones abiertas
- ✅ **Gráficos de tendencia** (últimos 12 meses)
- ✅ Reportes detallados con análisis FIFO

### 📥 Exportación de Datos
- ✅ Exportación a **Excel** (.xlsx) con múltiples hojas:
  - **Inversiones**: Resumen ejecutivo + Análisis FIFO + Detalle de transacciones
  - **Cashflow**: Resumen mensual + Detalle de movimientos
- ✅ Ideal para declaraciones de impuestos y contabilidad

### 👥 Multi-Usuario
- ✅ Autenticación con Firebase (email/password)
- ✅ Datos compartidos entre usuarios autorizados
- ✅ Identificación de quién registró cada operación
- ✅ Permisos de super admin para operaciones críticas

---

## 🚀 **Inicio Rápido**

### Prerrequisitos
- Node.js >= 18.x
- npm o yarn
- Cuenta de Firebase (Firestore + Authentication)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/albert-carrasquel/home-flow.git
cd home-flow

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

### Configuración de Firebase

1. Crear un proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Habilitar **Firestore Database** y **Authentication** (Email/Password)
3. Las credenciales ya están configuradas en `src/config/firebase.js`

---

## 📁 **Estructura de Datos (Firestore)**

```
artifacts/
└── {appId}/
    └── public/
        └── data/
            ├── transactions/          # Inversiones (compra/venta)
            │   └── {transactionId}
            │       ├── tipo: "compra" | "venta"
            │       ├── activo: string
            │       ├── simbolo: string
            │       ├── cantidad: number
            │       ├── precio: number
            │       ├── moneda: "ARS" | "USD"
            │       ├── comision: number
            │       ├── tipoActivo: string
            │       ├── exchange: string
            │       ├── usuario: uid
            │       ├── occurredAt: timestamp
            │       └── anulada: boolean
            │
            ├── cashflow/              # Gastos e ingresos
            │   └── {cashflowId}
            │       ├── tipo: "gasto" | "ingreso"
            │       ├── monto: number
            │       ├── moneda: "ARS" | "USD"
            │       ├── categoria: string
            │       ├── descripcion: string
            │       ├── medioPago: string
            │       ├── usuario: uid
            │       ├── occurredAt: timestamp
            │       └── anulada: boolean
            │
            └── monthly-checklist-{YYYY-MM}/  # Checklist mensual
                └── {templateId}
                    ├── templateId: string
                    ├── nombre: string
                    ├── categoria: string
                    ├── monto: number
                    ├── usuario: uid
                    └── cashflowId: string
```

---

## 🔒 **Seguridad - Reglas de Firestore**

Configurar las siguientes reglas en Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Función helper para verificar autenticación
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Solo usuarios autenticados pueden leer/escribir
    match /artifacts/{appId}/public/data/{document=**} {
      allow read, write: if isAuthenticated();
    }
  }
}
```

---

## 🛠️ **Scripts Disponibles**

```bash
# Desarrollo
npm run dev          # Inicia servidor de desarrollo con hot reload

# Producción
npm run build        # Genera build optimizado en /dist
npm run preview      # Preview del build de producción

# Linting
npm run lint         # Ejecuta ESLint
```

---

## 🏗️ **Stack Tecnológico**

- **Framework**: React 19.2.0
- **Build Tool**: Vite 7.2.6
- **Backend**: Firebase (Firestore + Authentication)
- **Styling**: Custom CSS (variables CSS, diseño responsive)
- **Gráficos**: Recharts (visualizaciones interactivas)
- **Exportación**: XLSX (generación de archivos Excel)
- **Iconos**: Lucide React

---

## 📊 **Algoritmo FIFO**

HomeFlow utiliza el método **First In, First Out (FIFO)** para calcular ganancias y pérdidas:

1. Las compras se registran en orden cronológico
2. Cuando hay una venta, se consume la compra más antigua primero
3. El P&L se calcula como: `(Precio Venta - Precio Compra) × Cantidad - Comisiones`
4. Las posiciones abiertas mantienen su precio promedio de compra

**Ejemplo:**
- Compra 1: 10 BTC @ $30,000 (26/12/2025)
- Compra 2: 5 BTC @ $35,000 (28/12/2025)
- Venta: 8 BTC @ $40,000 (02/01/2026)

**Resultado FIFO:**
- Se consumen 10 BTC de Compra 1 → P&L: $100,000
- Se consumen 2 BTC de Compra 2 (quedan 3 abiertos)
- Posición abierta: 3 BTC @ $35,000

---

## 👥 **Usuarios Configurados**

Los usuarios se configuran en `src/config/constants.js`:

```javascript
export const USER_NAMES = {
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2': 'Albert Carrasquel',
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2': 'Haydee Macias',
};

export const SUPER_ADMINS = [
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2',
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2',
];
```

---

## 🎯 **Roadmap**

Ver [ROADMAP.md](./ROADMAP.md) para la lista completa de features implementadas y pendientes.

**Completadas:**
- ✅ Dashboard con métricas en tiempo real
- ✅ Portfolio con posiciones abiertas
- ✅ Gráficos y visualizaciones
- ✅ Exportación a Excel
- ✅ Checklist de gastos mensuales
- ✅ Refactorización de código

---

## 📝 **Licencia**

Este proyecto es privado y de uso personal.

---

## 👨‍💻 **Autor**

**Albert Carrasquel**  
🔗 GitHub: [@albert-carrasquel](https://github.com/albert-carrasquel)

---

**Última actualización:** 6 de enero de 2026  
**Versión:** 1.0.0-MVP
