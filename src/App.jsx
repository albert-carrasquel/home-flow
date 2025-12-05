import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
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
const appId = rawAppId.replace(/[/\.:]/g, '-');

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

// Token inicial de autenticación (si tu entorno lo inyecta)
// En local lo normal es que sea null → autenticación anónima.
const initialAuthToken =
  typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

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

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  // isAuthReady indica que el intento inicial de autenticación ha finalizado
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [newTransaction, setNewTransaction] = useState({
    tipoOperacion: 'compra', // 'compra' o 'venta'
    activo: '',
    nombreActivo: '',
    tipoActivo: '',
    cantidad: '',
    precioUnitario: '',
    moneda: 'USD',
    comision: '',
    monedaComision: 'USD',
    exchange: '',
    notas: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [docToDelete, setDocToDelete] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [showLogin, setShowLogin] = useState(true);
  // Mostrar nombre de usuario en vez de UID
  const [userName, setUserName] = useState('');

  // Filtros para consultas avanzadas
  const [filtroActivo, setFiltroActivo] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  // 1. Inicialización de Firebase y Autenticación
  useEffect(() => {
    if (Object.keys(firebaseConfig).length === 0) {
      setError('Error: Firebase configuration is missing.');
      setIsLoading(false);
      return;
    }

    // Inicialización de la app y servicios
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const firebaseAuth = getAuth(app);
    setLogLevel('debug');
    setDb(firestore);
    setAuth(firebaseAuth);
    setIsAuthReady(true);
    setIsLoading(false);
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

  // Verificación de super admin
  useEffect(() => {
    if (userId) {
      setIsSuperAdmin(SUPER_ADMINS.includes(userId));
    } else {
      setIsSuperAdmin(false);
    }
  }, [userId]);

  // Cálculo de métricas
  const totalInvestment = transactions
    .filter((t) => t.type === 'investment')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  const totalWithdrawal = transactions
    .filter((t) => t.type === 'withdrawal')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

  const netBalance = totalInvestment - totalWithdrawal;

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);

  // Manejo de inputs del formulario
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTransaction((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError(null);
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    // Validación básica
    if (!db || !userId || !newTransaction.activo || !newTransaction.cantidad || !newTransaction.precioUnitario) {
      setFormError('Completa los campos obligatorios: Activo, Cantidad y Precio Unitario.');
      return;
    }
    try {
      const transactionsPath = getTransactionsCollectionPath(appId);
      const montoTotal = parseFloat(newTransaction.cantidad) * parseFloat(newTransaction.precioUnitario);
      await addDoc(collection(db, transactionsPath), {
        ...newTransaction,
        cantidad: parseFloat(newTransaction.cantidad),
        precioUnitario: parseFloat(newTransaction.precioUnitario),
        montoTotal,
        usuarioId: userId,
        fecha: serverTimestamp(),
      });
      setNewTransaction({
        tipoOperacion: 'compra',
        activo: '',
        nombreActivo: '',
        tipoActivo: '',
        cantidad: '',
        precioUnitario: '',
        moneda: 'USD',
        comision: '',
        monedaComision: 'USD',
        exchange: '',
        notas: '',
      });
      setFormError(null);
    } catch (e) {
      console.error('Error adding transaction: ', e);
      setError('Error al agregar la transacción. Revisa las reglas de seguridad de Firestore.');
    }
  };

  // Manejo del modal de confirmación de borrado
  const handleShowDeleteConfirm = (id) => {
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

  // Si ya hay usuario, no mostrar login
  useEffect(() => {
    if (userId) setShowLogin(false);
  }, [userId]);

  // Mostrar nombre de usuario
  useEffect(() => {
    if (userId && USER_NAMES[userId]) {
      setUserName(USER_NAMES[userId]);
    } else if (auth && userId) {
      const user = auth.currentUser;
      setUserName(user.displayName || user.email || 'Usuario');
    }
  }, [auth, userId]);

  // Obtener lista de tokens únicos normalizados
  const tokensRegistrados = Array.from(new Set(transactions.map(t => (t.activo || '').toUpperCase()).filter(Boolean)));

  // Consulta filtrada mejorada
  const transaccionesFiltradas = transactions.filter((t) => {
    let ok = true;
    if (filtroActivo && t.activo) ok = ok && t.activo.toUpperCase() === filtroActivo;
    if (filtroUsuario && t.usuarioId) ok = ok && t.usuarioId === filtroUsuario;
    if (filtroFechaDesde && t.fecha) ok = ok && t.fecha.toDate() >= new Date(filtroFechaDesde);
    if (filtroFechaHasta && t.fecha) ok = ok && t.fecha.toDate() <= new Date(filtroFechaHasta);
    return ok;
  });

  // Mostrar login si no está autenticado
  if (showLogin && isAuthReady && !userId) {
    return <LoginForm onLogin={handleLogin} error={loginError} />;
  }

  // --- RENDER ---

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="text-xl font-medium text-gray-700">
          Cargando aplicación...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-lg mx-auto mt-10 shadow-xl">
        <h2 className="text-2xl font-bold mb-4">
          Error de Configuración/Conexión
        </h2>

        <p className="font-semibold mb-2">{error}</p>

        <p className="mt-4 text-sm font-bold text-red-800">
          ACCIÓN REQUERIDA: El error `permission-denied` indica que las Reglas
          de Seguridad de tu base de datos Firestore están bloqueando el acceso.
          Para una aplicación colaborativa pública como esta, debes permitir la
          lectura y escritura.
        </p>

        <h3 className="mt-4 text-lg font-semibold text-red-700">
          Regla de Seguridad Sugerida (para copiar):
        </h3>

        <div className="mt-3 p-4 bg-red-2 00 rounded-lg text-xs break-all overflow-x-auto font-mono">
          <pre className="whitespace-pre-wrap">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permite lectura y escritura en la colección de transacciones (ruta pública)
    // RUTA: /artifacts/{appId}/public/data/transactions/{transactionId}
    match /artifacts/{appId}/public/data/transactions/{transactionId} {
      allow read, write: if true;
    }
    // Asegúrate de que tengas una regla de fallback para el resto de la base de datos
    // match /{document=**} {
    //   allow read, write: if false; // O cualquier otra regla de seguridad por defecto
    // }
  }
}`}
          </pre>
        </div>

        <p className="mt-4 text-xs text-red-800 italic">
          Copia y pega este *snippet* en el editor de "Reglas" de tu consola de
          Firebase para solucionar el problema de permisos.
        </p>

        <div className="mt-4 p-2 bg-red-300 rounded text-xs break-all">
          <strong>Ruta de Firestore utilizada:</strong> {' '}
          {getTransactionsCollectionPath(appId)}
          <br />
          <strong>User ID:</strong> {userId || 'No autenticado'}
          <br />
          <span className="italic">
            Revisa la consola para el logging de depuración de Firestore.
          </span>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin && isAuthReady) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50">
        <div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-lg mx-auto mt-10 shadow-xl">
          <h2 className="text-2xl font-bold mb-4">Acceso Denegado</h2>
          <p className="mb-2">
            Tu usuario no tiene permisos para acceder a esta aplicación.
          </p>
          <p className="text-xs text-gray-600">
            Contacta al administrador para solicitar acceso.
          </p>
          <div className="mt-4 p-2 bg-red-300 rounded text-xs break-all">
            <strong>User ID detectado:</strong> {userId || 'No autenticado'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans antialiased">
      <header className="mb-8 p-4 bg-white shadow-lg rounded-xl">
        <h1 className="text-3xl font-extrabold text-indigo-700 flex items-center">
          <DollarSign className="w-8 h-8 mr-2 text-indigo-500" />
          Investment Manager
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Proyecto colaborativo usando React y Cloud Firestore.
        </p>
        {userName && (
          <div className="mt-3 text-xs text-gray-600 p-2 bg-indigo-50 rounded-lg break-all">
            <strong>Usuario:</strong> {userName}
          </div>
        )}
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel de Métricas */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Balance Neto"
            amount={netBalance}
            icon={DollarSign}
            color={netBalance >= 0 ? 'green' : 'red'}
            formatCurrency={formatCurrency}
          />
          <MetricCard
            title="Inversión Total"
            amount={totalInvestment}
            icon={ArrowUpRight}
            color="indigo"
            formatCurrency={formatCurrency}
          />
          <MetricCard
            title="Retiro Total"
            amount={totalWithdrawal}
            icon={ArrowDownLeft}
            color="red"
            formatCurrency={formatCurrency}
          />

          {/* Filtros de consulta mejorados */}
          <div className="mb-6 p-4 bg-indigo-50 rounded-xl flex flex-col md:flex-row gap-4 items-center">
            {/* Combo de usuario */}
            <select
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Todos los usuarios</option>
              <option value="9dZMQNvgovSWE4lP7tOUNDzy6Md2">Albert Carrasquel</option>
              <option value="T0Kh0eHZ05he8iqD6vEG2G2c7Rl2">Haydee Macias</option>
            </select>
            {/* Combo de token */}
            <select
              value={filtroActivo}
              onChange={(e) => setFiltroActivo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Todos los tokens</option>
              {tokensRegistrados.map((token) => (
                <option key={token} value={token}>{token}</option>
              ))}
            </select>
            <input
              type="date"
              placeholder="Desde"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <input
              type="date"
              placeholder="Hasta"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                setFiltroActivo('');
                setFiltroUsuario('');
                setFiltroFechaDesde('');
                setFiltroFechaHasta('');
              }}
              className="px-4 py-2 rounded-lg bg-gray-300 text-gray-700 font-medium hover:bg-gray-400 transition"
            >
              Limpiar filtros
            </button>
          </div>

          {/* Lista de Transacciones */}
          <div className="md:col-span-3 bg-white p-6 shadow-xl rounded-xl">
            <h2 className="text-xl font-semibold text-gray-800 border-b pb-3 mb-4">
              Historial de Transacciones ({transaccionesFiltradas.length})
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {transaccionesFiltradas.length === 0 ? (
                <p className="text-gray-500 italic">
                  No hay transacciones con los filtros seleccionados.
                </p>
              ) : (
                transaccionesFiltradas.map((t) => (
                  <TransactionItem
                    key={t.id}
                    transaction={t}
                    formatCurrency={formatCurrency}
                    onDelete={handleShowDeleteConfirm}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Formulario de Nueva Transacción */}
        <div className="lg:col-span-1 bg-white p-6 shadow-xl rounded-xl h-fit">
          <h2 className="text-2xl font-bold mb-6 text-indigo-700">
            Nueva Transacción
          </h2>
          {formError && (
            <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
              {formError}
            </div>
          )}
          <form onSubmit={handleAddTransaction} className="space-y-5">
            {/* Tipo de Operación */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Operación
              </label>
              <div className="flex space-x-4">
                <RadioOption
                  id="compra"
                  name="tipoOperacion"
                  value="compra"
                  checked={newTransaction.tipoOperacion === 'compra'}
                  onChange={handleInputChange}
                  label="Compra"
                />
                <RadioOption
                  id="venta"
                  name="tipoOperacion"
                  value="venta"
                  checked={newTransaction.tipoOperacion === 'venta'}
                  onChange={handleInputChange}
                  label="Venta"
                />
              </div>
            </div>

            {/* Activo */}
            <div>
              <label
                htmlFor="activo"
                className="block text-sm font-medium text-gray-700"
              >
                Activo
              </label>
              <input
                id="activo"
                name="activo"
                type="text"
                required
                placeholder="Ej: BTC, INTC"
                value={newTransaction.activo}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Nombre del Activo */}
            <div>
              <label
                htmlFor="nombreActivo"
                className="block text-sm font-medium text-gray-700"
              >
                Nombre del Activo (opcional)
              </label>
              <input
                id="nombreActivo"
                name="nombreActivo"
                type="text"
                placeholder="Ej: Bitcoin, Intel"
                value={newTransaction.nombreActivo}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Tipo de Activo */}
            <div>
              <label
                htmlFor="tipoActivo"
                className="block text-sm font-medium text-gray-700"
              >
                Tipo de Activo (opcional)
              </label>
              <input
                id="tipoActivo"
                name="tipoActivo"
                type="text"
                placeholder="Ej: cripto, acción, cedear"
                value={newTransaction.tipoActivo}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Cantidad */}
            <div>
              <label
                htmlFor="cantidad"
                className="block text-sm font-medium text-gray-700"
              >
                Cantidad
              </label>
              <input
                id="cantidad"
                name="cantidad"
                type="number"
                required
                step="any"
                min="0.00000001"
                placeholder="Ej: 0.5"
                value={newTransaction.cantidad}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Precio Unitario */}
            <div>
              <label
                htmlFor="precioUnitario"
                className="block text-sm font-medium text-gray-700"
              >
                Precio Unitario
              </label>
              <input
                id="precioUnitario"
                name="precioUnitario"
                type="number"
                required
                step="any"
                min="0.0001"
                placeholder="Ej: 100.00"
                value={newTransaction.precioUnitario}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Moneda */}
            <div>
              <label htmlFor="moneda" className="block text-sm font-medium text-gray-700">
                Moneda
              </label>
              <input
                id="moneda"
                name="moneda"
                type="text"
                required
                placeholder="USD, ARS"
                value={newTransaction.moneda}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Comisión */}
            <div>
              <label htmlFor="comision" className="block text-sm font-medium text-gray-700">
                Comisión (opcional)
              </label>
              <input
                id="comision"
                name="comision"
                type="number"
                step="any"
                min="0"
                placeholder="Ej: 1.5"
                value={newTransaction.comision}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Moneda Comisión */}
            <div>
              <label htmlFor="monedaComision" className="block text-sm font-medium text-gray-700">
                Moneda Comisión (opcional)
              </label>
              <input
                id="monedaComision"
                name="monedaComision"
                type="text"
                placeholder="USD, ARS"
                value={newTransaction.monedaComision}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Exchange */}
            <div>
              <label htmlFor="exchange" className="block text-sm font-medium text-gray-700">
                Exchange (opcional)
              </label>
              <input
                id="exchange"
                name="exchange"
                type="text"
                placeholder="Ej: Binance, NYSE"
                value={newTransaction.exchange}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Notas */}
            <div>
              <label htmlFor="notas" className="block text-sm font-medium text-gray-700">
                Notas (opcional)
              </label>
              <textarea
                id="notas"
                name="notas"
                rows={2}
                placeholder="Observaciones, detalles..."
                value={newTransaction.notas}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
            >
              Agregar Transacción
            </button>
          </form>
        </div>
      </main>

      {/* Modal de Confirmación */}
      {showConfirmModal && (
        <ConfirmationModal
          onConfirm={handleDeleteTransaction}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
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
const MetricCard = ({ title, amount, icon: Icon, color, formatCurrency }) => {
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
          <h3
            className={`text-3xl font-extrabold mt-1 ${
              color === 'red' && amount < 0 ? 'text-red-600' : 'text-gray-900'
            }`}
          >
            {formatCurrency(amount)}
          </h3>
        </div>
        <div
          className={`p-3 rounded-full ${colorClasses[color]} shadow-lg ${shadowClass[color]}`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};

// Item de transacción
const TransactionItem = ({ transaction, formatCurrency, onDelete }) => {
  const isCompra = transaction.tipoOperacion === 'compra';
  const typeClass = isCompra ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  const Icon = isCompra ? ArrowUpRight : ArrowDownLeft;
  const formattedDate = transaction.fecha instanceof Date
    ? transaction.fecha.toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Cargando fecha...';
  const userName = USER_NAMES[transaction.usuarioId] || 'Usuario';
  const token = (transaction.activo || '').toUpperCase();

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
        </div>
      </div>
      <div className="flex items-center space-x-3 mt-2 md:mt-0">
        <p className={`font-bold text-lg ${isCompra ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(transaction.montoTotal || 0)}
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
