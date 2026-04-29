/**
 * Metrics Calculation Utilities
 * Calculates trading performance metrics from trades data
 */

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
    filteredTrades = filteredTrades.filter(t => new Date(t.openTime) >= startDate)
  }
  if (endDate) {
    filteredTrades = filteredTrades.filter(t => new Date(t.openTime) <= endDate)
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
    const date = new Date(trade.openTime).toDateString()
    if (!dailyPnl[date]) {
      dailyPnl[date] = 0
    }
    dailyPnl[date] += (trade.pnl || 0)
  })

  Object.entries(dailyPnl).forEach(([date, amount]) => {
    if (amount > metrics.largestWinningDay.amount) {
      metrics.largestWinningDay = { date, amount }
    }
    if (amount < metrics.largestLosingDay.amount) {
      metrics.largestLosingDay = { date, amount }
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
      const duration = (new Date(t.closeTime) - new Date(t.openTime)) / 1000 // seconds
      return sum + duration
    }, 0)
    metrics.avgTradeDuration = formatDuration(totalDuration / filteredTrades.length)
  }

  // Balance Curve
  let balance = accountConfig?.starting_balance || 0
  metrics.balanceCurve.push({ time: filteredTrades[0]?.openTime || Date.now(), balance })

  filteredTrades.forEach(trade => {
    balance += (trade.pnl || 0)
    metrics.balanceCurve.push({ time: trade.closeTime, balance })
  })

  // Pairs Distribution
  filteredTrades.forEach(trade => {
    const pair = trade.pair || 'Unknown'
    if (!metrics.pairsDistribution[pair]) {
      metrics.pairsDistribution[pair] = { count: 0, pnl: 0, wins: 0 }
    }
    metrics.pairsDistribution[pair].count++
    metrics.pairsDistribution[pair].pnl += (trade.pnl || 0)
    if (trade.pnl > 0) metrics.pairsDistribution[pair].wins++
  })

  // Strategy Breakdown
  filteredTrades.forEach(trade => {
    // By day of week
    const dayOfWeek = new Date(trade.openTime).getDay()
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const dayName = dayNames[dayOfWeek]
    if (!metrics.strategyBreakdown.byDayOfWeek[dayName]) {
      metrics.strategyBreakdown.byDayOfWeek[dayName] = { count: 0, pnl: 0, wins: 0 }
    }
    metrics.strategyBreakdown.byDayOfWeek[dayName].count++
    metrics.strategyBreakdown.byDayOfWeek[dayName].pnl += (trade.pnl || 0)
    if (trade.pnl > 0) metrics.strategyBreakdown.byDayOfWeek[dayName].wins++

    // By hour
    const hour = new Date(trade.openTime).getHours()
    if (!metrics.strategyBreakdown.byHour[hour]) {
      metrics.strategyBreakdown.byHour[hour] = { count: 0, pnl: 0, wins: 0 }
    }
    metrics.strategyBreakdown.byHour[hour].count++
    metrics.strategyBreakdown.byHour[hour].pnl += (trade.pnl || 0)
    if (trade.pnl > 0) metrics.strategyBreakdown.byHour[hour].wins++

    // By side
    const side = trade.side === 'buy' || trade.side === 'long' ? 'long' : 'short'
    metrics.strategyBreakdown.bySide[side].total++
    if (trade.pnl > 0) metrics.strategyBreakdown.bySide[side].wins
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
