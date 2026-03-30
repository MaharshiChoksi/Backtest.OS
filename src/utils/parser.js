import { tableFromIPC } from 'apache-arrow'

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

/**
 * Parse Parquet file using Apache Arrow (for reading Parquet files users provide).
 */
export async function parseParquet(arrayBuffer) {
  try {
    const table = tableFromIPC(new Uint8Array(arrayBuffer))
    const headers = table.schema.fields.map(f => f.name)
    
    const rows = []
    const chunked = table.toArray()
    for (const row of chunked) {
      const obj = {}
      headers.forEach((h, i) => {
        obj[h] = row[i] !== null ? String(row[i]) : ''
      })
      rows.push(obj)
    }
    
    return { headers, rows }
  } catch (error) {
    console.error('Parquet parse error:', error)
    return null
  }
}

/**
 * Cache parsed data efficiently for next session using IndexedDB.
 * Stores as compressed JSON for fast reload.
 */
export async function cacheData(fileName, headers, rows) {
  try {
    // Open IndexedDB
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 1)
      req.onupgradeneeded = (e) => {
        const store = e.target.result.createObjectStore('data', { keyPath: 'name' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    // Compress and store
    const data = { headers, rows, timestamp: Date.now() }
    const json = JSON.stringify(data)
    
    // Use native compression via Blob (built-in browser support)
    const blob = new Blob([json], { type: 'application/json' })
    
    // Store in IndexedDB
    const tx = db.transaction('data', 'readwrite')
    const store = tx.objectStore('data')
    
    await new Promise((resolve, reject) => {
      const req = store.put({
        name: fileName,
        blob: blob,
        timestamp: Date.now(),
        size: blob.size
      })
      req.onsuccess = resolve
      req.onerror = reject
    })

    console.log(`📦 Cached ${rows.length} rows for ${fileName} (${(blob.size / 1024).toFixed(2)} KB)`)
  } catch (error) {
    console.error('Cache error:', error)
  }
}

/**
 * Load cached data from IndexedDB.
 */
export async function loadCachedData(fileName) {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 1)
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('data', { keyPath: 'name' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const tx = db.transaction('data', 'readonly')
    const store = tx.objectStore('data')
    
    const cached = await new Promise((resolve, reject) => {
      const req = store.get(fileName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = reject
    })

    if (!cached || !cached.blob) return null

    const text = await cached.blob.text()
    return JSON.parse(text)
  } catch (error) {
    console.error('Load cache error:', error)
    return null
  }
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
  
  // Smart detection: prefer combined datetime column, fallback to separate date+time
  // Look for combined datetime ONLY (not 'time' which is usually just time portion)
  const combined = m('datetime', 'timestamp', 'dt', 'period', 'bar')
  
  return {
    time:   combined,
    date:   combined ? '' : m('date'),
    timeOfDay: combined ? '' : m('time'),
    open:   m('open', 'o'),
    high:   m('high', 'h'),
    low:    m('low', 'l'),
    close:  m('close', 'last', 'c', 'price'),
    volume: m('volume', 'vol', 'tickvol', 'tick_vol', 'v'),
  }
}

export function parseTS(str) {
  if (!str) return null
  str = String(str).trim()
  
  // Try numeric timestamp first (seconds or milliseconds) - always return milliseconds
  const n = Number(str)
  if (!isNaN(n) && n > 0) return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000)
  
  // Common datetime formats:
  // MT5: "2020.01.02 00:00:00" or "2020.01.02" + "00:00:00"
  // Standard: "2020-01-02T00:00:00" or "2020-01-02 00:00:00"
  // US: "01/02/2020 00:00:00"
  
  let normalized = str
  
  // Convert MT5 dot format to dashes: "2020.01.02" → "2020-01-02"
  if (normalized.match(/\d{4}\.\d{2}\.\d{2}/)) {
    normalized = normalized.replace(/(\d{4})\.(\d{2})\.(\d{2})/g, '$1-$2-$3')
  }
  
  // Normalize space separator between date and time to T for ISO parsing
  // "2020-01-02 00:00:00" → "2020-01-02T00:00:00"
  normalized = normalized.replace(/(\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')
  
  const d = new Date(normalized)
  const result = d.getTime()
  
  if (normalized.includes('2020')) {
    console.log(`parseTS: "${str}" → normalized "${normalized}" → date ${new Date(result)} → ${result}ms`)
  }
  
  if (isNaN(result)) {
    // Try alternative formats if ISO parsing fails
    const altFormats = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/,  // MM/DD/YYYY HH:MM:SS
      /(\d{1,2})-(\d{1,2})-(\d{4})\s*(\d{2}:\d{2}:\d{2})?/,   // MM-DD-YYYY HH:MM:SS
    ]
    for (const fmt of altFormats) {
      const m = str.match(fmt)
      if (m) {
        const [, p1, p2, year, time] = m
        const d2 = new Date(`${year}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}T${time || '00:00:00'}`)
        return d2.getTime()
      }
    }
    return null
  }
  
  return result
}

export function rowToBar(row, mapping) {
  // Extract time value, handling both combined and separate date/time columns
  let timeStr = row[mapping.time]
  
  // If no combined time column, try merging separate date and time
  if (!timeStr && mapping.date && mapping.timeOfDay) {
    const date = row[mapping.date]
    const timeOfDay = row[mapping.timeOfDay]
    if (date && timeOfDay) {
      // Merge: concatenate with space separator
      timeStr = `${date} ${timeOfDay}`
      if (row === row) { // First row debug log
        console.log('🔍 Merged date+time:', timeStr)
      }
    }
  }
  
  const time = parseTS(timeStr)
  if (!time) return null
  
  const o = parseFloat(row[mapping.open])
  const h = parseFloat(row[mapping.high])
  const l = parseFloat(row[mapping.low])
  const c = parseFloat(row[mapping.close])
  if ([o, h, l, c].some(isNaN)) return null
  
  const vol = parseFloat(row[mapping.volume] || '0')
  return { time, open: o, high: h, low: l, close: c, volume: isNaN(vol) ? 0 : vol }
}