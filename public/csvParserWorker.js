/**
 * CSV Parser Web Worker
 * Runs heavy parsing on background thread to keep UI responsive
 * 
 * Usage:
 *   const worker = new Worker('/csvParserWorker.js')
 *   worker.postMessage({ type: 'parse', text: csvText, options: {...} })
 *   worker.onmessage = (e) => { if (e.data.type === 'progress') {...} else {...} }
 */

/**
 * Parse delimited text (CSV/TSV) in chunks to allow progress reporting
 */
function parseDelimited(text, options = {}) {
  const { chunkSize = 10000, onProgress } = options
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { headers: [], rows: [] }

  // Detect delimiter
  const first = lines[0]
  let delim = ',', best = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = first.split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const clean = (s) => s.trim().replace(/^["']|["']$/g, '')
  const headers = first.split(delim).map(clean)
  const rawRows = lines.slice(1)

  // Parse in chunks for progress reporting
  const rows = []
  const totalRows = rawRows.length
  let processed = 0

  for (let i = 0; i < rawRows.length; i++) {
    const l = rawRows[i]
    const obj = {}
    l.split(delim).map(clean).forEach((v, j) => { if (headers[j]) obj[headers[j]] = v })
    if (headers.some(h => obj[h])) rows.push(obj)
    
    processed++
    if (onProgress && processed % chunkSize === 0) {
      onProgress({ processed, total: totalRows, percent: Math.round((processed / totalRows) * 100) })
    }
  }

  return { headers, rows }
}

/**
 * Parse and convert to bars in a single pass with early termination
 * Returns headers AND bars in one go, stopping when maxBars is reached
 * @param {string} text - Raw CSV text
 * @param {Object} options - Options
 * @param {number} options.maxBars - Stop after this many valid bars
 * @param {number} options.chunkSize - Progress reporting interval
 * @param {Function} options.onProgress - Progress callback
 */
function parseAndConvertBars(text, options = {}) {
  const { maxBars = Infinity, chunkSize = 10000, onProgress } = options
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean)
  if (lines.length < 2) return { headers: [], rows: [], bars: [], stoppedEarly: false }

  // Detect delimiter
  const first = lines[0]
  let delim = ',', best = 0
  for (const d of [',', '\t', ';', '|']) {
    const n = first.split(d).length - 1
    if (n > best) { best = n; delim = d }
  }

  const clean = (s) => s.trim().replace(/^["']|["']$/g, '')
  const headers = first.split(delim).map(clean)
  
  // Detect mapping
  const mapping = detectMapping(headers)
  
  const rawRows = lines.slice(1)
  const totalRows = rawRows.length
  const rows = []  // Store raw rows for mapping phase
  const bars = []
  let processed = 0
  let validBarsCount = 0
  let stoppedEarly = false

  for (let i = 0; i < rawRows.length; i++) {
    const l = rawRows[i]
    const obj = {}
    l.split(delim).map(clean).forEach((v, j) => { if (headers[j]) obj[headers[j]] = v })
    if (headers.some(h => obj[h])) {
      rows.push(obj)
      
      // Convert to bar immediately
      let timeStr = obj[mapping.time]
      if (!timeStr && mapping.date && mapping.timeOfDay) {
        const date = obj[mapping.date]
        const timeOfDay = obj[mapping.timeOfDay]
        if (date && timeOfDay) timeStr = `${date} ${timeOfDay}`
      }
      
      const time = parseTS(timeStr)
      if (time) {
        const o = parseFloat(obj[mapping.open])
        const h = parseFloat(obj[mapping.high])
        const l = parseFloat(obj[mapping.low])
        const c = parseFloat(obj[mapping.close])
        if (![o, h, l, c].some(isNaN)) {
          const vol = parseFloat(obj[mapping.volume] || '0')
          bars.push({ time, open: o, high: h, low: l, close: c, volume: isNaN(vol) ? 0 : vol })
          validBarsCount++
          
          // Early termination - stop once we have enough bars
          if (validBarsCount >= maxBars) {
            stoppedEarly = true
            onProgress && onProgress({ processed: i + 1, total: totalRows, percent: 100, barsFound: validBarsCount, stoppedEarly: true, phase: 'complete' })
            return { headers, rows, bars, stoppedEarly: true }
          }
        }
      }
    }
    
    processed++
    if (onProgress && processed % chunkSize === 0) {
      const percent = Math.round((processed / totalRows) * 100)
      onProgress({ processed, total: totalRows, percent, barsFound: validBarsCount })
    }
  }

  onProgress && onProgress({ processed: totalRows, total: totalRows, percent: 100, barsFound: validBarsCount, stoppedEarly: false })
  return { headers, rows, bars, stoppedEarly: false }
}

/**
 * Parse timestamp string - optimized for worker
 */
function parseTS(str) {
  if (!str) return null
  str = String(str).trim()
  
  // Numeric timestamp (seconds or milliseconds)
  const n = Number(str)
  if (!isNaN(n) && n > 0) return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000)
  
  // MT5 dot format: "2020.01.02 00:00:00" → "2020-01-02T00:00:00"
  let normalized = str.replace(/(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')
  
  // Normalize space to T for ISO parsing
  normalized = normalized.replace(/(\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')
  
  const d = new Date(normalized)
  const result = d.getTime()
  
  if (!isNaN(result)) return result
  
  // Alternative formats
  const altFormats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/,
    /(\d{1,2})-(\d{1,2})-(\d{4})\s*(\d{2}:\d{2}:\d{2})?/,
  ]
  for (const fmt of altFormats) {
    const m = str.match(fmt)
    if (m) {
      const [, p1, p2, year, time] = m
      const d2 = new Date(`${year}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}T${time || '00:00:00'}`)
      const r = d2.getTime()
      if (!isNaN(r)) return r
    }
  }
  return null
}

/**
 * Detect column mapping
 */
function detectMapping(headers) {
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
    time: combined,
    date: combined ? '' : m('date'),
    timeOfDay: combined ? '' : m('time'),
    open: m('open', 'o'),
    high: m('high', 'h'),
    low: m('low', 'l'),
    close: m('close', 'last', 'c', 'price'),
    volume: m('volume', 'vol', 'tickvol', 'tick_vol', 'v'),
  }
}

/**
 * Convert rows to bar objects
 * @param {Array} rows - Array of row objects
 * @param {Object} mapping - Column mapping
 * @param {Object} options - Options including maxBars for early termination
 * @param {number} options.maxBars - Stop processing after this many valid bars
 * @param {number} options.chunkSize - Progress reporting interval
 * @param {Function} options.onProgress - Progress callback
 * @param {Function} options.onMaxBarsReached - Callback when maxBars limit is hit
 */
function rowsToBars(rows, mapping, options = {}) {
  const { maxBars = Infinity, chunkSize = 5000, onProgress, onMaxBarsReached } = options
  const bars = []
  const total = rows.length
  let validBarsCount = 0
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    
    // Get time value
    let timeStr = row[mapping.time]
    if (!timeStr && mapping.date && mapping.timeOfDay) {
      const date = row[mapping.date]
      const timeOfDay = row[mapping.timeOfDay]
      if (date && timeOfDay) timeStr = `${date} ${timeOfDay}`
    }
    
    const time = parseTS(timeStr)
    if (!time) continue
    
    const o = parseFloat(row[mapping.open])
    const h = parseFloat(row[mapping.high])
    const l = parseFloat(row[mapping.low])
    const c = parseFloat(row[mapping.close])
    if ([o, h, l, c].some(isNaN)) continue
    
    const vol = parseFloat(row[mapping.volume] || '0')
    bars.push({ time, open: o, high: h, low: l, close: c, volume: isNaN(vol) ? 0 : vol })
    validBarsCount++
    
    // Early termination - stop processing once we have enough bars
    if (validBarsCount >= maxBars) {
      // Report that we hit the limit
      if (onMaxBarsReached) {
        onMaxBarsReached({ 
          processed: i + 1, 
          total, 
          barsFound: validBarsCount,
          stoppedEarly: true 
        })
      }
      break
    }
    
    if (onProgress && (i + 1) % chunkSize === 0) {
      onProgress({ processed: i + 1, total, percent: Math.round(((i + 1) / total) * 100), barsFound: validBarsCount })
    }
  }
  
  return bars
}

/**
 * Convert bars to binary format (Float64Array) for efficient storage
 * Format: [time, open, high, low, close, volume] per bar
 */
function barsToBinary(bars) {
  const arr = new Float64Array(bars.length * 6)
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    const idx = i * 6
    arr[idx] = b.time
    arr[idx + 1] = b.open
    arr[idx + 2] = b.high
    arr[idx + 3] = b.low
    arr[idx + 4] = b.close
    arr[idx + 5] = b.volume
  }
  return arr
}

// Message handler
self.onmessage = async function(e) {
  const { type, id, payload } = e.data
  
  try {
    switch (type) {
      case 'parse': {
        const { text, options = {} } = payload
        const maxBars = options.maxBars || Infinity
        
        // Use optimized single-pass parsing when maxBars is specified
        // This parses AND converts in one go with early termination
        if (maxBars !== Infinity) {
          self.postMessage({ type: 'phase', id, phase: 'parsing', message: 'Parsing & converting...' })
          const result = parseAndConvertBars(text, {
            maxBars,
            chunkSize: 10000,
            onProgress: (p) => {
              const message = p.stoppedEarly 
                ? `Limit reached (${p.barsFound?.toLocaleString()} bars)` 
                : `Parsed ${p.percent}%`
              self.postMessage({ type: 'progress', id, ...p, message, phase: 'complete' })
            }
          })
          
          self.postMessage({ type: 'phase', id, phase: 'optimizing', message: 'Optimizing data...' })
          const binaryData = barsToBinary(result.bars)
          
          self.postMessage({
            type: 'complete',
            id,
            result: {
              headers: result.headers,
              mapping: detectMapping(result.headers),
              bars: result.bars,
              binaryData: binaryData.buffer,
              rowCount: result.rows.length,
              barCount: result.bars.length,
              stoppedEarly: result.stoppedEarly,
              maxBarsLimit: maxBars
            }
          }, [binaryData.buffer])
        } else {
          // Original multi-phase parsing for unlimited bars
          // Phase 1: Parse CSV
          self.postMessage({ type: 'phase', id, phase: 'parsing', message: 'Parsing CSV...' })
          const { headers, rows } = parseDelimited(text, {
            chunkSize: 10000,
            onProgress: (p) => self.postMessage({ type: 'progress', id, ...p, phase: 'parsing' })
          })
          
          // Phase 2: Detect mapping
          self.postMessage({ type: 'phase', id, phase: 'mapping', message: 'Detecting columns...' })
          const mapping = detectMapping(headers)
          
          // Track if we stopped early due to maxBars
          let stoppedEarly = false
          
          // Phase 3: Convert to bars (with early termination support)
          self.postMessage({ type: 'phase', id, phase: 'converting', message: 'Converting to bars...' })
          const bars = rowsToBars(rows, mapping, {
            maxBars,
            chunkSize: 10000,
            onProgress: (p) => self.postMessage({ type: 'progress', id, ...p, phase: 'converting' }),
            onMaxBarsReached: (info) => {
              stoppedEarly = true
              self.postMessage({ type: 'progress', id, ...info, phase: 'converting', stoppedEarly: true })
            }
          })
          
          // Phase 4: Convert to binary
          self.postMessage({ type: 'phase', id, phase: 'optimizing', message: 'Optimizing data...' })
          const binaryData = barsToBinary(bars)
          
          // Return result
          self.postMessage({
            type: 'complete',
            id,
            result: {
              headers,
              mapping,
              bars,
              binaryData: binaryData.buffer,
              rowCount: rows.length,
              barCount: bars.length,
              stoppedEarly,
              maxBarsLimit: null
            }
          }, [binaryData.buffer])
          break
        }
      }
      
      case 'parseParquet': {
        // For parquet, we'd need to load arrow-js in worker
        // For now, just acknowledge and let main thread handle it
        self.postMessage({ type: 'error', id, message: 'Parquet parsing not implemented in worker yet' })
        break
      }
      
      default:
        self.postMessage({ type: 'error', id, message: `Unknown command: ${type}` })
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message, stack: error.stack })
  }
}
