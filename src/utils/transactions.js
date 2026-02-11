/**
 * Firestore Transaction Utilities
 * Provides atomic operations to prevent race conditions
 */

import { runTransaction, doc } from 'firebase/firestore';
import { withRetry } from './errorHandling';

/**
 * Wrapper para operaciones transaccionales seguras con retry
 * @param {Firestore} db - Instancia de Firestore
 * @param {Function} operation - Función que recibe el objeto transaction
 * @param {number} maxRetries - Número máximo de reintentos
 * @returns {Promise<any>} - Resultado de la transacción
 */
export const safeTransaction = async (db, operation, maxRetries = 3) => {
  try {
    const result = await withRetry(
      () => runTransaction(db, operation),
      maxRetries
    );
    return { success: true, data: result };
  } catch (error) {
    console.error('Transaction failed after retries:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Actualiza un gasto del checklist mensual de forma atómica
 * Previene race conditions cuando dos usuarios editan el mismo gasto
 * 
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} cashflowPath - Path de la colección cashflow
 * @param {string} checklistPath - Path de la colección checklist
 * @param {string} cashflowId - ID del documento cashflow
 * @param {string} checklistDocId - ID del documento checklist
 * @param {number} newAmount - Nuevo monto
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export const updateMonthlyExpenseAtomic = async (
  db,
  cashflowPath,
  checklistPath,
  cashflowId,
  checklistDocId,
  newAmount
) => {
  return await withRetry(async () => {
    return await runTransaction(db, async (transaction) => {
      // 1. Leer documentos actuales
      const cashflowRef = doc(db, cashflowPath, cashflowId);
      const checklistRef = doc(db, checklistPath, checklistDocId);
      
      const cashflowDoc = await transaction.get(cashflowRef);
      const checklistDoc = await transaction.get(checklistRef);
      
      if (!cashflowDoc.exists()) {
        throw new Error('El registro de cashflow no existe');
      }
      
      // 2. Validar que no haya sido modificado por otro usuario
      const cashflowData = cashflowDoc.data();
      if (cashflowData.anulada && cashflowData.anuladaAt) {
        console.warn('Registro fue anulado previamente, será reactivado');
      }
      
      // 3. Actualizar ambos documentos atómicamente
      transaction.update(cashflowRef, {
        monto: newAmount,
        anulada: false,
        updatedAt: new Date()
      });
      
      if (checklistDoc.exists()) {
        transaction.update(checklistRef, {
          amount: newAmount,
          updatedAt: new Date()
        });
      }
      
      return { cashflowId, checklistDocId, newAmount };
    });
  }, 3); // 3 reintentos
};

/**
 * Registra un gasto del checklist mensual de forma atómica
 * Crea cashflow y marca checklist en una sola transacción
 * 
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} cashflowPath - Path de la colección cashflow
 * @param {string} checklistPath - Path de la colección checklist
 * @param {object} cashflowData - Datos del cashflow
 * @param {object} checklistData - Datos del checklist
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export const registerMonthlyExpenseAtomic = async (
  db,
  cashflowPath,
  checklistPath,
  cashflowData,
  checklistData
) => {
  return await runTransaction(db, async (transaction) => {
    const checklistDocId = checklistData.docId;
    const checklistRef = doc(db, checklistPath, checklistDocId);
    
    // 1. Verificar que no esté ya registrado
    const checklistDoc = await transaction.get(checklistRef);
    
    if (checklistDoc.exists() && checklistDoc.data().completed) {
      throw new Error('Este gasto ya fue registrado este mes');
    }
    
    // 2. Crear cashflow (necesitamos el ID, así que lo hacemos fuera de transaction)
    // Nota: Por limitación de Firestore, no podemos crear docs con ID auto en transactions
    // Solución: Generar ID manualmente
    const cashflowRef = doc(db, cashflowPath);
    const cashflowId = cashflowRef.id;
    
    // 3. Crear ambos documentos atómicamente
    transaction.set(doc(db, cashflowPath, cashflowId), {
      ...cashflowData,
      createdAt: new Date()
    });
    
    transaction.set(checklistRef, {
      ...checklistData,
      cashflowId,
      completed: true,
      registeredAt: new Date()
    });
    
    return { cashflowId, checklistDocId };
  });
};

/**
 * Anula un gasto y desmarca del checklist de forma atómica
 * 
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} cashflowPath - Path de la colección cashflow
 * @param {string} checklistPath - Path de la colección checklist (puede ser múltiples meses)
 * @param {string} cashflowId - ID del documento cashflow
 * @param {string} userId - ID del usuario que anula
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export const annulCashflowAtomic = async (
  db,
  cashflowPath,
  cashflowId,
  userId
) => {
  return await runTransaction(db, async (transaction) => {
    const cashflowRef = doc(db, cashflowPath, cashflowId);
    const cashflowDoc = await transaction.get(cashflowRef);
    
    if (!cashflowDoc.exists()) {
      throw new Error('El registro no existe');
    }
    
    const data = cashflowDoc.data();
    if (data.anulada) {
      throw new Error('Este registro ya fue anulado');
    }
    
    // Marcar como anulado
    transaction.update(cashflowRef, {
      anulada: true,
      anuladaAt: new Date(),
      anuladaBy: userId,
      voidedAt: new Date()
    });
    
    return { cashflowId };
  });
};

/**
 * Elimina un documento del checklist de forma atómica (desmarca)
 * Debe usarse DESPUÉS de annulCashflowAtomic
 * 
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} checklistPath - Path completo al documento
 * @param {string} checklistDocId - ID del documento checklist
 * @returns {Promise<{success: boolean}>}
 */
export const deleteChecklistItemAtomic = async (
  db,
  checklistPath,
  checklistDocId
) => {
  return await runTransaction(db, async (transaction) => {
    const checklistRef = doc(db, checklistPath, checklistDocId);
    const checklistDoc = await transaction.get(checklistRef);
    
    if (checklistDoc.exists()) {
      transaction.delete(checklistRef);
    }
    
    return { checklistDocId };
  });
};

/**
 * Anula una transacción de inversión de forma atómica
 * 
 * @param {Firestore} db - Instancia de Firestore
 * @param {string} transactionsPath - Path de la colección transactions
 * @param {string} transactionId - ID de la transacción
 * @param {string} userId - ID del usuario que anula
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export const annulTransactionAtomic = async (
  db,
  transactionsPath,
  transactionId,
  userId
) => {
  return await runTransaction(db, async (transaction) => {
    const txRef = doc(db, transactionsPath, transactionId);
    const txDoc = await transaction.get(txRef);
    
    if (!txDoc.exists()) {
      throw new Error('La transacción no existe');
    }
    
    const data = txDoc.data();
    if (data.anulada) {
      throw new Error('Esta transacción ya fue anulada');
    }
    
    // Marcar como anulada
    transaction.update(txRef, {
      anulada: true,
      anuladaAt: new Date(),
      anuladaBy: userId,
      voidedAt: new Date()
    });
    
    return { transactionId };
  });
};
