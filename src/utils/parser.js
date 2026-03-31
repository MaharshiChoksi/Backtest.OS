import { tableFromIPC } from 'apache-arrow'

// ═══════════════════════════════════════════════════════════════════
// WEB WORKER PARSER - Runs parsing in background thread
// ═══════════════════════════════════════════════════════════════════

let _worker = null

/**
 * Get or create the CSV parser worker
 */
function getWorker() {
  if (!_worker) {
    _worker = new Worker('/csvParserWorker.js')
  }
  return _worker
}

/**
 * Parse CSV text using Web Worker (non-blocking)
 * Returns a promise that resolves with progress updates
 */
export function parseCSVWithWorker(text, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = getWorker()
    const id = Date.now()
    
    const handleMessage = (e) => {
      const { type, id: msgId, ...data } = e.data
      
      if (type === 'progress' || type === 'phase') {
        if (options.onProgress) {
          options.onProgress(data)
        }
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
// LEGACY PARSERS (still used for small files or fallback)
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
 * Parse delimited text asynchronously with progress reporting
 * Yields to event loop periodically to allow UI updates
 * @param {string} text - Raw text content
 * @param {Object} options - Options
 * @param {number} options.chunkSize - Rows per chunk before yielding (default: 5000)
 * @param {Function} options.onProgress - Progress callback (percent: number)
 * @returns {Promise<{headers: Array, rows: Array}>}
 */
export async function parseDelimitedAsync(text, options = {}) {
  const { chunkSize = 5000, onProgress } = options
  
  // Split lines synchronously (fast)
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return null

  // Detect delimiter synchronously
  const first = lines[0]
  let delim = ',', best = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = first.split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const clean = (s) => s.trim().replace(/^["']|["']$/g, '')
  const headers = first.split(delim).map(clean)
  
  // Process rows in chunks, yielding to event loop between chunks
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
    
    // Report progress and yield to event loop
    if (onProgress) {
      onProgress(Math.min(Math.round(((i + chunk.length) / total) * 100), 100))
    }
    
    // Yield to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  
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
 * Supports both JSON (for metadata) and binary Float64Array (for bars).
 * Binary storage is ~10-50x faster than JSON for large datasets.
 */
export async function cacheData(fileName, headers, rows, bars, options = {}) {
  const { useBinary = true, onProgress } = options
  
  try {
    // Open IndexedDB
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 2)
      req.onupgradeneeded = (e) => {
        const db = e.target.result
        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'name' })
        }
        // Create binary data store (for large bar data)
        if (!db.objectStoreNames.contains('bars')) {
          db.createObjectStore('bars', { keyPath: 'name' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const timestamp = Date.now()
    
    // Store metadata first (separate transaction)
    const metadata = { 
      name: fileName, 
      headers, 
      rowCount: rows ? rows.length : 0,
      timestamp,
      useBinary: useBinary && bars && bars.length > 0
    }
    
    await new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readwrite')
      const store = tx.objectStore('metadata')
      const req = store.put(metadata)
      req.onsuccess = resolve
      req.onerror = () => reject(req.error)
    })

    // Store bars (either as binary or JSON) - separate transaction
    if (useBinary && bars && bars.length > 0) {
      console.log(`[Cache] Starting binary cache for ${bars.length} bars`)
      if (onProgress) {
        onProgress({ phase: 'caching', message: 'Preparing data...', percent: 0 })
        await new Promise(r => setTimeout(r, 10)) // Small delay to let UI update
      }
      
      // Convert bars to Float64Array for efficient storage (async chunked)
      const binaryData = new Float64Array(bars.length * 6)
      console.log(`[Cache] Float64Array created, byteLength: ${binaryData.byteLength}`)
      const chunkSize = 1000  // Process 1k bars at a time for smoother progress
      
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        const idx = i * 6
        binaryData[idx] = b.time
        binaryData[idx + 1] = b.open
        binaryData[idx + 2] = b.high
        binaryData[idx + 3] = b.low
        binaryData[idx + 4] = b.close
        binaryData[idx + 5] = b.volume
        
        // Yield to event loop periodically to keep UI responsive and show progress
        if (i > 0 && i % chunkSize === 0) {
          const percent = Math.round((i / bars.length) * 100)
          if (onProgress) {
            onProgress({ phase: 'caching', message: `Converting... ${percent}%`, percent })
          }
          await new Promise(r => setTimeout(r, 0)) // Yield to event loop
        }
      }
      
      console.log(`[Cache] Conversion done, saving to IndexedDB...`)
      if (onProgress) onProgress({ phase: 'caching', message: 'Saving...', percent: 95 })
      
      // Create NEW transaction for bars (old one is already committed)
      await new Promise((resolve, reject) => {
        const tx = db.transaction('bars', 'readwrite')
        const store = tx.objectStore('bars')
        const req = store.put({
          name: fileName,
          data: binaryData.buffer,  // ArrayBuffer
          barCount: bars.length,
          timestamp
        })
        req.onsuccess = resolve
        req.onerror = () => reject(req.error)
      })
      
      console.log(`📦 Cached ${bars.length} bars for ${fileName} (binary: ${(binaryData.byteLength / 1024).toFixed(2)} KB)`)
    } else if (bars && bars.length > 0) {
      // Fallback to JSON - create new transaction
      await new Promise((resolve, reject) => {
        const tx = db.transaction('bars', 'readwrite')
        const store = tx.objectStore('bars')
        const req = store.put({
          name: fileName,
          data: JSON.stringify(bars),
          barCount: bars.length,
          timestamp
        })
        req.onsuccess = resolve
        req.onerror = () => reject(req.error)
      })
      
      console.log(`📦 Cached ${bars?.length || 0} bars for ${fileName} (JSON)`)
    }
  } catch (error) {
    console.error('[Cache] Error:', error)
    throw error  // Re-throw so caller knows caching failed
  }
}

/**
 * Load cached data from IndexedDB.
 * Automatically uses binary format if available.
 */
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

    // Load metadata
    const tx = db.transaction(['metadata', 'bars'], 'readonly')
    const metaStore = tx.objectStore('metadata')
    
    const metadata = await new Promise((resolve, reject) => {
      const req = metaStore.get(fileName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = reject
    })

    if (!metadata) return null

    // Load bars
    const barStore = tx.objectStore('bars')
    const barData = await new Promise((resolve, reject) => {
      const req = barStore.get(fileName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = reject
    })

    if (!barData) return null

    let bars
    if (metadata.useBinary && barData.data instanceof ArrayBuffer) {
      // Decode binary Float64Array
      const arr = new Float64Array(barData.data)
      bars = []
      for (let i = 0; i < arr.length; i += 6) {
        bars.push({
          time: arr[i],
          open: arr[i + 1],
          high: arr[i + 2],
          low: arr[i + 3],
          close: arr[i + 4],
          volume: arr[i + 5]
        })
      }
    } else {
      // Parse JSON
      bars = typeof barData.data === 'string' ? JSON.parse(barData.data) : barData.data
    }

    return {
      headers: metadata.headers,
      bars,
      rowCount: metadata.rowCount
    }
  } catch (error) {
    console.error('Load cache error:', error)
    return null
  }
}

/**
 * Clear all cached data
 */
export async function clearCache(fileName = null) {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('BacktestDB', 2)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const tx = db.transaction(['metadata', 'bars'], 'readwrite')
    
    if (fileName) {
      await tx.objectStore('metadata').delete(fileName)
      await tx.objectStore('bars').delete(fileName)
      console.log(`🗑️ Cleared cache for ${fileName}`)
    } else {
      await tx.objectStore('metadata').clear()
      await tx.objectStore('bars').clear()
      console.log(`🗑️ Cleared all cache`)
    }
  } catch (error) {
    console.error('Clear cache error:', error)
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

/**
 * Convert bar timestamp from data timezone to UTC
 * @param {number} timestamp - Timestamp in milliseconds (data timezone)
 * @param {number} timezoneOffset - Offset in hours from UTC (e.g., 3 for GMT+3)
 * @returns {number} Timestamp in milliseconds (UTC)
 */
export function timestampToUTC(timestamp, timezoneOffset) {
  if (!timezoneOffset) return timestamp
  const offsetMs = timezoneOffset * 60 * 60 * 1000
  return timestamp - offsetMs
}

/**
 * Convert bar timestamp from UTC to data timezone
 * @param {number} timestamp - Timestamp in milliseconds (UTC)
 * @param {number} timezoneOffset - Offset in hours from UTC (e.g., 3 for GMT+3)
 * @returns {number} Timestamp in milliseconds (data timezone)
 */
export function timestampFromUTC(timestamp, timezoneOffset) {
  if (!timezoneOffset) return timestamp
  const offsetMs = timezoneOffset * 60 * 60 * 1000
  return timestamp + offsetMs
}

/**
 * Apply timezone offset to a single bar
 * @param {Object} bar - Bar object with time property
 * @param {number} timezoneOffset - Offset in hours from UTC
 * @returns {Object} Bar with converted timestamp
 */
export function convertBarTimezone(bar, timezoneOffset) {
  return {
    ...bar,
    time: timestampToUTC(bar.time, timezoneOffset)
  }
}

/**
 * Convert rows to bars with early termination support
 * Stops processing once maxBars valid bars have been found
 * Yields to event loop periodically for UI responsiveness
 * @param {Array} rows - Array of row objects
 * @param {Object} mapping - Column mapping
 * @param {Object} options - Options
 * @param {number} options.maxBars - Stop after this many valid bars (default: Infinity)
 * @param {Function} options.onProgress - Progress callback (percent)
 * @returns {Promise<{bars: Array, stoppedEarly: boolean, totalProcessed: number}>}
 */
export async function rowsToBarsLimited(rows, mapping, options = {}) {
  const { maxBars = Infinity, onProgress } = options
  const bars = []
  let processed = 0
  let validCount = 0
  const total = rows.length
  const chunkSize = 5000  // Yield every 5k rows
  
  for (let i = 0; i < rows.length; i++) {
    const bar = rowToBar(rows[i], mapping)
    if (bar) {
      bars.push(bar)
      validCount++
      
      // Early termination - stop once we have enough bars
      if (validCount >= maxBars) {
        if (onProgress) onProgress(100)
        return { bars, stoppedEarly: true, totalProcessed: i + 1 }
      }
    }
    
    processed++
    
    // Yield to event loop periodically for UI responsiveness
    if (processed % chunkSize === 0) {
      if (onProgress) onProgress(Math.min(Math.round((processed / total) * 100), 99))
      await new Promise(r => setTimeout(r, 0))
    }
  }
  
  if (onProgress) onProgress(100)
  return { bars, stoppedEarly: false, totalProcessed: processed }
}

/**
 * Validate time intervals asynchronously with progress reporting
 * @param {Array} bars - Array of bar objects
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback (percent)
 * @returns {Promise<{minInterval: number, stoppedEarly: boolean}>}
 */
export async function validateTimeIntervals(bars, options = {}) {
  const { onProgress } = options
  let minInterval = Infinity
  const chunkSize = 10000
  
  for (let i = 1; i < bars.length; i++) {
    const interval = bars[i].time - bars[i - 1].time
    if (interval < minInterval) {
      minInterval = interval
    }
    
    // Yield periodically
    if (i % chunkSize === 0) {
      if (onProgress) onProgress(Math.round((i / bars.length) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }
  
  if (onProgress) onProgress(100)
  return { minInterval, stoppedEarly: false }
}

/**
 * Apply timezone conversion to bars asynchronously
 * @param {Array} bars - Array of bar objects
 * @param {number} timezoneOffset - Offset in hours from UTC
 * @param {Object} options - Options
 * @param {Function} options.onProgress - Progress callback (percent)
 * @returns {Promise<Array>} Converted bars
 */
export async function convertBarsTimezone(bars, timezoneOffset, options = {}) {
  const { onProgress } = options
  const converted = []
  const chunkSize = 10000
  
  for (let i = 0; i < bars.length; i++) {
    converted.push({
      ...bars[i],
      time: timestampToUTC(bars[i].time, timezoneOffset)
    })
    
    // Yield periodically
    if (i > 0 && i % chunkSize === 0) {
      if (onProgress) onProgress(Math.round((i / bars.length) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }
  
  if (onProgress) onProgress(100)
  return converted
}