export const guessDecimals = (price) =>
  price < 5 ? 5 : price < 100 ? 4 : price < 1000 ? 2 : 1

export const fmt = (n, d) =>
  typeof n === 'number' ? n.toFixed(d ?? guessDecimals(n)) : '—'

export const fmtPnl = (n) => (n >= 0 ? '+' : '') + n.toFixed(2)

export const fmtDate = (ts) => {
  // ts can be seconds or milliseconds - detect and handle both
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16)
}

export const fmtShortDate = (ts) => {
  // Guard against invalid inputs
  if (!ts || typeof ts !== 'number' || isNaN(ts)) return 'Invalid Date'
  
  // ts can be seconds or milliseconds - detect and handle both
  const ms = ts > 1e12 ? ts : ts * 1000
  const date = new Date(ms)
  
  // Check if date is valid
  if (isNaN(date.getTime())) return 'Invalid Date'
  
  return date.toISOString().slice(0, 10)
}

export const generateSampleBars = (n = 2000) => {
  const bars = []
  let price = 1.085
  let time  = 1704067200000 // milliseconds (2024-01-01)
  for (let i = 0; i < n; i++) {
    const trend  = Math.sin(i / 200) * 0.0003
    const change = trend + (Math.random() - 0.495) * 0.0018
    const open   = price
    const close  = +(price + change).toFixed(5)
    const range  = Math.random() * 0.0025 + 0.0005
    const high   = +(Math.max(open, close) + range * Math.random()).toFixed(5)
    const low    = +(Math.min(open, close) - range * Math.random()).toFixed(5)
    bars.push({ time, open, high, low, close, volume: Math.floor(Math.random() * 8000 + 500) })
    price = close
    time += 3600000 // milliseconds per hour
  }
  return bars
}