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
import { DollarSign } from 'lucide-react';
import ConfirmationModal from './components/ConfirmationModal';
import { formatCurrency, sanitizeDecimal, sanitizeActivo, sanitizeNombre, getUniqueActivos } from './utils/formatters';

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-indigo-700 text-center">
          Iniciar Sesión
        </h2>
        {error && (
          <div className="mb-4 text-red-700 text-sm">{error}</div>
        )}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => onLogin({ google: true })}
            className="w-full py-2 px-4 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 transition"
          >
            Ingresar con Google
          </button>
        </div>
      </div>
    </div>
  );
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
  const [tab, setTab] = useState(''); // '', 'inversiones', 'gastos', 'reportes'


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
    const q = query(collection(db, cashflowPath), orderBy('timestamp', 'desc'), limit(5));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const fetched = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetched.push({ id: docSnap.id, ...data, timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date() });
        });

        // If there are no results (e.g., older records only have `fecha` but not `timestamp`),
        // fallback to fetch by `fecha` so existing docs appear in the 'Últimos 5'.
        if (fetched.length === 0) {
          try {
            const fallbackQ = query(collection(db, cashflowPath), orderBy('fecha', 'desc'), limit(5));
            const fallbackSnap = await getDocs(fallbackQ);
            const fallback = [];
            fallbackSnap.forEach((docSnap) => {
              const data = docSnap.data();
              fallback.push({ id: docSnap.id, ...data, timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : (data.fecha?.toDate ? data.fecha.toDate() : new Date()) });
            });
            setCashflows(fallback);
            return;
          } catch (e) {
            console.error('Error fetching fallback cashflow by fecha:', e);
          }
        }

        setCashflows(fetched);
      },
      (err) => {
        console.error('Error fetching cashflow:', err);
        setError('Error fetching cashflow: Problema de red o configuración.');
      },
    );

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
  }, [_transactions, newTransaction.usuarioId]);

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
    const transactionToSave = {
      ...newTransaction,
      tipoOperacion: newTransaction.tipoOperacion,
      activo: assetSymbol,
      nombreActivo: newTransaction.nombreActivo || '',
      tipoActivo: newTransaction.tipoActivo,
      cantidad: parseFloat(newTransaction.cantidad),
      precioUnitario: parseFloat(newTransaction.precioUnitario),
      montoTotal: parseFloat(newTransaction.totalOperacion) || 0, // usamos el total indicado por el recibo
      // Guardar comisión como number o null si no existe (importante para cálculos y reportes)
      comision: newTransaction.comision ? parseFloat(newTransaction.comision) : null,
      // Guardar moneda de la comisión como null si está vacía (consistencia con `comision`)
      monedaComision: newTransaction.monedaComision ? newTransaction.monedaComision : null,
      usuarioId: newTransaction.usuarioId || userId,
      timestamp: serverTimestamp(), // fecha real de creación (para ordenar)
      fechaTransaccion: new Date(`${newTransaction.fechaTransaccion}T00:00:00`), // fecha elegida (como Date)
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
      // keep both `timestamp` (used for ordering) and `fecha` for compatibility
      timestamp: serverTimestamp(),
      fecha: serverTimestamp(),
      fechaOperacion: new Date(`${newCashflow.fechaOperacion}T00:00:00`),
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
        anuladaAt: serverTimestamp(),
        anuladaBy: userId || 'dev-albert',
      });
      handleCancelAnnul();
    } catch (err) {
      console.error('Error annulling cashflow:', err);
      setError('Error al anular el registro.');
      handleCancelAnnul();
    }
  };

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
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-xl font-medium text-gray-700">
          Cargando aplicación...
        </div>
      </div>
    );
  } else if (error) {
    contenido = (
      <div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-lg mx-auto mt-10 shadow-xl">
        <h2 className="text-2xl font-bold mb-4">Error de Configuración/Conexión</h2>
        <p className="font-semibold mb-2">{error}</p>
      </div>
    );
  } else if (!DEV_BYPASS_AUTH && !isSuperAdmin && isAuthReady) {
    contenido = (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50">
        <div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-lg mx-auto mt-10 shadow-xl">
          <h2 className="text-2xl font-bold mb-4">Acceso Denegado</h2>
        </div>
      </div>
    );
  } else if (!tab) {
    contenido = (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center font-sans antialiased">
        <header className="mb-8 p-4 bg-white shadow-lg rounded-xl text-center">
          <h1 className="text-3xl font-extrabold text-indigo-700 flex items-center justify-center">
            <DollarSign className="w-8 h-8 mr-2 text-indigo-500" />
            HomeFlow
          </h1>
          <p className="text-sm text-gray-500 mt-1">Bienvenido, {userName}</p>
        </header>
        <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-8 flex flex-col gap-6">
          <h2 className="text-xl font-bold text-indigo-700 text-center mb-4">¿Qué sección deseas consultar?</h2>
          <button className="w-full py-3 rounded-lg bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-700 transition" onClick={() => setTab('inversiones')}>Inversiones</button>
          <button className="w-full py-3 rounded-lg bg-green-600 text-white font-bold text-lg hover:bg-green-700 transition" onClick={() => setTab('gastos')}>Gastos Mensuales</button>
          <button className="w-full py-3 rounded-lg bg-gray-600 text-white font-bold text-lg hover:bg-gray-700 transition" onClick={() => setTab('reportes')}>Reportes</button>
        </div>
      </div>
    );
  } else if (tab === 'inversiones') {
    contenido = (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans antialiased">
        <header className="mb-8 p-4 bg-white shadow-lg rounded-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <DollarSign className="w-10 h-10 text-indigo-600" />
            <h1 className="text-3xl font-extrabold text-indigo-700">Inversiones</h1>
          </div>
          <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80" alt="Inversiones" className="rounded-xl shadow-lg w-32 h-32 object-cover hidden md:block" />
          <button className="px-4 py-2 rounded-lg bg-gray-200 text-indigo-700 font-bold hover:bg-gray-300" onClick={() => setTab('')}>Volver</button>
        </header>
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-indigo-700 text-center">Agregar nueva transacción</h2>

          {successMessage && (
            <div className="p-3 mb-4 text-sm text-green-800 bg-green-100 rounded-lg">
              {successMessage}
            </div>
          )}

          {/* Ahora mostramos errores inline por campo en lugar de un mensaje global */}
          <form onSubmit={handleAddTransaction} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de Operación</label>
                <div className="mt-1 flex items-center gap-4">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="tipoOperacion" value="compra" checked={newTransaction.tipoOperacion === 'compra'} onChange={handleInputChange} />
                    <span>Compra</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="tipoOperacion" value="venta" checked={newTransaction.tipoOperacion === 'venta'} onChange={handleInputChange} />
                    <span>Venta</span>
                  </label>
                </div>
              </div>
              <div>
                <label htmlFor="fechaTransaccion" className="block text-sm font-medium text-gray-700">Fecha de la transacción</label>
                <input id="fechaTransaccion" name="fechaTransaccion" type="date" required value={newTransaction.fechaTransaccion || ''} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                {fieldErrors.fechaTransaccion && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.fechaTransaccion}</p>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="usuarioId" className="block text-sm font-medium text-gray-700">Usuario</label>
              <select id="usuarioId" name="usuarioId" value={newTransaction.usuarioId} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="" disabled>Selecciona usuario...</option>
                {Object.entries(USER_NAMES).map(([uid, name]) => (
                  <option key={uid} value={uid}>{name.split(' ')[0]}</option>
                ))}
              </select>
              {fieldErrors.usuarioId && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.usuarioId}</p>
              )}
              {newTransaction.tipoOperacion === 'venta' && !newTransaction.usuarioId && (
                <p className="mt-2 text-sm text-gray-500">Selecciona un usuario para ver los activos disponibles para venta.</p>
              )}
            </div>
            <div>
              <label htmlFor="activo" className="block text-sm font-medium text-gray-700">Símbolo del Activo</label>
              <select
                id="activo"
                name="activo"
                value={newTransaction.activo}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                disabled={newTransaction.tipoOperacion === 'venta' && activosList.length === 0}
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
              {fieldErrors.activo && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.activo}</p>
              )}
              {newTransaction.tipoOperacion === 'venta' && activosList.length === 0 && (
                <p className="mt-2 text-sm text-yellow-700">No hay activos registrados para el usuario seleccionado. No es posible registrar ventas.</p>
              )}
            </div>
            <div>
              <label htmlFor="nombreActivo" className="block text-sm font-medium text-gray-700">Nombre del Activo</label>
              <input id="nombreActivo" name="nombreActivo" type="text" placeholder="Ej: Bitcoin" value={newTransaction.nombreActivo} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeNombre(text);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, nombreActivo: cleaned }));
                  setFieldErrors(prev => ({ ...prev, nombreActivo: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.nombreActivo && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.nombreActivo}</p>
              )}
            </div>
            <div>
              <label htmlFor="tipoActivo" className="block text-sm font-medium text-gray-700">Tipo de Activo</label>
              <select id="tipoActivo" name="tipoActivo" value={newTransaction.tipoActivo} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="" disabled>Selecciona tipo de activo...</option>
                <option value="Cripto">Cripto</option>
                <option value="Acciones">Acciones</option>
                <option value="Cedears">Cedears</option>
                <option value="Lecap">Lecap</option>
                <option value="Letra">Letra</option>
                <option value="Bono">Bono</option>
              </select>
              {fieldErrors.tipoActivo && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.tipoActivo}</p>
              )}
            </div>
            <div>
              <label htmlFor="moneda" className="block text-sm font-medium text-gray-700">Moneda</label>
              <select id="moneda" name="moneda" required value={newTransaction.moneda} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="" disabled>Selecciona moneda...</option>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              {fieldErrors.moneda && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.moneda}</p>
              )}
            </div>
            <div>
              <label htmlFor="cantidad" className="block text-sm font-medium text-gray-700">Cantidad</label>
              <input id="cantidad" name="cantidad" type="text" inputMode="decimal" required placeholder="Ej: 0.5" value={newTransaction.cantidad} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 8);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, cantidad: cleaned }));
                  setFieldErrors(prev => ({ ...prev, cantidad: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.cantidad && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.cantidad}</p>
              )}
            </div>
            <div>
              <label htmlFor="precioUnitario" className="block text-sm font-medium text-gray-700">Precio Unitario</label>
              <input id="precioUnitario" name="precioUnitario" type="text" inputMode="decimal" required placeholder="Ej: 100.00" value={newTransaction.precioUnitario} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 8);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, precioUnitario: cleaned }));
                  setFieldErrors(prev => ({ ...prev, precioUnitario: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.precioUnitario && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.precioUnitario}</p>
              )}
            </div>
            <div>
              <label htmlFor="totalOperacion" className="block text-sm font-medium text-gray-700">Total {newTransaction.tipoOperacion === 'compra' ? 'Compra' : 'Venta'} (según recibo)</label>
              <input id="totalOperacion" name="totalOperacion" type="text" inputMode="decimal" required step="any" min="0.01" placeholder="Ej: 1000.00" value={newTransaction.totalOperacion || ''} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 2);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, totalOperacion: cleaned }));
                  setFieldErrors(prev => ({ ...prev, totalOperacion: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.totalOperacion && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.totalOperacion}</p>
              )}
            </div>
            <div>
              <label htmlFor="comision" className="block text-sm font-medium text-gray-700">Comisión (opcional)</label>
              <input id="comision" name="comision" type="text" inputMode="decimal" step="any" min="0" placeholder="Ej: 1.5" value={newTransaction.comision} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeDecimal(text, 4);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, comision: cleaned }));
                  setFieldErrors(prev => ({ ...prev, comision: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.comision && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.comision}</p>
              )}
            </div>
            <div>
              <label htmlFor="monedaComision" className="block text-sm font-medium text-gray-700">Moneda Comisión (opcional)</label>
              <select id="monedaComision" name="monedaComision" value={newTransaction.monedaComision} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="" disabled>Selecciona moneda para la comisión...</option>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
              {fieldErrors.monedaComision && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.monedaComision}</p>
              )}
            </div>
            <div>
              <label htmlFor="exchange" className="block text-sm font-medium text-gray-700">Exchange</label>
              <select id="exchange" name="exchange" value={newTransaction.exchange} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500">
                <option value="" disabled>Selecciona exchange...</option>
                <option value="Invertir Online">Invertir Online</option>
                <option value="Binance">Binance</option>
                <option value="BingX">BingX</option>
                <option value="Buenbit">Buenbit</option>
              </select>
              {fieldErrors.exchange && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.exchange}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="notas" className="block text-sm font-medium text-gray-700">Notas (opcional)</label>
              <textarea id="notas" name="notas" rows={2} placeholder="Observaciones, detalles..." value={newTransaction.notas} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <button
              type="submit"
              disabled={newTransaction.tipoOperacion === 'venta' && activosList.length === 0}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out ${newTransaction.tipoOperacion === 'venta' && activosList.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >Agregar Transacción</button>
          </form>
        </div>
      </div>
    );
  } else if (tab === 'gastos') {
    contenido = (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans antialiased">
        <header className="mb-8 p-4 bg-white shadow-lg rounded-xl flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-green-700 flex items-center">Gastos / Ingresos</h1>
          <button className="px-4 py-2 rounded-lg bg-gray-200 text-green-700 font-bold hover:bg-gray-300" onClick={() => setTab('')}>Volver</button>
        </header>
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold mb-4 text-green-700 text-center">Registrar Gasto / Ingreso</h2>

          {successMessage && (
            <div className="p-3 mb-4 text-sm text-green-800 bg-green-100 rounded-lg">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleAddCashflow} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <select name="tipo" value={newCashflow.tipo} onChange={handleCashflowInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500">
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                </select>
                {cashflowFieldErrors.tipo && <p className="mt-1 text-sm text-red-600">{cashflowFieldErrors.tipo}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha</label>
                <input name="fechaOperacion" value={newCashflow.fechaOperacion || ''} onChange={handleCashflowInputChange} type="date" required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500" />
                {cashflowFieldErrors.fechaOperacion && <p className="mt-1 text-sm text-red-600">{cashflowFieldErrors.fechaOperacion}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Usuario</label>
              <select name="usuarioId" value={newCashflow.usuarioId} onChange={handleCashflowInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500">
                <option value="" disabled>Selecciona usuario...</option>
                {Object.entries(USER_NAMES).map(([uid, name]) => (
                  <option key={uid} value={uid}>{name.split(' ')[0]}</option>
                ))}
              </select>
              {cashflowFieldErrors.usuarioId && <p className="mt-1 text-sm text-red-600">{cashflowFieldErrors.usuarioId}</p>}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Monto</label>
                <input name="monto" value={newCashflow.monto} onChange={handleCashflowInputChange} inputMode="decimal" placeholder="Ej: 1000.00" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500" />
                {cashflowFieldErrors.monto && <p className="mt-1 text-sm text-red-600">{cashflowFieldErrors.monto}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Moneda</label>
                <select name="moneda" value={newCashflow.moneda} onChange={handleCashflowInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500">
                  <option value="">Selecciona moneda...</option>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                {cashflowFieldErrors.moneda && <p className="mt-1 text-sm text-red-600">{cashflowFieldErrors.moneda}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Categoría</label>
                <select name="categoria" value={newCashflow.categoria} onChange={handleCashflowInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500">
                  <option value="">Selecciona categoría...</option>
                  <option value="Comida">Comida</option>
                  <option value="Servicios">Servicios</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Salud">Salud</option>
                  <option value="Entretenimiento">Entretenimiento</option>
                  <option value="Sueldo">Sueldo</option>
                  <option value="Otros">Otros</option>
                </select>
                {cashflowFieldErrors.categoria && <p className="mt-1 text-sm text-red-600">{cashflowFieldErrors.categoria}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Descripción (opcional)</label>
              <input name="descripcion" value={newCashflow.descripcion} onChange={handleCashflowInputChange} placeholder="Detalle breve..." className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-green-500 focus:border-green-500" />
            </div>

            <button type="submit" className="w-full py-2 px-4 rounded-xl shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">Guardar</button>
          </form>

          <hr className="my-6" />

          <h3 className="text-lg font-semibold mb-3">Últimos 5 registros</h3>
          <div className="space-y-3">
            {cashflows.length === 0 ? (
              <div className="text-sm text-gray-500">No hay registros recientes.</div>
            ) : (
              cashflows.map((c) => (
                <div key={c.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start justify-between">
                  <div>
                          <div className="text-sm text-gray-500">{c.tipo.toUpperCase()} • {c.categoria} • <span className="font-medium">{USER_NAMES[c.usuarioId] ? USER_NAMES[c.usuarioId].split(' ')[0] : 'Usuario'}</span></div>
                    <div className="font-bold text-lg">{formatCurrency(c.monto || 0, c.moneda || 'ARS')}</div>
                    <div className="text-sm text-gray-500">{(c.fechaOperacion && c.fechaOperacion.toDate) ? c.fechaOperacion.toDate().toLocaleDateString() : (c.fechaOperacion ? new Date(c.fechaOperacion).toLocaleDateString() : '')}</div>
                    {c.descripcion && <div className="text-sm text-gray-600 mt-1">{c.descripcion}</div>}
                    {c.anulada && <div className="mt-2 inline-block text-sm font-semibold text-red-700">ANULADA</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-gray-400">{new Date(c.timestamp || Date.now()).toLocaleString()}</div>
                    {!c.anulada ? (
                      <button onClick={() => _handleShowAnnulConfirm(c.id)} className="px-3 py-1 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700">Anular</button>
                    ) : (
                      <button disabled className="px-3 py-1 rounded-lg bg-gray-300 text-gray-600 text-sm">Anulada</button>
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
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans antialiased">
        <header className="mb-8 p-4 bg-white shadow-lg rounded-xl flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-gray-700 flex items-center">Reportes</h1>
          <button className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-bold hover:bg-gray-300" onClick={() => setTab('')}>Volver</button>
        </header>
        <div className="bg-white rounded-xl shadow-xl p-8 text-center text-gray-500">Próximamente: Panel de reportes</div>
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
