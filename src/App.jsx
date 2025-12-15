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
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  X,
} from 'lucide-react';

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

// Formato de moneda compartido (utilidad global dentro de este módulo)
const formatCurrency = (amount, moneda = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(amount);

const App = () => {
  // Ref to detect IME composition (avoid sanitizing during composition)
  const compositionRef = useRef(false);

  // --- Sanitizers (prevent invalid characters on input) ---
  const sanitizeDecimal = (value, maxDecimals = 8) => {
    if (!value && value !== '') return '';
    // Allow comma as decimal separator (convert to dot)
    let v = value.replace(',', '.');
    // Remove everything except digits and dot
    v = v.replace(/[^0-9.]/g, '');
    // Only allow one dot
    const parts = v.split('.');
    if (parts.length > 2) {
      v = parts.shift() + '.' + parts.join('');
    }
    // Limit decimals
    if (parts[1]) {
      parts[1] = parts[1].slice(0, maxDecimals);
      v = parts[0] + '.' + parts[1];
    }
    return v;
  };

  // sanitizeInteger removed (not used). Use sanitizeDecimal where needed.

  const sanitizeActivo = (value) => value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 10);

  const sanitizeNombre = (value) => value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, '').slice(0, 50);

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  // isAuthReady indica que el intento inicial de autenticación ha finalizado
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [_transactions, setTransactions] = useState([]);
  const [newTransaction, setNewTransaction] = useState({
    tipoOperacion: 'compra', // 'compra' o 'venta'
    activo: '',
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
    console.log(
      `Firestore Path being used for onSnapshot (App ID: ${appId}, User ID: ${userId}): ${transactionsPath}`,
    );

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
    // Total acorde al recibo (obligatorio, solo números)
    if (!/^\d+(\.\d+)?$/.test(newTransaction.totalOperacion) || parseFloat(newTransaction.totalOperacion) <= 0) {
      errors.totalOperacion = 'El "Total (según recibo)" debe ser un número positivo.';
    }
    // Comisión (opcional) validación numérica
    if (newTransaction.comision && !/^\d+(\.\d+)?$/.test(newTransaction.comision)) {
      errors.comision = 'La "Comisión" debe ser un número válido.';
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
      activo: assetSymbol,
      nombreActivo: newTransaction.nombreActivo || '',
      tipoActivo: newTransaction.tipoActivo,
      cantidad: parseFloat(newTransaction.cantidad),
      precioUnitario: parseFloat(newTransaction.precioUnitario),
      montoTotal: parseFloat(newTransaction.totalOperacion) || 0, // usamos el total indicado por el recibo
      usuarioId: userId,
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
            Investment Manager
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
            <div>
              <label htmlFor="fechaTransaccion" className="block text-sm font-medium text-gray-700">Fecha de la transacción</label>
              <input id="fechaTransaccion" name="fechaTransaccion" type="date" required value={newTransaction.fechaTransaccion || ''} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.fechaTransaccion && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.fechaTransaccion}</p>
              )}
            </div>
            <div>
              <label htmlFor="activo" className="block text-sm font-medium text-gray-700">Activo</label>
              <input id="activo" name="activo" type="text" required placeholder="Ej: BTC, INTC" value={newTransaction.activo} onChange={handleInputChange} onPaste={(e) => {
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const cleaned = sanitizeActivo(text);
                if (!cleaned) e.preventDefault();
                else {
                  e.preventDefault();
                  setNewTransaction(prev => ({ ...prev, activo: cleaned }));
                  setFieldErrors(prev => ({ ...prev, activo: null }));
                }
              }} onCompositionStart={() => (compositionRef.current = true)} onCompositionEnd={(e) => { compositionRef.current = false; handleInputChange(e); }} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
              {fieldErrors.activo && (
                <p className="mt-1 text-sm text-red-600">{fieldErrors.activo}</p>
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
              <label htmlFor="notas" className="block text-sm font-medium text-gray-700">Notas (opcional)</label>
              <textarea id="notas" name="notas" rows={2} placeholder="Observaciones, detalles..." value={newTransaction.notas} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out">Agregar Transacción</button>
          </form>
        </div>
      </div>
    );
  } else if (tab === 'gastos') {
    contenido = (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans antialiased">
        <header className="mb-8 p-4 bg-white shadow-lg rounded-xl flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-green-700 flex items-center">Gastos Mensuales</h1>
          <button className="px-4 py-2 rounded-lg bg-gray-200 text-green-700 font-bold hover:bg-gray-300" onClick={() => setTab('')}>Volver</button>
        </header>
        <div className="bg-white rounded-xl shadow-xl p-8 text-center text-gray-500">Próximamente: Control de gastos mensuales</div>
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
        <ConfirmationModal
          onConfirm={handleDeleteTransaction}
          onCancel={handleCancelDelete}
        />
      )}
    </>
  );
};

// Modal de confirmación
const ConfirmationModal = ({ onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all">
      <div className="flex justify-between items-start border-b pb-3 mb-4">
        <h3 className="text-xl font-bold text-red-600">
          Confirmar Eliminación
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
      <p className="text-gray-700 mb-6">
        ¿Estás seguro de que quieres eliminar esta transacción? Esta acción no
        se puede deshacer.
      </p>
      <div className="flex justify-end space-x-3">
        <button
          onClick={onCancel}
          className="py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          className="py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition"
        >
          Eliminar
        </button>
      </div>
    </div>
  </div>
);

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

// Item de transacción
const TransactionItem = ({ transaction, onDelete }) => {
  const isCompra = transaction.tipoOperacion === 'compra';
  const typeClass = isCompra ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  const Icon = isCompra ? ArrowUpRight : ArrowDownLeft;
  const sourceDate = transaction.fechaTransaccion || transaction.fecha;
  const formattedDate = sourceDate instanceof Date
    ? sourceDate.toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Cargando fecha...';
  const userName = USER_NAMES[transaction.usuarioId] || 'Usuario';
  const token = (transaction.activo || '').toUpperCase();
  const moneda = transaction.moneda || 'ARS';

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition duration-150 ease-in-out">
      <div className="flex items-center space-x-3 min-w-0">
        <div className={`p-2 rounded-full ${typeClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 truncate">
            {transaction.nombreActivo || token}
          </p>
          <p className="text-xs text-gray-500">{formattedDate}</p>
          <p className="text-xs text-indigo-700 font-bold">Token: {token}</p>
          <p className="text-xs text-gray-700">Usuario: {userName}</p>
          <p className="text-xs text-gray-700">Tipo: {isCompra ? 'Compra' : 'Venta'}</p>
          <p className="text-xs text-gray-700">Cantidad: {transaction.cantidad}</p>
          <p className="text-xs text-gray-700">Precio Unitario: {formatCurrency(transaction.precioUnitario, moneda)}</p>
          <p className="text-xs text-gray-700">Moneda: {moneda}</p>
        </div>
      </div>
      <div className="flex items-center space-x-3 mt-2 md:mt-0">
        <p className={`font-bold text-lg ${isCompra ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(transaction.montoTotal || 0, moneda)}
        </p>
        <button
          onClick={() => onDelete(transaction.id)}
          className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition duration-150"
          title="Eliminar Transacción"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

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
