/**
 * Metrics Calculation Utilities
 * Calculates trading performance metrics from trades data
 */

const normalizeTimestamp = (value) => {
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const isLongSide = (side) => {
  if (!side) return false
  const normalized = String(side).trim().toLowerCase()
  return ['buy', 'long', 'b', 'l'].includes(normalized)
}

/**
 * Calculate all metrics for a set of trades
 * @param {Array} trades - Array of trade objects
 * @param {Object} accountConfig - Account configuration with starting_balance
 * @param {Date} startDate - Filter start date (optional)
 * @param {Date} endDate - Filter end date (optional)
 * @param {string} pairFilter - Filter by pair (optional)
 * @returns {Object} All calculated metrics
 */
export function calculateMetrics(trades, accountConfig, startDate = null, endDate = null, pairFilter = null) {
  // Filter trades
  let filteredTrades = trades.filter(t => t.status === 'closed')
  
  if (startDate) {
    filteredTrades = filteredTrades.filter(t => {
      const openMs = normalizeTimestamp(t.openTime)
      return openMs !== null && new Date(openMs) >= startDate
    })
  }
  if (endDate) {
    filteredTrades = filteredTrades.filter(t => {
      const openMs = normalizeTimestamp(t.openTime)
      return openMs !== null && new Date(openMs) <= endDate
    })
  }
  if (pairFilter) {
    filteredTrades = filteredTrades.filter(t => t.pair === pairFilter)
  }

  if (filteredTrades.length === 0) {
    return getEmptyMetrics()
  }

  const metrics = {
    // Basic counts
    totalTrades: filteredTrades.length,
    totalWins: filteredTrades.filter(t => t.pnl > 0).length,
    totalLosses: filteredTrades.filter(t => t.pnl <= 0).length,
    
    // Win rate
    winRate: filteredTrades.length > 0 
      ? (filteredTrades.filter(t => t.pnl > 0).length / filteredTrades.length * 100).toFixed(2)
      : 0,

    // Profit metrics
    totalPnl: filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
    grossProfit: filteredTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0),
    grossLoss: Math.abs(filteredTrades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0)),

    // Average metrics
    avgWin: 0,
    avgLoss: 0,
    avgRR: 0,

    // Consecutive
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    currentConsecutiveWins: 0,
    currentConsecutiveLosses: 0,

    // Largest trades
    largestWinnerLong: null,
    largestWinnerShort: null,
    largestLoserLong: null,
    largestLoserShort: null,

    // Day-based metrics
    largestWinningDay: { date: null, amount: 0 },
    largestLosingDay: { date: null, amount: 0 },

    // Risk metrics
    sharpeRatio: 0,
    profitFactor: 0,
    avgRiskPercent: 0,

    // Fees
    totalFees: filteredTrades.reduce((sum, t) => sum + (t.fees || 0), 0),

    // Duration
    avgTradeDuration: 0,

    // Balance curve data
    balanceCurve: [],
    
    // Pairs distribution
    pairsDistribution: {},

    // Strategy breakdown (by day of week, hour, etc.)
    strategyBreakdown: {
      byDayOfWeek: {},
      byHour: {},
      bySide: { long: { wins: 0, losses: 0, total: 0 }, short: { wins: 0, losses: 0, total: 0 } },
    },
  }

  // Calculate averages
  const winners = filteredTrades.filter(t => t.pnl > 0)
  const losers = filteredTrades.filter(t => t.pnl <= 0)
  
  if (winners.length > 0) {
    metrics.avgWin = winners.reduce((sum, t) => sum + t.pnl, 0) / winners.length
  }
  if (losers.length > 0) {
    metrics.avgLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0) / losers.length)
  }
  if (metrics.avgLoss > 0) {
    metrics.avgRR = (metrics.avgWin / metrics.avgLoss).toFixed(2)
  }

  // Consecutive wins/losses
  let consecutiveWins = 0
  let consecutiveLosses = 0
  let maxWins = 0
  let maxLosses = 0

  filteredTrades.forEach(trade => {
    if (trade.pnl > 0) {
      consecutiveWins++
      consecutiveLosses = 0
      maxWins = Math.max(maxWins, consecutiveWins)
    } else {
      consecutiveLosses++
      consecutiveWins = 0
      maxLosses = Math.max(maxLosses, consecutiveLosses)
    }
  })

  metrics.maxConsecutiveWins = maxWins
  metrics.maxConsecutiveLosses = maxLosses

  // Largest trades by side
  filteredTrades.forEach(trade => {
    if (trade.pnl > 0) {
      if (trade.side === 'buy' || trade.side === 'long') {
        if (!metrics.largestWinnerLong || trade.pnl > metrics.largestWinnerLong.pnl) {
          metrics.largestWinnerLong = trade
        }
      } else {
        if (!metrics.largestWinnerShort || trade.pnl > metrics.largestWinnerShort.pnl) {
          metrics.largestWinnerShort = trade
        }
      }
    } else {
      if (trade.side === 'buy' || trade.side === 'long') {
        if (!metrics.largestLoserLong || trade.pnl < metrics.largestLoserLong.pnl) {
          metrics.largestLoserLong = trade
        }
      } else {
        if (!metrics.largestLoserShort || trade.pnl < metrics.largestLoserShort.pnl) {
          metrics.largestLoserShort = trade
        }
      }
    }
  })

  // Daily P&L
  const dailyPnl = {}
  filteredTrades.forEach(trade => {
    const tradeDate = new Date(trade.openTime)
    const dateKey = tradeDate.toDateString()
    const dateTimestamp = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate()).getTime()
    if (!dailyPnl[dateKey]) {
      dailyPnl[dateKey] = { amount: 0, timestamp: dateTimestamp }
    }
    dailyPnl[dateKey].amount += (trade.pnl || 0)
  })

  Object.entries(dailyPnl).forEach(([dateKey, data]) => {
    const { amount, timestamp } = data
    if (amount > metrics.largestWinningDay.amount) {
      metrics.largestWinningDay = { date: timestamp, amount }
    }
    if (amount < metrics.largestLosingDay.amount) {
      metrics.largestLosingDay = { date: timestamp, amount }
    }
  })

  // Sharpe Ratio (simplified - using daily returns)
  const dailyReturns = Object.values(dailyPnl)
  if (dailyReturns.length > 1) {
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    const stdDev = Math.sqrt(
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
    )
    if (stdDev > 0) {
      metrics.sharpeRatio = (avgReturn / stdDev * Math.sqrt(252)).toFixed(2) // Annualized
    }
  }

  // Profit Factor
  if (metrics.grossLoss > 0) {
    metrics.profitFactor = (metrics.grossProfit / metrics.grossLoss).toFixed(2)
  }

  // Average Risk Percent
  if (filteredTrades.length > 0) {
    const totalRisk = filteredTrades.reduce((sum, t) => {
      const riskPercent = t.riskPercent || 0
      return sum + riskPercent
    }, 0)
    metrics.avgRiskPercent = (totalRisk / filteredTrades.length).toFixed(2)
  }

  // Average Trade Duration
  if (filteredTrades.length > 0) {
    const totalDuration = filteredTrades.reduce((sum, t) => {
      const openMs = normalizeTimestamp(t.openTime)
      const closeMs = normalizeTimestamp(t.closeTime)
      const duration = (closeMs && openMs) ? (closeMs - openMs) / 1000 : 0
      return sum + duration
    }, 0)
    metrics.avgTradeDuration = formatDuration(totalDuration / filteredTrades.length)
  }

  // Balance Curve
  const balanceCurveTrades = [...filteredTrades].sort((a, b) => {
    const aTime = normalizeTimestamp(a.closeTime) || normalizeTimestamp(a.openTime) || 0
    const bTime = normalizeTimestamp(b.closeTime) || normalizeTimestamp(b.openTime) || 0
    return aTime - bTime
  })

  let balance = accountConfig?.starting_balance || 0
  const firstOpen = normalizeTimestamp(balanceCurveTrades[0]?.openTime)
  const startTime = firstOpen || Date.now()
  metrics.balanceCurve.push({ time: startTime, balance })

  balanceCurveTrades.forEach(trade => {
    balance += (trade.pnl || 0)
    const openMs = normalizeTimestamp(trade.openTime)
    const closeMs = normalizeTimestamp(trade.closeTime)
    const tradeTime = closeMs || openMs
    if (tradeTime) {
      metrics.balanceCurve.push({ time: tradeTime, balance })
    }
  })

  // Pairs Distribution
  filteredTrades.forEach(trade => {
    const pair = trade.pair || 'Unknown'
    const normalizedSide = isLongSide(trade.side) ? 'long' : 'short'
    if (!metrics.pairsDistribution[pair]) {
      metrics.pairsDistribution[pair] = {
        count: 0,
        pnl: 0,
        wins: 0,
        losses: 0,
        longs: 0,
        longWins: 0,
        longLosses: 0,
        longPnl: 0,
        shorts: 0,
        shortWins: 0,
        shortLosses: 0,
        shortPnl: 0,
      }
    }
    const pairMetrics = metrics.pairsDistribution[pair]
    pairMetrics.count++
    pairMetrics.pnl += (trade.pnl || 0)
    if (trade.pnl > 0) {
      pairMetrics.wins++
    } else {
      pairMetrics.losses++
    }

    if (normalizedSide === 'long') {
      pairMetrics.longs++
      pairMetrics.longPnl += (trade.pnl || 0)
      if (trade.pnl > 0) {
        pairMetrics.longWins++
      } else {
        pairMetrics.longLosses++
      }
    } else {
      pairMetrics.shorts++
      pairMetrics.shortPnl += (trade.pnl || 0)
      if (trade.pnl > 0) {
        pairMetrics.shortWins++
      } else {
        pairMetrics.shortLosses++
      }
    }
  })

  // Strategy Breakdown
  filteredTrades.forEach(trade => {
    const tradeDate = new Date(trade.openTime)
    const dayOfWeek = tradeDate.getDay()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayName = dayNames[dayOfWeek]
    if (!metrics.strategyBreakdown.byDayOfWeek[dayName]) {
      metrics.strategyBreakdown.byDayOfWeek[dayName] = { count: 0, pnl: 0, wins: 0 }
    }
    metrics.strategyBreakdown.byDayOfWeek[dayName].count++
    metrics.strategyBreakdown.byDayOfWeek[dayName].pnl += (trade.pnl || 0)
    if (trade.pnl > 0) metrics.strategyBreakdown.byDayOfWeek[dayName].wins++

    // By hour
    const hour = tradeDate.getHours()
    if (!metrics.strategyBreakdown.byHour[hour]) {
      metrics.strategyBreakdown.byHour[hour] = { count: 0, pnl: 0, wins: 0 }
    }
    metrics.strategyBreakdown.byHour[hour].count++
    metrics.strategyBreakdown.byHour[hour].pnl += (trade.pnl || 0)
    if (trade.pnl > 0) metrics.strategyBreakdown.byHour[hour].wins++

    // By side
    const normalizedSide = ['buy', 'long'].includes(String(trade.side).toLowerCase()) ? 'long' : 'short'
    if (!metrics.strategyBreakdown.bySide[normalizedSide]) {
      metrics.strategyBreakdown.bySide[normalizedSide] = { wins: 0, losses: 0, total: 0 }
    }
    metrics.strategyBreakdown.bySide[normalizedSide].total++
    if (trade.pnl > 0) {
      metrics.strategyBreakdown.bySide[normalizedSide].wins++
    } else {
      metrics.strategyBreakdown.bySide[normalizedSide].losses++
    }
  })

  return metrics
}

/**
 * Get empty metrics object
 */
function getEmptyMetrics() {
  return {
    totalTrades: 0,
    totalWins: 0,
    totalLosses: 0,
    winRate: 0,
    totalPnl: 0,
    grossProfit: 0,
    grossLoss: 0,
    avgWin: 0,
    avgLoss: 0,
    avgRR: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    largestWinnerLong: null,
    largestWinnerShort: null,
    largestLoserLong: null,
    largestLoserShort: null,
    largestWinningDay: { date: null, amount: 0 },
    largestLosingDay: { date: null, amount: 0 },
    sharpeRatio: 0,
    profitFactor: 0,
    avgRiskPercent: 0,
    totalFees: 0,
    avgTradeDuration: '0m',
    balanceCurve: [],
    pairsDistribution: {},
    strategyBreakdown: {
      byDayOfWeek: {},
      byHour: {},
      bySide: { long: { wins: 0, losses: 0, total: 0 }, short: { wins: 0, losses: 0, total: 0 } },
    },
  }
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

/**
 * Calculate web-type summary averages for filtered trades
 */
export function calculateWebSummary(trades) {
  const closedTrades = trades.filter(t => t.status === 'closed')
  
  if (closedTrades.length === 0) {
    return {
      avgWinRate: 0,
      avgRRRatio: 0,
      avgRiskPercent: 0,
      avgProfitFactor: 0,
      sharpeRatio: 0,
      avgTradeDuration: '0m',
    }
  }

  const metrics = calculateMetrics(closedTrades)
  
  return {
    avgWinRate: parseFloat(metrics.winRate),
    avgRRRatio: parseFloat(metrics.avgRR),
    avgRiskPercent: parseFloat(metrics.avgRiskPercent),
    avgProfitFactor: parseFloat(metrics.profitFactor),
    sharpeRatio: parseFloat(metrics.sharpeRatio),
    avgTradeDuration: metrics.avgTradeDuration,
  }
}
