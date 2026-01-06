/**
 * Centralized Firestore collection paths
 */

export const getTransactionsPath = (appId) =>
  `artifacts/${appId}/public/data/transactions`;

export const getCashflowPath = (appId) =>
  `artifacts/${appId}/public/data/cashflow`;

export const getMonthlyChecklistPath = (appId, month) =>
  `artifacts/${appId}/public/data/monthly-checklist-${month}`;
