import { tableFromIPC } from 'apache-arrow'

// ═══════════════════════════════════════════════════════════════════
// WEB WORKER PARSER - Runs parsing in background thread
// ═══════════════════════════════════════════════════════════════════

let _worker = null

function getWorker() {
  if (!_worker) {
    _worker = new Worker('/csvParserWorker.js')
  }
  return _worker
}

export function parseCSVWithWorker(text, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = getWorker()
    const id = Date.now()

    const handleMessage = (e) => {
      const { type, id: msgId, ...data } = e.data

      if (type === 'progress' || type === 'phase') {
        if (options.onProgress) options.onProgress(data)
      } else if (type === 'complete') {
        if (data.id === id) {
          worker.removeEventListener('message', handleMessage)
          resolve(data.result)
        }
      } else if (type === 'error') {
        if (data.id === id) {
          worker.removeEventListener('message', handleMessage)
          reject(new Error(data.message))
        }
      }
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage({ type: 'parse', id, payload: { text, options } })
  })
}

// ═══════════════════════════════════════════════════════════════════
// TIMEZONE UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get last Sunday of a given month/year in UTC milliseconds.
 * @param {number} year
 * @param {number} month - 0-indexed (March = 2, October = 9)
 */
function lastSunday(year, month) {
  const d = new Date(Date.UTC(year, month + 1, 0)) // last day of month
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())     // rewind to Sunday
  return d.getTime()
}

/**
 * Per-year DST boundary cache.
 * Avoids recomputing Date objects for every bar — computed once per year.
 */
const _dstCache = {}

function getDSTBoundaries(year) {
  if (_dstCache[year]) return _dstCache[year]
  _dstCache[year] = {
    start: lastSunday(year, 2),  // Last Sunday in March  → DST starts
    end:   lastSunday(year, 9),  // Last Sunday in October → DST ends
  }
  return _dstCache[year]
}

/**
 * Detect MT5 server UTC offset for a given timestamp.
 *
 * MT5 follows European DST rules:
 *   - UTC+3 from last Sunday in March 00:00 UTC
 *   - UTC+2 from last Sunday in October 00:00 UTC
 *
 * The timestamp arriving here is still in MT5 local time (not yet UTC),
 * so we approximate UTC by subtracting the base offset of +2.
 * This is accurate to within 1 hour of the DST boundary — acceptable for
 * all practical purposes (affects at most 1-2 bars per year).
 *
 * @param {number} timestampMs - Raw MT5 local timestamp in milliseconds
 * @returns {number} 2 or 3 (UTC offset hours)
 */
export function getMT5Offset(timestampMs) {
  const year = new Date(timestampMs).getUTCFullYear()
  const { start, end } = getDSTBoundaries(year)
  const approxUtc = timestampMs - 2 * 3600000  // approximate UTC using base offset
  return (approxUtc >= start && approxUtc < end) ? 3 : 2
}

/**
 * Convert an MT5 bar timestamp to any target UTC offset.
 * Handles MT5 DST automatically (UTC+2 winter / UTC+3 summer).
 *
 * @param {number} timestampMs  - Raw timestamp from MT5 data (MT5 local time)
 * @param {number} targetOffset - Desired UTC offset in hours (0 = UTC, -5 = EST, etc.)
 * @returns {number} Timestamp shifted to target timezone in milliseconds
 */
export function convertMT5Timestamp(timestampMs, targetOffset) {
  const mt5Offset = getMT5Offset(timestampMs)
  const utcMs = timestampMs - mt5Offset * 3600000   // strip MT5 local → UTC
  return utcMs + targetOffset * 3600000              // apply target offset
}

/**
 * Convert bar timestamp from a fixed-offset timezone to UTC.
 * Use this for non-MT5 sources with a known fixed offset.
 *
 * @param {number} timestamp      - Timestamp in milliseconds (source timezone)
 * @param {number} timezoneOffset - Source UTC offset in hours
 * @returns {number} UTC timestamp in milliseconds
 */
export function timestampToUTC(timestamp, timezoneOffset) {
  if (!timezoneOffset) return timestamp
  return timestamp - timezoneOffset * 3600000
}

/**
 * Convert UTC timestamp to a target timezone.
 *
 * @param {number} timestamp      - UTC timestamp in milliseconds
 * @param {number} timezoneOffset - Target UTC offset in hours
 * @returns {number} Timestamp in milliseconds (target timezone)
 */
export function timestampFromUTC(timestamp, timezoneOffset) {
  if (!timezoneOffset) return timestamp
  return timestamp + timezoneOffset * 3600000
}

// ═══════════════════════════════════════════════════════════════════
// LEGACY PARSERS
// ═══════════════════════════════════════════════════════════════════

export function parseDelimited(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null

  const first = lines[0]
  let delim = ',', best = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = first.split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const clean = (s) => s.trim().replace(/^["']|["']$/g, '')
  const headers = first.split(delim).map(clean)
  const rows = lines.slice(1)
    .map(l => {
      const o = {}
      l.split(delim).map(clean).forEach((v, i) => { if (headers[i]) o[headers[i]] = v })
      return o
    })
    .filter(r => headers.some(h => r[h]))

  return { headers, rows }
}

export async function parseDelimitedAsync(text, options = {}) {
  const { chunkSize = 5000, onProgress } = options

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null

  const first = lines[0]
  let delim = ',', best = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = first.split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const clean = (s) => s.trim().replace(/^["']|["']$/g, '')
  const headers = first.split(delim).map(clean)

  const rows = []
  const rawRows = lines.slice(1)
  const total = rawRows.length

  for (let i = 0; i < rawRows.length; i += chunkSize) {
    const chunk = rawRows.slice(i, i + chunkSize)

    for (const l of chunk) {
      const o = {}
      l.split(delim).map(clean).forEach((v, j) => { if (headers[j]) o[headers[j]] = v })
      if (headers.some(h => o[h])) rows.push(o)
    }

    if (onProgress) {
      onProgress(Math.min(Math.round(((i + chunk.length) / total) * 100), 100))
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  return { headers, rows }
}

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

// ═══════════════════════════════════════════════════════════════════
// INDEXEDDB CACHE
// ═══════════════════════════════════════════════════════════════════

export async function cacheData(fileName, headers, rows, bars, options = {}) {
  const { useBinary = true, onProgress } = options

  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 3)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'name' })
        }
        if (!db.objectStoreNames.contains('bars')) {
          db.createObjectStore('bars', { keyPath: 'name' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const timestamp = Date.now()

    const metadata = {
      name: fileName,
      headers,
      rowCount: rows ? rows.length : 0,
      timestamp,
      useBinary: useBinary && bars && bars.length > 0,
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readwrite')
      const store = tx.objectStore('metadata')
      const req = store.put(metadata)
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
    })

    if (useBinary && bars && bars.length > 0) {
      if (onProgress) {
        onProgress({ phase: 'caching', message: 'Preparing data...', percent: 0 })
        await new Promise(r => setTimeout(r, 10))
      }

      const binaryData = new Float64Array(bars.length * 6)
      const chunkSize = 1000

      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        const idx = i * 6
        binaryData[idx]     = b.time
        binaryData[idx + 1] = b.open
        binaryData[idx + 2] = b.high
        binaryData[idx + 3] = b.low
        binaryData[idx + 4] = b.close
        binaryData[idx + 5] = b.volume

        if (i > 0 && i % chunkSize === 0) {
          const percent = Math.round((i / bars.length) * 100)
          if (onProgress) onProgress({ phase: 'caching', message: `Converting... ${percent}%`, percent })
          await new Promise(r => setTimeout(r, 0))
        }
      }

      if (onProgress) onProgress({ phase: 'caching', message: 'Saving...', percent: 95 })

      await new Promise((resolve, reject) => {
        const tx = db.transaction('bars', 'readwrite')
        const store = tx.objectStore('bars')
        const req = store.put({
          name: fileName,
          data: binaryData.buffer,
          barCount: bars.length,
          timestamp,
        })
        req.onsuccess = resolve
        req.onerror = () => reject(req.error)
      })
    } else if (bars && bars.length > 0) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('bars', 'readwrite')
        const store = tx.objectStore('bars')
        const req = store.put({
          name: fileName,
          data: JSON.stringify(bars),
          barCount: bars.length,
          timestamp,
        })
        req.onsuccess = resolve
        req.onerror = () => reject(req.error)
      })
    }
  } catch (error) {
    console.error('[Cache] Error:', error)
    throw error
  }
}

export async function loadCachedData(fileName) {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 2)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'name' })
        }
        if (!db.objectStoreNames.contains('bars')) {
          db.createObjectStore('bars', { keyPath: 'name' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const tx = db.transaction(['metadata', 'bars'], 'readonly')

    const metadata = await new Promise((resolve, reject) => {
      const req = tx.objectStore('metadata').get(fileName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = reject
    })

    if (!metadata) return null

    const barData = await new Promise((resolve, reject) => {
      const req = tx.objectStore('bars').get(fileName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = reject
    })

    if (!barData) return null

    let bars
    if (metadata.useBinary && barData.data instanceof ArrayBuffer) {
      const arr = new Float64Array(barData.data)
      bars = []
      for (let i = 0; i < arr.length; i += 6) {
        bars.push({
          time:   arr[i],
          open:   arr[i + 1],
          high:   arr[i + 2],
          low:    arr[i + 3],
          close:  arr[i + 4],
          volume: arr[i + 5],
        })
      }
    } else {
      bars = typeof barData.data === 'string' ? JSON.parse(barData.data) : barData.data
    }

    return { headers: metadata.headers, bars, rowCount: metadata.rowCount }
  } catch (error) {
    console.error('Load cache error:', error)
    return null
  }
}

export async function clearCache(fileName = null) {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 3)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const tx = db.transaction(['metadata', 'bars'], 'readwrite')

    if (fileName) {
      tx.objectStore('metadata').delete(fileName)
      tx.objectStore('bars').delete(fileName)
    } else {
      tx.objectStore('metadata').clear()
      tx.objectStore('bars').clear()
    }
  } catch (error) {
    console.error('Clear cache error:', error)
  }
}

// ═══════════════════════════════════════════════════════════════════
// COLUMN DETECTION & ROW PARSING
// ═══════════════════════════════════════════════════════════════════

export function detectMapping(headers) {
  const H = headers.map(h => h.toLowerCase().replace(/[<>]/g, '').trim())
  const m = (...keys) => {
    for (const k of keys) {
      const i = H.findIndex(h => h === k || h.startsWith(k))
      if (i >= 0) return headers[i]
    }
    return ''
  }

  const combined = m('datetime', 'timestamp', 'dt', 'period', 'bar')

  return {
    time:      combined,
    date:      combined ? '' : m('date'),
    timeOfDay: combined ? '' : m('time'),
    open:      m('open', 'o'),
    high:      m('high', 'h'),
    low:       m('low', 'l'),
    close:     m('close', 'last', 'c', 'price'),
    volume:    m('volume', 'vol', 'tickvol', 'tick_vol', 'v'),
  }
}

export function parseTS(str) {
  if (!str) return null
  str = String(str).trim()

  // Numeric timestamp (seconds or milliseconds) → always return ms
  const n = Number(str)
  if (!isNaN(n) && n > 0) return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000)

  let normalized = str

  // MT5 dot format: "2020.01.02" → "2020-01-02"
  if (normalized.match(/\d{4}\.\d{2}\.\d{2}/)) {
    normalized = normalized.replace(/(\d{4})\.(\d{2})\.(\d{2})/g, '$1-$2-$3')
  }

  // "2020-01-02 00:00:00" → "2020-01-02T00:00:00"
  normalized = normalized.replace(/(\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')

  const result = new Date(normalized).getTime()
  if (!isNaN(result)) return result

  // Fallback: MM/DD/YYYY or MM-DD-YYYY
  const altFormats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/,
    /(\d{1,2})-(\d{1,2})-(\d{4})\s*(\d{2}:\d{2}:\d{2})?/,
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

export function rowToBar(row, mapping) {
  let timeStr = row[mapping.time]

  if (!timeStr && mapping.date && mapping.timeOfDay) {
    const date = row[mapping.date]
    const timeOfDay = row[mapping.timeOfDay]
    if (date && timeOfDay) timeStr = `${date} ${timeOfDay}`
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

// ═══════════════════════════════════════════════════════════════════
// BAR CONVERSION — SINGLE PASS (rows → bars + timezone in one loop)
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert rows to bars with optional timezone conversion in a single pass.
 *
 * Timezone options:
 *   timezoneOffset {number} - Target UTC offset in hours (0 = UTC, -5 = EST, etc.)
 *   mt5Source {boolean}     - true  → auto-detect MT5 DST (UTC+2/+3) and convert
 *                           - false → treat source as fixed timezoneOffset and convert to UTC
 *
 * If timezoneOffset is null/undefined, timestamps are left as-is.
 *
 * @param {Array}    rows
 * @param {Object}   mapping
 * @param {Object}   options
 * @param {number}   [options.maxBars=1_000_000]
 * @param {Function} [options.onProgress]
 * @param {number}   [options.timezoneOffset=null]  - Target UTC offset in hours
 * @param {boolean}  [options.mt5Source=true]       - Whether source data is from MT5
 * @returns {Promise<{bars: Array, stoppedEarly: boolean, totalProcessed: number}>}
 */
export async function rowsToBarsLimited(rows, mapping, options = {}) {
  const {
    maxBars = 1_000_000,
    onProgress,
    timezoneOffset = null,
    mt5Source = true,
  } = options

  const bars = []
  const total = rows.length
  const chunkSize = 5000
  const shouldConvert = timezoneOffset !== null

  for (let i = 0; i < rows.length; i++) {
    const bar = rowToBar(rows[i], mapping)

    if (bar) {
      // ── Timezone conversion in the SAME pass — no second loop ──
      if (shouldConvert) {
        bar.time = mt5Source
          ? convertMT5Timestamp(bar.time, timezoneOffset)
          : timestampToUTC(bar.time, timezoneOffset) + timezoneOffset * 3600000
      }

      bars.push(bar)

      if (bars.length >= maxBars) {
        if (onProgress) onProgress(100)
        return { bars, stoppedEarly: true, totalProcessed: i + 1 }
      }
    }

    // Yield to event loop periodically
    if ((i + 1) % chunkSize === 0) {
      if (onProgress) onProgress(Math.min(Math.round(((i + 1) / total) * 100), 99))
      await new Promise(r => setTimeout(r, 0))
    }
  }

  if (onProgress) onProgress(100)
  return { bars, stoppedEarly: false, totalProcessed: rows.length }
}

/**
 * Validate time intervals between bars.
 * Returns the minimum interval found (used to detect timeframe).
 */
export async function validateTimeIntervals(bars, options = {}) {
  const { onProgress } = options
  let minInterval = Infinity
  const chunkSize = 10000

  for (let i = 1; i < bars.length; i++) {
    const interval = bars[i].time - bars[i - 1].time
    if (interval < minInterval) minInterval = interval

    if (i % chunkSize === 0) {
      if (onProgress) onProgress(Math.round((i / bars.length) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }

  if (onProgress) onProgress(100)
  return { minInterval, stoppedEarly: false }
}

/**
 * Convert bar timestamps for an already-parsed array (e.g. cached bars being re-offset).
 * For fresh parsing, prefer passing timezoneOffset into rowsToBarsLimited instead.
 *
 * @param {Array}    bars
 * @param {number}   timezoneOffset - Target UTC offset in hours
 * @param {Object}   options
 * @param {boolean}  [options.mt5Source=true]
 * @param {Function} [options.onProgress]
 */
export async function convertBarsTimezone(bars, timezoneOffset, options = {}) {
  const { mt5Source = true, onProgress } = options
  const converted = []
  const chunkSize = 10000

  for (let i = 0; i < bars.length; i++) {
    converted.push({
      ...bars[i],
      time: mt5Source
        ? convertMT5Timestamp(bars[i].time, timezoneOffset)
        : timestampToUTC(bars[i].time, timezoneOffset),
    })

    if (i > 0 && i % chunkSize === 0) {
      if (onProgress) onProgress(Math.round((i / bars.length) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }

  if (onProgress) onProgress(100)
  return converted
}