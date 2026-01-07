/* global __app_id, __firebase_config */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
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
import { updateDoc, orderBy, limit, getDocs, setDoc } from 'firebase/firestore';
import logo from './assets/logo.png';
import ConfirmationModal from './components/ConfirmationModal';
import TransactionItem from './components/TransactionItem';
import { formatCurrency, sanitizeDecimal, sanitizeActivo, sanitizeNombre, getUniqueActivos, dateStringToTimestamp, getOccurredAtFromDoc } from './utils/formatters';
import { calculateInvestmentReport } from './utils/reporting';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DEV_BYPASS_AUTH, DEV_USER_ID, SUPER_ADMINS, USER_NAMES, MONTHLY_EXPENSE_TEMPLATES } from './config/constants';
import { getTransactionsPath, getCashflowPath, getMonthlyChecklistPath } from './services/firestorePaths';
import Dashboard from './components/Dashboard';
import Portfolio from './components/Portfolio';

// --- CONFIGURACIÓN GLOBAL ---

// Estas variables se proporcionan automáticamente en ciertos entornos.
// En local probablemente NO existan, así que usamos defaults.
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Limpieza del appId para que sea un segmento válido de ruta en Firestore
const appId = rawAppId.replace(/[.:]/g, '-').replace(/\//g, '-');

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
      USER_NAMES[tx.usuarioId] || tx.usuario || 'N/A',
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
      USER_NAMES[cf.usuarioId] || cf.usuario || 'N/A',
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
  const [deleteType, setDeleteType] = useState(null); // 'transaction' o 'cashflow'
  const [massDeleteType, setMassDeleteType] = useState(null); // 'all-transactions', 'all-cashflow', 'everything'
  const [showMassDeleteModal, setShowMassDeleteModal] = useState(false);
  const [transactionToAnnul, setTransactionToAnnul] = useState(null);
  const [showAnnulTransactionModal, setShowAnnulTransactionModal] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(!!DEV_BYPASS_AUTH);
  const [loginError, setLoginError] = useState(null);
  const [showLogin, setShowLogin] = useState(!DEV_BYPASS_AUTH ? false : false);
  // Mostrar nombre de usuario en vez de UID
  const [userName, setUserName] = useState(DEV_BYPASS_AUTH ? 'Dev Mode' : '');

  // (Filtros y vista se desactivaron por ahora para evitar variables sin usar)
  // Nuevo estado para pestañas multitarea - persistir en localStorage
  const [tab, setTab] = useState(() => {
    // Recuperar tab guardado o usar 'dashboard' por defecto
    return localStorage.getItem('homeflow-current-tab') || 'dashboard';
  });
  
  // Dashboard states
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  
  // Portfolio states
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);

  // Guardar tab actual en localStorage cuando cambia
  useEffect(() => {
    localStorage.setItem('homeflow-current-tab', tab);
  }, [tab]);

  // Monthly checklist states
  const [monthlyChecklist, setMonthlyChecklist] = useState([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyExpenseAmounts, setMonthlyExpenseAmounts] = useState({});
  const [editingChecklistItem, setEditingChecklistItem] = useState(null);
  const [checklistHistory, setChecklistHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);


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

    // Desactivar persistencia: cierra sesión al cerrar pestaña/navegador
    setPersistence(firebaseAuth, browserSessionPersistence)
      .then(() => {
        console.log('🔒 Persistencia de sesión desactivada - se requiere login cada vez');
      })
      .catch((error) => {
        console.error('Error configurando persistencia:', error);
      });

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

  // 1.5. Listener de autenticación de Firebase
  useEffect(() => {
    if (!auth || DEV_BYPASS_AUTH) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Usuario autenticado
        const uid = user.uid;
        console.log('🔐 Usuario autenticado:', {
          uid: uid,
          email: user.email,
          displayName: user.displayName
        });
        
        // Verificar si es super admin
        if (SUPER_ADMINS.includes(uid)) {
          console.log('✅ Usuario autorizado como Super Admin');
          setUserId(uid);
          setIsSuperAdmin(true);
          setShowLogin(false);
          setLoginError(null);
        } else {
          // Usuario no autorizado - cerrar sesión automáticamente
          console.log('❌ UID no encontrado en SUPER_ADMINS:', SUPER_ADMINS);
          console.log('⚠️ Cerrando sesión de usuario no autorizado...');
          signOut(auth).then(() => {
            setUserId(null);
            setUserName('');
            setIsSuperAdmin(false);
            setShowLogin(true);
            setLoginError(`Acceso denegado. Tu UID es: ${uid}. Contacta al administrador para agregar este UID a la lista de usuarios permitidos.`);
          });
        }
      } else {
        // Usuario no autenticado
        setUserId(null);
        setUserName('');
        setIsSuperAdmin(false);
        setShowLogin(true);
      }
      
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [auth]);


  // 2. Suscripción en tiempo real a las transacciones
  useEffect(() => {
    if (!isAuthReady || !db || !userId || !isSuperAdmin) return;

    const transactionsPath = getTransactionsPath(appId);

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
  }, [db, userId, isAuthReady, isSuperAdmin]);

  // 3. Suscripción en tiempo real a los últimos 5 cashflow (gastos/ingresos)
  useEffect(() => {
    if (!isAuthReady || !db || !isSuperAdmin) return;

    const cashflowPath = getCashflowPath(appId);

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
        // Mostrar error más detallado
        let errorMsg = 'Error cargando gastos/ingresos';
        if (e.code === 'permission-denied') {
          errorMsg = 'Acceso denegado a Firestore. Verifica que estés autenticado y tengas permisos.';
        } else if (e.message) {
          errorMsg = `Error: ${e.message}`;
        }
        setError(errorMsg);
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
  }, [db, isAuthReady, isSuperAdmin]);

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
    if (!db || !isAuthReady || !isSuperAdmin) {
      setDashboardLoading(true);
      return;
    }

    const calculateDashboard = async () => {
      try {
        setDashboardLoading(true);

        // 1. Fetch all transactions and cashflows
        const transactionsPath = getTransactionsPath(appId);
        const cashflowPath = getCashflowPath(appId);

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
          // Los campos correctos son cantidadRestante y promedioCompra
          const cantidad = parseFloat(pos.cantidadRestante) || 0;
          const precio = parseFloat(pos.promedioCompra) || 0;
          const monto = cantidad * precio;
          return sum + monto;
        }, 0);
        
        const totalInvertidoCerradas = parseFloat(pnlReport.resumenGlobal.totalInvertido) || 0;
        const totalRecuperado = parseFloat(pnlReport.resumenGlobal.totalRecuperado) || 0;
        
        const totalInvertidoGeneral = totalInvertidoCerradas + totalInvertidoAbiertas;
        const pnlNetoCerradas = parseFloat(pnlReport.resumenGlobal.pnlNeto) || 0;
        const pnlPctCerradas = totalInvertidoCerradas > 0 
          ? (pnlNetoCerradas / totalInvertidoCerradas) * 100 
          : 0;

        setDashboardData({
          // Métricas de inversiones (nivel superior para Dashboard)
          totalInvertido: totalInvertidoGeneral,
          totalRecuperado: totalRecuperado,
          plRealizado: pnlNetoCerradas,
          plPct: pnlPctCerradas,
          posicionesAbiertas: pnlReport.posicionesAbiertas.length,
          // Métricas de cashflow (nivel superior para Dashboard)
          totalGastos,
          totalIngresos,
          balance: totalIngresos - totalGastos,
          mes: now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
          // Datos adicionales
          topAssets: sortedAssets,
          topCategories: Object.entries(categorySummary)
            .map(([categoria, data]) => ({
              categoria,
              monto: data.gastos,
              count: data.count || 0,
            }))
            .sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
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
  }, [db, isAuthReady, isSuperAdmin, _transactions, cashflows]);

  // Calculate Portfolio data whenever transactions change
  useEffect(() => {
    if (!db || !isAuthReady || !isSuperAdmin) {
      setPortfolioLoading(true);
      return;
    }

    const calculatePortfolio = async () => {
      setPortfolioLoading(true);
      try {
        const transactionsPath = getTransactionsPath(appId);
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
  }, [db, isAuthReady, isSuperAdmin, _transactions]);

  // 7. Monthly Checklist - Cargar y detectar cambio de mes
  useEffect(() => {
    if (!db || !isAuthReady || !isSuperAdmin) {
      // console.log('Monthly checklist: waiting for db/auth...', { db: !!db, isAuthReady });
      return;
    }

    const loadMonthlyChecklist = async () => {
      try {
        setChecklistLoading(true);
        
        // Detectar mes actual
        const now = new Date();
        const detectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        console.log('✅ Loading monthly checklist for:', detectedMonth);
        console.log('Current month state:', currentMonth);
        
        // Si cambió el mes, actualizar estado
        if (detectedMonth !== currentMonth) {
          console.log('📅 Month changed! Updating from', currentMonth, 'to', detectedMonth);
          setCurrentMonth(detectedMonth);
        }
        
        const checklistPath = getMonthlyChecklistPath(appId, detectedMonth);
        console.log('📂 Checklist path:', checklistPath);
        
        const checklistSnapshot = await getDocs(collection(db, checklistPath));
        console.log('📄 Checklist documents found:', checklistSnapshot.size);
        
        const checklistMap = {};
        checklistSnapshot.docs.forEach(doc => {
          const data = doc.data();
          checklistMap[data.templateId] = {
            ...data,
            id: doc.id
          };
        });
        
        console.log('🗂️ Checklist map:', checklistMap);
        console.log('📋 Templates to merge:', MONTHLY_EXPENSE_TEMPLATES);
        
        // Merge templates con estado del checklist
        const checklistWithStatus = MONTHLY_EXPENSE_TEMPLATES.map(template => ({
          ...template,
          completed: checklistMap[template.id]?.completed || false,
          amount: checklistMap[template.id]?.amount || null,
          moneda: checklistMap[template.id]?.moneda || 'ARS',
          registeredAt: checklistMap[template.id]?.registeredAt || null,
          registeredBy: checklistMap[template.id]?.registeredBy || null,
          cashflowId: checklistMap[template.id]?.cashflowId || null
        }));
        
        console.log('✅ Final checklist with status:', checklistWithStatus);
        console.log('📊 Checklist length:', checklistWithStatus.length);
        setMonthlyChecklist(checklistWithStatus);
      } catch (err) {
        console.error('❌ Error loading monthly checklist:', err);
      } finally {
        setChecklistLoading(false);
      }
    };

    loadMonthlyChecklist();
    
    // Cargar historial de últimos 3 meses
    const loadChecklistHistory = async () => {
      try {
        setHistoryLoading(true);
        const history = [];
        const now = new Date();
        
        // Generar últimos 3 meses (excluyendo el actual)
        for (let i = 1; i <= 3; i++) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const monthName = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
          
          const checklistPath = getMonthlyChecklistPath(appId, monthKey);
          const checklistSnapshot = await getDocs(collection(db, checklistPath));
          
          const checklistMap = {};
          checklistSnapshot.docs.forEach(doc => {
            const data = doc.data();
            checklistMap[data.templateId] = { ...data, id: doc.id };
          });
          
          // Merge con templates para detectar faltantes
          const items = MONTHLY_EXPENSE_TEMPLATES.map(template => ({
            ...template,
            completed: checklistMap[template.id]?.completed || false,
            amount: checklistMap[template.id]?.amount || null,
            moneda: checklistMap[template.id]?.moneda || 'ARS',
            registeredAt: checklistMap[template.id]?.registeredAt || null,
            registeredBy: checklistMap[template.id]?.registeredBy || null,
            cashflowId: checklistMap[template.id]?.cashflowId || null
          }));
          
          const completed = items.filter(item => item.completed).length;
          const pending = items.filter(item => !item.completed);
          
          history.push({
            monthKey,
            monthName,
            items,
            completed,
            total: MONTHLY_EXPENSE_TEMPLATES.length,
            pending
          });
        }
        
        setChecklistHistory(history);
      } catch (err) {
        console.error('❌ Error loading checklist history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };
    
    loadChecklistHistory();
    
    // Re-check cada minuto para detectar cambio de mes
    const interval = setInterval(() => {
      const now = new Date();
      const detectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (detectedMonth !== currentMonth) {
        console.log('⏰ Interval detected month change');
        loadMonthlyChecklist();
        loadChecklistHistory();
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [db, isAuthReady, isSuperAdmin, appId]);

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
      // Anulación system
      anulada: false,
    };
    try {
      const transactionsPath = getTransactionsPath(appId);
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
      const cashflowPath = getCashflowPath(appId);
      await addDoc(collection(db, cashflowPath), cashflowToSave);
      setSuccessMessage('✅ Registro guardado');
      setTimeout(() => setSuccessMessage(null), 2000);
      setNewCashflow({ tipo: 'gasto', monto: '', moneda: '', fechaOperacion: '', categoria: '', descripcion: '' });
      setCashflowFieldErrors({});
      // Scroll al inicio de la página
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const cashflowPath = getCashflowPath(appId);
      const docRef = doc(db, cashflowPath, cashflowToAnnul);
      
      // 1. Anular el cashflow
      await updateDoc(docRef, {
        anulada: true,
        anuladaAt: serverTimestamp(), // legacy field (keep for compatibility)
        anuladaBy: userId || 'dev-albert',
        voidedAt: serverTimestamp(), // NEW STANDARD
        updatedAt: serverTimestamp(), // NEW STANDARD
      });
      
      // 2. Verificar si este cashflow pertenece al checklist mensual y desmarcarlo
      try {
        // Buscar en checklist del mes actual
        const checklistPath = getMonthlyChecklistPath(appId, currentMonth);
        const checklistSnapshot = await getDocs(collection(db, checklistPath));
        
        let foundInChecklist = false;
        for (const checklistDoc of checklistSnapshot.docs) {
          const data = checklistDoc.data();
          if (data.cashflowId === cashflowToAnnul) {
            // Eliminar el registro del checklist
            await deleteDoc(doc(db, checklistPath, checklistDoc.id));
            
            // Actualizar estado local
            setMonthlyChecklist(prev => prev.map(item =>
              item.id === data.templateId
                ? { ...item, completed: false, amount: null, moneda: 'ARS', registeredAt: null, registeredBy: null, cashflowId: null }
                : item
            ));
            
            foundInChecklist = true;
            console.log('✅ Checklist item unmarked:', data.templateId);
            break;
          }
        }
        
        // Si no se encontró en el mes actual, buscar en historial (3 meses anteriores)
        if (!foundInChecklist) {
          for (let i = 1; i <= 3; i++) {
            const date = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const historyChecklistPath = getMonthlyChecklistPath(appId, monthKey);
            const historySnapshot = await getDocs(collection(db, historyChecklistPath));
            
            for (const checklistDoc of historySnapshot.docs) {
              const data = checklistDoc.data();
              if (data.cashflowId === cashflowToAnnul) {
                await deleteDoc(doc(db, historyChecklistPath, checklistDoc.id));
                
                // Actualizar historial local
                setChecklistHistory(prev => prev.map(historyMonth => {
                  if (historyMonth.monthKey === monthKey) {
                    const updatedItems = historyMonth.items.map(item =>
                      item.id === data.templateId
                        ? { ...item, completed: false, amount: null, moneda: 'ARS', registeredAt: null, registeredBy: null, cashflowId: null }
                        : item
                    );
                    return {
                      ...historyMonth,
                      items: updatedItems,
                      completed: updatedItems.filter(i => i.completed).length,
                      pending: updatedItems.filter(i => !i.completed)
                    };
                  }
                  return historyMonth;
                }));
                
                foundInChecklist = true;
                console.log('✅ History checklist item unmarked:', data.templateId, 'from', monthKey);
                break;
              }
            }
            if (foundInChecklist) break;
          }
        }
      } catch (checklistErr) {
        console.error('Error updating checklist after annul:', checklistErr);
        // No mostrar error al usuario, el cashflow ya fue anulado exitosamente
      }
      
      handleCancelAnnul();
    } catch (err) {
      console.error('Error annulling cashflow:', err);
      setError('Error al anular el registro.');
      handleCancelAnnul();
    }
  };

  const handleShowAnnulTransaction = (id) => {
    setTransactionToAnnul(id);
    setShowAnnulTransactionModal(true);
  };

  const handleCancelAnnulTransaction = () => {
    setTransactionToAnnul(null);
    setShowAnnulTransactionModal(false);
  };

  const handleAnnulTransaction = async () => {
    if (!transactionToAnnul) return;
    try {
      const transactionsPath = getTransactionsPath(appId);
      const docRef = doc(db, transactionsPath, transactionToAnnul);
      await updateDoc(docRef, {
        anulada: true,
        anuladaAt: serverTimestamp(),
        anuladaBy: userId || 'dev-albert',
        voidedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      handleCancelAnnulTransaction();
      setSuccessMessage('Transacción anulada exitosamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error annulling transaction:', err);
      setError('Error al anular la transacción.');
      handleCancelAnnulTransaction();
    }
  };

  const handleShowMassDelete = (type) => {
    setMassDeleteType(type);
    setShowMassDeleteModal(true);
  };

  const handleCancelMassDelete = () => {
    setMassDeleteType(null);
    setShowMassDeleteModal(false);
  };

  const handleMassDelete = async () => {
    if (!massDeleteType || !db) return;
    
    try {
      if (massDeleteType === 'all-transactions') {
        const transactionsPath = getTransactionsPath(appId);
        const q = query(collection(db, transactionsPath));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
        setSuccessMessage(`${snapshot.size} inversiones eliminadas exitosamente`);
      } else if (massDeleteType === 'all-cashflow') {
        const cashflowPath = getCashflowPath(appId);
        const q = query(collection(db, cashflowPath));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
        setSuccessMessage(`${snapshot.size} registros de cashflow eliminados exitosamente`);
      } else if (massDeleteType === 'everything') {
        const transactionsPath = getTransactionsPath(appId);
        const cashflowPath = getCashflowPath(appId);
        
        const [txSnapshot, cfSnapshot] = await Promise.all([
          getDocs(query(collection(db, transactionsPath))),
          getDocs(query(collection(db, cashflowPath)))
        ]);
        
        const allDeletePromises = [
          ...txSnapshot.docs.map(docSnap => deleteDoc(docSnap.ref)),
          ...cfSnapshot.docs.map(docSnap => deleteDoc(docSnap.ref))
        ];
        
        await Promise.all(allDeletePromises);
        setSuccessMessage(`${txSnapshot.size + cfSnapshot.size} registros eliminados exitosamente`);
      }
      
      handleCancelMassDelete();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error in mass delete:', err);
      setError('Error al eliminar los registros.');
      handleCancelMassDelete();
    }
  };

  // --- MONTHLY CHECKLIST HANDLERS ---
  const handleMonthlyExpenseAmountChange = (templateId, value) => {
    setMonthlyExpenseAmounts(prev => ({
      ...prev,
      [templateId]: value
    }));
  };

  const handleRegisterMonthlyExpense = async (template) => {
    const amount = parseFloat(monthlyExpenseAmounts[template.id]);
    
    if (!amount || amount <= 0) {
      setError('Ingresa un monto válido mayor a 0');
      return;
    }
    
    if (!db) return;
    
    try {
      // 1. Crear el registro de cashflow normal
      const cashflowPath = getCashflowPath(appId);
      const now = new Date();
      const cashflowData = {
        tipo: 'gasto',
        categoria: template.categoria,
        descripcion: template.nombre,
        monto: amount,
        moneda: 'ARS',
        medioPago: 'Transferencia', // Default
        usuarioId: userId || 'dev-albert',
        fechaOperacion: dateStringToTimestamp(now.toISOString().split('T')[0]),
        timestamp: serverTimestamp(), // Para que aparezca en "Últimos 5 registros"
        createdAt: serverTimestamp(),
        anulada: false
      };
      
      const cashflowRef = await addDoc(collection(db, cashflowPath), cashflowData);
      
      // 2. Marcar en el checklist mensual
      const checklistPath = getMonthlyChecklistPath(appId, currentMonth);
      const checklistDocId = `${currentMonth}-${template.id}`;
      
      await setDoc(doc(db, checklistPath, checklistDocId), {
        templateId: template.id,
        mes: currentMonth,
        completed: true,
        amount,
        moneda: 'ARS',
        registeredAt: serverTimestamp(),
        registeredBy: userId || 'dev-albert',
        cashflowId: cashflowRef.id
      });
      
      // 3. Actualizar estado local
      setMonthlyChecklist(prev => prev.map(item =>
        item.id === template.id
          ? {
              ...item,
              completed: true,
              amount,
              moneda: 'ARS',
              registeredAt: new Date(),
              registeredBy: userId || 'dev-albert',
              cashflowId: cashflowRef.id
            }
          : item
      ));
      
      // 4. Limpiar input
      setMonthlyExpenseAmounts(prev => ({
        ...prev,
        [template.id]: ''
      }));
      
      setSuccessMessage(`✅ ${template.nombre} registrado exitosamente`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error registering monthly expense:', err);
      setError(`Error al registrar ${template.nombre}.`);
    }
  };

  const handleEditMonthlyExpense = (item) => {
    setEditingChecklistItem(item.id);
    setMonthlyExpenseAmounts(prev => ({
      ...prev,
      [item.id]: item.amount.toString()
    }));
  };

  const handleUpdateMonthlyExpense = async (template) => {
    const newAmount = parseFloat(monthlyExpenseAmounts[template.id]);
    
    if (!newAmount || newAmount <= 0) {
      setError('Ingresa un monto válido mayor a 0');
      return;
    }
    
    if (!db || !template.cashflowId) return;
    
    try {
      // 1. Actualizar el cashflow existente
      const cashflowPath = getCashflowPath(appId);
      const cashflowRef = doc(db, cashflowPath, template.cashflowId);
      
      // Des-anular si estaba anulado y actualizar monto
      await updateDoc(cashflowRef, {
        monto: newAmount,
        anulada: false, // Des-anular automáticamente al modificar
        updatedAt: serverTimestamp()
      });
      
      // 2. Actualizar el checklist
      const checklistPath = getMonthlyChecklistPath(appId, currentMonth);
      const checklistDocId = `${currentMonth}-${template.id}`;
      await updateDoc(doc(db, checklistPath, checklistDocId), {
        amount: newAmount
      });
      
      // 3. Actualizar estado local
      setMonthlyChecklist(prev => prev.map(item =>
        item.id === template.id
          ? { ...item, amount: newAmount }
          : item
      ));
      
      // 4. Salir del modo edición
      setEditingChecklistItem(null);
      setMonthlyExpenseAmounts(prev => ({
        ...prev,
        [template.id]: ''
      }));
      
      setSuccessMessage(`✅ ${template.nombre} actualizado y habilitado exitosamente`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error updating monthly expense:', err);
      setError(`Error al actualizar ${template.nombre}.`);
    }
  };

  const handleCancelEdit = (itemId) => {
    setEditingChecklistItem(null);
    setMonthlyExpenseAmounts(prev => ({
      ...prev,
      [itemId]: ''
    }));
  };

  const handleRemoveFromChecklist = async (template) => {
    if (!db) return;
    
    try {
      // 1. Eliminar el documento del checklist en Firestore
      const checklistPath = getMonthlyChecklistPath(appId, currentMonth);
      const checklistDocId = `${currentMonth}-${template.id}`;
      await deleteDoc(doc(db, checklistPath, checklistDocId));
      
      // 2. Actualizar estado local
      setMonthlyChecklist(prev => prev.map(item =>
        item.id === template.id
          ? { ...item, completed: false, amount: null, moneda: 'ARS', registeredAt: null, registeredBy: null, cashflowId: null }
          : item
      ));
      
      setSuccessMessage(`✅ ${template.nombre} desmarcado exitosamente`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error removing from checklist:', err);
      setError(`Error al desmarcar ${template.nombre}.`);
    }
  };

  const handlePayOverdue = async (template, monthKey, monthName) => {
    const amountKey = `overdue-${monthKey}-${template.id}`;
    const amount = parseFloat(monthlyExpenseAmounts[amountKey]);
    
    if (!amount || amount <= 0) {
      setError('Ingresa un monto válido mayor a 0');
      return;
    }
    
    if (!db) return;
    
    try {
      // 1. Crear el registro de cashflow con fecha del mes correspondiente
      const cashflowPath = getCashflowPath(appId);
      // Usar primer día del mes atrasado
      const [year, month] = monthKey.split('-');
      const overdueDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      
      const cashflowData = {
        tipo: 'gasto',
        categoria: template.categoria,
        descripcion: `${template.nombre} (${monthName})`,
        monto: amount,
        moneda: 'ARS',
        medioPago: 'Transferencia',
        usuarioId: userId || 'dev-albert',
        fechaOperacion: dateStringToTimestamp(overdueDate.toISOString().split('T')[0]),
        timestamp: serverTimestamp(), // Para que aparezca en "Últimos 5 registros"
        createdAt: serverTimestamp(),
        anulada: false
      };
      
      const cashflowRef = await addDoc(collection(db, cashflowPath), cashflowData);
      
      // 2. Marcar en el checklist del mes correspondiente
      const checklistPath = getMonthlyChecklistPath(appId, monthKey);
      const checklistDocId = `${monthKey}-${template.id}`;
      
      await setDoc(doc(db, checklistPath, checklistDocId), {
        templateId: template.id,
        mes: monthKey,
        completed: true,
        amount,
        moneda: 'ARS',
        registeredAt: serverTimestamp(),
        registeredBy: userId || 'dev-albert',
        cashflowId: cashflowRef.id
      });
      
      // 3. Actualizar historial local
      setChecklistHistory(prev => prev.map(historyMonth => {
        if (historyMonth.monthKey === monthKey) {
          const updatedItems = historyMonth.items.map(item =>
            item.id === template.id
              ? {
                  ...item,
                  completed: true,
                  amount,
                  moneda: 'ARS',
                  registeredAt: new Date(),
                  registeredBy: userId || 'dev-albert',
                  cashflowId: cashflowRef.id
                }
              : item
          );
          return {
            ...historyMonth,
            items: updatedItems,
            completed: updatedItems.filter(i => i.completed).length,
            pending: updatedItems.filter(i => !i.completed)
          };
        }
        return historyMonth;
      }));
      
      // 4. Limpiar input
      setMonthlyExpenseAmounts(prev => ({
        ...prev,
        [amountKey]: ''
      }));
      
      setSuccessMessage(`✅ ${template.nombre} de ${monthName} registrado exitosamente`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error paying overdue expense:', err);
      setError(`Error al registrar ${template.nombre} atrasado.`);
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
      const collectionPath = reportFilters.tipoDatos === 'inversiones' ? getTransactionsPath(appId) : getCashflowPath(appId);
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
        // IMPORTANTE: Para métricas financieras, SIEMPRE excluir anuladas
        // El checkbox "incluirAnulados" solo controla la visibilidad en la tabla, no los cálculos
        const activosParaMetricas = filtered.filter((r) => !r.anulada);
        
        // Use investment P&L engine for inversiones
        const pnlReport = calculateInvestmentReport(activosParaMetricas, reportFilters);
        setInvestmentReport(pnlReport);
        
        // Keep basic metrics for compatibility
        const compras = activosParaMetricas.filter((r) => r.tipoOperacion === 'compra');
        const ventas = activosParaMetricas.filter((r) => r.tipoOperacion === 'venta');
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
        const transactionsPath = getTransactionsPath(appId);
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
    setDeleteType(null);
    setShowConfirmModal(false);
  };

  const handleDeleteTransaction = async () => {
    if (!docToDelete || !deleteType) return;

    try {
      const collectionPath = deleteType === 'transaction' 
        ? getTransactionsPath(appId) 
        : getCashflowPath(appId);
      const docRef = doc(db, collectionPath, docToDelete);
      await deleteDoc(docRef);
      handleCancelDelete();
      setSuccessMessage('Registro eliminado exitosamente');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e) {
      console.error('Error deleting document: ', e);
      setError(`Error al eliminar el ${deleteType === 'transaction' ? 'registro de inversión' : 'registro de cashflow'}.`);
      handleCancelDelete();
    }
  };

  // Login handler
  const handleLogin = async ({ email, password, google }) => {
    setLoginError(null);
    try {
      if (google) {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        // onAuthStateChanged se encargará de verificar permisos y actualizar el estado
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged se encargará de verificar permisos y actualizar el estado
      }
    } catch (e) {
      console.error('Login error:', e);
      setLoginError(e.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserId(null);
      setUserName('');
      setIsSuperAdmin(false);
      setShowLogin(true);
      setTab('dashboard');
    } catch (error) {
      console.error('Logout error:', error);
      setMessage({ text: 'Error al cerrar sesión', type: 'error' });
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
        <div className="hf-card hf-alert-error" style={{maxWidth: '500px', textAlign: 'center'}}>
          <h2 className="text-2xl font-bold mb-4">Acceso Denegado</h2>
          <p style={{marginBottom: 'var(--hf-space-lg)', color: 'var(--hf-text-secondary)'}}>
            No tienes permisos para acceder a esta aplicación. Por favor, contacta al administrador.
          </p>
          <button 
            className="hf-button hf-button-secondary" 
            onClick={handleLogout}
          >
            Volver al Login
          </button>
        </div>
      </div>
    );
  } else if (tab === 'dashboard') {
    contenido = (
      <Dashboard 
        userName={userName}
        dashboardData={dashboardData}
        dashboardLoading={dashboardLoading}
        onNavigate={setTab}
        isSuperAdmin={isSuperAdmin}
        onMassDelete={handleShowMassDelete}
        onLogout={handleLogout}
      />
    );
  } else if (tab === 'portfolio') {
    contenido = (
      <Portfolio 
        portfolioData={portfolioData}
        portfolioLoading={portfolioLoading}
        onNavigate={setTab}
      />
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

        {/* Monthly Checklist Section */}
        <div className="hf-card" style={{maxWidth: '900px', margin: '0 auto var(--hf-space-lg)'}}>
          <div className="hf-flex-between" style={{marginBottom: 'var(--hf-space-md)'}}>
            <h3 className="text-lg font-semibold">
              📋 Gastos Mensuales - {new Date(currentMonth + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
            </h3>
            <div className="hf-badge hf-badge-info">
              {monthlyChecklist.filter(item => item.completed).length}/{monthlyChecklist.length} completados
            </div>
          </div>
          
          {checklistLoading ? (
            <div style={{textAlign: 'center', padding: 'var(--hf-space-lg)', color: 'var(--hf-text-secondary)'}}>
              <div className="hf-loading" style={{width: '30px', height: '30px', margin: '0 auto'}}></div>
              <p style={{marginTop: 'var(--hf-space-sm)'}}>Cargando checklist...</p>
            </div>
          ) : (
            <div className="hf-list">
              {monthlyChecklist.map((item) => (
                <div 
                  key={item.id} 
                  className="hf-list-item"
                  style={{
                    opacity: item.completed ? 0.6 : 1,
                    textDecoration: item.completed ? 'line-through' : 'none'
                  }}
                >
                  <div className="hf-flex" style={{alignItems: 'center', gap: 'var(--hf-space-md)', flexWrap: 'wrap', flex: 1}}>
                    <div style={{minWidth: '24px', fontSize: '1.25rem'}}>
                      {item.completed ? '✓' : '☐'}
                    </div>
                    <div style={{minWidth: '120px', fontWeight: 600}}>
                      {item.nombre}
                    </div>
                    {item.completed ? (
                      editingChecklistItem === item.id ? (
                        <div className="hf-flex" style={{gap: 'var(--hf-space-sm)', alignItems: 'center', flex: 1}}>
                          <input
                            type="number"
                            placeholder="Nuevo monto"
                            value={monthlyExpenseAmounts[item.id] || ''}
                            onChange={(e) => handleMonthlyExpenseAmountChange(item.id, e.target.value)}
                            className="hf-input"
                            style={{maxWidth: '150px'}}
                            step="0.01"
                            min="0"
                          />
                          <span style={{color: 'var(--hf-text-secondary)'}}>ARS</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateMonthlyExpense(item)}
                            className="hf-button hf-button-primary"
                            style={{padding: '0.5rem 1rem', fontSize: '0.875rem'}}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelEdit(item.id)}
                            className="hf-button"
                            style={{padding: '0.5rem 1rem', fontSize: '0.875rem'}}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="hf-flex" style={{alignItems: 'center', gap: 'var(--hf-space-md)', flex: 1, justifyContent: 'space-between'}}>
                          <div style={{color: 'var(--hf-text-secondary)', fontSize: '0.875rem'}}>
                            {formatCurrency(item.amount, item.moneda)} • {USER_NAMES[item.registeredBy]?.split(' ')[0] || 'Usuario'} • {item.registeredAt?.toDate ? item.registeredAt.toDate().toLocaleDateString('es-ES') : 'Hoy'}
                          </div>
                          <div className="hf-flex" style={{gap: 'var(--hf-space-sm)'}}>
                            <button
                              type="button"
                              onClick={() => handleEditMonthlyExpense(item)}
                              className="hf-button"
                              style={{padding: '0.35rem 0.75rem', fontSize: '0.8rem'}}
                            >
                              ✏️ Modificar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromChecklist(item)}
                              className="hf-button"
                              style={{padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: '#ef4444'}}
                              title="Desmarcar este gasto del checklist"
                            >
                              🗑️ Desmarcar
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="hf-flex" style={{gap: 'var(--hf-space-sm)', alignItems: 'center', flex: 1}}>
                        <input
                          type="number"
                          placeholder="Monto"
                          value={monthlyExpenseAmounts[item.id] || ''}
                          onChange={(e) => handleMonthlyExpenseAmountChange(item.id, e.target.value)}
                          className="hf-input"
                          style={{maxWidth: '150px'}}
                          step="0.01"
                          min="0"
                        />
                        <span style={{color: 'var(--hf-text-secondary)'}}>ARS</span>
                        <button
                          type="button"
                          onClick={() => handleRegisterMonthlyExpense(item)}
                          className="hf-button hf-button-primary"
                          style={{padding: '0.5rem 1rem', fontSize: '0.875rem'}}
                        >
                          Registrar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historial de meses anteriores */}
        <div className="hf-card" style={{maxWidth: '900px', margin: 'var(--hf-space-lg) auto 0'}}>
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="hf-flex"
            style={{
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--hf-text-primary)'
            }}
          >
            <div className="hf-flex" style={{alignItems: 'center', gap: 'var(--hf-space-md)'}}>
              <h3 style={{margin: 0}}>📅 Historial de Meses Anteriores</h3>
              {checklistHistory.length > 0 && (
                <div className="hf-badge hf-badge-warning">
                  {checklistHistory.reduce((acc, month) => acc + month.pending.length, 0)} pendientes
                </div>
              )}
            </div>
            <span style={{fontSize: '1.5rem', transition: 'transform 0.2s', transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)'}}>
              ▼
            </span>
          </button>

          {showHistory && (
            <div style={{marginTop: 'var(--hf-space-lg)'}}>
              {historyLoading ? (
                <div style={{textAlign: 'center', padding: 'var(--hf-space-lg)', color: 'var(--hf-text-secondary)'}}>
                  <div className="hf-loading" style={{width: '30px', height: '30px', margin: '0 auto'}}></div>
                  <p style={{marginTop: 'var(--hf-space-sm)'}}>Cargando historial...</p>
                </div>
              ) : checklistHistory.length === 0 ? (
                <p style={{textAlign: 'center', color: 'var(--hf-text-secondary)', padding: 'var(--hf-space-lg)'}}>
                  No hay historial disponible
                </p>
              ) : (
                checklistHistory.map((monthData, idx) => (
                  <div 
                    key={monthData.monthKey}
                    style={{
                      marginBottom: idx < checklistHistory.length - 1 ? 'var(--hf-space-xl)' : 0,
                      paddingBottom: idx < checklistHistory.length - 1 ? 'var(--hf-space-xl)' : 0,
                      borderBottom: idx < checklistHistory.length - 1 ? '1px solid var(--hf-border)' : 'none'
                    }}
                  >
                    <div className="hf-flex-between" style={{marginBottom: 'var(--hf-space-md)'}}>
                      <h4 style={{margin: 0, textTransform: 'capitalize'}}>
                        {monthData.monthName}
                      </h4>
                      <div className={`hf-badge ${monthData.pending.length === 0 ? 'hf-badge-success' : 'hf-badge-warning'}`}>
                        {monthData.completed}/{monthData.total} completados
                      </div>
                    </div>

                    {monthData.pending.length > 0 && (
                      <div 
                        style={{
                          background: 'rgba(251, 191, 36, 0.1)',
                          border: '1px solid rgba(251, 191, 36, 0.3)',
                          borderRadius: 'var(--hf-radius)',
                          padding: 'var(--hf-space-md)',
                          marginBottom: 'var(--hf-space-md)'
                        }}
                      >
                        <div className="hf-flex" style={{alignItems: 'center', gap: 'var(--hf-space-sm)', marginBottom: 'var(--hf-space-sm)'}}>
                          <span style={{fontSize: '1.25rem'}}>⚠️</span>
                          <strong style={{color: '#f59e0b'}}>Pagos Pendientes</strong>
                        </div>
                        <div className="hf-list" style={{marginTop: 'var(--hf-space-sm)'}}>
                          {monthData.pending.map(item => (
                            <div key={item.id} className="hf-list-item">
                              <div className="hf-flex" style={{alignItems: 'center', gap: 'var(--hf-space-md)', flexWrap: 'wrap', flex: 1}}>
                                <div style={{minWidth: '24px', fontSize: '1.25rem'}}>❌</div>
                                <div style={{minWidth: '120px', fontWeight: 600, color: '#f59e0b'}}>
                                  {item.nombre}
                                </div>
                                <div className="hf-flex" style={{gap: 'var(--hf-space-sm)', alignItems: 'center', flex: 1}}>
                                  <input
                                    type="number"
                                    placeholder="Monto"
                                    value={monthlyExpenseAmounts[`overdue-${monthData.monthKey}-${item.id}`] || ''}
                                    onChange={(e) => handleMonthlyExpenseAmountChange(`overdue-${monthData.monthKey}-${item.id}`, e.target.value)}
                                    className="hf-input"
                                    style={{maxWidth: '150px'}}
                                    step="0.01"
                                    min="0"
                                  />
                                  <span style={{color: 'var(--hf-text-secondary)'}}>ARS</span>
                                  <button
                                    type="button"
                                    onClick={() => handlePayOverdue(item, monthData.monthKey, monthData.monthName)}
                                    className="hf-button hf-button-primary"
                                    style={{padding: '0.5rem 1rem', fontSize: '0.875rem'}}
                                  >
                                    Pagar ahora
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {monthData.items.filter(i => i.completed).length > 0 && (
                      <div>
                        <p style={{fontSize: '0.875rem', color: 'var(--hf-text-secondary)', marginBottom: 'var(--hf-space-sm)', fontWeight: 600}}>
                          ✅ Pagados
                        </p>
                        <div className="hf-list">
                          {monthData.items.filter(i => i.completed).map(item => (
                            <div 
                              key={item.id} 
                              className="hf-list-item"
                              style={{opacity: 0.7}}
                            >
                              <div className="hf-flex" style={{alignItems: 'center', gap: 'var(--hf-space-md)', flex: 1}}>
                                <div style={{minWidth: '24px', fontSize: '1.25rem'}}>✓</div>
                                <div style={{minWidth: '120px', fontWeight: 500}}>
                                  {item.nombre}
                                </div>
                                <div style={{color: 'var(--hf-text-secondary)', fontSize: '0.875rem'}}>
                                  {formatCurrency(item.amount, item.moneda)} • {USER_NAMES[item.registeredBy]?.split(' ')[0] || 'Usuario'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="hf-card" style={{maxWidth: '900px', margin: '0 auto'}}>
          <h2 className="text-xl font-bold mb-4 hf-text-gradient text-center">Registrar Gasto / Ingreso Manual</h2>

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
                      <th>Acciones</th>
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
                        <td>
                          <div className="hf-flex" style={{gap: '0.5rem'}}>
                            {!r.anulada && (
                              <button 
                                onClick={() => {
                                  if (reportFilters.tipoDatos === 'inversiones') {
                                    handleShowAnnulTransaction(r.id);
                                  } else {
                                    _handleShowAnnulConfirm(r.id);
                                  }
                                }}
                                className="p-2 rounded-full text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 transition-colors"
                                title="Anular registro"
                              >
                                <span style={{fontSize: '1rem'}}>⊘</span>
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setDocToDelete(r.id);
                                setDeleteType(reportFilters.tipoDatos === 'inversiones' ? 'transaction' : 'cashflow');
                                setShowConfirmModal(true);
                              }}
                              className="p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Eliminar registro"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
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

  // Mostrar login si no está autenticado o aún no se verificó autenticación
  if (!DEV_BYPASS_AUTH && (showLogin || !isAuthReady)) {
    return <LoginForm onLogin={handleLogin} error={loginError} />;
  }

  // Render único
  return (
    <>
      {contenido}
      {/* Modal de Confirmación para eliminación individual */}
      {showConfirmModal && (
        <ConfirmationModal onConfirm={handleDeleteTransaction} onCancel={handleCancelDelete} />
      )}
      {/* Modal de Confirmación para eliminación masiva */}
      {showMassDeleteModal && (
        <ConfirmationModal 
          onConfirm={handleMassDelete} 
          onCancel={handleCancelMassDelete}
          message={
            massDeleteType === 'all-transactions' 
              ? '¿Estás seguro de eliminar TODAS las inversiones? Esta acción es permanente.' 
              : massDeleteType === 'all-cashflow'
              ? '¿Estás seguro de eliminar TODOS los registros de cashflow? Esta acción es permanente.'
              : '¿Estás seguro de eliminar TODOS los datos (inversiones y cashflow)? Esta acción es permanente y NO se puede deshacer.'
          }
        />
      )}
      {/* Modal de Confirmación para anulación de transacción */}
      {showAnnulTransactionModal && (
        <ConfirmationModal 
          onConfirm={handleAnnulTransaction} 
          onCancel={handleCancelAnnulTransaction}
          message="¿Estás seguro de anular esta transacción de inversión? Se marcará como anulada pero no se eliminará del registro."
        />
      )}
      {/* Modal de Confirmación para anulación de cashflow */}
      {showAnnulModal && (
        <ConfirmationModal onConfirm={handleAnnulCashflow} onCancel={handleCancelAnnul} />
      )}
    </>
  );
};

export default App;
