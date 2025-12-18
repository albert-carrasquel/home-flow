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
 * IMPORTANTE: Esta función solo se llama para acciones en USD (mercado US)
 * @param {string} symbol - Símbolo de la acción (AAPL, GOOGL, etc.)
 * @param {string} currency - Moneda (siempre USD para stocks US)
 * @returns {Promise<number|null>} - Precio actual o null si falla
 */
async function getStockPrice(symbol, currency) {
  try {
    // IMPORTANTE: Reemplazar con tu API key de Alpha Vantage
    const API_KEY = 'M45V7OEF494I5Z22'; // Cambiar por tu key real
    
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
    console.log(`[PriceService] 📡 Alpha Vantage request: ${symbol} (${currency}) - URL: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[PriceService] ❌ Alpha Vantage API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[PriceService] Alpha Vantage response for ${symbol}:`, JSON.stringify(data, null, 2));
    
    // Verificar si hay error de rate limit o API
    if (data['Note']) {
      console.warn(`[PriceService] Alpha Vantage rate limit: ${data['Note']}`);
      return null;
    }
    
    if (data['Error Message']) {
      console.error(`[PriceService] Alpha Vantage error: ${data['Error Message']}`);
      return null;
    }
    
    // Alpha Vantage devuelve el precio en "Global Quote" > "05. price"
    const globalQuote = data['Global Quote'];
    if (!globalQuote || Object.keys(globalQuote).length === 0) {
      console.warn(`[PriceService] ⚠️ Alpha Vantage: Global Quote vacío para ${symbol}`);
      return null;
    }

    const price = parseFloat(globalQuote['05. price']);

    if (!isNaN(price) && price > 0) {
      console.log(`[PriceService] ✅ Alpha Vantage: ${symbol} = ${price} USD`);
      return price;
    }

    console.warn(`[PriceService] ⚠️ Alpha Vantage: Precio inválido para ${symbol} (${price})`);
    return null;
  } catch (error) {
    console.error('[PriceService] Error fetching stock price from Alpha Vantage:', error);
    return null;
  }
}

/**
 * Obtiene precio de activo argentino (Cedears, Bonos, Acciones locales)
 * Utiliza la API pública de Rava Bursátil
 * 
 * IMPORTANTE sobre CEDEARS:
 * - Un Cedear NO es lo mismo que la acción US original
 * - Ej: Cedear de AAPL ≠ Acción de AAPL en NASDAQ
 * - Cedears tienen ratio de conversión (ej: 1 Cedear = 0.1 acción US)
 * - Cotizan en ARS con precio diferente al US
 * - Tienen spread, comisiones y arbitraje local
 * 
 * API utilizada: Rava Bursátil (https://www.rava.com/)
 * - Endpoint: https://api.rava.com.ar/cotizaciones/{ticker}
 * - No requiere autenticación
 * - Cubre: Cedears, Acciones argentinas, Bonos, etc.
 * 
 * NOTA: Los Cedears pueden tener sufijos en Rava (ej: AAPL.D, NVDA.D)
 * Intentamos múltiples variantes hasta encontrar el precio
 * 
 * @param {string} symbol - Símbolo del activo (ej: AAPL, GGAL, AL30)
 * @param {string} currency - Moneda (ARS principalmente)
 * @returns {Promise<number|null>} - Precio actual o null si falla
 */
async function getArgentinaAssetPrice(symbol, currency) {
  // Para Cedears, intentar con sufijo .D (Dolares) que usa Rava
  const variants = [
    symbol.toUpperCase(),           // AAPL
    `${symbol.toUpperCase()}.D`,    // AAPL.D (Cedears en Rava)
    `${symbol.toUpperCase()}D`,     // AAPLD (algunas plataformas)
    `${symbol.toUpperCase()}.BA`    // AAPL.BA (Buenos Aires)
  ];
  
  for (const ticker of variants) {
    try {
      const url = `https://api.rava.com.ar/cotizaciones/${ticker}`;
      console.log(`[PriceService] 📡 Rava request: ${symbol} → probando ${ticker} - URL: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`[PriceService] Rava: ${ticker} no encontrado (${response.status}), probando siguiente variante...`);
        continue; // Probar siguiente variante
      }
      
      const data = await response.json();
      console.log(`[PriceService] Rava response for ${ticker}:`, JSON.stringify(data, null, 2));
      
      // Verificar si hay datos
      if (!data || typeof data !== 'object') {
        console.log(`[PriceService] Rava: ${ticker} respuesta inválida, probando siguiente...`);
        continue;
      }
      
      // Rava devuelve múltiples precios, priorizamos:
      // 1. ultimoPrecio (último precio operado)
      // 2. ultimoCierre (cierre anterior si no operó hoy)
      // 3. puntaCompradora/puntaVendedora (promedio de puntas)
      
      let price = null;
      
      if (data.ultimoPrecio && data.ultimoPrecio > 0) {
        price = parseFloat(data.ultimoPrecio);
      } else if (data.ultimoCierre && data.ultimoCierre > 0) {
        price = parseFloat(data.ultimoCierre);
        console.log(`[PriceService] Rava: usando precio de cierre para ${ticker}`);
      } else if (data.puntaCompradora && data.puntaVendedora) {
        // Promedio de puntas como último recurso
        const bid = parseFloat(data.puntaCompradora);
        const ask = parseFloat(data.puntaVendedora);
        if (bid > 0 && ask > 0) {
          price = (bid + ask) / 2;
          console.log(`[PriceService] Rava: usando promedio de puntas para ${ticker}`);
        }
      }
      
      if (price && !isNaN(price) && price > 0) {
        console.log(`[PriceService] ✅ Rava: ${symbol} (${ticker}) = ${price.toFixed(2)} ARS`);
        return price;
      }
      
      console.log(`[PriceService] Rava: ${ticker} sin precio válido, probando siguiente...`);
      
    } catch (error) {
      console.log(`[PriceService] Error con ${ticker}:`, error.message, '- probando siguiente...');
      continue;
    }
  }
  
  // Si ninguna variante funcionó
  console.warn(`[PriceService] ❌ Rava: no se encontró precio para ${symbol} después de probar ${variants.length} variantes:`, variants);
  return null;
}

/**
 * Detecta el tipo de activo basado en el símbolo, tipo y MONEDA
 * IMPORTANTE: La MONEDA es crítica para diferenciar Acciones US vs Argentinas
 * @param {string} symbol - Símbolo del activo
 * @param {string} tipoActivo - Tipo: Cripto, Acciones, Cedears, etc.
 * @param {string} currency - Moneda: USD o ARS (crítico para detección)
 * @returns {string} - Tipo detectado: 'crypto', 'stock-us', 'argentina', 'unknown'
 */
function detectAssetType(symbol, tipoActivo, currency) {
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
  
  // REGLA 4: Tipo "Acciones" - LA MONEDA ES CRÍTICA AQUÍ
  if (tipoActivo === 'Acciones') {
    // 4.1: Si la moneda es ARS → Es acción argentina (BYMA/Merval)
    if (currency === 'ARS') {
      console.log(`[PriceService] ${symbol} tipo "Acciones" en ARS → acción argentina`);
      return 'argentina';
    }
    
    // 4.2: Si la moneda es USD → Es acción US (NASDAQ/NYSE)
    if (currency === 'USD') {
      console.log(`[PriceService] ${symbol} tipo "Acciones" en USD → stock US`);
      return 'stock-us';
    }
    
    // 4.3: Si tiene sufijo .BA (Buenos Aires), es Argentina (redundante pero seguro)
    if (symbol.includes('.BA')) {
      return 'argentina';
    }
    
    // 4.4: Acciones argentinas conocidas (BYMA/Merval) - por si acaso
    const accionesArgentinas = [
      'YPFD', 'GGAL', 'PAMP', 'ALUA', 'COME', 'TRAN', 'EDN', 'LOMA',
      'TGSU2', 'TXAR', 'VALO', 'BBAR', 'BMA', 'SUPV', 'CRES', 'CEPU',
      'AGRO', 'BYMA', 'MIRG', 'TGNO4', 'CGPA2', 'BOLT', 'MOLI', 'DYCA'
    ];
    
    if (accionesArgentinas.includes(symbol.toUpperCase())) {
      return 'argentina';
    }
    
    // 4.5: Por defecto, asumimos stock-us si no hay otra señal
    console.log(`[PriceService] ${symbol} tipo "Acciones" → asumiendo stock US (sin moneda clara)`);
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
    console.log(`[PriceService] Cache hit: ${symbol} (${tipoActivo}) ${currency}`);
    return cachedPrice;
  }

  const assetType = detectAssetType(symbol, tipoActivo, currency);
  let price = null;

  try {
    switch (assetType) {
      case 'crypto':
        price = await getCryptoPrice(symbol, currency);
        break;
      
      case 'stock-us':
        // Stock US siempre en USD (Alpha Vantage)
        price = await getStockPrice(symbol, 'USD');
        break;
      
      case 'argentina':
        price = await getArgentinaAssetPrice(symbol, currency);
        break;
      
      default:
        console.warn(`[PriceService] Unknown asset type for ${symbol} (${tipoActivo}) ${currency}`);
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
