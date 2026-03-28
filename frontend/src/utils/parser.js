export function parseDelimited(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null

  const first = lines[0]
  let delim = ',', best = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = first.split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const clean   = (s) => s.trim().replace(/^["']|["']$/g, '')
  const headers = first.split(delim).map(clean)
  const rows    = lines.slice(1)
    .map(l => {
      const o = {}
      l.split(delim).map(clean).forEach((v, i) => { if (headers[i]) o[headers[i]] = v })
      return o
    })
    .filter(r => headers.some(h => r[h]))

  return { headers, rows }
}

export function detectMapping(headers) {
  const H = headers.map(h => h.toLowerCase().replace(/[<>]/g, '').trim())
  const m = (...keys) => {
    for (const k of keys) {
      const i = H.findIndex(h => h === k || h.startsWith(k))
      if (i >= 0) return headers[i]
    }
    return ''
  }
  return {
    time:   m('time', 'date', 'datetime', 'timestamp', 'dt', 'period', 'bar'),
    open:   m('open', 'o'),
    high:   m('high', 'h'),
    low:    m('low', 'l'),
    close:  m('close', 'last', 'c', 'price'),
    volume: m('volume', 'vol', 'tickvol', 'tick_vol', 'v'),
  }
}

export function parseTS(str) {
  if (!str) return null
  const n = Number(str)
  if (!isNaN(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
  const d = new Date(str.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000)
}

export function rowToBar(row, mapping) {
  const time = parseTS(row[mapping.time])
  if (!time) return null
  const o = parseFloat(row[mapping.open])
  const h = parseFloat(row[mapping.high])
  const l = parseFloat(row[mapping.low])
  const c = parseFloat(row[mapping.close])
  if ([o, h, l, c].some(isNaN)) return null
  const vol = parseFloat(row[mapping.volume] || '0')
  return { time, open: o, high: h, low: l, close: c, volume: isNaN(vol) ? 0 : vol }
}