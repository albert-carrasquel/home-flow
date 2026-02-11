/**
 * reporting.js
 * 
 * Engine de cálculo de reportes de inversiones con lógica FIFO.
 * Todas las funciones son puras y no tienen dependencias de React.
 */

/**
 * Agrupa transacciones por usuario, activo y moneda
 * @param {Array} transactions - Lista de transacciones filtradas
 * @returns {Object} - Objeto agrupado por clave "userId_symbol_currency"
 */
function groupByUserAssetCurrency(transactions) {
  const groups = {};
  
  transactions.forEach(tx => {
    const key = `${tx.usuarioId}_${tx.activo}_${tx.moneda}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(tx);
  });
  
  return groups;
}

/**
 * Ordena transacciones por fecha (occurredAt con fallback a fechaTransaccion)
 * @param {Array} transactions - Lista de transacciones
 * @returns {Array} - Transacciones ordenadas ascendentemente
 */
function sortByDate(transactions) {
  return [...transactions].sort((a, b) => {
    const dateA = a.occurredAt?.toDate ? a.occurredAt.toDate() : 
                  a.fechaTransaccion?.toDate ? a.fechaTransaccion.toDate() : 
                  new Date(a.fechaTransaccion || 0);
    const dateB = b.occurredAt?.toDate ? b.occurredAt.toDate() : 
                  b.fechaTransaccion?.toDate ? b.fechaTransaccion.toDate() : 
                  new Date(b.fechaTransaccion || 0);
    return dateA - dateB;
  });
}

/**
 * Aplica lógica FIFO a un grupo de transacciones del mismo activo
 * @param {Array} transactions - Transacciones del mismo usuario/activo/moneda, ordenadas por fecha
 * @returns {Object} - { trades, openPositions, summary }
 */
function applyFIFOToAsset(transactions) {
  const openLots = []; // Lotes de compra abiertos: [{ cantidad, precioUnitario, fecha, comision, ... }]
  const trades = []; // Trades cerrados (venta con sus compras asociadas)
  
  let totalInvertido = 0;
  let totalRecuperado = 0;
  let cantidadCerrada = 0;
  
  transactions.forEach(tx => {
    if (tx.tipoOperacion === 'compra') {
      // Agregar nuevo lote abierto
      openLots.push({
        cantidad: tx.cantidad,
        precioUnitario: tx.precioUnitario,
        fecha: tx.occurredAt?.toDate ? tx.occurredAt.toDate() : 
               tx.fechaTransaccion?.toDate ? tx.fechaTransaccion.toDate() : 
               new Date(tx.fechaTransaccion || 0),
        comision: tx.comision || 0,
        totalOperacion: tx.totalOperacion || (tx.cantidad * tx.precioUnitario)
      });
    } else if (tx.tipoOperacion === 'venta') {
      // Procesar venta con FIFO
      let cantidadPorVender = tx.cantidad;
      const precioVenta = tx.precioUnitario;
      const fechaVenta = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : 
                         tx.fechaTransaccion?.toDate ? tx.fechaTransaccion.toDate() : 
                         new Date(tx.fechaTransaccion || 0);
      const comisionVenta = tx.comision || 0;
      
      const comprasAsociadas = [];
      
      while (cantidadPorVender > 0 && openLots.length > 0) {
        const lote = openLots[0];
        const cantidadATomar = Math.min(cantidadPorVender, lote.cantidad);
        
        // Registrar compra asociada
        comprasAsociadas.push({
          fecha: lote.fecha,
          cantidad: cantidadATomar,
          precioUnitario: lote.precioUnitario
        });
        
        // Calcular P&L de este trozo
        const montoCompra = cantidadATomar * lote.precioUnitario;
        const montoVenta = cantidadATomar * precioVenta;
        
        totalInvertido += montoCompra;
        totalRecuperado += montoVenta;
        cantidadCerrada += cantidadATomar;
        
        // Reducir lote o eliminarlo si se consume completamente
        lote.cantidad -= cantidadATomar;
        if (lote.cantidad <= 0.0001) { // Tolerancia para flotantes
          openLots.shift();
        }
        
        cantidadPorVender -= cantidadATomar;
      }
      
      // Si vendimos algo, registrar el trade
      if (comprasAsociadas.length > 0) {
        const cantidadVendida = comprasAsociadas.reduce((sum, c) => sum + c.cantidad, 0);
        const montoInvertidoTrade = comprasAsociadas.reduce((sum, c) => sum + (c.cantidad * c.precioUnitario), 0);
        const montoRecuperadoTrade = cantidadVendida * precioVenta;
        const pnlNeto = montoRecuperadoTrade - montoInvertidoTrade - comisionVenta;
        const pnlPct = montoInvertidoTrade > 0 ? (pnlNeto / montoInvertidoTrade) * 100 : 0;
        
        trades.push({
          usuarioId: tx.usuarioId,
          activo: tx.activo,
          moneda: tx.moneda,
          cantidad: cantidadVendida,
          detalleCompras: comprasAsociadas,
          detalleVenta: {
            fecha: fechaVenta,
            cantidad: cantidadVendida,
            precioUnitario: precioVenta
          },
          montoInvertido: montoInvertidoTrade,
          montoRecuperado: montoRecuperadoTrade,
          pnlNeto,
          pnlPct
        });
      }
      
      // Si quedó cantidad por vender sin compra asociada, es una venta en corto
      if (cantidadPorVender > 0.0001) {
        // CRÍTICO: Esto indica un error de datos - no debería ocurrir si la validación frontend funciona
        console.error(`⚠️ VENTA EN CORTO DETECTADA: ${tx.activo}, cantidad sin respaldo: ${cantidadPorVender}`);
        // Lanzar error para que sea visible en la UI
        throw new Error(`Venta en corto detectada para ${tx.activo}: intentas vender ${cantidadPorVender} unidades sin compra previa. Verifica tus transacciones.`);
      }
    }
  });
  
  // Calcular posiciones abiertas
  const openPositions = openLots.map(lote => ({
    cantidad: lote.cantidad,
    precioUnitario: lote.precioUnitario,
    fecha: lote.fecha,
    montoInvertido: lote.cantidad * lote.precioUnitario
  }));
  
  // Promedios
  const promedioCompra = cantidadCerrada > 0 ? totalInvertido / cantidadCerrada : 0;
  const promedioVenta = cantidadCerrada > 0 ? totalRecuperado / cantidadCerrada : 0;
  const pnlNeto = totalRecuperado - totalInvertido;
  const pnlPct = totalInvertido > 0 ? (pnlNeto / totalInvertido) * 100 : 0;
  
  return {
    trades,
    openPositions,
    summary: {
      cantidadCerrada,
      promedioCompra,
      promedioVenta,
      totalInvertido,
      totalRecuperado,
      pnlNeto,
      pnlPct
    }
  };
}

/**
 * Calcula el reporte completo de inversiones con P&L
 * @param {Array} transactions - Lista de transacciones ya filtradas
 * @param {Object} filtros - Filtros adicionales (por si se necesitan en el futuro)
 * @returns {Object} - Reporte completo con resumen global, por activo, trades y posiciones abiertas
 */
export function calculateInvestmentReport(transactions, filtros = {}) {
  if (!transactions || transactions.length === 0) {
    return {
      resumenGlobal: {
        totalInvertido: 0,
        totalRecuperado: 0,
        pnlNeto: 0,
        pnlPct: 0
      },
      porActivo: [],
      trades: [],
      posicionesAbiertas: []
    };
  }
  
  // Agrupar por usuario + activo + moneda
  const groups = groupByUserAssetCurrency(transactions);
  
  // Procesar cada grupo con FIFO
  const porActivo = [];
  const allTrades = [];
  const allOpenPositions = [];
  
  let globalInvertido = 0;
  let globalRecuperado = 0;
  
  Object.entries(groups).forEach(([key, groupTransactions]) => {
    const [usuarioId, activo, moneda] = key.split('_');
    
    // Ordenar por fecha
    const sortedTransactions = sortByDate(groupTransactions);
    
    // Aplicar FIFO
    const result = applyFIFOToAsset(sortedTransactions);
    
    // Acumular para resumen global
    globalInvertido += result.summary.totalInvertido;
    globalRecuperado += result.summary.totalRecuperado;
    
    // Agregar a por activo si hay trades cerrados
    if (result.summary.cantidadCerrada > 0) {
      porActivo.push({
        usuarioId,
        activo,
        moneda,
        nombreActivo: groupTransactions[0].nombreActivo || activo,
        tipoActivo: groupTransactions[0].tipoActivo || 'N/A',
        ...result.summary
      });
    }
    
    // Agregar trades
    allTrades.push(...result.trades);
    
    // Agregar posiciones abiertas
    if (result.openPositions.length > 0) {
      const totalAbierto = result.openPositions.reduce((sum, pos) => sum + pos.montoInvertido, 0);
      const cantidadAbierta = result.openPositions.reduce((sum, pos) => sum + pos.cantidad, 0);
      const promedioCompraAbierta = cantidadAbierta > 0 ? totalAbierto / cantidadAbierta : 0;
      
      allOpenPositions.push({
        usuarioId,
        activo,
        moneda,
        nombreActivo: groupTransactions[0].nombreActivo || activo,
        tipoActivo: groupTransactions[0].tipoActivo || 'N/A',
        cantidadRestante: cantidadAbierta,
        promedioCompra: promedioCompraAbierta,
        montoInvertido: totalAbierto,
        lotes: result.openPositions
      });
    }
  });
  
  // Ordenar por activo
  porActivo.sort((a, b) => a.activo.localeCompare(b.activo));
  allOpenPositions.sort((a, b) => a.activo.localeCompare(b.activo));
  
  // Ordenar trades por fecha de venta (más reciente primero)
  allTrades.sort((a, b) => b.detalleVenta.fecha - a.detalleVenta.fecha);
  
  // Resumen global
  const pnlNetoGlobal = globalRecuperado - globalInvertido;
  const pnlPctGlobal = globalInvertido > 0 ? (pnlNetoGlobal / globalInvertido) * 100 : 0;
  
  return {
    resumenGlobal: {
      totalInvertido: globalInvertido,
      totalRecuperado: globalRecuperado,
      pnlNeto: pnlNetoGlobal,
      pnlPct: pnlPctGlobal
    },
    porActivo,
    trades: allTrades,
    posicionesAbiertas: allOpenPositions
  };
}

/**
 * Filtra transacciones según criterios adicionales (usado opcionalmente)
 * @param {Array} transactions - Transacciones base
 * @param {Object} filters - Criterios de filtrado
 * @returns {Array} - Transacciones filtradas
 */
export function filterTransactions(transactions, filters) {
  return transactions.filter(tx => {
    if (filters.activo && filters.activo !== 'todos' && tx.activo !== filters.activo) {
      return false;
    }
    if (filters.tipoOperacion && filters.tipoOperacion !== 'todas' && tx.tipoOperacion !== filters.tipoOperacion) {
      return false;
    }
    if (filters.moneda && filters.moneda !== 'todas' && tx.moneda !== filters.moneda) {
      return false;
    }
    return true;
  });
}
