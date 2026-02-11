/**
 * Error handling utilities for Firestore operations
 * Converts technical errors into user-friendly messages
 */

/**
 * Converts Firestore error codes into user-friendly Spanish messages
 * @param {Error} error - The error object from Firestore
 * @returns {string} - User-friendly error message
 */
export const handleFirestoreError = (error) => {
  console.error('Firestore Error:', error);
  
  // Si no es un error de Firebase, retornar mensaje genérico
  if (!error || !error.code) {
    return 'Error desconocido. Por favor, intenta nuevamente.';
  }
  
  const errorCode = error.code;
  
  // Mapeo de códigos de error comunes
  const errorMessages = {
    // Errores de autenticación
    'auth/user-not-found': 'Usuario no encontrado. Verifica tus credenciales.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-email': 'El formato del email no es válido.',
    'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
    'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.',
    'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
    
    // Errores de permisos
    'permission-denied': 'No tienes permisos para realizar esta operación. Contacta al administrador.',
    'unauthenticated': 'Debes iniciar sesión para continuar.',
    
    // Errores de red
    'unavailable': 'Servicio temporalmente no disponible. Intenta en unos momentos.',
    'deadline-exceeded': 'La operación tardó demasiado. Verifica tu conexión.',
    'network-error': 'Error de red. Verifica tu conexión a internet.',
    
    // Errores de datos
    'not-found': 'El documento no existe o fue eliminado.',
    'already-exists': 'Este registro ya existe.',
    'invalid-argument': 'Datos inválidos. Verifica la información ingresada.',
    'failed-precondition': 'No se cumplieron las condiciones necesarias para esta operación.',
    'aborted': 'Operación cancelada debido a conflicto. Intenta nuevamente.',
    
    // Errores de cuota/límites
    'resource-exhausted': 'Has excedido el límite de operaciones. Intenta más tarde.',
    'out-of-range': 'Valor fuera del rango permitido.',
    
    // Errores internos
    'internal': 'Error interno del servidor. Intenta nuevamente.',
    'unknown': 'Error desconocido. Por favor, contacta al soporte.',
  };
  
  // Retornar mensaje personalizado o genérico
  return errorMessages[errorCode] || `Error: ${errorCode}. Por favor, contacta al administrador.`;
};

/**
 * Wrapper para operaciones de Firestore con manejo de errores integrado
 * @param {Function} operation - Función async que realiza la operación
 * @param {Function} onSuccess - Callback opcional para éxito
 * @param {Function} onError - Callback opcional para error
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export const withErrorHandling = async (operation, onSuccess, onError) => {
  try {
    const result = await operation();
    if (onSuccess) onSuccess(result);
    return { success: true, data: result };
  } catch (error) {
    const errorMessage = handleFirestoreError(error);
    if (onError) onError(errorMessage);
    return { success: false, error: errorMessage };
  }
};

/**
 * Valida errores específicos de operaciones financieras
 * @param {string} errorMessage - Mensaje de error
 * @returns {object} - {isCritical: boolean, suggestion: string}
 */
export const categorizefinancialError = (errorMessage) => {
  const criticalPatterns = [
    'venta en corto',
    'sin compra previa',
    'cantidad insuficiente',
    'balance negativo'
  ];
  
  const isCritical = criticalPatterns.some(pattern => 
    errorMessage.toLowerCase().includes(pattern)
  );
  
  let suggestion = '';
  if (isCritical) {
    suggestion = 'Este error puede afectar tus balances. Revisa tus transacciones antes de continuar.';
  }
  
  return { isCritical, suggestion };
};
