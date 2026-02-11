/**
 * Advanced validation utilities
 * Validates dates, ranges, and business rules
 */

/**
 * Valida que una fecha esté en un rango razonable
 * @param {string} dateString - Fecha en formato YYYY-MM-DD
 * @returns {{valid: boolean, error?: string}}
 */
export const validateDate = (dateString) => {
  if (!dateString) {
    return { valid: false, error: 'La fecha es requerida' };
  }
  
  const date = new Date(dateString);
  
  // Validar formato
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Formato de fecha inválido' };
  }
  
  // Validar rango razonable: desde 2020 hasta hoy + 1 día
  const minDate = new Date('2020-01-01');
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 1); // Permitir hoy y mañana (por zona horaria)
  
  if (date < minDate) {
    return { valid: false, error: 'La fecha no puede ser anterior a 2020' };
  }
  
  if (date > maxDate) {
    return { valid: false, error: 'La fecha no puede ser futura' };
  }
  
  return { valid: true };
};

/**
 * Valida cantidad según tipo de activo
 * @param {number} cantidad - Cantidad a validar
 * @param {string} tipoActivo - Tipo de activo
 * @param {string} simbolo - Símbolo del activo
 * @returns {{valid: boolean, error?: string}}
 */
export const validateQuantity = (cantidad, tipoActivo, simbolo = '') => {
  if (cantidad <= 0) {
    return { valid: false, error: 'La cantidad debe ser mayor a 0' };
  }
  
  // Máximos razonables por tipo
  const maxValues = {
    'Cripto': {
      'BTC': 1000,
      'ETH': 10000,
      'default': 1000000
    },
    'Acciones': 1000000,
    'Cedears': 1000000,
    'Lecap': 10000000,
    'Letra': 10000000,
    'Bono': 10000000
  };
  
  let maxValue;
  if (tipoActivo === 'Cripto' && maxValues.Cripto[simbolo]) {
    maxValue = maxValues.Cripto[simbolo];
  } else {
    maxValue = maxValues[tipoActivo] || 1000000;
  }
  
  if (cantidad > maxValue) {
    return {
      valid: false,
      error: `Cantidad sospechosamente alta (máximo razonable: ${maxValue}). Verifica el valor.`
    };
  }
  
  // Mínimos razonables
  const minValue = 0.00000001; // 1 satoshi para criptos
  if (cantidad < minValue) {
    return {
      valid: false,
      error: 'Cantidad demasiado pequeña (mínimo: 0.00000001)'
    };
  }
  
  return { valid: true };
};

/**
 * Valida precio unitario según tipo de activo
 * @param {number} precio - Precio a validar
 * @param {string} tipoActivo - Tipo de activo
 * @param {string} moneda - Moneda (ARS/USD)
 * @returns {{valid: boolean, error?: string}}
 */
export const validatePrice = (precio, tipoActivo, moneda) => {
  if (precio <= 0) {
    return { valid: false, error: 'El precio debe ser mayor a 0' };
  }
  
  // Máximos razonables por tipo y moneda
  const maxPrices = {
    'USD': {
      'Cripto': 1000000, // Bitcoin puede llegar alto
      'Acciones': 100000,
      'default': 1000000
    },
    'ARS': {
      'Cripto': 100000000, // Conversión alta
      'Acciones': 10000000,
      'default': 100000000
    }
  };
  
  const maxPrice = maxPrices[moneda]?.[tipoActivo] || maxPrices[moneda]?.default || 1000000;
  
  if (precio > maxPrice) {
    return {
      valid: false,
      error: `Precio sospechosamente alto (máximo razonable: ${maxPrice.toLocaleString()} ${moneda}). Verifica el valor.`
    };
  }
  
  // Mínimo razonable
  const minPrice = moneda === 'USD' ? 0.000001 : 0.01;
  if (precio < minPrice) {
    return {
      valid: false,
      error: `Precio demasiado bajo (mínimo: ${minPrice} ${moneda})`
    };
  }
  
  return { valid: true };
};

/**
 * Valida total de operación vs cantidad * precio
 * Alerta si la diferencia es muy grande (posible error de tipeo)
 * @param {number} cantidad - Cantidad
 * @param {number} precioUnitario - Precio unitario
 * @param {number} totalOperacion - Total según recibo
 * @returns {{valid: boolean, warning?: string}}
 */
export const validateOperationTotal = (cantidad, precioUnitario, totalOperacion) => {
  const calculado = cantidad * precioUnitario;
  const diferencia = Math.abs(totalOperacion - calculado);
  const porcentajeDif = (diferencia / calculado) * 100;
  
  // Si la diferencia es > 10%, probablemente es un error
  if (porcentajeDif > 10) {
    return {
      valid: true, // No bloqueamos, solo advertimos
      warning: `⚠️ Diferencia del ${porcentajeDif.toFixed(1)}% entre cantidad×precio (${calculado.toFixed(2)}) y total (${totalOperacion.toFixed(2)}). ¿Incluye comisiones altas?`
    };
  }
  
  return { valid: true };
};

/**
 * Valida monto de cashflow según categoría
 * @param {number} monto - Monto a validar
 * @param {string} categoria - Categoría del gasto/ingreso
 * @param {string} moneda - Moneda
 * @returns {{valid: boolean, warning?: string}}
 */
export const validateCashflowAmount = (monto, categoria, moneda) => {
  if (monto <= 0) {
    return { valid: false, error: 'El monto debe ser mayor a 0' };
  }
  
  // Máximos razonables por categoría (en USD, multiplicar por 1000 para ARS aprox)
  const maxAmounts = {
    'USD': {
      'Alimentación': 5000,
      'Transporte': 2000,
      'Servicios': 10000,
      'Alquiler': 50000,
      'Salud': 50000,
      'Entretenimiento': 5000,
      'Sueldo': 500000,
      'default': 100000
    }
  };
  
  const multiplier = moneda === 'ARS' ? 1000 : 1;
  const maxAmount = (maxAmounts.USD[categoria] || maxAmounts.USD.default) * multiplier;
  
  if (monto > maxAmount) {
    return {
      valid: true, // No bloqueamos
      warning: `⚠️ Monto muy alto para ${categoria} (${monto.toLocaleString()} ${moneda}). Verifica que sea correcto.`
    };
  }
  
  return { valid: true };
};

/**
 * Valida todas las reglas de una transacción de inversión
 * @param {object} transaction - Transacción a validar
 * @returns {{valid: boolean, errors: object, warnings: object}}
 */
export const validateInvestmentTransaction = (transaction) => {
  const errors = {};
  const warnings = {};
  
  // Validar fecha
  const dateValidation = validateDate(transaction.fechaTransaccion);
  if (!dateValidation.valid) {
    errors.fechaTransaccion = dateValidation.error;
  }
  
  // Validar cantidad
  const quantityValidation = validateQuantity(
    parseFloat(transaction.cantidad),
    transaction.tipoActivo,
    transaction.activo
  );
  if (!quantityValidation.valid) {
    errors.cantidad = quantityValidation.error;
  }
  
  // Validar precio
  const priceValidation = validatePrice(
    parseFloat(transaction.precioUnitario),
    transaction.tipoActivo,
    transaction.moneda
  );
  if (!priceValidation.valid) {
    errors.precioUnitario = priceValidation.error;
  }
  
  // Validar total de operación
  if (transaction.totalOperacion) {
    const totalValidation = validateOperationTotal(
      parseFloat(transaction.cantidad),
      parseFloat(transaction.precioUnitario),
      parseFloat(transaction.totalOperacion)
    );
    if (totalValidation.warning) {
      warnings.totalOperacion = totalValidation.warning;
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
};

/**
 * Valida todas las reglas de un cashflow
 * @param {object} cashflow - Cashflow a validar
 * @returns {{valid: boolean, errors: object, warnings: object}}
 */
export const validateCashflowTransaction = (cashflow) => {
  const errors = {};
  const warnings = {};
  
  // Validar fecha
  const dateValidation = validateDate(cashflow.fechaOperacion);
  if (!dateValidation.valid) {
    errors.fechaOperacion = dateValidation.error;
  }
  
  // Validar monto
  const amountValidation = validateCashflowAmount(
    parseFloat(cashflow.monto),
    cashflow.categoria,
    cashflow.moneda
  );
  if (!amountValidation.valid) {
    errors.monto = amountValidation.error;
  } else if (amountValidation.warning) {
    warnings.monto = amountValidation.warning;
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings
  };
};
