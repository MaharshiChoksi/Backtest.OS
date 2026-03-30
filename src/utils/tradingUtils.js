/**
 * Convert milliseconds timestamp to seconds (required by TradingView)
 */
export function msToSeconds(ms) {
  if (ms > 1e12) return Math.floor(ms / 1000)
  return ms
}

/**
 * Convert bar data to TradingView format (timestamps in seconds)
 */
export function barsToTradingViewFormat(bars) {
  return bars.map(b => ({
    ...b,
    time: msToSeconds(b.time)
  }))
}

/**
 * Calculate decimal places to display based on pip_size
 * pip_size determines the last significant digit
 * E.g., pip_size 0.0001 → 4 decimals, 0.01 → 2 decimals
 */
export function getDecimalPlaces(pipSize) {
  if (!pipSize) return 4 // default
  const str = String(pipSize)
  const decimalIndex = str.indexOf('.')
  if (decimalIndex === -1) return 0
  return str.length - decimalIndex - 1
}

/**
 * Get entry price adjusted for spread based on side
 * BUY: pay ask (close + spread), SELL: receive bid (close - spread)
 * @param {number} closePrice - The close/market price
 * @param {string} side - 'buy' or 'sell'
 * @param {number} spreadPips - Spread in pips from accountConfig
 * @param {number} pipSize - Pip size from symbolConfig
 */
export function getEntryPrice(closePrice, side, spreadPips = 0, pipSize = 0.0001) {
  const spreadInPrice = spreadPips * pipSize
  return side === 'buy'
    ? closePrice + spreadInPrice  // pay ask
    : closePrice - spreadInPrice  // receive bid
}

/**
 * Get exit price adjusted for spread based on side (opposite of entry)
 * LONG: receive bid (close - spread), SHORT: pay ask (close + spread)
 * @param {number} closePrice - The close/market price
 * @param {string} side - 'buy' or 'sell'
 * @param {number} spreadPips - Spread in pips from accountConfig
 * @param {number} pipSize - Pip size from symbolConfig
 */
export function getExitPrice(closePrice, side, spreadPips = 0, pipSize = 0.0001) {
  const spreadInPrice = spreadPips * pipSize
  return side === 'buy'
    ? closePrice - spreadInPrice  // receive bid when closing long
    : closePrice + spreadInPrice  // pay ask when closing short
}

/**
 * Format price with correct decimal places
 */
export function formatPrice(price, symbolConfig) {
  if (!symbolConfig || !symbolConfig.pip_size) return price.toFixed(4)
  const decimals = getDecimalPlaces(symbolConfig.pip_size)
  return price.toFixed(decimals)
}

/**
 * Calculate PnL for a trade
 * 
 * For forex and forex-like pairs:
 * PnL = (Exit Price - Entry Price) * Lot Size * Contract Size * Pip Value / Pip Size
 * 
 * For commodities and indices, adjusted accordingly
 */
export function calculatePnL(entryPrice, exitPrice, lotSize, symbolConfig, accountConfig) {
  if (!symbolConfig || !accountConfig) return 0
  if (exitPrice === undefined || entryPrice === undefined) return 0

  // Base calculation: price difference * lot size * contract size
  const priceDiff = exitPrice - entryPrice
  const contractSize = symbolConfig.contract_size || 100000
  const pipValue = symbolConfig.pip_value || 10
  const pipSize = symbolConfig.pip_size || 0.0001

  // Calculate raw PnL based on pip movement
  const pipsMove = priceDiff / pipSize
  const rawPnL = pipsMove * pipValue * lotSize

  // Apply commission (scaled by lot size: entry + exit)
  const commission = accountConfig.commission || 0
  const pnlWithCommission = rawPnL - (commission * lotSize * 2)

  return pnlWithCommission
}

/**
 * Calculate margin used for a trade
 */
export function calculateMarginUsed(lotSize, symbolConfig, leverage) {
  if (!symbolConfig) return 0
  const contractSize = symbolConfig.contract_size || 100000
  const requiredPerLot = (contractSize / leverage) * (symbolConfig.close || 1)
  return requiredPerLot * lotSize
}

/**
 * Determine timeframe in milliseconds
 */
export function getTimeframeMs(timeframe) {
  const map = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000,
  }
  return map[timeframe] || 60000
}

/**
 * Detect timeframe from bars data
 * Returns most common interval between consecutive bars
 */
export function detectTimeframe(bars) {
  if (bars.length < 2) return '1h'

  const intervals = []
  for (let i = 1; i < Math.min(bars.length, 20); i++) {
    const diff = (bars[i].time - bars[i - 1].time) * 1000 // convert to ms
    intervals.push(diff)
  }

  // Find most common interval
  const counts = {}
  intervals.forEach((i) => {
    counts[i] = (counts[i] || 0) + 1
  })

  const mostCommon = Object.keys(counts).reduce((a, b) =>
    counts[a] > counts[b] ? a : b
  )

  const ms = parseInt(mostCommon)
  if (ms === 60000) return '1m'
  if (ms === 300000) return '5m'
  if (ms === 900000) return '15m'
  if (ms === 1800000) return '30m'
  if (ms === 3600000) return '1h'
  if (ms === 14400000) return '4h'
  if (ms === 86400000) return '1d'

  return '1h'
}

/**
 * Format date range based on start/end bar times
 */
export function formatDateRange(startTime, endTime) {
  const start = new Date(startTime * 1000)
  const end = new Date(endTime * 1000)

  const startStr = start.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const endStr = end.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return `${startStr} → ${endStr}`
}

/**
 * Aggregate OHLCV bars to a higher timeframe
 * E.g., aggregate 1m bars to 5m, 15m, 1h, etc.
 * 
 * NOTE: bar.time is in milliseconds, toTimeframeMs is in milliseconds
 */
export function aggregateBars(bars, fromTimeframeMs, toTimeframeMs) {
  if (toTimeframeMs <= fromTimeframeMs) return bars // no aggregation needed

  const aggregated = []

  let currentGroup = []
  let groupStartTime = null

  for (const bar of bars) {
    // Group bars by their timeframe boundary (bar.time and toTimeframeMs are both in ms)
    const barGroupTime = Math.floor(bar.time / toTimeframeMs) * toTimeframeMs

    if (groupStartTime === null) {
      groupStartTime = barGroupTime
    }

    if (barGroupTime === groupStartTime) {
      currentGroup.push(bar)
    } else {
      // Close current group and create aggregated bar
      if (currentGroup.length > 0) {
        aggregated.push(createAggregatedBar(currentGroup, groupStartTime))
      }
      currentGroup = [bar]
      groupStartTime = barGroupTime
    }
  }

  // Add last group
  if (currentGroup.length > 0) {
    aggregated.push(createAggregatedBar(currentGroup, groupStartTime))
  }

  return aggregated
}

/**
 * Create a single aggregated OHLCV bar from multiple bars
 */
function createAggregatedBar(bars, time) {
  const opens = bars.map((b) => b.open)
  const highs = bars.map((b) => b.high)
  const lows = bars.map((b) => b.low)
  const closes = bars.map((b) => b.close)
  const volumes = bars.map((b) => b.volume)

  return {
    time: Math.floor(time),  // Keep in milliseconds
    open: opens[0],
    high: Math.max(...highs),
    low: Math.min(...lows),
    close: closes[closes.length - 1],
    volume: volumes.reduce((a, b) => a + b, 0),
  }
}

/**
 * Calculate account statistics
 */
export function calculateAccountStats(accountConfig, trades) {
  const startBalance = accountConfig.starting_balance || 10000
  let currentBalance = startBalance

  let winTrades = 0
  let lossTrades = 0
  let totalPnL = 0
  let maxDrawdown = 0
  let peakBalance = startBalance

  trades.forEach((trade) => {
    if (trade.pnl > 0) winTrades++
    else if (trade.pnl < 0) lossTrades++

    totalPnL += trade.pnl
    currentBalance += trade.pnl

    if (currentBalance > peakBalance) {
      peakBalance = currentBalance
    } else {
      const drawdown = ((peakBalance - currentBalance) / peakBalance) * 100
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }
  })

  const totalTrades = winTrades + lossTrades
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0

  return {
    startBalance,
    currentBalance,
    totalPnL,
    totalTrades,
    winTrades,
    lossTrades,
    winRate,
    maxDrawdown,
    return: ((currentBalance - startBalance) / startBalance) * 100,
  }
}
