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
  String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);

export const sanitizeNombre = (value) =>
  String(value).replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ\s]/g, '').toUpperCase().slice(0, 50);

export const getUniqueActivos = (transactions = [], usuarioId) => {
  const filtered = transactions.filter((t) => t && t.activo && (usuarioId ? t.usuarioId === usuarioId : true));
  const setActivos = new Set(filtered.map((t) => String(t.activo).toUpperCase()).filter(Boolean));
  return Array.from(setActivos).sort();
};

/**
 * Converts a YYYY-MM-DD string to a Firestore Timestamp at 00:00:00 in local timezone.
 * This ensures the date chosen by the user is saved exactly as that date without timezone bugs.
 * 
 * @param {string} dateString - Date in YYYY-MM-DD format (from input[type="date"])
 * @returns {Date} - Date object at 00:00:00 local time, ready to be stored as Firestore Timestamp
 * @throws {Error} - If dateString is invalid or not in YYYY-MM-DD format
 */
export const dateStringToTimestamp = (dateString) => {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error('Invalid date string: must be a non-empty string');
  }
  
  // Validate YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, got "${dateString}"`);
  }
  
  // Parse as local date at 00:00:00 (avoids UTC conversion bugs)
  const [year, month, day] = dateString.split('-').map(Number);
  const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  
  // Validate the date is valid (e.g., not 2025-02-30)
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    throw new Error(`Invalid date: "${dateString}" does not represent a valid calendar date`);
  }
  
  return localDate;
};

/**
 * Extracts occurredAt from a document with fallback logic for legacy fields.
 * Priority: occurredAt > fechaTransaccion/fechaOperacion > timestamp > fecha
 * 
 * @param {object} doc - Firestore document data
 * @param {string} type - 'inversiones' or 'cashflow' to determine fallback field
 * @returns {Date|null} - Date object or null if no valid date found
 */
export const getOccurredAtFromDoc = (doc, type) => {
  if (!doc) return null;
  
  // Priority 1: occurredAt (new standard)
  if (doc.occurredAt?.toDate) {
    return doc.occurredAt.toDate();
  }
  
  // Priority 2: legacy date field (fechaTransaccion for inversiones, fechaOperacion for cashflow)
  const legacyField = type === 'inversiones' ? 'fechaTransaccion' : 'fechaOperacion';
  if (doc[legacyField]?.toDate) {
    return doc[legacyField].toDate();
  }
  if (doc[legacyField] && typeof doc[legacyField] === 'string') {
    return new Date(doc[legacyField]);
  }
  
  // Priority 3: timestamp (createdAt equivalent)
  if (doc.timestamp?.toDate) {
    return doc.timestamp.toDate();
  }
  
  // Priority 4: fecha (generic fallback)
  if (doc.fecha?.toDate) {
    return doc.fecha.toDate();
  }
  if (doc.fecha && typeof doc.fecha === 'string') {
    return new Date(doc.fecha);
  }
  
  return null;
};

/**
 * Normalizes transaction amounts with backward compatibility for legacy documents.
 * Establishes totalOperacion as the "source of truth" (official receipt amount).
 * 
 * @param {object} doc - Firestore transaction document data
 * @returns {object} - Normalized amounts: { totalOperacionNumber, montoTotalNumber, diferenciaOperacionNumber, montoFuenteDeVerdad }
 */
export const normalizeTransactionAmounts = (doc) => {
  if (!doc) {
    return {
      totalOperacionNumber: null,
      montoTotalNumber: null,
      diferenciaOperacionNumber: null,
      montoFuenteDeVerdad: null,
    };
  }

  // Parse totalOperacion (priority 1: source of truth)
  let totalOperacionNumber = null;
  if (typeof doc.totalOperacion === 'number') {
    totalOperacionNumber = doc.totalOperacion;
  } else if (typeof doc.totalOperacion === 'string' && doc.totalOperacion) {
    const parsed = parseFloat(doc.totalOperacion);
    if (!isNaN(parsed)) totalOperacionNumber = parsed;
  }

  // Parse montoTotal (priority 2: fallback for legacy docs)
  let montoTotalNumber = null;
  if (typeof doc.montoTotal === 'number') {
    montoTotalNumber = doc.montoTotal;
  } else if (typeof doc.montoTotal === 'string' && doc.montoTotal) {
    const parsed = parseFloat(doc.montoTotal);
    if (!isNaN(parsed)) montoTotalNumber = parsed;
  }

  // Calculate diferencia if both exist
  let diferenciaOperacionNumber = null;
  if (totalOperacionNumber !== null && montoTotalNumber !== null) {
    diferenciaOperacionNumber = totalOperacionNumber - montoTotalNumber;
  }

  // Determine montoFuenteDeVerdad (official amount)
  // Priority: totalOperacion > montoTotal
  const montoFuenteDeVerdad = totalOperacionNumber !== null ? totalOperacionNumber : montoTotalNumber;

  return {
    totalOperacionNumber,
    montoTotalNumber,
    diferenciaOperacionNumber,
    montoFuenteDeVerdad,
  };
};

