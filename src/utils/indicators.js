import { seriesTimeSeconds, aggregateBars } from './tradingUtils'

export function calcEMA(vals, period) {
  const k   = 2 / (period + 1)
  const out = new Array(vals.length).fill(null)
  let ema   = null
  for (let i = 0; i < vals.length; i++) {
    if (i < period - 1) continue
    ema = ema === null
      ? vals.slice(0, period).reduce((a, b) => a + b, 0) / period
      : vals[i] * k + ema * (1 - k)
    out[i] = +ema.toFixed(8)
  }
  return out
}

/**
 * Calculate multiple EMAs at once for given periods
 * Returns an object with period as key and EMA values array as value
 */
export function calcEMAs(vals, periods) {
  const result = {}
  periods.forEach(period => {
    result[period] = calcEMA(vals, period)
  })
  return result
}

export function calcRSI(vals, period = 14) {
  const out = new Array(vals.length).fill(null)
  if (vals.length <= period) return out
  let ag = 0, al = 0
  for (let i = 1; i <= period; i++) {
    const d = vals[i] - vals[i - 1]
    ag += Math.max(d, 0)
    al += Math.max(-d, 0)
  }
  ag /= period
  al /= period
  for (let i = period; i < vals.length; i++) {
    if (i > period) {
      const d = vals[i] - vals[i - 1]
      ag = (ag * (period - 1) + Math.max(d,  0)) / period
      al = (al * (period - 1) + Math.max(-d, 0)) / period
    }
    out[i] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2)
  }
  return out
}

export function calcBB(vals, period = 20, stdDev = 2) {
  const mid   = calcEMA(vals, period)
  const upper = new Array(vals.length).fill(null)
  const lower = new Array(vals.length).fill(null)
  for (let i = period - 1; i < vals.length; i++) {
    const slice = vals.slice(i - period + 1, i + 1)
    const mean  = slice.reduce((a, b) => a + b, 0) / period
    const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
    upper[i] = +(mid[i] + stdDev * std).toFixed(8)
    lower[i] = +(mid[i] - stdDev * std).toFixed(8)
  }
  return { mid, upper, lower }
}

/**
 * Average True Range (ATR) — EMA of True Range
 */
export function calcATR(bars, period = 20) {
  const n = bars.length
  const out = new Array(n).fill(null)
  if (n < 2) return out
  const tr = new Array(n).fill(0)
  tr[0] = bars[0].high - bars[0].low
  for (let i = 1; i < n; i++) {
    const h = bars[i].high
    const l = bars[i].low
    const pc = bars[i - 1].close
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc))
  }
  const k = 2 / (period + 1)
  let atr = null
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue
    atr = atr === null
      ? tr.slice(0, period).reduce((a, b) => a + b, 0) / period
      : tr[i] * k + atr * (1 - k)
    out[i] = +atr.toFixed(8)
  }
  return out
}

/**
 * Normalized slope for multiple EMAs.
 * Returns an object keyed by EMA period, with slope = (EMA[i] - EMA[i-1]) / ATR[i]
 */
export function calcNormalizedSlope(bars, emaPeriods, atrPeriod = 20) {
  const closes = bars.map(b => b.close)
  const emas = {}
  emaPeriods.forEach(p => { emas[p] = calcEMA(closes, p) })
  const atr = calcATR(bars, atrPeriod)
  const n = bars.length
  const result = {}
  emaPeriods.forEach(p => {
    const values = new Array(n).fill(null)
    const ema = emas[p]
    for (let i = 1; i < n; i++) {
      if (ema[i] !== null && ema[i - 1] !== null && atr[i] !== null && atr[i] !== 0) {
        values[i] = +((ema[i] - ema[i - 1]) / atr[i]).toFixed(8)
      }
    }
    result[p] = values
  })
  return result
}

/**
 * Build a LightweightCharts series data array from a full indicator value array,
 * sliced to `idx` bars and paired with Unix timestamps (converted to seconds for TradingView).
 */
export function buildLine(vals, idx, times) {
  const result = []
  const limit  = Math.min(idx, vals.length, times.length)
  for (let i = 0; i < limit; i++) {
    if (vals[i] !== null && vals[i] !== undefined) {
      const timeInSeconds = seriesTimeSeconds(times[i])
      if (timeInSeconds == null) continue
      result.push({ time: timeInSeconds, value: vals[i] })
    }
  }
  return result
}

/**
 * Compute Previous Day & Week Levels (PDWL) for each bar index.
 *
 * Aggregates the bar array into daily/weekly OHLC and then for each bar
 * determines the most recent completed day/week's OHLC values, plus the
 * start time of that previous day/week (for drawing lines from that origin).
 *
 * @param {Array} bars - OHLCV bar array (bar.time in milliseconds)
 * @returns {Object}
 *   pdOpen|pdHigh|pdLow|pdClose|pwOpen|pwHigh|pwLow|pwClose — price arrays
 *   pdDayStart|pwWeekStart — start timestamps (ms) of the previous day/week
 */
export function calcPDWL(bars) {
  const n = bars.length
  const DAY_MS = 86400000
  const WEEK_MS = 7 * DAY_MS

  const pdOpen     = new Array(n).fill(null)
  const pdHigh     = new Array(n).fill(null)
  const pdLow      = new Array(n).fill(null)
  const pdClose    = new Array(n).fill(null)
  const pdDayStart = new Array(n).fill(null)
  const pwOpen     = new Array(n).fill(null)
  const pwHigh     = new Array(n).fill(null)
  const pwLow      = new Array(n).fill(null)
  const pwClose    = new Array(n).fill(null)
  const pwWeekStart = new Array(n).fill(null)

  if (n === 0) return { pdOpen, pdHigh, pdLow, pdClose, pdDayStart, pwOpen, pwHigh, pwLow, pwClose, pwWeekStart }

  const dailyBars  = aggregateBars(bars, 0, DAY_MS)
  const weeklyBars = aggregateBars(bars, 0, WEEK_MS)

  let dailyIdx = 0
  for (let i = 0; i < n; i++) {
    while (dailyIdx < dailyBars.length - 1 && dailyBars[dailyIdx + 1].time <= bars[i].time) {
      dailyIdx++
    }
    if (dailyIdx > 0) {
      const prev = dailyBars[dailyIdx - 1]
      pdOpen[i]     = prev.open
      pdHigh[i]     = prev.high
      pdLow[i]      = prev.low
      pdClose[i]    = prev.close
      pdDayStart[i] = prev.time
    }
  }

  let weeklyIdx = 0
  for (let i = 0; i < n; i++) {
    while (weeklyIdx < weeklyBars.length - 1 && weeklyBars[weeklyIdx + 1].time <= bars[i].time) {
      weeklyIdx++
    }
    if (weeklyIdx > 0) {
      const prev = weeklyBars[weeklyIdx - 1]
      pwOpen[i]      = prev.open
      pwHigh[i]      = prev.high
      pwLow[i]       = prev.low
      pwClose[i]     = prev.close
      pwWeekStart[i] = prev.time
    }
  }

  return { pdOpen, pdHigh, pdLow, pdClose, pdDayStart, pwOpen, pwHigh, pwLow, pwClose, pwWeekStart }
}