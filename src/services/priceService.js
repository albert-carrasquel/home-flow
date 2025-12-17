/**
 * priceService.js
 * 
 * Servicio para obtener precios en tiempo real de diferentes activos.
 * Integra múltiples APIs: CoinGecko (crypto), Alpha Vantage (stocks US).
 */

// Cache simple para evitar excesivas llamadas a APIs (5 minutos de TTL)
const priceCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Limpia entradas expiradas del cache
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of priceCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      priceCache.delete(key);
    }
  }
}

/**
 * Obtiene precio de cache si está disponible y no expiró
 * @param {string} symbol - Símbolo del activo
 * @param {string} currency - Moneda de cotización (ARS, USD)
 * @param {string} tipoActivo - Tipo de activo para diferenciar (Cedears vs Acciones)
 * @returns {number|null} - Precio en cache o null
 */
function getPriceFromCache(symbol, currency, tipoActivo = '') {
  cleanExpiredCache();
  // IMPORTANTE: Incluir tipoActivo en la key para diferenciar Cedears de Acciones US
  const key = `${symbol}_${currency}_${tipoActivo}`;
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }
  return null;
}

/**
 * Guarda precio en cache
 * @param {string} symbol - Símbolo del activo
 * @param {string} currency - Moneda de cotización
 * @param {string} tipoActivo - Tipo de activo para diferenciar
 * @param {number} price - Precio a guardar
 */
function setPriceInCache(symbol, currency, tipoActivo = '', price) {
  // IMPORTANTE: Incluir tipoActivo en la key para diferenciar Cedears de Acciones US
  const key = `${symbol}_${currency}_${tipoActivo}`;
  priceCache.set(key, { price, timestamp: Date.now() });
}

/**
 * Mapeo de símbolos a IDs de CoinGecko (crypto)
 * Expandir según necesidades
 */
const COINGECKO_SYMBOL_MAP = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'BNB': 'binancecoin',
  'SOL': 'solana',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'TRX': 'tron',
  'MATIC': 'matic-network',
  'DOT': 'polkadot',
  'LTC': 'litecoin',
  'SHIB': 'shiba-inu',
  'UNI': 'uniswap',
  'LINK': 'chainlink',
  'AVAX': 'avalanche-2',
  'XLM': 'stellar',
  'ATOM': 'cosmos',
  'FIL': 'filecoin'
};

/**
 * Obtiene precio de criptomoneda desde CoinGecko API (gratuita)
 * @param {string} symbol - Símbolo (BTC, ETH, etc.)
 * @param {string} currency - Moneda de cotización (USD, ARS)
 * @returns {Promise<number|null>} - Precio actual o null si falla
 */
async function getCryptoPrice(symbol, currency) {
  try {
    const coinId = COINGECKO_SYMBOL_MAP[symbol.toUpperCase()];
    if (!coinId) {
      console.warn(`CoinGecko: No mapping for symbol ${symbol}`);
      return null;
    }

    const vsCurrency = currency.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const price = data[coinId]?.[vsCurrency];
    
    if (price !== undefined) {
      return price;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching crypto price from CoinGecko:', error);
    return null;
  }
}

/**
 * Obtiene precio de acción US desde Alpha Vantage API (gratuita - 5 req/min)
 * NOTA: Requiere API key gratuita de https://www.alphavantage.co/support/#api-key
 * @param {string} symbol - Símbolo de la acción (AAPL, GOOGL, etc.)
 * @param {string} currency - Moneda (USD principalmente)
 * @returns {Promise<number|null>} - Precio actual o null si falla
 */
async function getStockPrice(symbol, currency) {
  try {
    // IMPORTANTE: Reemplazar con tu API key de Alpha Vantage
    const API_KEY = 'M45V7OEF494I5Z22'; // Cambiar por tu key real
    
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Alpha Vantage API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // Alpha Vantage devuelve el precio en "Global Quote" > "05. price"
    const price = parseFloat(data['Global Quote']?.['05. price']);
    
    if (!isNaN(price) && price > 0) {
      // Alpha Vantage devuelve en USD, si necesitas ARS, deberías multiplicar por tipo de cambio
      if (currency === 'ARS') {
        // Aquí podrías integrar un servicio de tipo de cambio USD->ARS
        // Por ahora retornamos null para ARS en stocks
        console.warn('Stock price in ARS not implemented yet');
        return null;
      }
      return price;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching stock price from Alpha Vantage:', error);
    return null;
  }
}

/**
 * Obtiene precio de activo argentino (Cedears, Bonos, Acciones locales)
 * 
 * IMPORTANTE sobre CEDEARS:
 * - Un Cedear NO es lo mismo que la acción US original
 * - Ej: Cedear de AAPL ≠ Acción de AAPL en NASDAQ
 * - Cedears tienen ratio de conversión (ej: 1 Cedear = 0.1 acción US)
 * - Cotizan en ARS con precio diferente al US
 * - Tienen spread, comisiones y arbitraje local
 * 
 * APIs disponibles para implementar:
 * 1. IOL API (Invertir Online) - requiere cuenta
 * 2. PPI API - requiere cuenta  
 * 3. Bolsar.com - scraping (no recomendado)
 * 4. Portfolio Personal - API privada
 * 
 * @param {string} symbol - Símbolo del activo
 * @param {string} currency - Moneda (ARS principalmente)
 * @returns {Promise<number|null>} - Precio actual o null si falla
 */
async function getArgentinaAssetPrice(symbol, currency) {
  // TODO: Implementar integración con API de mercado argentino
  console.warn(`[PriceService] Precio de mercado argentino no implementado para ${symbol}`);
  console.info(`[PriceService] Para obtener precios de Cedears/Acciones argentinas, se necesita integrar con IOL o PPI API`);
  return null;
}

/**
 * Detecta el tipo de activo basado en el símbolo y tipo
 * IMPORTANTE: Esta función es crítica para evitar confundir Cedears con Acciones US
 * @param {string} symbol - Símbolo del activo
 * @param {string} tipoActivo - Tipo: Cripto, Acciones, Cedears, etc.
 * @returns {string} - Tipo detectado: 'crypto', 'stock-us', 'argentina', 'unknown'
 */
function detectAssetType(symbol, tipoActivo) {
  // REGLA 1: Criptomonedas - siempre tienen prioridad si están en el mapa
  if (tipoActivo === 'Cripto' || tipoActivo === 'Criptomoneda' || COINGECKO_SYMBOL_MAP[symbol.toUpperCase()]) {
    return 'crypto';
  }
  
  // REGLA 2: Cedears SIEMPRE son mercado argentino (nunca stocks US)
  // Los Cedears son certificados argentinos que representan acciones extranjeras
  // Ej: Cedear de AAPL ≠ Acción de AAPL en NASDAQ
  if (tipoActivo === 'Cedears') {
    console.log(`[PriceService] ${symbol} detectado como Cedear → mercado argentino`);
    return 'argentina';
  }
  
  // REGLA 3: Instrumentos argentinos explícitos
  if (tipoActivo === 'Bono' || tipoActivo === 'Lecap' || tipoActivo === 'Letra') {
    return 'argentina';
  }
  
  // REGLA 4: Tipo "Acciones" - puede ser US o Argentina
  if (tipoActivo === 'Acciones') {
    // 4.1: Si tiene sufijo .BA (Buenos Aires), es Argentina
    if (symbol.includes('.BA')) {
      return 'argentina';
    }
    
    // 4.2: Acciones argentinas conocidas (BYMA/Merval)
    const accionesArgentinas = [
      'YPFD', 'GGAL', 'PAMP', 'ALUA', 'COME', 'TRAN', 'EDN', 'LOMA',
      'TGSU2', 'TXAR', 'VALO', 'BBAR', 'BMA', 'SUPV', 'CRES', 'CEPU',
      'AGRO', 'BYMA', 'MIRG', 'TGNO4', 'CGPA2', 'BOLT', 'MOLI', 'DYCA'
    ];
    
    if (accionesArgentinas.includes(symbol.toUpperCase())) {
      return 'argentina';
    }
    
    // 4.3: Heurística: 4 letras mayúsculas suele ser Argentina (ej: GGAL, YPFD)
    // Pero AAPL, MSFT también son 4 letras... así que NO es confiable
    // Por defecto, asumimos que "Acciones" sin más contexto son US
    console.log(`[PriceService] ${symbol} tipo "Acciones" → asumiendo stock US (usa "Cedears" si es argentino)`);
    return 'stock-us';
  }
  
  return 'unknown';
}

/**
 * Obtiene el precio actual de un activo (intenta diferentes APIs según tipo)
 * @param {string} symbol - Símbolo del activo
 * @param {string} currency - Moneda de cotización (USD, ARS)
 * @param {string} tipoActivo - Tipo de activo (Cripto, Acciones, etc.)
 * @returns {Promise<number|null>} - Precio actual o null si no se puede obtener
 */
export async function getCurrentPrice(symbol, currency, tipoActivo) {
  // Verificar cache primero (incluye tipoActivo para diferenciar Cedears)
  const cachedPrice = getPriceFromCache(symbol, currency, tipoActivo);
  if (cachedPrice !== null) {
    console.log(`[PriceService] Cache hit: ${symbol} (${tipoActivo})`);
    return cachedPrice;
  }

  const assetType = detectAssetType(symbol, tipoActivo);
  let price = null;

  try {
    switch (assetType) {
      case 'crypto':
        price = await getCryptoPrice(symbol, currency);
        break;
      
      case 'stock-us':
        price = await getStockPrice(symbol, currency);
        break;
      
      case 'argentina':
        price = await getArgentinaAssetPrice(symbol, currency);
        break;
      
      default:
        console.warn(`[PriceService] Unknown asset type for ${symbol} (${tipoActivo})`);
        return null;
    }

    // Si obtuvimos precio, guardarlo en cache
    if (price !== null) {
      setPriceInCache(symbol, currency, tipoActivo, price);
      console.log(`[PriceService] Precio obtenido: ${symbol} (${tipoActivo}) = ${price} ${currency}`);
    }

    return price;
  } catch (error) {
    console.error(`[PriceService] Error getting price for ${symbol} (${tipoActivo}):`, error);
    return null;
  }
}

/**
 * Obtiene precios para múltiples activos en paralelo
 * @param {Array} positions - Array de posiciones con { activo, moneda, tipoActivo }
 * @returns {Promise<Map>} - Map con símbolo_moneda => precio
 */
export async function getMultiplePrices(positions) {
  const pricePromises = positions.map(pos => 
    getCurrentPrice(pos.activo, pos.moneda, pos.tipoActivo)
      .then(price => ({ key: `${pos.activo}_${pos.moneda}`, price }))
  );

  const results = await Promise.all(pricePromises);
  
  const priceMap = new Map();
  results.forEach(({ key, price }) => {
    if (price !== null) {
      priceMap.set(key, price);
    }
  });

  return priceMap;
}

/**
 * Limpia completamente el cache de precios
 * Útil para forzar actualización
 */
export function clearPriceCache() {
  priceCache.clear();
}

/**
 * Obtiene estadísticas del cache
 * @returns {Object} - { size, entries }
 */
export function getCacheStats() {
  cleanExpiredCache();
  return {
    size: priceCache.size,
    entries: Array.from(priceCache.entries()).map(([key, value]) => ({
      key,
      price: value.price,
      age: Math.floor((Date.now() - value.timestamp) / 1000) + 's'
    }))
  };
}
