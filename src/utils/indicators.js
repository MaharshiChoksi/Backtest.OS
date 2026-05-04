import { seriesTimeSeconds } from './tradingUtils'

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