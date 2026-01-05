/* global __app_id, __firebase_config */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  addDoc,
  onSnapshot,
  collection,
  query,
  serverTimestamp,
  deleteDoc,
  setLogLevel, // Importación de setLogLevel para depuración
} from 'firebase/firestore';
import { updateDoc, orderBy, limit, getDocs } from 'firebase/firestore';
import logo from './assets/logo.png';
import ConfirmationModal from './components/ConfirmationModal';
import { formatCurrency, sanitizeDecimal, sanitizeActivo, sanitizeNombre, getUniqueActivos, dateStringToTimestamp, getOccurredAtFromDoc } from './utils/formatters';
import { calculateInvestmentReport } from './utils/reporting';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';

// --- CONFIGURACIÓN GLOBAL ---

// Estas variables se proporcionan automáticamente en ciertos entornos.
// En local probablemente NO existan, así que usamos defaults.
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Limpieza del appId para que sea un segmento válido de ruta en Firestore
const appId = rawAppId.replace(/[.:]/g, '-').replace(/\//g, '-');

// Flags DEV (ponelos arriba del componente App o cerca de la config global)
const DEV_BYPASS_AUTH = true;
const DEV_USER_ID = 'dev-albert';

// Configuración de Firebase:
// - Si __firebase_config existe (entorno "especial" tipo Canvas / Gemini), lo usamos.
// - Si no existe (como en tu local o Firebase Hosting), usamos la config "normal" del proyecto.
const firebaseConfig =
  typeof __firebase_config !== 'undefined' && __firebase_config
    ? JSON.parse(__firebase_config)
    : {
      apiKey: 'AIzaSyDqQN-Lf4xZInlqysBaFIwNG2uCGQ1Vde4',
      authDomain: 'investment-manager-e47b6.firebaseapp.com',
      projectId: 'investment-manager-e47b6',
      storageBucket: 'investment-manager-e47b6.firebasestorage.app',
      messagingSenderId: '471997247184',
      appId: '1:471997247184:web:1a571d1cf28a8cfdd6b8d5',
    };

// Nota: __initial_auth_token puede inyectarse en entornos especiales; no se usa actualmente.

// Ruta de Firestore:
// artifacts/{appId}/public/data/transactions
const getTransactionsCollectionPath = (appId) =>
  `artifacts/${appId}/public/data/transactions`;

// Cashflow collection path: artifacts/{appId}/public/data/cashflow
const getCashflowCollectionPath = (appId) =>
  `artifacts/${appId}/public/data/cashflow`;

// UIDs de los super admins permitidos
const SUPER_ADMINS = [
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2', // Reemplaza por el UID real
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2', // Reemplaza por el UID real
];

// Mapeo de UID a nombre de usuario
const USER_NAMES = {
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2': 'Albert Carrasquel',
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2': 'Haydee Macias',
};

const LoginForm = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onLogin({ email, password });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hf-login-container">
      <div className="hf-card hf-login-card">
        <h2 className="text-2xl font-bold mb-6 hf-text-gradient text-center">
          Iniciar Sesión
        </h2>
        {error && (
          <div className="hf-alert hf-alert-error hf-mb-md">{error}</div>
        )}
        <form onSubmit={handleEmailLogin} className="hf-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="hf-input"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="hf-input"
          />
          <button
            type="submit"
            disabled={loading}
            className="hf-button hf-button-primary w-full"
          >
            {loading ? (
              <span className="hf-flex hf-gap-sm" style={{alignItems: 'center', justifyContent: 'center'}}>
                <span className="hf-loading"></span>
                <span>Ingresando...</span>
              </span>
            ) : 'Ingresar'}
          </button>
        </form>
        <div className="hf-divider"></div>
        <button
          type="button"
          onClick={() => onLogin({ google: true })}
          className="hf-button hf-button-secondary w-full"
          style={{background: '#EA4335', color: 'white', border: 'none'}}
        >
          Ingresar con Google
        </button>
      </div>
    </div>
  );
};

// ============================================
// EXPORT FUNCTIONS
// ============================================

/**
 * Exportar reporte de inversiones a Excel
 * @param {Array} transactions - Lista de transacciones filtradas
 * @param {Object} investmentReport - Reporte FIFO calculado
 * @param {Object} metrics - Métricas del reporte
 * @param {Object} filters - Filtros aplicados
 */
const exportInvestmentsToExcel = (transactions, investmentReport, metrics, filters) => {
  const workbook = XLSX.utils.book_new();

  // HOJA 1: Resumen Ejecutivo
  const summaryData = [
    ['REPORTE DE INVERSIONES - HOMEFLOW'],
    ['Generado:', new Date().toLocaleString('es-ES')],
    [''],
    ['FILTROS APLICADOS'],
    ['Usuario:', filters.usuario === 'todos' ? 'Todos' : filters.usuario],
    ['Fecha Desde:', filters.fechaDesde],
    ['Fecha Hasta:', filters.fechaHasta],
    ['Moneda:', filters.monedaInv === 'todas' ? 'Todas' : filters.monedaInv],
    ['Tipo Operación:', filters.tipoOperacion === 'todas' ? 'Todas' : filters.tipoOperacion],
    ['Activo:', filters.activo || 'Todos'],
    [''],
    ['MÉTRICAS GENERALES'],
    ['Total Registros:', metrics.count],
    ['Total Invertido:', metrics.totalInvertido || 0],
    ['Total Recuperado:', metrics.totalRecuperado || 0],
    ['P&L Neto:', metrics.pnlNeto || 0],
    ['P&L %:', `${(metrics.pnlPct || 0).toFixed(2)}%`],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  // HOJA 2: Análisis FIFO por Activo
  if (investmentReport && investmentReport.porActivo.length > 0) {
    const fifoData = [
      ['ANÁLISIS P&L POR ACTIVO (MÉTODO FIFO)'],
      [''],
      ['Activo', 'Moneda', 'Cant. Cerrada', 'Precio Prom. Compra', 'Precio Prom. Venta', 'Total Invertido', 'Total Recuperado', 'P&L Neto', 'P&L %']
    ];

    investmentReport.porActivo.forEach(asset => {
      fifoData.push([
        asset.activo,
        asset.moneda,
        asset.cantidadCerrada,
        asset.promedioCompra,
        asset.promedioVenta,
        asset.totalInvertido,
        asset.totalRecuperado,
        asset.pnlNeto,
        asset.pnlPct
      ]);
    });

    const fifoSheet = XLSX.utils.aoa_to_sheet(fifoData);
    XLSX.utils.book_append_sheet(workbook, fifoSheet, 'Análisis FIFO');
  }

  // HOJA 3: Detalle de Transacciones
  const detailData = [
    ['DETALLE DE TRANSACCIONES'],
    [''],
    ['Fecha', 'Operación', 'Símbolo', 'Nombre', 'Tipo Activo', 'Exchange', 'Cantidad', 'Precio Unitario', 'Comisión %', 'Comisión Monto', 'Monto Total', 'Moneda', 'Usuario', 'Anulada']
  ];

  transactions.forEach(tx => {
    const txDate = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : 
                   tx.fechaOperacion?.toDate ? tx.fechaOperacion.toDate() : null;
    detailData.push([
      txDate ? txDate.toLocaleDateString('es-ES') : 'N/A',
      tx.tipoOperacion || 'N/A',
      tx.simbolo || 'N/A',
      tx.nombre || 'N/A',
      tx.tipoActivo || 'N/A',
      tx.exchange || 'N/A',
      tx.cantidad || 0,
      tx.precioUnitario || 0,
      tx.comisionPct || 0,
      tx.comisionMonto || 0,
      tx.montoTotal || 0,
      tx.moneda || 'N/A',
      tx.usuario || 'N/A',
      tx.anulada ? 'SÍ' : 'NO'
    ]);
  });

  const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle Transacciones');

  // Descargar archivo
  const fileName = `HomeFlow_Inversiones_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/**
 * Exportar reporte de cashflow a Excel
 * @param {Array} cashflows - Lista de cashflows filtrados
 * @param {Object} metrics - Métricas del reporte
 * @param {Object} filters - Filtros aplicados
 */
const exportCashflowToExcel = (cashflows, metrics, filters) => {
  const workbook = XLSX.utils.book_new();

  // HOJA 1: Resumen Ejecutivo
  const summaryData = [
    ['REPORTE DE CASHFLOW - HOMEFLOW'],
    ['Generado:', new Date().toLocaleString('es-ES')],
    [''],
    ['FILTROS APLICADOS'],
    ['Usuario:', filters.usuario === 'todos' ? 'Todos' : filters.usuario],
    ['Fecha Desde:', filters.fechaDesde],
    ['Fecha Hasta:', filters.fechaHasta],
    ['Tipo:', filters.tipoCashflow === 'todos' ? 'Todos' : filters.tipoCashflow],
    ['Categoría:', filters.categoria === 'todos' ? 'Todas' : filters.categoria],
    ['Medio de Pago:', filters.medioPago === 'todos' ? 'Todos' : filters.medioPago],
    ['Moneda:', filters.monedaCash === 'todas' ? 'Todas' : filters.monedaCash],
    [''],
    ['MÉTRICAS GENERALES'],
    ['Total Registros:', metrics.count],
    ['Total Gastos:', metrics.totalGastos || 0],
    ['Total Ingresos:', metrics.totalIngresos || 0],
    ['Balance Neto:', metrics.neto || 0],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');

  // HOJA 2: Detalle de Movimientos
  const detailData = [
    ['DETALLE DE MOVIMIENTOS'],
    [''],
    ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Moneda', 'Medio de Pago', 'Usuario', 'Anulada']
  ];

  cashflows.forEach(cf => {
    const cfDate = cf.occurredAt?.toDate ? cf.occurredAt.toDate() : 
                   cf.fechaOperacion?.toDate ? cf.fechaOperacion.toDate() : null;
    detailData.push([
      cfDate ? cfDate.toLocaleDateString('es-ES') : 'N/A',
      cf.tipo || 'N/A',
      cf.categoria || 'N/A',
      cf.descripcion || 'N/A',
      cf.monto || 0,
      cf.moneda || 'N/A',
      cf.medioPago || 'N/A',
      cf.usuario || 'N/A',
      cf.anulada ? 'SÍ' : 'NO'
    ]);
  });

  const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle Movimientos');

  // Descargar archivo
  const fileName = `HomeFlow_Cashflow_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};


const App = () => {
  // Ref to detect IME composition (avoid sanitizing during composition)
  const compositionRef = useRef(false);

  // sanitizers and formatCurrency are provided by `src/utils/formatters.js`

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  // isAuthReady indica que el intento inicial de autenticación ha finalizado
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [_transactions, setTransactions] = useState([]);
  const [activosList, setActivosList] = useState([]);
  const [newTransaction, setNewTransaction] = useState({
    tipoOperacion: 'compra', // 'compra' o 'venta'
    activo: '',
    usuarioId: '',
    nombreActivo: '',
    tipoActivo: '',
    cantidad: '',
    precioUnitario: '',
    moneda: '',
    comision: '',
    monedaComision: '',
    exchange: '',
    totalOperacion: '',
    notas: '',
    fechaTransaccion: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Replaced aggregate form error with per-field inline errors
  const [fieldErrors, setFieldErrors] = useState({});
  // Cashflow states
  const [cashflows, setCashflows] = useState([]);
  const [newCashflow, setNewCashflow] = useState({
    tipo: 'gasto',
    monto: '',
    usuarioId: '',
    moneda: '',
    fechaOperacion: '',
    categoria: '',
    descripcion: '',
  });
  const [cashflowFieldErrors, setCashflowFieldErrors] = useState({});
  const [showAnnulModal, setShowAnnulModal] = useState(false);
  const [cashflowToAnnul, setCashflowToAnnul] = useState(null);
  // Reports states
  const [reportFilters, setReportFilters] = useState({
    tipoDatos: '',
    usuario: 'todos',
    fechaDesde: '',
    fechaHasta: '',
    // Inversiones filters
    operacion: 'todas',
    simboloActivo: 'todos',
    monedaInv: 'todas',
    // Cashflow filters
    tipoCashflow: 'todos',
    categoria: 'todos',
    medioPago: 'todos',
    monedaCash: 'todas',
    incluirAnulados: false,
  });
  const [reportResults, setReportResults] = useState([]);
  const [reportMetrics, setReportMetrics] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportErrors, setReportErrors] = useState({});
  const [availableActivos, setAvailableActivos] = useState([]);
  // Investment P&L report state
  const [investmentReport, setInvestmentReport] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [docToDelete, setDocToDelete] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(!!DEV_BYPASS_AUTH);
  const [loginError, setLoginError] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  // Mostrar nombre de usuario en vez de UID
  const [userName, setUserName] = useState(DEV_BYPASS_AUTH ? 'Dev Mode' : '');

  // (Filtros y vista se desactivaron por ahora para evitar variables sin usar)
  // Nuevo estado para pestañas multitarea
  const [tab, setTab] = useState('dashboard'); // 'dashboard', 'portfolio', 'inversiones', 'gastos', 'reportes'
  
  // Dashboard states
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  
  // Portfolio states
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);


  // 1. Inicialización de Firebase (y bypass de auth en DEV)
  useEffect(() => {
    if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
      // Defer state changes to avoid triggering synchronous setState inside effect
      setTimeout(() => {
        setError('Error: Firebase configuration is missing.');
        setIsLoading(false);
      }, 0);
      return;
    }

    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);

    setLogLevel('debug');
    // Defer state updates to avoid synchronous setState within effect
    setTimeout(() => {
      setDb(firestore);
      setAuth(firebaseAuth);
      // Marcamos la app lista
      setIsAuthReady(true);
      setIsLoading(false);
    }, 0);

    // BYPASS DEV: entra directo sin login (defer state updates)
    if (DEV_BYPASS_AUTH) {
      setTimeout(() => {
        setUserId(DEV_USER_ID);
        setUserName('Dev Mode');
        setIsSuperAdmin(true);
        setShowLogin(false);
        setLoginError(null);
      }, 0);
    }
  }, []);


  // 2. Suscripción en tiempo real a las transacciones
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const transactionsPath = getTransactionsCollectionPath(appId);

    const q = query(collection(db, transactionsPath));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedTransactions = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedTransactions.push({
            id: docSnap.id,
            ...data,
            timestamp: data.timestamp?.toDate
              ? data.timestamp.toDate()
              : new Date(),
          });
        });
        fetchedTransactions.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(fetchedTransactions);
      },
      (err) => {
        console.error('Error fetching transactions:', err);
        if (err.code === 'permission-denied') {
          setError(
            "Error: Acceso bloqueado. El error 'permission-denied' indica que necesitas actualizar las Reglas de Seguridad de Firestore.",
          );
        } else {
          setError(
            'Error fetching transactions: Problema de red o configuración.',
          );
        }
      },
    );

    return () => unsubscribe();
  }, [db, userId, isAuthReady]);

  // 3. Suscripción en tiempo real a los últimos 5 cashflow (gastos/ingresos)
  useEffect(() => {
    if (!isAuthReady || !db) return;

    const cashflowPath = getCashflowCollectionPath(appId);

    // Helper to fetch merged last-5 by timestamp and fallback to fecha
    const refreshCashflows = async () => {
      try {
        const byTimestampQ = query(collection(db, cashflowPath), orderBy('timestamp', 'desc'), limit(5));
        const snap1 = await getDocs(byTimestampQ);
        const items = [];
        const ids = new Set();
        snap1.forEach((docSnap) => {
          const data = docSnap.data();
          const ts = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : (data.fecha && data.fecha.toDate ? data.fecha.toDate() : new Date());
          items.push({ id: docSnap.id, ...data, timestamp: ts });
          ids.add(docSnap.id);
        });

        if (items.length < 5) {
          // supplement with items ordered by fecha (descending)
          const byFechaQ = query(collection(db, cashflowPath), orderBy('fecha', 'desc'), limit(10));
          const snap2 = await getDocs(byFechaQ);
          snap2.forEach((docSnap) => {
            if (ids.has(docSnap.id)) return;
            const data = docSnap.data();
            const ts = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : (data.fecha && data.fecha.toDate ? data.fecha.toDate() : new Date());
            items.push({ id: docSnap.id, ...data, timestamp: ts });
            ids.add(docSnap.id);
          });
        }

        // Sort merged items by timestamp desc and keep only 5
        items.sort((a, b) => b.timestamp - a.timestamp);
        setCashflows(items.slice(0, 5));
      } catch (e) {
        console.error('Error refreshing cashflows:', e);
        setError('Error fetching cashflow: Problema de red o configuración.');
      }
    };

    // Initial fetch
    refreshCashflows();

    // Listen for changes (using timestamp ordering) and refresh list on updates
    const listenQ = query(collection(db, cashflowPath), orderBy('timestamp', 'desc'), limit(20));
    const unsubscribe = onSnapshot(listenQ, () => {
      refreshCashflows().catch((e) => console.error('Error refreshing on snapshot:', e));
    }, (err) => {
      console.error('Error in cashflow subscription:', err);
    });

    return () => unsubscribe();
  }, [db, isAuthReady]);

  // Build a unique list of activos (optionally filtered by usuarioId from the form)
  useEffect(() => {
    // use helper to compute unique activos (optionally filtered by usuarioId)
    const list = getUniqueActivos(_transactions, newTransaction.usuarioId);
    setActivosList(list);
    if (newTransaction.activo && !list.includes(newTransaction.activo.toUpperCase())) {
      setNewTransaction((prev) => ({ ...prev, activo: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_transactions, newTransaction.usuarioId]);

  // Calculate Dashboard data whenever transactions or cashflows change
  useEffect(() => {
    if (!db || !isAuthReady) {
      setDashboardLoading(true);
      return;
    }

    const calculateDashboard = async () => {
      try {
        setDashboardLoading(true);

        // 1. Fetch all transactions and cashflows
        const transactionsPath = getTransactionsCollectionPath(appId);
        const cashflowPath = getCashflowCollectionPath(appId);

        const [transactionsSnapshot, cashflowSnapshot] = await Promise.all([
          getDocs(query(collection(db, transactionsPath))),
          getDocs(query(collection(db, cashflowPath)))
        ]);

        const allTransactions = [];
        transactionsSnapshot.forEach((docSnap) => {
          allTransactions.push({ id: docSnap.id, ...docSnap.data() });
        });

        const allCashflows = [];
        cashflowSnapshot.forEach((docSnap) => {
          allCashflows.push({ id: docSnap.id, ...docSnap.data() });
        });

        // 2. Calculate Investment Metrics (all time, all users)
        const pnlReport = calculateInvestmentReport(allTransactions, {});
        
        // 3. Calculate Cashflow for current month (excluding anuladas)
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        
        const monthCashflows = allCashflows.filter((cf) => {
          if (cf.anulada) return false;
          const cfDate = cf.occurredAt?.toDate ? cf.occurredAt.toDate() : 
                        cf.fechaOperacion?.toDate ? cf.fechaOperacion.toDate() : null;
          if (!cfDate) return false;
          return cfDate >= firstDayOfMonth && cfDate <= lastDayOfMonth;
        });

        const gastos = monthCashflows.filter((cf) => cf.tipo === 'gasto');
        const ingresos = monthCashflows.filter((cf) => cf.tipo === 'ingreso');
        const totalGastos = gastos.reduce((sum, cf) => sum + (cf.monto || 0), 0);
        const totalIngresos = ingresos.reduce((sum, cf) => sum + (cf.monto || 0), 0);

        // 4. Get top 5 performing assets (by P&L %)
        const sortedAssets = [...pnlReport.porActivo]
          .sort((a, b) => b.pnlPct - a.pnlPct)
          .slice(0, 5);

        // 5. Get cashflow by category (current month)
        const categorySummary = {};
        monthCashflows.forEach((cf) => {
          const cat = cf.categoria || 'Sin categoría';
          if (!categorySummary[cat]) {
            categorySummary[cat] = { gastos: 0, ingresos: 0 };
          }
          if (cf.tipo === 'gasto') {
            categorySummary[cat].gastos += cf.monto || 0;
          } else {
            categorySummary[cat].ingresos += cf.monto || 0;
          }
        });

        // 6. Calculate cashflow for last 12 months (for bar chart)
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
          const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
          
          const monthLabel = monthDate.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
          
          const monthCFs = allCashflows.filter((cf) => {
            if (cf.anulada) return false;
            const cfDate = cf.occurredAt?.toDate ? cf.occurredAt.toDate() : 
                          cf.fechaOperacion?.toDate ? cf.fechaOperacion.toDate() : null;
            if (!cfDate) return false;
            return cfDate >= monthStart && cfDate <= monthEnd;
          });
          
          const ingresos = monthCFs.filter(cf => cf.tipo === 'ingreso').reduce((sum, cf) => sum + (cf.monto || 0), 0);
          const gastos = monthCFs.filter(cf => cf.tipo === 'gasto').reduce((sum, cf) => sum + (cf.monto || 0), 0);
          
          monthlyData.push({
            mes: monthLabel,
            ingresos,
            gastos,
            neto: ingresos - gastos
          });
        }

        // Calcular métricas de inversiones incluyendo posiciones abiertas
        const totalInvertidoAbiertas = pnlReport.posicionesAbiertas.reduce((sum, pos) => {
          return sum + (pos.cantidadActual * pos.precioPromedioCompra);
        }, 0);
        
        const totalInvertidoCerradas = pnlReport.resumenGlobal.totalInvertido || 0;
        const totalRecuperado = pnlReport.resumenGlobal.totalRecuperado || 0;
        
        const totalInvertidoGeneral = totalInvertidoCerradas + totalInvertidoAbiertas;
        const pnlNetoCerradas = pnlReport.resumenGlobal.pnlNeto || 0;
        const pnlPctCerradas = totalInvertidoCerradas > 0 
          ? (pnlNetoCerradas / totalInvertidoCerradas) * 100 
          : 0;

        setDashboardData({
          investments: {
            totalInvertido: totalInvertidoGeneral,
            totalRecuperado: totalRecuperado,
            pnlNeto: pnlNetoCerradas,
            pnlPct: pnlPctCerradas,
            posicionesAbiertas: pnlReport.posicionesAbiertas.length,
          },
          cashflow: {
            totalGastos,
            totalIngresos,
            neto: totalIngresos - totalGastos,
            mes: now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
          },
          topAssets: sortedAssets,
          categoryBreakdown: Object.entries(categorySummary)
            .map(([categoria, data]) => ({
              categoria,
              gastos: data.gastos,
              ingresos: data.ingresos,
              neto: data.ingresos - data.gastos,
            }))
            .sort((a, b) => Math.abs(b.gastos) - Math.abs(a.gastos))
            .slice(0, 5),
          monthlyTrend: monthlyData,
        });
      } catch (error) {
        console.error('Error calculating dashboard:', error);
      } finally {
        setDashboardLoading(false);
      }
    };

    calculateDashboard();
  }, [db, isAuthReady, _transactions, cashflows]);

  // Calculate Portfolio data whenever transactions change
  useEffect(() => {
    if (!db || !isAuthReady) {
      setPortfolioLoading(true);
      return;
    }

    const calculatePortfolio = async () => {
      setPortfolioLoading(true);
      try {
        const transactionsPath = getTransactionsCollectionPath(appId);
        const transactionsSnapshot = await getDocs(query(collection(db, transactionsPath)));
        const allTransactions = transactionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        
        // Use FIFO engine to calculate positions
        const investmentReport = calculateInvestmentReport(allTransactions, {});
        
        if (investmentReport.posicionesAbiertas.length === 0) {
          setPortfolioData({
            posiciones: [],
            resumen: {
              totalInvertido: 0,
              totalPosiciones: 0,
              totalActivos: 0
            },
            porTipo: [],
            porMoneda: []
          });
          setPortfolioLoading(false);
          return;
        }
        
        // Calculate totals
        const totalInvertido = investmentReport.posicionesAbiertas.reduce(
          (sum, pos) => sum + pos.montoInvertido,
          0
        );
        
        // Group by asset type
        const byType = {};
        investmentReport.posicionesAbiertas.forEach((pos) => {
          const tipo = pos.tipoActivo || 'Otros';
          if (!byType[tipo]) {
            byType[tipo] = { tipo, montoInvertido: 0, cantidad: 0 };
          }
          byType[tipo].montoInvertido += pos.montoInvertido;
          byType[tipo].cantidad += 1;
        });
        
        const porTipo = Object.values(byType).map((item) => ({
          ...item,
          porcentaje: totalInvertido > 0 ? (item.montoInvertido / totalInvertido) * 100 : 0
        })).sort((a, b) => b.montoInvertido - a.montoInvertido);
        
        // Group by currency
        const byCurrency = {};
        investmentReport.posicionesAbiertas.forEach((pos) => {
          const moneda = pos.moneda;
          if (!byCurrency[moneda]) {
            byCurrency[moneda] = { moneda, montoInvertido: 0, cantidad: 0 };
          }
          byCurrency[moneda].montoInvertido += pos.montoInvertido;
          byCurrency[moneda].cantidad += 1;
        });
        
        const porMoneda = Object.values(byCurrency).map((item) => ({
          ...item,
          porcentaje: totalInvertido > 0 ? (item.montoInvertido / totalInvertido) * 100 : 0
        })).sort((a, b) => b.montoInvertido - a.montoInvertido);
        
        setPortfolioData({
          posiciones: investmentReport.posicionesAbiertas,
          resumen: {
            totalInvertido,
            totalPosiciones: investmentReport.posicionesAbiertas.length,
            totalActivos: new Set(investmentReport.posicionesAbiertas.map(p => p.activo)).size
          },
          porTipo,
          porMoneda
        });
      } catch (err) {
        console.error('Error calculating portfolio:', err);
        setError('Error al calcular el portfolio.');
      } finally {
        setPortfolioLoading(false);
      }
    };

    calculatePortfolio();
  }, [db, isAuthReady, _transactions]);

  // (Metrics and super-admin derivation are simplified/disabled for now)

  // Manejo de inputs del formulario
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // If IME composition is in progress, set raw value and skip sanitization
    if (compositionRef.current) {
      setNewTransaction((prev) => ({ ...prev, [name]: value }));
      return setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }

    let sanitized = value;
    switch (name) {
      case 'activo':
        sanitized = sanitizeActivo(value);
        break;
      case 'nombreActivo':
        sanitized = sanitizeNombre(value);
        break;
      case 'cantidad':
        sanitized = sanitizeDecimal(value, 8);
        break;
      case 'precioUnitario':
        sanitized = sanitizeDecimal(value, 8);
        break;
      case 'totalOperacion':
        sanitized = sanitizeDecimal(value, 2);
        break;
      case 'comision':
        sanitized = sanitizeDecimal(value, 4);
        break;
      default:
        sanitized = value;
    }

    setNewTransaction((prev) => ({ ...prev, [name]: sanitized }));
    // Clear inline error for this field when the user modifies it
    setFieldErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    // Build per-field errors
    const errors = {};
    const assetSymbol = (newTransaction.activo || '').toUpperCase();
    if (!/^[A-Z]{2,10}$/.test(assetSymbol)) {
      errors.activo = 'El campo "Activo" debe contener solo letras (A-Z), entre 2 y 10 caracteres.';
    }
    if (!/^\d+(\.\d+)?$/.test(newTransaction.cantidad) || parseFloat(newTransaction.cantidad) <= 0) {
      errors.cantidad = 'La "Cantidad" debe ser un número positivo.';
    }
    if (!/^\d+(\.\d+)?$/.test(newTransaction.precioUnitario) || parseFloat(newTransaction.precioUnitario) <= 0) {
      errors.precioUnitario = 'El "Precio Unitario" debe ser un número positivo.';
    }
    // Nombre del activo: solo letras y espacios
    if (newTransaction.nombreActivo && !/^[A-Za-zÀ-ÖØ-öø-ÿ\s]{2,50}$/.test(newTransaction.nombreActivo)) {
      errors.nombreActivo = 'El "Nombre del Activo" debe contener solo letras y espacios (2-50 caracteres).';
    }
    // Tipo de activo: debe ser una de las opciones permitidas y estar seleccionado
    const allowedTipos = ['Cripto', 'Acciones', 'Cedears', 'Lecap', 'Letra', 'Bono'];
    if (!newTransaction.tipoActivo) {
      errors.tipoActivo = 'Selecciona un "Tipo de Activo".';
    } else if (!allowedTipos.includes(newTransaction.tipoActivo)) {
      errors.tipoActivo = 'Selecciona un "Tipo de Activo" válido.';
    }
    // Moneda: requerida y valida
    const allowedMonedas = ['ARS', 'USD'];
    if (!newTransaction.moneda) {
      errors.moneda = 'Selecciona la "Moneda".';
    } else if (!allowedMonedas.includes(newTransaction.moneda)) {
      errors.moneda = 'Selecciona una "Moneda" válida (ARS o USD).';
    }
    // Moneda de comisión (opcional)
    if (newTransaction.monedaComision && !allowedMonedas.includes(newTransaction.monedaComision)) {
      errors.monedaComision = 'Selecciona una "Moneda Comisión" válida (ARS o USD).';
    }
    if (!newTransaction.fechaTransaccion) {
      errors.fechaTransaccion = 'Debes indicar la fecha de la transacción.';
    }
    // Usuario: requerido (selección en el formulario)
    if (!newTransaction.usuarioId) {
      errors.usuarioId = 'Selecciona un usuario.';
    } else if (!USER_NAMES[newTransaction.usuarioId]) {
      errors.usuarioId = 'Selecciona un usuario válido.';
    }
    // Total acorde al recibo (obligatorio, solo números)
    if (!/^\d+(\.\d+)?$/.test(newTransaction.totalOperacion) || parseFloat(newTransaction.totalOperacion) <= 0) {
      errors.totalOperacion = 'El "Total (según recibo)" debe ser un número positivo.';
    }
    // Comisión (opcional) validación numérica
    if (newTransaction.comision && !/^\d+(\.\d+)?$/.test(newTransaction.comision)) {
      errors.comision = 'La "Comisión" debe ser un número válido.';
    }
    // Venta-specific validation: ensure there are activos available to sell for the selected user
    if (newTransaction.tipoOperacion === 'venta') {
      if (activosList.length === 0) {
        errors.activo = 'No hay activos registrados para el usuario seleccionado. No es posible registrar ventas.';
      } else if (!activosList.includes(assetSymbol)) {
        errors.activo = 'El activo seleccionado no está disponible para venta para este usuario.';
      }
    }
    // Exchange: requerido y validar opción
    const allowedExchanges = ['Invertir Online', 'Binance', 'BingX', 'Buenbit'];
    if (!newTransaction.exchange) {
      errors.exchange = 'Selecciona un "Exchange".';
    } else if (!allowedExchanges.includes(newTransaction.exchange)) {
      errors.exchange = 'Selecciona un "Exchange" válido.';
    }

    // If there are any field errors, set them and abort
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    // Normalizamos el activo antes de guardar
    const cantidad = parseFloat(newTransaction.cantidad);
    const precioUnitario = parseFloat(newTransaction.precioUnitario);
    const totalOperacion = parseFloat(newTransaction.totalOperacion);
    
    // Calculate montoTotal (theoretical: cantidad * precioUnitario)
    const montoTotal = cantidad * precioUnitario;
    
    // Calculate diferenciaOperacion (totalOperacion - montoTotal)
    const diferenciaOperacion = totalOperacion - montoTotal;
    
    const transactionToSave = {
      ...newTransaction,
      tipoOperacion: newTransaction.tipoOperacion,
      activo: assetSymbol,
      nombreActivo: newTransaction.nombreActivo || '',
      tipoActivo: newTransaction.tipoActivo,
      cantidad,
      precioUnitario,
      // NEW STANDARD: totalOperacion as source of truth (official receipt amount)
      totalOperacion,
      // NEW STANDARD: montoTotal as calculated theoretical amount
      montoTotal,
      // NEW STANDARD: diferenciaOperacion shows implicit fees/spreads/rounding
      diferenciaOperacion,
      // Guardar comisión como number o null si no existe (importante para cálculos y reportes)
      comision: newTransaction.comision ? parseFloat(newTransaction.comision) : null,
      // Guardar moneda de la comisión como null si está vacía (consistencia con `comision`)
      monedaComision: newTransaction.monedaComision ? newTransaction.monedaComision : null,
      usuarioId: newTransaction.usuarioId || userId,
      // NEW STANDARD: createdAt (audit timestamp) and occurredAt (user-chosen date)
      createdAt: serverTimestamp(),
      occurredAt: dateStringToTimestamp(newTransaction.fechaTransaccion),
      exchange: newTransaction.exchange || '',
    };
    try {
      const transactionsPath = getTransactionsCollectionPath(appId);
      await addDoc(collection(db, transactionsPath), transactionToSave);

      setSuccessMessage('✅ Transacción guardada correctamente');
      setTimeout(() => setSuccessMessage(null), 2500);

      setNewTransaction({
        tipoOperacion: 'compra',
        activo: '',
        usuarioId: '',
        nombreActivo: '',
        tipoActivo: '',
        cantidad: '',
        precioUnitario: '',
        moneda: '',
        comision: '',
        monedaComision: '',
        exchange: '',
        notas: '',
        totalOperacion: '',
        fechaTransaccion: '',
      });
      setFieldErrors({});
    } catch (e) {
      console.error('Error adding transaction: ', e);
      setError('Error al agregar la transacción. Revisa las reglas de seguridad de Firestore.');
    }
  };

  // --- CASHFLOW HANDLERS ---
  const handleCashflowInputChange = (e) => {
    const { name, value } = e.target;
    let sanitized = value;
    if (name === 'monto') sanitized = sanitizeDecimal(value, 4);
    setNewCashflow((prev) => ({ ...prev, [name]: sanitized }));
    setCashflowFieldErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleAddCashflow = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!newCashflow.tipo || !['gasto', 'ingreso'].includes(newCashflow.tipo)) {
      errors.tipo = 'Selecciona tipo: gasto o ingreso.';
    }
    if (!newCashflow.monto || !/^\d+(\.\d+)?$/.test(newCashflow.monto) || parseFloat(newCashflow.monto) <= 0) {
      errors.monto = 'El "Monto" debe ser un número positivo.';
    }
    if (!newCashflow.usuarioId || !USER_NAMES[newCashflow.usuarioId]) {
      errors.usuarioId = 'Selecciona un usuario válido.';
    }
    if (!newCashflow.moneda || !['ARS', 'USD'].includes(newCashflow.moneda)) {
      errors.moneda = 'Selecciona una "Moneda" válida.';
    }
    if (!newCashflow.fechaOperacion) {
      errors.fechaOperacion = 'Indica la fecha de la operación.';
    }
    if (!newCashflow.categoria) {
      errors.categoria = 'Selecciona o escribe una categoría.';
    }

    if (Object.keys(errors).length > 0) {
      setCashflowFieldErrors(errors);
      return;
    }

    const cashflowToSave = {
      usuarioId: newCashflow.usuarioId || userId || 'dev-albert',
      tipo: newCashflow.tipo,
      monto: parseFloat(newCashflow.monto),
      moneda: newCashflow.moneda,
      // NEW STANDARD: createdAt (audit timestamp) and occurredAt (user-chosen date)
      createdAt: serverTimestamp(),
      occurredAt: dateStringToTimestamp(newCashflow.fechaOperacion),
      categoria: newCashflow.categoria,
      descripcion: newCashflow.descripcion || '',
      anulada: false,
    };

    try {
      const cashflowPath = getCashflowCollectionPath(appId);
      await addDoc(collection(db, cashflowPath), cashflowToSave);
      setSuccessMessage('✅ Registro guardado');
      setTimeout(() => setSuccessMessage(null), 2000);
      setNewCashflow({ tipo: 'gasto', monto: '', moneda: '', fechaOperacion: '', categoria: '', descripcion: '' });
      setCashflowFieldErrors({});
    } catch (err) {
      console.error('Error adding cashflow: ', err);
      setError('Error al guardar registro de gasto/ingreso. Revisa reglas de Firestore.');
    }
  };

  const _handleShowAnnulConfirm = (id) => {
    setCashflowToAnnul(id);
    setShowAnnulModal(true);
  };

  const handleCancelAnnul = () => {
    setCashflowToAnnul(null);
    setShowAnnulModal(false);
  };

  const handleAnnulCashflow = async () => {
    if (!cashflowToAnnul) return;
    try {
      const cashflowPath = getCashflowCollectionPath(appId);
      const docRef = doc(db, cashflowPath, cashflowToAnnul);
      await updateDoc(docRef, {
        anulada: true,
        anuladaAt: serverTimestamp(), // legacy field (keep for compatibility)
        anuladaBy: userId || 'dev-albert',
        voidedAt: serverTimestamp(), // NEW STANDARD
        updatedAt: serverTimestamp(), // NEW STANDARD
      });
      handleCancelAnnul();
    } catch (err) {
      console.error('Error annulling cashflow:', err);
      setError('Error al anular el registro.');
      handleCancelAnnul();
    }
  };

  // --- REPORTS HANDLERS ---
  const handleReportFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setReportFilters((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setReportErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleClearReportFilters = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    setReportFilters({
      tipoDatos: '',
      usuario: 'todos',
      fechaDesde: firstDay,
      fechaHasta: lastDay,
      operacion: 'todas',
      simboloActivo: 'todos',
      monedaInv: 'todas',
      tipoCashflow: 'todos',
      categoria: 'todos',
      medioPago: 'todos',
      monedaCash: 'todas',
      incluirAnulados: false,
    });
    setReportResults([]);
    setReportMetrics(null);
    setReportErrors({});
  };

  const handleSearchReports = async () => {
    const errors = {};
    if (!reportFilters.tipoDatos) errors.tipoDatos = 'Selecciona el tipo de datos.';
    if (!reportFilters.fechaDesde) errors.fechaDesde = 'Indica la fecha desde.';
    if (!reportFilters.fechaHasta) errors.fechaHasta = 'Indica la fecha hasta.';
    if (reportFilters.fechaDesde && reportFilters.fechaHasta && reportFilters.fechaDesde > reportFilters.fechaHasta) {
      errors.fechaHasta = 'La fecha "Hasta" debe ser mayor o igual a "Desde".';
    }

    if (Object.keys(errors).length > 0) {
      setReportErrors(errors);
      return;
    }

    setReportLoading(true);
    setReportErrors({});

    try {
      const collectionPath = reportFilters.tipoDatos === 'inversiones' ? getTransactionsCollectionPath(appId) : getCashflowCollectionPath(appId);
      const fromDate = new Date(`${reportFilters.fechaDesde}T00:00:00`);
      const toDate = new Date(`${reportFilters.fechaHasta}T23:59:59`);

      // Fetch all documents from the collection (no complex where clauses to avoid index requirements)
      const q = query(collection(db, collectionPath));
      const snapshot = await getDocs(q);
      const allResults = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        allResults.push({ id: docSnap.id, ...data });
      });

      // Filter in-memory (client-side) to avoid Firestore composite index requirements
      const dataType = reportFilters.tipoDatos === 'inversiones' ? 'inversiones' : 'cashflow';
      let filtered = allResults.filter((r) => {
        // Date range filter using occurredAt with fallback to legacy fields
        const docDate = getOccurredAtFromDoc(r, dataType);
        if (!docDate || docDate < fromDate || docDate > toDate) return false;

        // Usuario filter
        if (reportFilters.usuario !== 'todos' && r.usuarioId !== reportFilters.usuario) return false;

        // Tipo-specific filters
        if (reportFilters.tipoDatos === 'inversiones') {
          if (reportFilters.operacion !== 'todas' && r.tipoOperacion !== reportFilters.operacion) return false;
          if (reportFilters.simboloActivo !== 'todos' && r.activo !== reportFilters.simboloActivo) return false;
          if (reportFilters.monedaInv !== 'todas' && r.moneda !== reportFilters.monedaInv) return false;
        } else {
          if (reportFilters.tipoCashflow !== 'todos' && r.tipo !== reportFilters.tipoCashflow) return false;
          if (reportFilters.categoria !== 'todos' && r.categoria !== reportFilters.categoria) return false;
          if (reportFilters.monedaCash !== 'todas' && r.moneda !== reportFilters.monedaCash) return false;
        }

        // Exclude anulados unless explicitly included
        if (!reportFilters.incluirAnulados && r.anulada) return false;

        return true;
      });

      // Calculate metrics
      let metrics = {};
      if (reportFilters.tipoDatos === 'inversiones') {
        // Use investment P&L engine for inversiones
        const pnlReport = calculateInvestmentReport(filtered, reportFilters);
        setInvestmentReport(pnlReport);
        
        // Keep basic metrics for compatibility
        const compras = filtered.filter((r) => r.tipoOperacion === 'compra');
        const ventas = filtered.filter((r) => r.tipoOperacion === 'venta');
        const totalCompras = compras.reduce((sum, r) => sum + (r.montoTotal || 0), 0);
        const totalVentas = ventas.reduce((sum, r) => sum + (r.montoTotal || 0), 0);
        metrics = { 
          count: filtered.length, 
          totalCompras, 
          totalVentas, 
          neto: totalVentas - totalCompras,
          // Add P&L metrics
          ...pnlReport.resumenGlobal
        };
      } else {
        // Clear investment report for cashflow
        setInvestmentReport(null);
        
        // IMPORTANTE: Para métricas financieras, SIEMPRE excluir anuladas
        // El checkbox "incluirAnulados" solo controla la visibilidad en la tabla, no los cálculos
        const activosParaMetricas = filtered.filter((r) => !r.anulada);
        
        const gastos = activosParaMetricas.filter((r) => r.tipo === 'gasto');
        const ingresos = activosParaMetricas.filter((r) => r.tipo === 'ingreso');
        const totalGastos = gastos.reduce((sum, r) => sum + (r.monto || 0), 0);
        const totalIngresos = ingresos.reduce((sum, r) => sum + (r.monto || 0), 0);
        metrics = { count: filtered.length, totalGastos, totalIngresos, neto: totalIngresos - totalGastos };
      }

      setReportResults(filtered);
      setReportMetrics(metrics);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Error al consultar reportes. Verifica las reglas de Firestore.');
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch available activos for reports simboloActivo filter
  useEffect(() => {
    if (!db || reportFilters.tipoDatos !== 'inversiones') return;
    const fetchActivos = async () => {
      try {
        const transactionsPath = getTransactionsCollectionPath(appId);
        const q = query(collection(db, transactionsPath));
        const snapshot = await getDocs(q);
        const activos = new Set();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.activo) activos.add(data.activo);
        });
        setAvailableActivos(Array.from(activos).sort());
      } catch (e) {
        console.error('Error fetching activos for reports:', e);
      }
    };
    fetchActivos();
  }, [db, reportFilters.tipoDatos]);

  // Manejo del modal de confirmación de borrado
  const _handleShowDeleteConfirm = (id) => {
    setDocToDelete(id);
    setShowConfirmModal(true);
  };

  const handleCancelDelete = () => {
    setDocToDelete(null);
    setShowConfirmModal(false);
  };

  const handleDeleteTransaction = async () => {
    if (!docToDelete) return;

    try {
      const transactionsPath = getTransactionsCollectionPath(appId);
      const docRef = doc(db, transactionsPath, docToDelete);
      await deleteDoc(docRef);
      handleCancelDelete();
    } catch (e) {
      console.error('Error deleting document: ', e);
      setError('Error al eliminar la transacción.');
      handleCancelDelete();
    }
  };

  // Login handler
  const handleLogin = async ({ email, password, google }) => {
    setLoginError(null);
    try {
      if (google) {
        const provider = new GoogleAuthProvider();
        const userCredential = await signInWithPopup(auth, provider);
        setUserId(userCredential.user.uid);
      } else {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        setUserId(userCredential.user.uid);
      }
      setShowLogin(false);
    } catch (e) {
      setLoginError(e.message);
    }
  };

  // (El control de visibilidad del login se gestiona en la inicialización y en el flujo de login)

  // Mostrar nombre de usuario (cuando cambia userId o auth info)
  useEffect(() => {
    if (userId && USER_NAMES[userId]) {
      // Defer to avoid synchronous setState inside effect
      setTimeout(() => setUserName(USER_NAMES[userId]), 0);
      return;
    }

    if (auth && userId) {
      const user = auth.currentUser;
      // defer to avoid synchronous setState in effect
      setTimeout(() => setUserName(user?.displayName || user?.email || 'Usuario'), 0);
    }
  }, [auth, userId]);

  // (Futuros filtros y tokens registrados: desactivados temporalmente para evitar variables sin usar)

  // --- RENDER ---

  let contenido = null;

  if (isLoading) {
    contenido = (
      <div className="hf-flex-center" style={{minHeight: '100vh'}}>
        <div className="hf-card hf-text-center">
          <div className="hf-loading" style={{width: '40px', height: '40px', margin: '0 auto 1rem'}}></div>
          <p className="text-xl">Cargando aplicación...</p>
        </div>
      </div>
    );
  } else if (error) {
    contenido = (
      <div className="hf-page hf-flex-center" style={{minHeight: '100vh'}}>
        <div className="hf-card hf-alert-error" style={{maxWidth: '500px'}}>
          <h2 className="text-2xl font-bold mb-4">Error de Configuración/Conexión</h2>
          <p className="font-semibold mb-2">{error}</p>
        </div>
      </div>
    );
  } else if (!DEV_BYPASS_AUTH && !isSuperAdmin && isAuthReady) {
    contenido = (
      <div className="hf-page hf-flex-center" style={{minHeight: '100vh'}}>
        <div className="hf-card hf-alert-error" style={{maxWidth: '500px'}}>
          <h2 className="text-2xl font-bold mb-4">Acceso Denegado</h2>
        </div>
      </div>
    );
  } else if (tab === 'dashboard') {
    contenido = (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Dashboard</h2>
          </div>
          <div className="hf-flex hf-gap-sm">
            <button className="hf-button hf-button-secondary" onClick={() => setTab('portfolio')}>
              <span>💼 Portfolio</span>
            </button>
            <button className="hf-button hf-button-secondary" onClick={() => setTab('inversiones')}>
              <span>📈 Inversiones</span>
            </button>
            <button className="hf-button hf-button-secondary" onClick={() => setTab('gastos')}>
              <span>💰 Gastos</span>
            </button>
            <button className="hf-button hf-button-secondary" onClick={() => setTab('reportes')}>
              <span>📊 Reportes</span>
            </button>
          </div>
        </div>

        {dashboardLoading ? (
          <div className="hf-flex-center" style={{minHeight: '60vh'}}>
            <div className="hf-card hf-text-center">
              <div className="hf-loading" style={{width: '40px', height: '40px', margin: '0 auto 1rem'}}></div>
              <p>Cargando dashboard...</p>
            </div>
          </div>
        ) : dashboardData ? (
          <div>
            {/* Welcome Section */}
            <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
              <h1 className="text-2xl font-bold mb-2">Bienvenido, {userName}</h1>
              <p style={{color: 'var(--hf-text-secondary)'}}>
                Aquí tienes un resumen de tu situación financiera actual
              </p>
            </div>

            {/* Investment Metrics */}
            <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
              <h3 className="text-lg font-semibold mb-4 hf-text-gradient">💼 Inversiones</h3>
              <div className="hf-metrics-grid">
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Total Invertido</div>
                  <div className="hf-metric-value hf-metric-value-positive">
                    {formatCurrency(dashboardData.investments.totalInvertido, 'ARS')}
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Total Recuperado</div>
                  <div className="hf-metric-value" style={{color: 'var(--hf-accent-blue)'}}>
                    {formatCurrency(dashboardData.investments.totalRecuperado, 'ARS')}
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">P&L Neto</div>
                  <div className={`hf-metric-value ${dashboardData.investments.pnlNeto >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}`}>
                    {formatCurrency(dashboardData.investments.pnlNeto, 'ARS')}
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Rendimiento</div>
                  <div className={`hf-metric-value ${dashboardData.investments.pnlPct >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}`}>
                    {dashboardData.investments.pnlPct.toFixed(2)}%
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Posiciones Abiertas</div>
                  <div className="hf-metric-value">{dashboardData.investments.posicionesAbiertas}</div>
                </div>
              </div>
            </div>

            {/* Cashflow Metrics */}
            <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
              <h3 className="text-lg font-semibold mb-4 hf-text-gradient">💰 Cashflow ({dashboardData.cashflow.mes})</h3>
              <div className="hf-metrics-grid">
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Total Ingresos</div>
                  <div className="hf-metric-value hf-metric-value-positive">
                    {formatCurrency(dashboardData.cashflow.totalIngresos, 'ARS')}
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Total Gastos</div>
                  <div className="hf-metric-value hf-metric-value-negative">
                    {formatCurrency(dashboardData.cashflow.totalGastos, 'ARS')}
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Balance Neto</div>
                  <div className={`hf-metric-value ${dashboardData.cashflow.neto >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}`}>
                    {formatCurrency(dashboardData.cashflow.neto, 'ARS')}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Cashflow Trend */}
            <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
              <h3 className="text-lg font-semibold mb-4">📊 Tendencia Mensual (Últimos 12 meses)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboardData.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => formatCurrency(value, 'ARS')}
                    contentStyle={{ backgroundColor: 'var(--hf-bg-card)', border: '1px solid var(--hf-border)' }}
                  />
                  <Legend />
                  <Bar dataKey="ingresos" fill="#10b981" name="Ingresos" />
                  <Bar dataKey="gastos" fill="#ef4444" name="Gastos" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Two Column Layout */}
            <div className="hf-grid-2" style={{gap: 'var(--hf-space-lg)', alignItems: 'start'}}>
              {/* Top 5 Performing Assets */}
              <div className="hf-card">
                <h3 className="text-lg font-semibold mb-4">📈 Top 5 Activos (Rendimiento)</h3>
                {dashboardData.topAssets.length === 0 ? (
                  <div className="hf-empty-state">
                    <p>No hay datos de activos cerrados</p>
                  </div>
                ) : (
                  <div className="hf-list">
                    {dashboardData.topAssets.map((asset, idx) => (
                      <div key={idx} className="hf-list-item hf-flex-between">
                        <div>
                          <div className="font-bold">{asset.activo}</div>
                          <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                            {asset.moneda} • {asset.cantidadCerrada.toFixed(4)} unidades
                          </div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                          <div className={asset.pnlPct >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'} style={{fontSize: '1.25rem', fontWeight: 'bold'}}>
                            {asset.pnlPct.toFixed(2)}%
                          </div>
                          <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                            {formatCurrency(asset.pnlNeto, asset.moneda)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top 5 Categories */}
              <div className="hf-card">
                <h3 className="text-lg font-semibold mb-4">🏷️ Top 5 Categorías (Gastos del Mes)</h3>
                {dashboardData.categoryBreakdown.length === 0 ? (
                  <div className="hf-empty-state">
                    <p>No hay gastos este mes</p>
                  </div>
                ) : (
                  <div className="hf-list">
                    {dashboardData.categoryBreakdown.map((cat, idx) => (
                      <div key={idx} className="hf-list-item hf-flex-between">
                        <div>
                          <div className="font-bold">{cat.categoria}</div>
                          <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                            {cat.ingresos > 0 && `Ingresos: ${formatCurrency(cat.ingresos, 'ARS')}`}
                          </div>
                        </div>
                        <div style={{textAlign: 'right'}}>
                          <div className="hf-metric-value-negative" style={{fontSize: '1.125rem', fontWeight: 'bold'}}>
                            {formatCurrency(cat.gastos, 'ARS')}
                          </div>
                          {cat.neto !== -cat.gastos && (
                            <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                              Neto: {formatCurrency(cat.neto, 'ARS')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="hf-card" style={{marginTop: 'var(--hf-space-lg)'}}>
              <h3 className="text-lg font-semibold mb-4">⚡ Acciones Rápidas</h3>
              <div className="hf-features-grid">
                <button className="hf-button hf-button-primary" onClick={() => setTab('portfolio')}>
                  <span className="hf-feature-icon">💼</span>
                  <span>Ver Portfolio Actual</span>
                </button>
                <button className="hf-button hf-button-primary" onClick={() => setTab('inversiones')}>
                  <span className="hf-feature-icon">📈</span>
                  <span>Nueva Inversión</span>
                </button>
                <button className="hf-button hf-button-primary" onClick={() => setTab('gastos')}>
                  <span className="hf-feature-icon">💰</span>
                  <span>Registrar Gasto/Ingreso</span>
                </button>
                <button className="hf-button hf-button-primary" onClick={() => setTab('reportes')}>
                  <span className="hf-feature-icon">📊</span>
                  <span>Ver Reportes Detallados</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hf-card hf-alert-error">
            <p>Error al cargar datos del dashboard</p>
          </div>
        )}
      </div>
    );
  } else if (tab === 'portfolio') {
    contenido = (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Portfolio de Posiciones Abiertas</h2>
          </div>
          <button className="hf-button hf-button-ghost" onClick={() => setTab('dashboard')}>🏠 Dashboard</button>
        </div>

        {portfolioLoading ? (
          <div className="hf-flex-center" style={{minHeight: '60vh'}}>
            <div className="hf-card hf-text-center">
              <div className="hf-loading" style={{width: '40px', height: '40px', margin: '0 auto 1rem'}}></div>
              <p>Cargando portfolio...</p>
            </div>
          </div>
        ) : portfolioData ? (
          <div>
            {/* Summary Cards */}
            <div className="hf-card" style={{marginBottom: 'var(--hf-space-lg)'}}>
              <h3 className="text-lg font-semibold mb-4 hf-text-gradient">📊 Resumen del Portfolio</h3>
              <div className="hf-metrics-grid">
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Total Invertido</div>
                  <div className="hf-metric-value" style={{color: 'var(--hf-text-secondary)'}}>
                    {formatCurrency(portfolioData.resumen.totalInvertido, 'ARS')}
                  </div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Total Posiciones</div>
                  <div className="hf-metric-value">{portfolioData.resumen.totalPosiciones}</div>
                </div>
                <div className="hf-metric-card">
                  <div className="hf-metric-label">Activos Únicos</div>
                  <div className="hf-metric-value">{portfolioData.resumen.totalActivos}</div>
                </div>
              </div>
            </div>

            {/* Two Column Layout: Diversification */}
            <div className="hf-grid-2" style={{gap: 'var(--hf-space-lg)', alignItems: 'start', marginBottom: 'var(--hf-space-lg)'}}>
              {/* By Asset Type */}
              <div className="hf-card">
                <h3 className="text-lg font-semibold mb-4">🏷️ Diversificación por Tipo</h3>
                {portfolioData.porTipo.length === 0 ? (
                  <div className="hf-empty-state">
                    <p>No hay datos de diversificación</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={portfolioData.porTipo}
                          dataKey="porcentaje"
                          nameKey="tipo"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({tipo, porcentaje}) => `${tipo}: ${porcentaje.toFixed(1)}%`}
                        >
                          {portfolioData.porTipo.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="hf-list" style={{marginTop: 'var(--hf-space-md)'}}>
                      {portfolioData.porTipo.map((item, idx) => (
                        <div key={idx} className="hf-list-item hf-flex-between">
                          <div>
                            <div className="font-bold">{item.tipo}</div>
                            <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                              {item.cantidad} {item.cantidad === 1 ? 'posición' : 'posiciones'}
                            </div>
                          </div>
                          <div style={{textAlign: 'right'}}>
                            <div className="hf-metric-value-positive" style={{fontSize: '1.25rem', fontWeight: 'bold'}}>
                              {item.porcentaje.toFixed(1)}%
                            </div>
                            <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                              {formatCurrency(item.montoInvertido, 'ARS')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* By Currency */}
              <div className="hf-card">
                <h3 className="text-lg font-semibold mb-4">💱 Diversificación por Moneda</h3>
                {portfolioData.porMoneda.length === 0 ? (
                  <div className="hf-empty-state">
                    <p>No hay datos de diversificación</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={portfolioData.porMoneda}
                          dataKey="porcentaje"
                          nameKey="moneda"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({moneda, porcentaje}) => `${moneda}: ${porcentaje.toFixed(1)}%`}
                        >
                          {portfolioData.porMoneda.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6'][index % 2]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="hf-list" style={{marginTop: 'var(--hf-space-md)'}}>
                      {portfolioData.porMoneda.map((item, idx) => (
                        <div key={idx} className="hf-list-item hf-flex-between">
                          <div>
                            <div className="font-bold">{item.moneda}</div>
                            <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                              {item.cantidad} {item.cantidad === 1 ? 'posición' : 'posiciones'}
                            </div>
                          </div>
                          <div style={{textAlign: 'right'}}>
                            <div className="hf-metric-value-positive" style={{fontSize: '1.25rem', fontWeight: 'bold'}}>
                              {item.porcentaje.toFixed(1)}%
                            </div>
                            <div className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>
                              {formatCurrency(item.montoInvertido, item.moneda)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Positions Table */}
            <div className="hf-card">
              <div style={{marginBottom: 'var(--hf-space-md)'}}>
                <h3 className="text-lg font-semibold">📋 Posiciones Actuales</h3>
              </div>
              {portfolioData.posiciones.length === 0 ? (
                <div className="hf-empty-state">
                  <p>No tienes posiciones abiertas en este momento</p>
                  <button className="hf-button hf-button-primary" onClick={() => setTab('inversiones')} style={{marginTop: 'var(--hf-space-md)'}}>
                    Registrar Primera Inversión
                  </button>
                </div>
              ) : (
                <div className="hf-table-container">
                  <table className="hf-table">
                    <thead>
                      <tr>
                        <th>Activo</th>
                        <th>Tipo</th>
                        <th>Moneda</th>
                        <th>Cantidad</th>
                        <th>Precio Prom. Compra</th>
                        <th>Monto Invertido</th>
                        <th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioData.posiciones.map((pos, idx) => {
                        return (
                          <tr key={idx}>
                            <td style={{fontWeight: '600'}}>
                              <div>{pos.activo}</div>
                              {pos.nombreActivo && pos.nombreActivo !== pos.activo && (
                                <div className="text-sm" style={{color: 'var(--hf-text-secondary)', fontWeight: 'normal'}}>
                                  {pos.nombreActivo}
                                </div>
                              )}
                            </td>
                            <td>
                              <span className="hf-badge hf-badge-info">{pos.tipoActivo}</span>
                            </td>
                            <td style={{fontWeight: '500'}}>{pos.moneda}</td>
                            <td style={{fontWeight: '600'}}>{pos.cantidadRestante.toFixed(4)}</td>
                            <td>{formatCurrency(pos.promedioCompra, pos.moneda)}</td>
                            <td style={{fontWeight: 'bold', color: 'var(--hf-text-secondary)'}}>
                              {formatCurrency(pos.montoInvertido, pos.moneda)}
                            </td>
                            <td style={{color: 'var(--hf-accent-primary)', fontWeight: '500'}}>
                              {USER_NAMES[pos.usuarioId]?.split(' ')[0] || 'Usuario'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="hf-card hf-alert-error">
            <p>Error al cargar datos del portfolio</p>
          </div>
        )}
      </div>
    );
  } else if (tab === 'inversiones') {
    contenido = (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Inversiones</h2>
          </div>
          <button className="hf-button hf-button-ghost" onClick={() => setTab('dashboard')}>🏠 Dashboard</button>
        </div>
        
        <div className="hf-card" style={{maxWidth: '900px', margin: '0 auto'}}>
          <h2 className="text-2xl font-bold mb-6 hf-text-gradient text-center">Agregar nueva transacción</h2>

          {successMessage && (
            <div className="hf-alert hf-alert-success">
              {successMessage}
            </div>
          )}

          {/* Ahora mostramos errores inline por campo en lugar de un mensaje global */}
          <form onSubmit={handleAddTransaction} className="hf-form">
            <div className="hf-grid-2">
              <div className="hf-field">
                <label className="block text-sm font-medium">Tipo de Operación</label>
                <div className="hf-radio-group">
                  <label className="hf-radio-label">
                    <input type="radio" name="tipoOperacion" value="compra" checked={newTransaction.tipoOperacion === 'compra'} onChange={handleInputChange} />
                    <span>Compra</span>
                  </label>
                  <label className="hf-radio-label">
                    <input type="radio" name="tipoOperacion" value="venta" checked={newTransaction.tipoOperacion === 'venta'} onChange={handleInputChange} />
                    <span>Venta</span>
                  </label>
                </div>
              </div>
              <div className="hf-field">
                <label htmlFor="fechaTransaccion">Fecha de la transacción</label>
                <input id="fechaTransaccion" name="fechaTransaccion" type="date" required value={newTransaction.fechaTransaccion || ''} onChange={handleInputChange} className="hf-input" />
                {fieldErrors.fechaTransaccion && (
                  <p className="hf-field-error">{fieldErrors.fechaTransaccion}</p>
                )}
              </div>
            </div>
            <div className="hf-field">
              <label htmlFor="usuarioId">Usuario</label>
              <select id="usuarioId" name="usuarioId" value={newTransaction.usuarioId} onChange={handleInputChange} required className="hf-select">
                <option value="" disabled>Selecciona usuario...</option>
                {Object.entries(USER_NAMES).map(([uid, name]) => (
                  <option key={uid} value={uid}>{name.split(' ')[0]}</option>
                ))}
              </select>
              {fieldErrors.usuarioId && (
                <p className="hf-field-error">{fieldErrors.usuarioId}</p>
              )}
              {newTransaction.tipoOperacion === 'venta' && !newTransaction.usuarioId && (
                <p className="text-sm" style={{color: 'var(--hf-text-muted)', marginTop: '0.5rem'}}>Selecciona un usuario para ver los activos disponibles para venta.</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="activo">Símbolo del Activo</label>
              {newTransaction.tipoOperacion === 'compra' ? (
                <input
                  id="activo"
                  name="activo"
                  type="text"
                  placeholder="Ej: BTC, AAPL, INTC"
                  value={newTransaction.activo}
                  onChange={handleInputChange}
                  onPaste={(e) => {
                    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                    const cleaned = sanitizeActivo(text);
                    if (cleaned !== text) {
                      e.preventDefault();
                      setNewTransaction((prev) => ({ ...prev, activo: cleaned }));
                    }
                  }}
                  onCompositionStart={() => { compositionRef.current = true; }}
                  onCompositionEnd={(e) => {
                    compositionRef.current = false;
                    const cleaned = sanitizeActivo(e.target.value);
                    setNewTransaction((prev) => ({ ...prev, activo: cleaned }));
                  }}
                  required
                  maxLength={10}
                  className="hf-input uppercase"
                />
              ) : (
                <select
                  id="activo"
                  name="activo"
                  value={newTransaction.activo}
                  onChange={handleInputChange}
                  required
                  className="hf-select"
                  disabled={activosList.length === 0}
                >
                  {activosList.length === 0 ? (
                    <option value="" disabled>No hay activos registrados</option>
                  ) : (
                    <>
                      <option value="" disabled>Selecciona símbolo...</option>
                      {activosList.map((sym) => (
                        <option key={sym} value={sym}>{sym}</option>
                      ))}
                    </>
                  )}
                </select>
              )}
              {fieldErrors.activo && (
                <p className="hf-field-error">{fieldErrors.activo}</p>
              )}
              {newTransaction.tipoOperacion === 'venta' && activosList.length === 0 && (
                <p className="hf-alert hf-alert-warning" style={{fontSize: '0.875rem', padding: '0.5rem', marginTop: '0.5rem'}}>No hay activos registrados para el usuario seleccionado. No es posible registrar ventas.</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="nombreActivo">Nombre del Activo</label>
              <input id="nombreActivo" name="nombreActivo" type="text" placeholder="Ej: Bitcoin" value={newTransaction.nombreActivo} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeNombre(text);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, nombreActivo: cleaned }));
                  setFieldErrors(prev => ({ ...prev, nombreActivo: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="hf-input" />
              {fieldErrors.nombreActivo && (
                <p className="hf-field-error">{fieldErrors.nombreActivo}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="tipoActivo">Tipo de Activo</label>
              <select id="tipoActivo" name="tipoActivo" value={newTransaction.tipoActivo} onChange={handleInputChange} required className="hf-select">
                <option value="" disabled>Selecciona tipo de activo...</option>
                <option value="Cripto">Cripto</option>
                <option value="Acciones">Acciones</option>
                <option value="Cedears">Cedears</option>
                <option value="Lecap">Lecap</option>
                <option value="Letra">Letra</option>
                <option value="Bono">Bono</option>
              </select>
              {fieldErrors.tipoActivo && (
                <p className="hf-field-error">{fieldErrors.tipoActivo}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="moneda">Moneda</label>
              <select id="moneda" name="moneda" required value={newTransaction.moneda} onChange={handleInputChange} className="hf-select">
                <option value="" disabled>Selecciona moneda...</option>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              {fieldErrors.moneda && (
                <p className="hf-field-error">{fieldErrors.moneda}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="cantidad">Cantidad</label>
              <input id="cantidad" name="cantidad" type="text" inputMode="decimal" required placeholder="Ej: 0.5" value={newTransaction.cantidad} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 8);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, cantidad: cleaned }));
                  setFieldErrors(prev => ({ ...prev, cantidad: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="hf-input" />
              {fieldErrors.cantidad && (
                <p className="hf-field-error">{fieldErrors.cantidad}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="precioUnitario">Precio Unitario</label>
              <input id="precioUnitario" name="precioUnitario" type="text" inputMode="decimal" required placeholder="Ej: 100.00" value={newTransaction.precioUnitario} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 8);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, precioUnitario: cleaned }));
                  setFieldErrors(prev => ({ ...prev, precioUnitario: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="hf-input" />
              {fieldErrors.precioUnitario && (
                <p className="hf-field-error">{fieldErrors.precioUnitario}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="totalOperacion">Total {newTransaction.tipoOperacion === 'compra' ? 'Compra' : 'Venta'} (según recibo)</label>
              <input id="totalOperacion" name="totalOperacion" type="text" inputMode="decimal" required step="any" min="0.01" placeholder="Ej: 1000.00" value={newTransaction.totalOperacion || ''} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 2);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, totalOperacion: cleaned }));
                  setFieldErrors(prev => ({ ...prev, totalOperacion: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="hf-input" />
              {fieldErrors.totalOperacion && (
                <p className="hf-field-error">{fieldErrors.totalOperacion}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="comision">Comisión (opcional)</label>
              <input id="comision" name="comision" type="text" inputMode="decimal" step="any" min="0" placeholder="Ej: 1.5" value={newTransaction.comision} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 4);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, comision: cleaned }));
                  setFieldErrors(prev => ({ ...prev, comision: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="hf-input" />
              {fieldErrors.comision && (
                <p className="hf-field-error">{fieldErrors.comision}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="monedaComision">Moneda Comisión (opcional)</label>
              <select id="monedaComision" name="monedaComision" value={newTransaction.monedaComision} onChange={handleInputChange} className="hf-select">
                <option value="" disabled>Selecciona moneda para la comisión...</option>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              {fieldErrors.monedaComision && (
                <p className="hf-field-error">{fieldErrors.monedaComision}</p>
              )}
            </div>
            <div className="hf-field">
              <label htmlFor="exchange">Exchange</label>
              <select id="exchange" name="exchange" value={newTransaction.exchange} onChange={handleInputChange} required className="hf-select">
                <option value="" disabled>Selecciona exchange...</option>
                <option value="Invertir Online">Invertir Online</option>
                <option value="Binance">Binance</option>
                <option value="BingX">BingX</option>
                <option value="Buenbit">Buenbit</option>
              </select>
              {fieldErrors.exchange && (
                <p className="hf-field-error">{fieldErrors.exchange}</p>
              )}
            </div>
            
            <div className="hf-field">
              <label htmlFor="notas">Notas (opcional)</label>
              <textarea id="notas" name="notas" rows={3} placeholder="Observaciones, detalles..." value={newTransaction.notas} onChange={handleInputChange} className="hf-textarea" />
            </div>
            <button
              type="submit"
              disabled={newTransaction.tipoOperacion === 'venta' && activosList.length === 0}
              className="hf-button hf-button-primary w-full"
              style={{fontSize: '1.125rem', padding: '1rem'}}
            >Agregar Transacción</button>
          </form>
        </div>
      </div>
    );
  } else if (tab === 'gastos') {
    contenido = (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Gastos / Ingresos</h2>
          </div>
          <button className="hf-button hf-button-ghost" onClick={() => setTab('dashboard')}>🏠 Dashboard</button>
        </div>
        <div className="hf-card" style={{maxWidth: '900px', margin: '0 auto'}}>
          <h2 className="text-xl font-bold mb-4 hf-text-gradient text-center">Registrar Gasto / Ingreso</h2>

          {successMessage && (
            <div className="hf-alert hf-alert-success">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleAddCashflow} className="hf-form">
            <div className="hf-grid-2">
              <div className="hf-field">
                <label>Tipo</label>
                <select name="tipo" value={newCashflow.tipo} onChange={handleCashflowInputChange} required className="hf-select">
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                </select>
                {cashflowFieldErrors.tipo && <p className="hf-field-error">{cashflowFieldErrors.tipo}</p>}
              </div>
              <div className="hf-field">
                <label>Fecha</label>
                <input name="fechaOperacion" value={newCashflow.fechaOperacion || ''} onChange={handleCashflowInputChange} type="date" required className="hf-input" />
                {cashflowFieldErrors.fechaOperacion && <p className="hf-field-error">{cashflowFieldErrors.fechaOperacion}</p>}
              </div>
            </div>

            <div className="hf-field">
              <label>Usuario</label>
              <select name="usuarioId" value={newCashflow.usuarioId} onChange={handleCashflowInputChange} required className="hf-select">
                <option value="" disabled>Selecciona usuario...</option>
                {Object.entries(USER_NAMES).map(([uid, name]) => (
                  <option key={uid} value={uid}>{name.split(' ')[0]}</option>
                ))}
              </select>
              {cashflowFieldErrors.usuarioId && <p className="hf-field-error">{cashflowFieldErrors.usuarioId}</p>}
            </div>

            <div className="hf-grid-3">
              <div className="hf-field">
                <label>Monto</label>
                <input name="monto" value={newCashflow.monto} onChange={handleCashflowInputChange} inputMode="decimal" placeholder="Ej: 1000.00" className="hf-input" />
                {cashflowFieldErrors.monto && <p className="hf-field-error">{cashflowFieldErrors.monto}</p>}
              </div>
              <div className="hf-field">
                <label>Moneda</label>
                <select name="moneda" value={newCashflow.moneda} onChange={handleCashflowInputChange} required className="hf-select">
                  <option value="">Selecciona moneda...</option>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                {cashflowFieldErrors.moneda && <p className="hf-field-error">{cashflowFieldErrors.moneda}</p>}
              </div>
              <div className="hf-field">
                <label>Categoría</label>
                <select name="categoria" value={newCashflow.categoria} onChange={handleCashflowInputChange} required className="hf-select">
                  <option value="">Selecciona categoría...</option>
                  <option value="Comida">Comida</option>
                  <option value="Servicios">Servicios</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Salud">Salud</option>
                  <option value="Entretenimiento">Entretenimiento</option>
                  <option value="Sueldo">Sueldo</option>
                  <option value="Otros">Otros</option>
                </select>
                {cashflowFieldErrors.categoria && <p className="hf-field-error">{cashflowFieldErrors.categoria}</p>}
              </div>
            </div>

            <div className="hf-field">
              <label>Descripción (opcional)</label>
              <input name="descripcion" value={newCashflow.descripcion} onChange={handleCashflowInputChange} placeholder="Detalle breve..." className="hf-input" />
            </div>

            <button type="submit" className="hf-button hf-button-primary w-full" style={{fontSize: '1rem', padding: '0.875rem'}}>Guardar</button>
          </form>

          <div className="hf-divider"></div>

          <h3 className="text-lg font-semibold mb-3">Últimos 5 registros</h3>
          <div className="hf-list">
            {cashflows.length === 0 ? (
              <div className="hf-empty-state">
                <p>No hay registros recientes.</p>
              </div>
            ) : (
              cashflows.map((c) => (
                <div key={c.id} className="hf-list-item hf-flex-between">
                  <div>
                    <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem'}}>
                      <span className={`hf-badge ${c.tipo === 'gasto' ? 'hf-badge-error' : 'hf-badge-success'}`}>{c.tipo.toUpperCase()}</span>
                      <span className="text-sm" style={{color: 'var(--hf-text-secondary)'}}>{c.categoria}</span>
                      <span className="text-sm font-medium" style={{color: 'var(--hf-accent-primary)'}}>{USER_NAMES[c.usuarioId] ? USER_NAMES[c.usuarioId].split(' ')[0] : 'Usuario'}</span>
                    </div>
                    <div className="font-bold text-lg">{formatCurrency(c.monto || 0, c.moneda || 'ARS')}</div>
                    <div className="text-sm" style={{color: 'var(--hf-text-muted)'}}>{(c.fechaOperacion && c.fechaOperacion.toDate) ? c.fechaOperacion.toDate().toLocaleDateString() : (c.fechaOperacion ? new Date(c.fechaOperacion).toLocaleDateString() : '')}</div>
                    {c.descripcion && <div className="text-sm mt-1" style={{color: 'var(--hf-text-secondary)'}}>{c.descripcion}</div>}
                    {c.anulada && <div className="mt-2"><span className="hf-badge hf-badge-warning">ANULADA</span></div>}
                  </div>
                  <div className="hf-flex" style={{flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem'}}>
                    <div className="text-sm" style={{color: 'var(--hf-text-muted)'}}>{new Date(c.timestamp || Date.now()).toLocaleString()}</div>
                    {!c.anulada ? (
                      <button onClick={() => _handleShowAnnulConfirm(c.id)} className="hf-button hf-button-danger" style={{padding: '0.5rem 1rem', fontSize: '0.875rem'}}>Anular</button>
                    ) : (
                      <button disabled className="hf-button" style={{padding: '0.5rem 1rem', fontSize: '0.875rem', opacity: 0.5}}>Anulada</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Annul confirmation modal */}
        {showAnnulModal && (
          <ConfirmationModal onConfirm={handleAnnulCashflow} onCancel={handleCancelAnnul} />
        )}
      </div>
    );
  } else if (tab === 'reportes') {
    contenido = (
      <div className="hf-page">
        <div className="hf-header">
          <div className="hf-flex hf-gap-md" style={{alignItems: 'center'}}>
            <img src={logo} alt="HomeFlow Logo" style={{width: '40px', height: '40px', filter: 'drop-shadow(0 0 12px rgba(255, 176, 136, 0.3))'}} />
            <h2>Reportes</h2>
          </div>
          <button className="hf-button hf-button-ghost" onClick={() => setTab('dashboard')}>🏠 Dashboard</button>
        </div>

        {/* Filters panel */}
        <div className="hf-card hf-mb-lg">
          <h2 className="text-xl font-bold mb-4 hf-text-gradient">Filtros de consulta</h2>
          <div className="hf-form">
            {/* General filters */}
            <div className="hf-grid-3">
              <div className="hf-field">
                <label>Tipo de datos *</label>
                <select name="tipoDatos" value={reportFilters.tipoDatos} onChange={handleReportFilterChange} className="hf-select">
                  <option value="">Selecciona tipo...</option>
                  <option value="inversiones">Inversiones</option>
                  <option value="cashflow">Cashflow</option>
                </select>
                {reportErrors.tipoDatos && <p className="hf-field-error">{reportErrors.tipoDatos}</p>}
              </div>
              <div className="hf-field">
                <label>Usuario *</label>
                <select name="usuario" value={reportFilters.usuario} onChange={handleReportFilterChange} className="hf-select">
                  <option value="todos">Todos</option>
                  {Object.entries(USER_NAMES).map(([uid, name]) => (
                    <option key={uid} value={uid}>{name.split(' ')[0]}</option>
                  ))}
                </select>
              </div>
              <div className="hf-field">
                <label className="hf-checkbox-label" style={{marginTop: '1.5rem'}}>
                  <input type="checkbox" name="incluirAnulados" checked={reportFilters.incluirAnulados} onChange={handleReportFilterChange} />
                  <span>Incluir anulados</span>
                </label>
              </div>
            </div>

            <div className="hf-grid-2">
              <div className="hf-field">
                <label>Fecha Desde *</label>
                <input type="date" name="fechaDesde" value={reportFilters.fechaDesde} onChange={handleReportFilterChange} className="hf-input" />
                {reportErrors.fechaDesde && <p className="hf-field-error">{reportErrors.fechaDesde}</p>}
              </div>
              <div className="hf-field">
                <label>Fecha Hasta *</label>
                <input type="date" name="fechaHasta" value={reportFilters.fechaHasta} onChange={handleReportFilterChange} className="hf-input" />
                {reportErrors.fechaHasta && <p className="hf-field-error">{reportErrors.fechaHasta}</p>}
              </div>
            </div>

            {/* Conditional filters for inversiones */}
            {reportFilters.tipoDatos === 'inversiones' && (
              <div style={{borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 'var(--hf-space-lg)', marginTop: 'var(--hf-space-md)'}}>
                <h3 className="text-md font-semibold mb-3" style={{color: 'var(--hf-accent-primary)'}}>Filtros de Inversiones</h3>
                <div className="hf-grid-4">
                  <div className="hf-field">
                    <label>Operación</label>
                    <select name="operacion" value={reportFilters.operacion} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todas">Todas</option>
                      <option value="compra">Compra</option>
                      <option value="venta">Venta</option>
                    </select>
                  </div>
                  <div className="hf-field">
                    <label>Símbolo Activo</label>
                    <select name="simboloActivo" value={reportFilters.simboloActivo} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todos">Todos</option>
                      {availableActivos.map((sym) => (
                        <option key={sym} value={sym}>{sym}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hf-field">
                    <label>Moneda</label>
                    <select name="monedaInv" value={reportFilters.monedaInv} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todas">Todas</option>
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Conditional filters for cashflow */}
            {reportFilters.tipoDatos === 'cashflow' && (
              <div style={{borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 'var(--hf-space-lg)', marginTop: 'var(--hf-space-md)'}}>
                <h3 className="text-md font-semibold mb-3" style={{color: 'var(--hf-accent-primary)'}}>Filtros de Cashflow</h3>
                <div className="hf-grid-4">
                  <div className="hf-field">
                    <label>Tipo</label>
                    <select name="tipoCashflow" value={reportFilters.tipoCashflow} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todos">Todos</option>
                      <option value="gasto">Gasto</option>
                      <option value="ingreso">Ingreso</option>
                    </select>
                  </div>
                  <div className="hf-field">
                    <label>Categoría</label>
                    <select name="categoria" value={reportFilters.categoria} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todos">Todos</option>
                      <option value="Comida">Comida</option>
                      <option value="Servicios">Servicios</option>
                      <option value="Transporte">Transporte</option>
                      <option value="Salud">Salud</option>
                      <option value="Entretenimiento">Entretenimiento</option>
                      <option value="Sueldo">Sueldo</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>
                  <div className="hf-field">
                    <label>Medio de Pago</label>
                    <select name="medioPago" value={reportFilters.medioPago} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todos">Todos</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Débito">Débito</option>
                    </select>
                  </div>
                  <div className="hf-field">
                    <label>Moneda</label>
                    <select name="monedaCash" value={reportFilters.monedaCash} onChange={handleReportFilterChange} className="hf-select">
                      <option value="todas">Todas</option>
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="hf-flex hf-gap-md" style={{marginTop: 'var(--hf-space-lg)'}}>
              <button onClick={handleSearchReports} disabled={reportLoading} className="hf-button hf-button-primary" style={{padding: '0.75rem 2rem'}}>
                {reportLoading ? (
                  <span className="hf-flex hf-gap-sm" style={{alignItems: 'center'}}>
                    <span className="hf-loading"></span>
                    <span>Buscando...</span>
                  </span>
                ) : 'Buscar'}
              </button>
              <button onClick={handleClearReportFilters} className="hf-button hf-button-secondary" style={{padding: '0.75rem 2rem'}}>Limpiar</button>
            </div>
          </div>
        </div>

        {/* Results panel */}
        {reportMetrics && (
          <div className="hf-card hf-mb-lg">
            <div className="hf-flex-between" style={{marginBottom: 'var(--hf-space-md)'}}>
              <h2 className="text-xl font-bold hf-text-gradient">Métricas</h2>
              <button 
                onClick={() => {
                  if (reportFilters.tipoDatos === 'inversiones') {
                    exportInvestmentsToExcel(reportResults, investmentReport, reportMetrics, reportFilters);
                  } else {
                    exportCashflowToExcel(reportResults, reportMetrics, reportFilters);
                  }
                }}
                className="hf-button hf-button-primary"
                style={{padding: '0.5rem 1.5rem'}}
              >
                📥 Exportar a Excel
              </button>
            </div>
            <div className="hf-metrics-grid">
              <div className="hf-metric-card">
                <div className="hf-metric-label">Registros</div>
                <div className="hf-metric-value">{reportMetrics.count}</div>
              </div>
              {reportFilters.tipoDatos === 'inversiones' ? (
                <>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">Total Invertido</div>
                    <div className="hf-metric-value hf-metric-value-positive">{formatCurrency(reportMetrics.totalInvertido || 0, reportFilters.monedaInv !== 'todas' ? reportFilters.monedaInv : 'ARS')}</div>
                  </div>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">Total Recuperado</div>
                    <div className="hf-metric-value" style={{color: 'var(--hf-accent-blue)'}}>{formatCurrency(reportMetrics.totalRecuperado || 0, reportFilters.monedaInv !== 'todas' ? reportFilters.monedaInv : 'ARS')}</div>
                  </div>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">P&L Neto</div>
                    <div className={`hf-metric-value ${(reportMetrics.pnlNeto || 0) >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}`}>
                      {formatCurrency(reportMetrics.pnlNeto || 0, reportFilters.monedaInv !== 'todas' ? reportFilters.monedaInv : 'ARS')}
                    </div>
                  </div>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">P&L %</div>
                    <div className={`hf-metric-value ${(reportMetrics.pnlPct || 0) >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}`}>
                      {(reportMetrics.pnlPct || 0).toFixed(2)}%
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">Total Gastos</div>
                    <div className="hf-metric-value hf-metric-value-negative">{formatCurrency(reportMetrics.totalGastos, reportFilters.monedaCash !== 'todas' ? reportFilters.monedaCash : 'ARS')}</div>
                  </div>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">Total Ingresos</div>
                    <div className="hf-metric-value hf-metric-value-positive">{formatCurrency(reportMetrics.totalIngresos, reportFilters.monedaCash !== 'todas' ? reportFilters.monedaCash : 'ARS')}</div>
                  </div>
                  <div className="hf-metric-card">
                    <div className="hf-metric-label">Neto</div>
                    <div className="hf-metric-value">{formatCurrency(reportMetrics.neto, reportFilters.monedaCash !== 'todas' ? reportFilters.monedaCash : 'ARS')}</div>
                  </div>
                </>
              )}
            </div>

            {/* Investment P&L Chart */}
            {reportFilters.tipoDatos === 'inversiones' && investmentReport && investmentReport.porActivo.length > 0 && (
              <div style={{marginTop: 'var(--hf-space-xl)'}}>
                <h3 className="text-lg font-semibold mb-4">📊 P&L por Activo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={investmentReport.porActivo.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="activo" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value, 'ARS')}
                      contentStyle={{ backgroundColor: 'var(--hf-bg-card)', border: '1px solid var(--hf-border)' }}
                    />
                    <Legend />
                    <Bar dataKey="pnlNeto" name="P&L Neto" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Investment P&L Analysis Table */}
            {reportFilters.tipoDatos === 'inversiones' && investmentReport && investmentReport.porActivo.length > 0 && (
              <div style={{marginTop: 'var(--hf-space-xl)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 'var(--hf-space-lg)'}}>
                <h3 className="text-lg font-semibold mb-3">Análisis P&L por Activo</h3>
                <div className="hf-table-container">
                  <table className="hf-table">
                    <thead>
                      <tr>
                        <th>Activo</th>
                        <th>Moneda</th>
                        <th>Cant. Cerrada</th>
                        <th>Prom. Compra</th>
                        <th>Prom. Venta</th>
                        <th>Total Invertido</th>
                        <th>Total Recuperado</th>
                        <th>P&L Neto</th>
                        <th>P&L %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investmentReport.porActivo.map((asset, idx) => (
                        <tr key={idx}>
                          <td style={{fontWeight: '600'}}>{asset.activo}</td>
                          <td>{asset.moneda}</td>
                          <td>{asset.cantidadCerrada.toFixed(4)}</td>
                          <td>{formatCurrency(asset.promedioCompra, asset.moneda)}</td>
                          <td>{formatCurrency(asset.promedioVenta, asset.moneda)}</td>
                          <td>{formatCurrency(asset.totalInvertido, asset.moneda)}</td>
                          <td>{formatCurrency(asset.totalRecuperado, asset.moneda)}</td>
                          <td className={asset.pnlNeto >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}>
                            {formatCurrency(asset.pnlNeto, asset.moneda)}
                          </td>
                          <td className={asset.pnlPct >= 0 ? 'hf-metric-value-positive' : 'hf-metric-value-negative'}>
                            {asset.pnlPct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <h3 className="text-lg font-semibold mb-3 mt-6">Listado de registros</h3>
            {reportResults.length === 0 ? (
              <div className="hf-empty-state">
                <p>No se encontraron registros para esos filtros.</p>
              </div>
            ) : (
              <div className="hf-table-container">
                <table className="hf-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      {reportFilters.tipoDatos === 'inversiones' ? (
                        <>
                          <th>Operación</th>
                          <th>Símbolo</th>
                          <th>Tipo Activo</th>
                          <th>Monto Total</th>
                          <th>Moneda</th>
                        </>
                      ) : (
                        <>
                          <th>Tipo</th>
                          <th>Categoría</th>
                          <th>Monto</th>
                          <th>Moneda</th>
                          <th>Descripción</th>
                        </>
                      )}
                      <th>Usuario</th>
                      {reportFilters.incluirAnulados && (
                        <th>Estado</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {reportResults.map((r) => (
                      <tr key={r.id}>
                        <td>{(r.fechaTransaccion?.toDate ? r.fechaTransaccion.toDate() : r.fechaOperacion?.toDate ? r.fechaOperacion.toDate() : new Date()).toLocaleDateString()}</td>
                        {reportFilters.tipoDatos === 'inversiones' ? (
                          <>
                            <td><span className={`hf-badge ${r.tipoOperacion === 'compra' ? 'hf-badge-success' : 'hf-badge-info'}`}>{r.tipoOperacion}</span></td>
                            <td style={{fontWeight: 600}}>{r.activo}</td>
                            <td>{r.tipoActivo}</td>
                            <td style={{fontWeight: 600}}>{formatCurrency(r.montoTotal || 0, r.moneda)}</td>
                            <td>{r.moneda}</td>
                          </>
                        ) : (
                          <>
                            <td><span className={`hf-badge ${r.tipo === 'gasto' ? 'hf-badge-error' : 'hf-badge-success'}`}>{r.tipo}</span></td>
                            <td>{r.categoria}</td>
                            <td style={{fontWeight: 600}}>{formatCurrency(r.monto || 0, r.moneda)}</td>
                            <td>{r.moneda}</td>
                            <td style={{color: 'var(--hf-text-secondary)'}}>{r.descripcion || '-'}</td>
                          </>
                        )}
                        <td style={{color: 'var(--hf-accent-primary)', fontWeight: 500}}>{USER_NAMES[r.usuarioId]?.split(' ')[0] || 'Usuario'}</td>
                        {reportFilters.incluirAnulados && (
                          <td>{r.anulada ? <span className="hf-badge hf-badge-warning">ANULADA</span> : <span className="hf-badge hf-badge-success">Activa</span>}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Mostrar login si no está autenticado
  if (!DEV_BYPASS_AUTH && showLogin && isAuthReady && !userId) {
    return <LoginForm onLogin={handleLogin} error={loginError} />;
  }

  // Render único
  return (
    <>
      {contenido}
      {/* Modal de Confirmación */}
      {showConfirmModal && (
        <ConfirmationModal onConfirm={handleDeleteTransaction} onCancel={handleCancelDelete} />
      )}
    </>
  );
};

// Tarjeta de métrica
const MetricCard = ({ title, amount, icon, color, moneda }) => {
  const IconComponent = icon;
  const colorClasses = {
    green: 'bg-green-500 text-white',
    red: 'bg-red-500 text-white',
    indigo: 'bg-indigo-500 text-white',
  };
  const shadowClass = {
    green: 'shadow-green-300',
    red: 'shadow-red-300',
    indigo: 'shadow-indigo-300',
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-2xl transform hover:scale-[1.02] transition duration-300 ease-in-out">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <h3 className={`text-3xl font-extrabold mt-1 ${color === 'red' && amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(amount, moneda)}
          </h3>
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]} shadow-lg ${shadowClass[color]}`}>
          <IconComponent className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};

// TransactionItem was extracted to `src/components/TransactionItem.jsx` for reuse and testing.

// Radio option
const RadioOption = ({ id, name, value, checked, onChange, label }) => (
  <div className="flex items-center">
    <input
      id={id}
      name={name}
      type="radio"
      value={value}
      checked={checked}
      onChange={onChange}
      className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
    />
    <label htmlFor={id} className="ml-2 block text-sm font-medium text-gray-700">
      {label}
    </label>
  </div>
);

export default App;
