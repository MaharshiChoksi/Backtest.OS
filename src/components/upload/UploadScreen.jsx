import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { FONT } from '../../constants'
import { parseDelimited, parseParquet, cacheData, loadCachedData, detectMapping, rowToBar } from '../../utils/parser'
import { generateSampleBars } from '../../utils/format'
import { searchSymbol, getAccountDefaults } from '../../utils/symbolUtils'
import { detectTimeframe, aggregateBars, getTimeframeMs } from '../../utils/tradingUtils'
import { mkInp, mkLabel, mkSectionHead, pill } from '../ui/atoms'

const STEPS = {
  UPLOAD: 'upload',
  MAPPING: 'mapping',
  SYMBOL: 'symbol',
  ACCOUNT: 'account',
}

export function UploadScreen() {
  const C = useTheme()
  const loadSession = useSimStore((s) => s.loadSession)
  const setSymbolConfig = useSimStore((s) => s.setSymbolConfig)
  const setAccountConfig = useSimStore((s) => s.setAccountConfig)
  const setTimeframe = useSimStore((s) => s.setTimeframe)

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [drag, setDrag] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const fileRef = useRef()

  // Symbol step state
  const [symbolInput, setSymbolInput] = useState('')
  const [foundSymbol, setFoundSymbol] = useState(null)
  const [symbolConfig, setSymbolConfigState] = useState(null)

  // Account step state
  const [accountDefaults, setAccountDefaults] = useState(null)
  const [accountForm, setAccountForm] = useState({
    starting_balance: 10000,
    spread: 2,
    commission: 3,
    leverage: 100,
    margin_required: 1000,
  })

  // Timeframe & date range state
  const [detectedTimeframe, setDetectedTimeframe] = useState(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState(null)
  const [selectedTimeframes, setSelectedTimeframes] = useState([])
  const [availableDateRange, setAvailableDateRange] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // Timeframe options (must match getTimeframeMs format): lowercase like '1m', '5m', etc
  const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
  const tfDisplayMap = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D1' }

  const bars = useRef([])

  useEffect(() => {
    getAccountDefaults().then(setAccountDefaults)
  }, [])

  const processFile = (file) => {
    if (!file) return
    setFileName(file.name)
    setError('')
    setProcessing(true)

    const isParquet = file.name.toLowerCase().endsWith('.parquet')
    const reader = new FileReader()

    reader.onload = async (e) => {
      setProcessing(false)
      let result

      if (isParquet) {
        result = await parseParquet(e.target.result)
      } else {
        result = parseDelimited(e.target.result)
      }

      if (!result) {
        setError(`Could not parse file — please check the format (${isParquet ? 'Parquet' : 'CSV'}).`)
        return
      }
      setParsed(result)
      setMapping(detectMapping(result.headers))
      setStep(STEPS.MAPPING)
    }

    if (isParquet) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    processFile(e.dataTransfer.files[0])
  }

  const handleValidateMapping = async () => {
    try {
      setStatus('✓ Validating data…')
      setError('')
      setProcessing(true)

      const validatedBars = parsed.rows
        .map((r) => rowToBar(r, mapping))
        .filter(Boolean)
        .sort((a, b) => a.time - b.time)
      const unique = validatedBars.filter((b, i) => i === 0 || b.time !== validatedBars[i - 1].time)

      if (unique.length < 20) {
        setError('Too few valid bars — check column mapping.')
        setStatus('')
        setProcessing(false)
        return
      }

      bars.current = unique
      setStatus('💾 Caching data…')
      
      await cacheData(fileName, parsed.headers, parsed.rows)
      
      setStatus('')
      setProcessing(false)
      setStep(STEPS.SYMBOL)
    } catch (err) {
      setStatus('')
      setProcessing(false)
      setError('Error validating/caching data: ' + err.message)
    }
  }

  const handleSearchSymbol = async () => {
    if (!symbolInput.trim()) {
      setError('Please enter a symbol name.')
      return
    }

    setProcessing(true)
    const found = await searchSymbol(symbolInput)
    setProcessing(false)

    if (!found) {
      setError(`Symbol "${symbolInput}" not found. Please check the name.`)
      setFoundSymbol(null)
      setSymbolConfigState(null)
      return
    }

    setError('')
    setFoundSymbol(found)
    setSymbolConfigState({ ...found })
  }

  const handleConfirmSymbol = () => {
    if (!symbolConfig) {
      setError('Please select a valid symbol.')
      return
    }
    setError('')
    // Update account form with margin_required from symbol config
    setAccountForm((prev) => ({
      ...prev,
      margin_required: symbolConfig.margin_required || 1000,
      leverage: symbolConfig.leverage || 100,
    }))

    // Detect timeframe and set date range
    const detected = detectTimeframe(bars.current)
    setDetectedTimeframe(detected)
    setSelectedTimeframe(detected)
    setSelectedTimeframes([detected])

    if (bars.current.length > 0) {
      const firstBar = bars.current[0]
      const lastBar = bars.current[bars.current.length - 1]
      
      setAvailableDateRange({ 
        startTime: new Date(firstBar.time), 
        endTime: new Date(lastBar.time) 
      })
      setStartDate(new Date(firstBar.time).toISOString().split('T')[0])
      setEndDate(new Date(lastBar.time).toISOString().split('T')[0])
    }

    setStep(STEPS.ACCOUNT)
  }
  
  const handleToggleTimeframe = (tf) => {
    setSelectedTimeframes(curr => {
      if (curr.includes(tf)) {
        return curr.filter(x => x !== tf)
      } else {
        if (curr.length < 3) {
          return [...curr, tf]
        }
        return curr
      }
    })
  }

  const handleStartBacktest = async () => {
    if (!selectedTimeframes || selectedTimeframes.length === 0) {
      setError('Please select at least one timeframe.')
      return
    }

    if (!startDate || !endDate) {
      setError('Please select start and end dates.')
      return
    }

    try {
      setProcessing(true)
      setError('')
      setStatus('🔄 Preparing backtest...')
      
      // Ensure symbol and account config are set
      if (!symbolConfig) {
        setError('Symbol config is missing!')
        setProcessing(false)
        setStatus('')
        return
      }
      
      setSymbolConfig(symbolConfig)
      setAccountConfig(accountForm)
      
      setStatus('📊 Filtering data by date range...')
      const startTimestamp = new Date(startDate).getTime()
      const endTimestamp = new Date(endDate).getTime() + 86400000

      const filteredBars = bars.current.filter(
        (b) => b.time >= startTimestamp && b.time <= endTimestamp
      )

      console.log('🔍 Filtered bars:', filteredBars.length, 'from', bars.current.length)

      if (filteredBars.length < 20) {
        setError('Selected date range has too few bars (minimum 20 required).')
        setProcessing(false)
        setStatus('')
        return
      }

      setStatus('⚙️ Aggregating timeframes...')
      const detectedMs = getTimeframeMs(detectedTimeframe)
      const barsMap = {}
      
      selectedTimeframes.forEach(tf => {
        const tfMs = getTimeframeMs(tf)
        console.log('Processing timeframe:', tf, 'ms:', tfMs, 'vs detected:', detectedMs)
        
        if (tfMs >= detectedMs) {
          if (tfMs === detectedMs) {
            barsMap[tf] = filteredBars
          } else {
            barsMap[tf] = aggregateBars(filteredBars, detectedMs, tfMs)
          }
        } else {
          barsMap[tf] = filteredBars
        }
        console.log('  →', tf, 'bars:', barsMap[tf].length)
      })

      console.log('📦 Final barsMap:', Object.keys(barsMap).map(k => `${k}:${barsMap[k].length}`).join(', '))
      
      setStatus('💾 Caching data...')
      if (parsed?.headers && parsed?.rows) {
        await cacheData(fileName, parsed.headers, parsed.rows)
      }

      setStatus('🚀 Loading session...')
      setTimeframe(selectedTimeframes[0])
      useSimStore.getState().loadMultiTimeframeSession(barsMap, selectedTimeframes, fileName)
      
      console.log('✅ Backtest started successfully!')
      setStatus('')
      setProcessing(false)
      // App should navigate to Workspace automatically
    } catch (err) {
      setProcessing(false)
      setStatus('')
      console.error('❌ Error:', err)
      setError('Error starting backtest: ' + err.message)
    }
  }

  const inp = mkInp(C)
  const lbl = mkLabel(C)
  const head = mkSectionHead(C)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 15, color: C.muted, letterSpacing: '5px', textTransform: 'uppercase', marginBottom: 8 }}>
          MULTI-SYMBOL
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: C.text }}>
          BACKTEST<span style={{ color: C.amber }}>.</span>OS
        </div>
        <div style={{ fontSize: 12, color: C.muted, letterSpacing: '2px', marginTop: 6 }}>
          SIMULATION ENGINE · MARKET REPLAY
        </div>
        <div style={{ width: 40, height: 1, background: C.amber + '50', margin: '18px auto 0' }} />
      </div>

      {/* Progress steps */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 40, alignItems: 'center' }}>
        {Object.values(STEPS).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: step === s ? C.amber : C.surf2,
                border: `1px solid ${step === s ? C.amber : C.border2}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: step === s ? '#000' : C.muted,
              }}
            >
              {i + 1}
            </div>
            {i < Object.values(STEPS).length - 1 && (
              <div
                style={{ width: 20, height: 1, background: C.border2, margin: '0 4px' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* UPLOAD STEP */}
      {step === STEPS.UPLOAD && !parsed && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            onClick={() => fileRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            style={{
              width: '100%',
              height: '100%',
              border: `1.5px dashed ${drag ? C.amber : C.border2}`,
              borderRadius: 12,
              padding: '20px 0 20px 0',
              gap: '5px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all .2s',
              background: drag ? C.amber + '08' : C.surf,
            }}
          >
            {processing ? (
              <div style={{ color: C.muted, fontSize: 12 }}>Parsing file…</div>
            ) : (
              <>
                <div style={{ color: drag ? C.amber : C.text, fontSize: 14, marginBottom: 8, padding: '10px' }}>
                  Drop OHLCV data file here
                </div>
                <div style={{ color: C.muted, fontSize: 11, padding: '5px' }}>CSV · TSV · TXT · Parquet</div>
                <div
                  style={{
                    marginTop: 18,
                    padding: '5px 20px',
                    border: `1px solid ${C.border2}`,
                    borderRadius: 4,
                    color: C.muted,
                    fontSize: 11,
                  }}
                >
                  click to browse
                </div>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.parquet"
            style={{ display: 'none' }}
            onChange={(e) => processFile(e.target.files[0])}
          />

          <div style={{ color: C.muted, fontSize: 10 }}>— or —</div>

          <button
            onClick={() => {
              const sampleBars = generateSampleBars(2000)
              bars.current = sampleBars
              setFileName('EURUSD_H1_sample.csv')
              setStep(STEPS.SYMBOL)
            }}
            style={{
              padding: '9px 28px',
              background: C.surf,
              border: `1px solid ${C.border2}`,
              color: C.text,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: FONT,
              transition: 'border-color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.amber)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border2)}
          >
            Load sample EURUSD H1 data (2 000 bars)
          </button>

          <div style={{ color: C.dim, fontSize: 10, textAlign: 'center' }}>
            MT5 history · TradingView export · Dukascopy · NinjaTrader · Parquet · any OHLCV CSV
          </div>
        </div>
      )}

      {/* MAPPING STEP */}
      {step === STEPS.MAPPING && parsed && (
        <div style={{ width: '100%', maxWidth: 1000 }}>
          {/* File info bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={pill(C.amber)}>{fileName}</span>
            <span style={{ color: C.muted, fontSize: 11 }}>
              {parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} cols
            </span>
            <button
              onClick={() => {
                setParsed(null)
                setFileName('')
                setError('')
                setStep(STEPS.UPLOAD)
              }}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: `1px solid ${C.border2}`,
                color: C.muted,
                padding: '4px 14px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: FONT,
              }}
            >
              ← choose another file
            </button>
          </div>

          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 14 }}>
            <span style={head}>Column Mapping</span>
            {mapping.date && mapping.timeOfDay && (
              <div
                style={{
                  fontSize: 11,
                  color: C.amber,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: C.amber + '10',
                  borderRadius: 4,
                  border: `1px solid ${C.amber}40`,
                }}
              >
                ✓ Date and time columns will be merged: {mapping.date} + {mapping.timeOfDay}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
              <div>
                <label style={lbl}>time</label>
                <select
                  value={mapping.time || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, time: e.target.value, date: '', timeOfDay: '' }))}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="">— combined datetime —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {!mapping.time && (
                <div>
                  <label style={lbl}>date</label>
                  <select
                    value={mapping.date || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, date: e.target.value }))}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="">— none —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!mapping.time && (
                <div>
                  <label style={lbl}>time (HH:MM:SS)</label>
                  <select
                    value={mapping.timeOfDay || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, timeOfDay: e.target.value }))}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="">— none —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {['open', 'high', 'low', 'close', 'volume'].map((col) => (
                <div key={col}>
                  <label style={lbl}>{col}</label>
                  <select
                    value={mapping[col] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="">— none —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
              <span style={head}>Data Preview — First 10 rows</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ background: C.surf2 }}>
                    {parsed.headers.map((h) => {
                      const as = Object.entries(mapping).find(([, v]) => v === h)?.[0]
                      return (
                        <th
                          key={h}
                          style={{
                            padding: '8px 14px',
                            textAlign: 'left',
                            color: C.muted,
                            borderBottom: `1px solid ${C.border}`,
                            fontWeight: 400,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                          {as && <span style={{ ...pill(C.amber), marginLeft: 6 }}>{as}</span>}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((row, i) => (
                    <tr key={i} style={{ background: i % 2 ? C.surf2 + '88' : 'transparent' }}>
                      {parsed.headers.map((h) => (
                        <td
                          key={h}
                          style={{
                            padding: '5px 14px',
                            color: C.text,
                            whiteSpace: 'nowrap',
                            borderBottom: `1px solid ${C.border}22`,
                          }}
                        >
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div style={{ color: C.red, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>
          )}

          {status && (
            <div
              style={{
                color: C.amber,
                fontSize: 11,
                marginBottom: 12,
                padding: '8px 12px',
                background: C.amber + '10',
                borderRadius: 4,
                border: `1px solid ${C.amber}40`,
              }}
            >
              {status}
            </div>
          )}

          <button
            onClick={handleValidateMapping}
            disabled={processing}
            style={{
              background: processing ? C.muted : C.amber,
              border: 'none',
              color: '#000',
              padding: '11px 36px',
              borderRadius: 6,
              cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontFamily: FONT,
              fontWeight: 700,
              letterSpacing: '1px',
              opacity: processing ? 0.6 : 1,
            }}
          >
            {processing ? status || '⏳ Processing…' : 'VALIDATE & CONTINUE'} →
          </button>
        </div>
      )}

      {/* SYMBOL STEP */}
      {step === STEPS.SYMBOL && (
        <div style={{ width: '100%', maxWidth: 600 }}>
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28, marginBottom: 20 }}>
            <span style={head}>Select Trading Symbol</span>
            <p style={{ color: C.muted, fontSize: 12, marginTop: 8, marginBottom: 16 }}>
              Enter the symbol name from the config (e.g., EURUSD, GBPUSD, XAUUSD)
            </p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <input
                type="text"
                placeholder="e.g., EURUSD"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchSymbol()}
                style={{
                  ...inp,
                  flex: 1,
                  padding: '10px 12px',
                }}
              />
              <button
                onClick={handleSearchSymbol}
                disabled={processing}
                style={{
                  background: processing ? C.muted : C.amber,
                  border: 'none',
                  color: '#000',
                  padding: '10px 24px',
                  borderRadius: 4,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontFamily: FONT,
                  fontWeight: 600,
                }}
              >
                {processing ? '⏳' : 'Search'}
              </button>
            </div>

            {foundSymbol && (
              <div style={{ background: C.surf2, border: `1px solid ${C.amber}40`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>
                  ✓ Found: {foundSymbol.symbol}
                </div>

                {symbolConfig && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { key: 'full_name', label: 'Full Name' },
                      { key: 'base_currency', label: 'Base Currency' },
                      { key: 'quote_currency', label: 'Quote Currency' },
                      { key: 'pip_size', label: 'Pip Size' },
                      { key: 'pip_value', label: 'Pip Value' },
                      { key: 'contract_size', label: 'Contract Size' },
                      { key: 'leverage', label: 'Leverage' },
                      { key: 'margin_required', label: 'Margin Required (USD)' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label style={{ ...lbl, marginBottom: 4 }}>{label}</label>
                        <input
                          type="text"
                          value={symbolConfig[key] || ''}
                          onChange={(e) =>
                            setSymbolConfigState((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          style={{ ...inp }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setStep(STEPS.MAPPING)
                  setError('')
                }}
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.border2}`,
                  color: C.text,
                  padding: '10px 24px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: FONT,
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleConfirmSymbol}
                disabled={!symbolConfig || processing}
                style={{
                  background: !symbolConfig ? C.muted : C.amber,
                  border: 'none',
                  color: '#000',
                  padding: '10px 24px',
                  borderRadius: 4,
                  cursor: !symbolConfig ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontFamily: FONT,
                  fontWeight: 600,
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT STEP */}
      {step === STEPS.ACCOUNT && (
        <div style={{ width: '100%', maxWidth: 600 }}>
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28 }}>
            <span style={head}>Account & Backtest Configuration</span>
            <p style={{ color: C.muted, fontSize: 12, marginTop: 8, marginBottom: 20 }}>
              Set your trading account parameters and backtest period
            </p>

            {/* Account Parameters */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 12 }}>Trading Account</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Starting Balance (USD)</label>
                  <input
                    type="number"
                    value={accountForm.starting_balance}
                    onChange={(e) =>
                      setAccountForm((prev) => ({
                        ...prev,
                        starting_balance: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{ ...inp }}
                  />
                </div>
                <div>
                  <label style={lbl}>Spread (pips)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={accountForm.spread}
                    onChange={(e) =>
                      setAccountForm((prev) => ({
                        ...prev,
                        spread: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{ ...inp }}
                  />
                </div>
                <div>
                  <label style={lbl}>Commission (USD per Contract)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={accountForm.commission}
                    onChange={(e) =>
                      setAccountForm((prev) => ({
                        ...prev,
                        commission: parseFloat(e.target.value) || 0,
                      }))
                    }
                    style={{ ...inp }}
                  />
                </div>
                <div>
                  <label style={lbl}>Leverage</label>
                  <input
                    type="number"
                    value={accountForm.leverage}
                    onChange={(e) =>
                      setAccountForm((prev) => ({
                        ...prev,
                        leverage: parseFloat(e.target.value) || 1,
                      }))
                    }
                    style={{ ...inp }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: C.surf2,
                  padding: 12,
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: 11,
                  color: C.muted,
                }}
              >
                <div style={{ marginBottom: 6 }}>
                  <strong>Margin Required:</strong> {accountForm.margin_required} USD (from symbol config)
                </div>
                <div>
                  <strong>Estimated Max Position:</strong> ${(
                    (accountForm.starting_balance / accountForm.margin_required) * 100000
                  ).toFixed(0)}
                </div>
              </div>
            </div>

            {/* Date Range Selection */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 12 }}>Backtest Period</div>
              {availableDateRange && (
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                  Available: {availableDateRange.startTime.toLocaleDateString()} to {availableDateRange.endTime.toLocaleDateString()} ({bars.current.length.toLocaleString()} bars)
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lbl}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ ...inp }}
                  />
                </div>
                <div>
                  <label style={lbl}>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ ...inp }}
                  />
                </div>
              </div>
            </div>

            {/* Timeframe Selection (Multi-Select) */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Select Timeframes (up to 3)</div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 12 }}>
                {detectedTimeframe && <>Detected: <strong>{tfDisplayMap[detectedTimeframe] || detectedTimeframe}</strong></>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => handleToggleTimeframe(tf)}
                    style={{
                      padding: '10px',
                      border: `2px solid ${selectedTimeframes.includes(tf) ? C.amber : C.border2}`,
                      background: selectedTimeframes.includes(tf) ? C.amber + '20' : C.surf2,
                      borderRadius: 4,
                      cursor: selectedTimeframes.length >= 3 && !selectedTimeframes.includes(tf) ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontFamily: FONT,
                      fontWeight: selectedTimeframes.includes(tf) ? 600 : 400,
                      color: C.text,
                      opacity: selectedTimeframes.length >= 3 && !selectedTimeframes.includes(tf) ? 0.5 : 1,
                      transition: 'all .15s',
                    }}
                    disabled={selectedTimeframes.length >= 3 && !selectedTimeframes.includes(tf)}
                  >
                    {tfDisplayMap[tf] || tf}
                  </button>
                ))}
              </div>
              {selectedTimeframes.length > 0 && (
                <div
                  style={{
                    background: C.amber + '10',
                    padding: 10,
                    borderRadius: 4,
                    marginTop: 10,
                    fontSize: 10,
                    color: C.amber,
                    border: `1px solid ${C.amber}40`,
                  }}
                >
                  Selected: {selectedTimeframes.map(tf => tfDisplayMap[tf] || tf).join(', ')} ({selectedTimeframes.length} chart{selectedTimeframes.length !== 1 ? 's' : ''})
                </div>
              )}
            </div>

            {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}
            
            {status && (
              <div
                style={{
                  color: C.amber,
                  fontSize: 11,
                  marginBottom: 12,
                  padding: '8px 12px',
                  background: C.amber + '10',
                  borderRadius: 4,
                  border: `1px solid ${C.amber}40`,
                }}
              >
                {status}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setStep(STEPS.SYMBOL)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${C.border2}`,
                  color: C.text,
                  padding: '11px 28px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: FONT,
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleStartBacktest}
                disabled={processing}
                style={{
                  background: processing ? C.muted : C.amber,
                  border: 'none',
                  color: '#000',
                  padding: '11px 36px',
                  borderRadius: 4,
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontFamily: FONT,
                  fontWeight: 700,
                  opacity: processing ? 0.6 : 1,
                }}
              >
                {processing ? '⏳ Starting backtest…' : 'START BACKTEST'} →
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}