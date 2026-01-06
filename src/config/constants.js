// --- DEV FLAGS ---
// TODO: Remove or properly handle in production
export const DEV_BYPASS_AUTH = true;
export const DEV_USER_ID = 'dev-albert';

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
  'dev-albert': 'Albert Carrasquel', // Modo desarrollo
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
  { id: 'celular', nombre: 'Celular', categoria: 'Servicios', orden: 7 }
];
