// Utilities: formatting and sanitization helpers

export const formatCurrency = (amount, moneda = 'ARS') =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(amount);

export const sanitizeDecimal = (value, maxDecimals = 8) => {
  if (!value && value !== '') return '';
  let v = String(value).replace(',', '.');
  v = v.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  if (parts.length > 2) {
    v = parts.shift() + '.' + parts.join('');
  }
  if (parts[1]) {
    parts[1] = parts[1].slice(0, maxDecimals);
    v = parts[0] + '.' + parts[1];
  }
  return v;
};

export const sanitizeActivo = (value) =>
  String(value).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 10);

export const sanitizeNombre = (value) =>
  String(value).replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s]/g, '').toUpperCase().slice(0, 50);
