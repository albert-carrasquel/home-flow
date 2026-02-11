// --- DEV FLAGS ---
// Modo desarrollo desactivado - Usando autenticación real de Firebase
export const DEV_BYPASS_AUTH = false;
export const DEV_USER_ID = 'dev-albert'; // Solo se usa si DEV_BYPASS_AUTH = true

// --- SUPER ADMINS ---
// UIDs de los super admins permitidos
export const SUPER_ADMINS = [
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2',
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2',
];

// Mapeo de UID a nombre de usuario
export const USER_NAMES = {
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2': 'Albert Carrasquel',
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2': 'Haydee Macias',
};

// Nombres cortos para UI compacta
export const USER_SHORT_NAMES = {
  '9dZMQNvgovSWE4lP7tOUNDzy6Md2': 'Albert',
  'T0Kh0eHZ05he8iqD6vEG2G2c7Rl2': 'Haydee',
};

// --- SELECT OPTIONS ---

export const MONEDAS = ['ARS', 'USD'];

export const TIPOS_ACTIVO = ['Cripto', 'Acciones', 'Cedears', 'Lecap', 'Letra', 'Bono'];

export const EXCHANGES = ['Invertir Online', 'Binance', 'BingX', 'Buenbit'];

export const TIPOS_CASHFLOW = ['gasto', 'ingreso'];

export const CATEGORIAS_CASHFLOW = [
  'Alimentación',
  'Transporte',
  'Salud',
  'Educación',
  'Entretenimiento',
  'Servicios',
  'Vivienda',
  'Otros',
  'Salario',
  'Inversión',
  'Regalo',
];

export const MEDIOS_PAGO = [
  'Efectivo',
  'Tarjeta débito',
  'Tarjeta crédito',
  'Transferencia',
  'Billetera digital',
  'Cheque',
];

// Templates de gastos mensuales hardcodeados
export const MONTHLY_EXPENSE_TEMPLATES = [
  { id: 'alquiler', nombre: 'Alquiler', categoria: 'Servicios', orden: 1 },
  { id: 'luz', nombre: 'Luz', categoria: 'Servicios', orden: 2 },
  { id: 'gas', nombre: 'Gas', categoria: 'Servicios', orden: 3 },
  { id: 'agua', nombre: 'Agua', categoria: 'Servicios', orden: 4 },
  { id: 'internet', nombre: 'Internet', categoria: 'Servicios', orden: 5 },
  { id: 'expensas', nombre: 'Expensas', categoria: 'Servicios', orden: 6 },
  { id: 'telefono', nombre: 'Telefono', categoria: 'Servicios', orden: 7 },
  { id: 'estacionamiento', nombre: 'Estacionamiento', categoria: 'Servicios', orden: 8 },
  { id: 'sonia', nombre: 'Sonia', categoria: 'Servicios', orden: 9 },
  { id: 'visa-haydee-santander', nombre: 'Visa Haydee', categoria: 'Tarjetas', orden: 10 },
  { id: 'visa-albert-santander', nombre: 'Visa Alb Santander', categoria: 'Tarjetas', orden: 11 },
  { id: 'american-haydee-santander', nombre: 'Amex Haydee', categoria: 'Tarjetas', orden: 12 },
  { id: 'american-albert-santander', nombre: 'Amex Alb Santander', categoria: 'Tarjetas', orden: 13 },
  { id: 'visa-albert-galicia', nombre: 'Visa Galicia', categoria: 'Tarjetas', orden: 14 },
  { id: 'mastercard-albert-galicia', nombre: 'Master Galicia', categoria: 'Tarjetas', orden: 15 }
];
