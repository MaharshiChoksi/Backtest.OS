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

// ═══════════════════════════════════════════════════════════════════════════
// TIMEZONE UTILITIES
// Bars are stored internally in UTC (milliseconds). These helpers convert
// between UTC and the user's selected data timezone for display purposes.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a timestamp from data timezone to UTC
 * @param {number} timestamp - Timestamp in milliseconds (in data timezone)
 * @param {number} timezoneOffset - Offset in hours from UTC (e.g., 3 for GMT+3)
 * @returns {number} Timestamp in milliseconds (UTC)
 */
export function convertToUTC(timestamp, timezoneOffset) {
  if (!timezoneOffset) return timestamp  // Already UTC
  const offsetMs = timezoneOffset * 60 * 60 * 1000
  return timestamp - offsetMs  // Subtract offset to get UTC
}

/**
 * Convert a UTC timestamp to data timezone
 * @param {number} timestamp - Timestamp in milliseconds (UTC)
 * @param {number} timezoneOffset - Offset in hours from UTC (e.g., 3 for GMT+3)
 * @returns {number} Timestamp in milliseconds (in data timezone)
 */
export function convertFromUTC(timestamp, timezoneOffset) {
  if (!timezoneOffset) return timestamp  // Already UTC
  const offsetMs = timezoneOffset * 60 * 60 * 1000
  return timestamp + offsetMs  // Add offset to get data timezone
}

/**
 * Apply timezone offset to all bars in a bars array
 * Converts bar timestamps from data timezone to UTC for internal storage
 * @param {Array} bars - Array of bar objects with time property
 * @param {number} timezoneOffset - Offset in hours from UTC (e.g., 3 for GMT+3)
 * @returns {Array} Bars with timestamps converted to UTC
 */
export function applyTimezoneToBars(bars, timezoneOffset) {
  if (!timezoneOffset || !bars || bars.length === 0) return bars
  
  return bars.map(bar => ({
    ...bar,
    time: convertToUTC(bar.time, timezoneOffset)
  }))
}

/**
 * Get session information for a given timestamp
 * Sessions are defined in the data's timezone, not UTC
 * @param {number} timestamp - Timestamp in milliseconds (UTC)
 * @param {number} timezoneOffset - Data timezone offset in hours
 * @returns {Object} Session info { name, isActive }
 */
export function getSessionForTimestamp(timestamp, timezoneOffset = 0) {
  // Convert UTC to data timezone for session calculation
  const dataTime = convertFromUTC(timestamp, timezoneOffset)
  const date = new Date(dataTime)
  const hour = date.getUTCHours() + timezoneOffset  // Hour in data timezone
  
  // Normalize to 0-23 range
  const normalizedHour = ((hour % 24) + 24) % 24
  
  // Session definitions (in data timezone, typical for MT4/MT5)
  // London: 08:00 - 17:00 (data timezone)
  // New York: 13:00 - 18:00 (data timezone) 
  // Tokyo: 00:00 - 09:00 (data timezone)
  // Sydney: 22:00 - 07:00 (data timezone)
  
  const sessions = [
    { name: 'LONDON', start: 8, end: 17 },
    { name: 'NEWYORK', start: 13, end: 18 },
    { name: 'TOKYO', start: 0, end: 9 },
    { name: 'SYDNEY', start: 22, end: 7 },  // Overnight session
  ]
  
  for (const session of sessions) {
    let isActive = false
    if (session.start < session.end) {
      // Normal session (e.g., 8-17)
      isActive = normalizedHour >= session.start && normalizedHour < session.end
    } else {
      // Overnight session (e.g., 22-7)
      isActive = normalizedHour >= session.start || normalizedHour < session.end
    }
    if (isActive) {
      return { name: session.name, isActive: true }
    }
  }
  
  return { name: null, isActive: false }
}

/**
 * Check if a given hour is within a trading session
 * @param {number} hour - Hour in 24h format (0-23)
 * @param {number} start - Session start hour
 * @param {number} end - Session end hour
 * @returns {boolean}
 */
export function isInSession(hour, start, end) {
  if (start < end) {
    return hour >= start && hour < end
  } else {
    // Overnight session
    return hour >= start || hour < end
  }
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
 * Note: bar.time is in milliseconds (Unix timestamp in ms)
 */
export function detectTimeframe(bars) {
  if (bars.length < 2) return '1h'

  const intervals = []
  // Sample first 20 bars to detect timeframe (bar.time is already in ms)
  for (let i = 1; i < Math.min(bars.length, 20); i++) {
    const diff = bars[i].time - bars[i - 1].time  // Already in ms, no conversion needed
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
  // Common timeframe intervals in milliseconds
  const ONE_MIN = 60 * 1000        // 60,000 ms
  const FIVE_MIN = 5 * ONE_MIN     // 300,000 ms
  const FIFTEEN_MIN = 15 * ONE_MIN // 900,000 ms
  const THIRTY_MIN = 30 * ONE_MIN  // 1,800,000 ms
  const ONE_HOUR = 60 * ONE_MIN    // 3,600,000 ms
  const FOUR_HOUR = 4 * ONE_HOUR   // 14,400,000 ms
  const ONE_DAY = 24 * ONE_HOUR   // 86,400,000 ms

  // Check with a small tolerance (within 5%) for slight irregularities
  const tolerance = ms * 0.05

  if (Math.abs(ms - ONE_MIN) <= tolerance) return '1m'
  if (Math.abs(ms - FIVE_MIN) <= tolerance) return '5m'
  if (Math.abs(ms - FIFTEEN_MIN) <= tolerance) return '15m'
  if (Math.abs(ms - THIRTY_MIN) <= tolerance) return '30m'
  if (Math.abs(ms - ONE_HOUR) <= tolerance) return '1h'
  if (Math.abs(ms - FOUR_HOUR) <= tolerance) return '4h'
  if (Math.abs(ms - ONE_DAY) <= tolerance) return '1d'

  console.warn(`[detectTimeframe] Unknown interval: ${ms}ms (${(ms / 1000).toFixed(1)}s). Defaulting to 1h.`)
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

/**
 * Calculate required margin for a new trade
 * @param {number} lotSize - Position size in lots
 * @param {number} currentPrice - Current price of the symbol
 * @param {number} leverage - Leverage ratio (e.g., 100 for 1:100)
 * @param {Object} symbolConfig - Symbol configuration with contract_size
 * @returns {number} Required margin in account currency
 */
export function calculateRequiredMargin(lotSize, currentPrice, leverage, symbolConfig) {
  if (!symbolConfig || !leverage || leverage <= 0) return 0
  
  const contractSize = symbolConfig.contract_size || 100000
  const requiredPerLot = (contractSize / leverage) * currentPrice
  return requiredPerLot * lotSize
}

/**
 * Calculate total used margin from all open trades
 * @param {Array} openTrades - Array of open trade objects
 * @param {Object} symbolConfig - Symbol configuration
 * @param {number} leverage - Account leverage
 * @returns {number} Total used margin
 */
export function calculateUsedMargin(openTrades, symbolConfig, leverage) {
  if (!openTrades || openTrades.length === 0) return 0
  
  let totalUsedMargin = 0
  openTrades.forEach((trade) => {
    const tradeMargin = calculateRequiredMargin(
      trade.size,
      trade.entry,
      leverage,
      symbolConfig
    )
    totalUsedMargin += tradeMargin
  })
  
  return totalUsedMargin
}

/**
 * Calculate available margin for new trades
 * @param {number} accountBalance - Current account balance
 * @param {number} usedMargin - Total margin already used
 * @returns {number} Available margin
 */
export function calculateAvailableMargin(accountBalance, usedMargin) {
  return Math.max(0, accountBalance - usedMargin)
}

/**
 * Validate if there's enough margin to open a new position
 * @param {Object} params - Validation parameters
 * @param {number} params.accountBalance - Current account balance
 * @param {number} params.openTrades - Array of open trades
 * @param {number} params.positions.lotSize - New position size in lots
 * @param {number} params.positions.entryPrice - New position entry price
 * @param {number} params.leverage - Account leverage
 * @param {Object} params.symbolConfig - Symbol configuration
 * @returns {Object} Validation result with { valid: boolean, requiredMargin: number, availableMargin: number, message: string }
 */
export function validateMarginForTrade({
  accountBalance,
  openTrades = [],
  positions = {},
  leverage,
  symbolConfig
}) {
  const { lotSize = 0, entryPrice = 0 } = positions
  
  if (!leverage || leverage <= 0) {
    return {
      valid: false,
      requiredMargin: 0,
      availableMargin: accountBalance,
      usedMargin: 0,
      message: '❌ Invalid leverage configuration'
    }
  }
  
  if (!symbolConfig) {
    return {
      valid: false,
      requiredMargin: 0,
      availableMargin: accountBalance,
      usedMargin: 0,
      message: '❌ Symbol configuration not available'
    }
  }
  
  if (lotSize <= 0) {
    return {
      valid: false,
      requiredMargin: 0,
      availableMargin: accountBalance,
      usedMargin: 0,
      message: '❌ Invalid lot size (must be > 0)'
    }
  }
  
  // Calculate margins
  const usedMargin = calculateUsedMargin(openTrades, symbolConfig, leverage)
  const requiredMargin = calculateRequiredMargin(lotSize, entryPrice, leverage, symbolConfig)
  const availableMargin = calculateAvailableMargin(accountBalance, usedMargin)
  
  // Check if enough margin available
  const hasEnoughMargin = availableMargin >= requiredMargin
  
  const marginRatio = requiredMargin > 0 ? (availableMargin / requiredMargin) * 100 : 100
  
  return {
    valid: hasEnoughMargin,
    requiredMargin: Math.round(requiredMargin * 100) / 100,
    availableMargin: Math.round(availableMargin * 100) / 100,
    usedMargin: Math.round(usedMargin * 100) / 100,
    marginRatio: Math.round(marginRatio),
    accountBalance: Math.round(accountBalance * 100) / 100,
    message: hasEnoughMargin
      ? `✓ Margin OK: ${requiredMargin.toFixed(2)} required, ${availableMargin.toFixed(2)} available`
      : `❌ Insufficient margin: ${requiredMargin.toFixed(2)} required, but only ${availableMargin.toFixed(2)} available`
  }
}
