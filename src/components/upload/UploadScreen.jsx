import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useIndicatorStore as useIndStore } from '../../store/useIndicatorStore'
import { FONT } from '../../constants'
import { parseDelimitedAsync, parseParquet, parseCSVWithWorker, cacheData, detectMapping, rowsToBarsLimited, validateTimeIntervals, convertBarsTimezone, clearCache } from '../../utils/parser'
import { generateSampleBars } from '../../utils/format'
import { searchSymbol, getAccountDefaults } from '../../utils/symbolUtils'
import { detectTimeframe, aggregateBars, getTimeframeMs } from '../../utils/tradingUtils'
import { mkInp, mkLabel, mkSectionHead, pill } from '../ui/atoms'

const STEPS = {
  UPLOAD: 'upload',
  MAPPING: 'mapping',
  SYMBOL: 'symbol',
  INDICATORS: 'indicators',
  ACCOUNT: 'account',
}

const MAX_BARS = 1_000_000  // Maximum bars to load (1 million) for performance with 3 multi-timeframe charts

// Timezone options for data source
// Default is UTC, but MT4/MT5 brokers often use broker server time (e.g., GMT+2 or GMT+3)
// This affects how bars are displayed and future session-based features (LONDON, NY, TOKYO sessions, etc.)
export const TIMEZONE_OPTIONS = [
  // UTC
  { label: 'UTC (GMT+0)', value: 0 },

  // European Timezones
  { label: 'GMT+1 (London Winter)', value: 1 },
  { label: 'GMT+2 (Cairo/Moscow)', value: 2 },
  { label: 'GMT+3 (Moscow/Istanbul)', value: 3 },
  { label: 'GMT+4 (Dubai)', value: 4 },

  // Asian Timezones
  { label: 'GMT+5 (Karachi)', value: 5 },
  { label: 'GMT+5:30 (Kolkata/Delhi)', value: 5.5 },
  { label: 'GMT+5:45 (Kathmandu)', value: 5.75 },
  { label: 'GMT+6 (Dhaka)', value: 6 },
  { label: 'GMT+6:30 (Yangon)', value: 6.5 },
  { label: 'GMT+7 (Bangkok/Jakarta)', value: 7 },
  { label: 'GMT+8 (Singapore/HK/Beijing)', value: 8 },
  { label: 'GMT+9 (Tokyo/Seoul)', value: 9 },
  { label: 'GMT+9:30 (Adelaide)', value: 9.5 },
  { label: 'GMT+10 (Sydney/Brisbane)', value: 10 },
  { label: 'GMT+11 (Solomon Islands)', value: 11 },
  { label: 'GMT+12 (Auckland)', value: 12 },
  { label: 'GMT+13 (Fiji Summer)', value: 13 },
  { label: 'GMT+14 (Kiribati)', value: 14 },

  // American Timezones
  { label: 'GMT-1 (Azores)', value: -1 },
  { label: 'GMT-2 (Mid-Atlantic)', value: -2 },
  { label: 'GMT-3 (São Paulo/Buenos Aires)', value: -3 },
  { label: 'GMT-3:30 (Newfoundland)', value: -3.5 },
  { label: 'GMT-4 (Halifax/Santiago)', value: -4 },
  { label: 'GMT-5 (New York/Toronto)', value: -5 },
  { label: 'GMT-6 (Chicago/Mexico City)', value: -6 },
  { label: 'GMT-7 (Denver/Phoenix)', value: -7 },
  { label: 'GMT-8 (Los Angeles/Seattle)', value: -8 },
  { label: 'GMT-9 (Alaska)', value: -9 },
  { label: 'GMT-10 (Hawaii)', value: -10 },
  { label: 'GMT-11 (American Samoa)', value: -11 },
  { label: 'GMT-12 (Baker Island)', value: -12 },
]

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
  const [progress, setProgress] = useState(0)  // Progress percentage (0-100)
  const [barLimitReached, setBarLimitReached] = useState(false)  // Track if we hit the 1M bar limit
  const [workerResult, setWorkerResult] = useState(null)  // Store worker parsing result for later use
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

  // Timezone state - default UTC
  const [selectedTimezone, setSelectedTimezone] = useState(0)  // Offset in hours from UTC

  // Indicator configuration state
  const [emaEnabled, setEmaEnabled] = useState(true)
  const [emaPeriods, setEmaPeriods] = useState([20, 50, 100])
  const [emaPeriodsInput, setEmaPeriodsInput] = useState('20, 50, 100')
  const [emaColors, setEmaColors] = useState(['#f59e0b', '#a855f7', '#3b82f6'])
  const [emaColorsInput, setEmaColorsInput] = useState('#f59e0b, #a855f7, #3b82f6')
  const [bbEnabled, setBbEnabled] = useState(false)
  const [bbPeriod, setBbPeriod] = useState(20)
  const [bbStdDev, setBbStdDev] = useState(2)
  const [rsiEnabled, setRsiEnabled] = useState(false)
  const [rsiPeriod, setRsiPeriod] = useState(14)

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
    setBarLimitReached(false)  // Reset bar limit flag for new file
    setStatus('Loading file...')
    setProgress(5)

    const isParquet = file.name.toLowerCase().endsWith('.parquet')
    const reader = new FileReader()

    reader.onload = async (e) => {
      let result

      if (isParquet) {
        setStatus('Parsing Parquet file...')
        setProgress(20)
        result = await parseParquet(e.target.result)
        setProgress(60)
      } else {
        const text = e.target.result
        const rowEstimate = text.split('\n').length

        // Use Web Worker for large files (>50k rows) to avoid UI lag
        if (rowEstimate > 50000) {
          setStatus('Parsing CSV (background processing)')
          setProgress(15)
          try {
            const parseResult = await parseCSVWithWorker(text, {
              maxBars: MAX_BARS,  // Early termination - don't process more than we need
              onProgress: (p) => {
                // Map worker progress (0-100) to overall progress (15-75%)
                const mappedProgress = 15 + Math.round((p.percent || 0) * 0.6)
                setProgress(mappedProgress)
                // Show bar count in progress message
                const barInfo = p.barsFound ? ` (${p.barsFound.toLocaleString()} bars)` : ''
                const earlyInfo = p.stoppedEarly ? ' [LIMIT REACHED]' : ''
                setStatus(`${p.message} ${p.percent}%${barInfo}${earlyInfo}`)
              }
            })
            setProgress(75)
            setStatus('Finalizing data...')
            result = { headers: parseResult.headers, rows: [] }  // Only need headers for mapping
            // Store bars for later use
            if (parseResult.bars) {
              bars.current = parseResult.bars
            }
            // Track if we stopped early due to maxBars limit
            if (parseResult.stoppedEarly) {
              setBarLimitReached(true)
            }
            // Store worker result for later use
            setWorkerResult(parseResult)
          } catch (err) {
            console.error('Worker parsing failed, falling back to main thread:', err)
            setStatus('Falling back to standard parsing...')
            setProgress(15)
            result = await parseDelimitedAsync(text, {
              onProgress: (percent) => {
                // Map 15-60% for this phase
                setProgress(15 + Math.round(percent * 0.45))
              }
            })
            setProgress(60)
          }
        } else {
          setStatus('Parsing CSV...')
          setProgress(15)
          // Use async parsing for progress updates
          result = await parseDelimitedAsync(text, {
            onProgress: (percent) => {
              // Map 15-60% for this phase
              setProgress(15 + Math.round(percent * 0.45))
            }
          })
          setProgress(60)
        }
      }

      setProgress(80)
      setStatus('Preparing columns...')

      if (!result) {
        setProcessing(false)
        setProgress(0)
        setStatus('')
        setError(`Could not parse file — please check the format (${isParquet ? 'Parquet' : 'CSV'}).`)
        return
      }

      setProgress(100)
      setTimeout(() => {
        setParsed(result)
        setMapping(detectMapping(result.headers))
        setProcessing(false)
        setProgress(0)
        setStatus('')
        setStep(STEPS.MAPPING)
      }, 200)  // Brief delay to show 100% before transitioning
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
      setStatus('Validating data...')
      setProgress(10)
      setError('')
      setProcessing(true)

      let validatedBars
      let stoppedEarly = false

      // If we have pre-parsed bars from Web Worker, filter them by the mapping
      if (workerResult && workerResult.bars && workerResult.bars.length > 0) {
        setStatus('Filtering data...')
        setProgress(30)
        // Bars are already parsed, just sort and dedupe
        validatedBars = [...workerResult.bars]
          .sort((a, b) => a.time - b.time)
          .filter((b, i, arr) => i === 0 || b.time !== arr[i - 1].time)
        setProgress(50)
      } else {
        // Fall back to main-thread parsing with early termination
        setStatus('Converting rows to bars...')
        setProgress(25)

        // Use rowsToBarsLimited for early termination - stops when MAX_BARS reached
        const result = await rowsToBarsLimited(parsed.rows, mapping, {
          maxBars: MAX_BARS,
          onProgress: (percent) => {
            // Map 25-45% for this phase
            setProgress(25 + Math.round(percent * 0.2))
          }
        })

        validatedBars = result.bars
          .sort((a, b) => a.time - b.time)
        setProgress(45)

        // Remove duplicates
        const unique = validatedBars.filter((b, i) => i === 0 || b.time !== validatedBars[i - 1].time)
        validatedBars = unique
        setProgress(50)

        // Track if we stopped early
        stoppedEarly = result.stoppedEarly
        if (stoppedEarly) {
          setBarLimitReached(true)
        }
      }

      if (validatedBars.length < 20) {
        setError('Too few valid bars — check column mapping.')
        setStatus('')
        setProgress(0)
        setProcessing(false)
        return
      }

      setStatus('Validating time intervals...')
      setProgress(55)

      // Validate minimum 1-minute bar interval asynchronously (reject tick data)
      const { minInterval } = await validateTimeIntervals(validatedBars, {
        onProgress: (percent) => {
          // Map 55-65% for this phase
          setProgress(55 + Math.round(percent * 0.1))
        }
      })

      const MIN_INTERVAL_MS = 60000 // 1 minute
      if (minInterval < MIN_INTERVAL_MS) {
        setError(`Data resolution is too high (${(minInterval / 1000).toFixed(0)}s between bars). Minimum supported interval is 1 minute. Tick data is incompatible.`)
        setStatus('')
        setProgress(0)
        setProcessing(false)
        return
      }

      setProgress(65)
      // Enforce bar limit for performance (loading 3 multi-timeframe charts simultaneously)
      let finalBars = validatedBars
      if (validatedBars.length > MAX_BARS) {
        finalBars = validatedBars.slice(0, MAX_BARS)
        setBarLimitReached(true)
      }

      // Apply timezone conversion to bars asynchronously (if not UTC)
      // Convert from data timezone to UTC for storage
      if (selectedTimezone !== 0) {
        setStatus('Converting timezone...')
        setProgress(67)
        finalBars = await convertBarsTimezone(finalBars, selectedTimezone, {
          onProgress: (percent) => {
            // Map 67-75% for this phase
            setProgress(67 + Math.round(percent * 0.08))
          }
        })
      }

      bars.current = finalBars
      setStatus('Caching data...')
      setProgress(75)

      // Force a re-render before starting the heavy work
      await new Promise(r => setTimeout(r, 50))

      // Cache with binary format for faster reload
      await cacheData(fileName, parsed.headers, parsed.rows, finalBars, {
        useBinary: true,
        onProgress: (p) => {
          // Map 75-95% for caching phase
          setProgress(75 + Math.round((p.percent || 0) * 0.2))
          if (p.message) setStatus(p.message)
        }
      })
      setProgress(95)

      setProgress(100)
      setTimeout(() => {
        setStatus('')
        setProgress(0)
        setProcessing(false)
        setWorkerResult(null)  // Clear worker result after use
        setStep(STEPS.SYMBOL)
      }, 200)
    } catch (err) {
      setStatus('')
      setProgress(0)
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

    const normalizedBaseUsdRate = symbolConfig.base_usd_rate !== undefined && symbolConfig.base_usd_rate !== ''
      ? parseFloat(symbolConfig.base_usd_rate)
      : undefined

    if (symbolConfig.quote_currency !== 'USD' && !normalizedBaseUsdRate) {
      setError('Please enter the Base/USD rate for this exotic pair.')
      return
    }

    const symbolConfigWithBaseRate = {
      ...symbolConfig,
      base_usd_rate: normalizedBaseUsdRate,
    }

    setSymbolConfigState(symbolConfigWithBaseRate)
    setError('')
    // Update account form with margin_required from symbol config
    setAccountForm((prev) => ({
      ...prev,
      margin_required: symbolConfigWithBaseRate.margin_required || 1000,
      leverage: symbolConfigWithBaseRate.leverage || 100,
    }))

    // Detect timeframe and set date range
    const detected = detectTimeframe(bars.current)
    setDetectedTimeframe(detected)
    setSelectedTimeframe(detected)
    setSelectedTimeframes([detected])

    // Reset timezone to default (UTC) when confirming symbol
    setSelectedTimezone(2)
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

    setStep(STEPS.INDICATORS)
  }

  const handleContinueToAccount = () => {
    // Parse and save indicator config to store
    const { setEmaConfig, setBbConfig, setRsiConfig } = useIndStore.getState()
    
    // Parse EMA periods from input
    const periodVals = emaPeriodsInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    if (periodVals.length > 0) {
      setEmaPeriods(periodVals)
    }
    
    // Parse EMA colors from input
    const colorVals = emaColorsInput.split(',').map(s => s.trim()).filter(c => c.match(/^#[0-9a-fA-F]{6}$/))
    if (colorVals.length > 0) {
      setEmaColors(colorVals)
    }
    
    setEmaConfig(periodVals.length > 0 ? periodVals : emaPeriods, colorVals.length > 0 ? colorVals : emaColors)
    setBbConfig(bbPeriod, bbStdDev)
    setRsiConfig(rsiPeriod)
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

    // Validate that all selected timeframes are >= detected timeframe
    const detectedMs = getTimeframeMs(detectedTimeframe)
    const invalidTfs = selectedTimeframes.filter(tf => {
      const tfMs = getTimeframeMs(tf)
      return tfMs < detectedMs
    })

    if (invalidTfs.length > 0) {
      setError(`Cannot select timeframes lower than detected data resolution (${tfDisplayMap[detectedTimeframe] || detectedTimeframe}). Data cannot be downsampled. Please select only equal or higher timeframes.`)
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

      // Add timezone to symbolConfig
      const configWithTimezone = {
        ...symbolConfig,
        timezone: selectedTimezone,  // Offset in hours from UTC
        timezoneLabel: TIMEZONE_OPTIONS.find(tz => tz.value === selectedTimezone)?.label || 'UTC',
      }

      setSymbolConfig(configWithTimezone)
      setAccountConfig(accountForm)

      setStatus('📊 Filtering data by date range...')
      const startTimestamp = new Date(startDate).getTime()
      const endTimestamp = new Date(endDate).getTime() + 86400000
      useSimStore.getState().setBacktestDateRange(startDate, endDate)  // add this line


      const filteredBars = bars.current.filter(
        (b) => b.time >= startTimestamp && b.time <= endTimestamp
      )

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
        const displayKey = tfDisplayMap[tf] || tf  // Use display format as key (M1, M5, etc)

        if (tfMs >= detectedMs) {
          barsMap[displayKey] = tfMs === detectedMs
            ? filteredBars
            : aggregateBars(filteredBars, detectedMs, tfMs)
        } else {
          // Can't downsample - just use original (user should load higher resolution data)
          barsMap[displayKey] = filteredBars
        }
      })

      setStatus('💾 Caching data (binary format)...')
      if (parsed?.headers && parsed?.rows) {
        await cacheData(fileName, parsed.headers, parsed.rows, bars.current, { useBinary: true })
      }

      setStatus('🚀 Loading session...')
      setTimeframe(tfDisplayMap[selectedTimeframes[0]] || selectedTimeframes[0])  // Set with display format

      // Get timezone info
      const timezoneLabel = TIMEZONE_OPTIONS.find(tz => tz.value === selectedTimezone)?.label || 'UTC'

      useSimStore.getState().loadMultiTimeframeSession(
        barsMap,
        selectedTimeframes.map(tf => tfDisplayMap[tf] || tf),
        fileName,
        selectedTimezone,  // timezone offset in hours
        timezoneLabel  // display label
      )

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
      {/* Global styles for animations */}
      <style>{`
        @keyframes progressPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.95); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 17, color: C.muted, letterSpacing: '5px', textTransform: 'uppercase', marginBottom: 8 }}>
          MULTI-SYMBOL
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 4, color: C.text }}>
          BACKTEST<span style={{ color: C.amber }}>.</span>OS
        </div>
        <div style={{ fontSize: 14, color: C.muted, letterSpacing: '2px', marginTop: 6 }}>
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
            onClick={() => !processing && fileRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            style={{
              width: '100%',
              maxWidth: 500,
              height: processing ? 'auto' : 200,
              minHeight: 200,
              border: `1.5px dashed ${drag ? C.amber : C.border2}`,
              borderRadius: 12,
              padding: processing ? '40px 40px' : '20px 0',
              gap: '5px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: processing ? 'default' : 'pointer',
              transition: 'all .3s',
              background: drag ? C.amber + '08' : C.surf,
            }}
          >
            {processing ? (
              <div style={{ width: '100%', maxWidth: 350, textAlign: 'center' }}>
                {/* File name */}
                <div style={{
                  color: C.text,
                  fontSize: 13,
                  marginBottom: 16,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 350
                }}>
                  {fileName}
                </div>

                {/* Progress bar */}
                <div style={{
                  width: '100%',
                  height: 8,
                  background: C.surf2,
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginBottom: 12
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${C.amber}CC, ${C.amber})`,
                    borderRadius: 4,
                    transition: 'width 0.3s ease-out',
                    boxShadow: `0 0 10px ${C.amber}40`
                  }} />
                </div>

                {/* Progress percentage */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8
                }}>
                  <span style={{ color: C.amber, fontSize: 11, fontWeight: 600 }}>
                    {progress}%
                  </span>
                  <span style={{ color: C.muted, fontSize: 11 }}>
                    {status || 'Processing...'}
                  </span>
                </div>

                {/* Animated indicator */}
                <div style={{
                  color: C.amber,
                  fontSize: 12,
                  marginTop: 8
                }}>
                  <span style={{
                    animation: 'progressPulse 1.5s ease-in-out infinite',
                    display: 'inline-block'
                  }}>
                    ● Processing
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div style={{ color: drag ? C.amber : C.text, fontSize: 14, marginBottom: 8, padding: '10px' }}>
                  Drop OHLCV data file here
                </div>
                <div style={{ color: C.muted, fontSize: 13, padding: '5px' }}>CSV · TSV · TXT · Parquet</div>
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
                setBarLimitReached(false)
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
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
            <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>
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
            <p style={{ color: C.muted, fontSize: 14, marginTop: 8, marginBottom: 16 }}>
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
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>
                  ✓ Found: {foundSymbol.symbol}
                </div>

                {symbolConfig && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { key: 'full_name', label: 'Full Name' },
                        { key: 'base_currency', label: 'Base Currency' },
                        { key: 'quote_currency', label: 'Quote Currency' },
                        { key: 'base_usd_rate', label: 'Base/USD Rate' },
                        { key: 'pip_size', label: 'Pip Size' },
                        { key: 'pip_value', label: 'Pip Value' },
                        { key: 'contract_size', label: 'Contract Size' },
                        { key: 'leverage', label: 'Leverage' },
                        { key: 'margin_required', label: 'Margin Required (USD)' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ ...lbl, marginBottom: 4 }}>{label}</label>
                          <input
                            type={key === 'base_usd_rate' || key === 'pip_size' || key === 'pip_value' || key === 'contract_size' || key === 'leverage' || key === 'margin_required' ? 'number' : 'text'}
                            step={key === 'base_usd_rate' ? '0.0001' : 'any'}
                            min={key === 'base_usd_rate' ? '0' : undefined}
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
                    {symbolConfig.quote_currency !== 'USD' && (
                      <div style={{ gridColumn: '1 / -1', color: C.muted, fontSize: 12, marginTop: 8 }}>
                        Please enter the conversion rate for {symbolConfig.base_currency}/USD so margin is calculated in USD.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}

            <div style={{ display: 'flex', gap: 12 }}>
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

      {/* INDICATORS STEP */}
      {step === STEPS.INDICATORS && (
        <div style={{ width: '100%', maxWidth: 600 }}>
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 28, marginBottom: 20 }}>
            <span style={head}>Indicator Configuration</span>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 8, marginBottom: 16 }}>
              Configure indicators to display on the chart
            </p>

            {/* EMA Configuration */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div
                  onClick={() => setEmaEnabled(!emaEnabled)}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: emaEnabled ? C.amber : C.surf2,
                    border: `1px solid ${emaEnabled ? C.amber : C.border2}`,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all .2s',
                  }}
                >
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 2,
                    left: emaEnabled ? 22 : 2,
                    transition: 'left .2s',
                  }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>EMA (Exponential Moving Average)</div>
              </div>

              {emaEnabled && (
                <div style={{ paddingLeft: 56 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Periods (comma-separated, up to 3)</div>
                  <input
                    type="text"
                    value={emaPeriodsInput}
                    onChange={(e) => {
                      const val = e.target.value
                      setEmaPeriodsInput(val)
                      // Only update actual periods if the input is valid
                      const vals = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
                      if (vals.length <= 3) setEmaPeriods(vals)
                    }}
                    style={{ ...inp, width: '100%' }}
                    placeholder="20, 50, 100"
                  />
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4, marginBottom: 12 }}>
                    Current: {emaPeriods.join(', ')}
                  </div>

                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Colors (hex, comma-separated)</div>
                  <input
                    type="text"
                    value={emaColorsInput}
                    onChange={(e) => {
                      const val = e.target.value
                      setEmaColorsInput(val)
                      // Only update actual colors if the input is valid
                      const colors = val.split(',').map(s => s.trim()).filter(c => c.match(/^#[0-9a-fA-F]{6}$/))
                      if (colors.length <= 3) setEmaColors(colors)
                    }}
                    style={{ ...inp, width: '100%' }}
                    placeholder="#f59e0b, #a855f7, #3b82f6"
                  />
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                    Current: {emaColors.join(', ')}
                  </div>
                </div>
              )}
            </div>

            {/* Bollinger Bands Configuration */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div
                  onClick={() => setBbEnabled(!bbEnabled)}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: bbEnabled ? C.blue : C.surf2,
                    border: `1px solid ${bbEnabled ? C.blue : C.border2}`,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all .2s',
                  }}
                >
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 2,
                    left: bbEnabled ? 22 : 2,
                    transition: 'left .2s',
                  }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Bollinger Bands</div>
              </div>

              {bbEnabled && (
                <div style={{ paddingLeft: 56, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={lbl}>Period</label>
                    <input
                      type="number"
                      value={bbPeriod}
                      onChange={(e) => setBbPeriod(parseInt(e.target.value) || 20)}
                      style={{ ...inp }}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Std Deviation</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bbStdDev}
                      onChange={(e) => setBbStdDev(parseFloat(e.target.value) || 2)}
                      style={{ ...inp }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* RSI Configuration */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div
                  onClick={() => setRsiEnabled(!rsiEnabled)}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: rsiEnabled ? C.purple : C.surf2,
                    border: `1px solid ${rsiEnabled ? C.purple : C.border2}`,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all .2s',
                  }}
                >
                  <div style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 2,
                    left: rsiEnabled ? 22 : 2,
                    transition: 'left .2s',
                  }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>RSI (Relative Strength Index)</div>
              </div>

              {rsiEnabled && (
                <div style={{ paddingLeft: 56 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={lbl}>Period</label>
                      <input
                        type="number"
                        value={rsiPeriod}
                        onChange={(e) => setRsiPeriod(parseInt(e.target.value) || 14)}
                        style={{ ...inp }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                    Standard period is 14. Overbought: 70, Oversold: 30
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleContinueToAccount}
                style={{
                  background: C.amber,
                  border: 'none',
                  color: '#000',
                  padding: '10px 24px',
                  borderRadius: 4,
                  cursor: 'pointer',
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
                <>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                    Available: {availableDateRange.startTime.toLocaleDateString()} to {availableDateRange.endTime.toLocaleDateString()} ({bars.current.length.toLocaleString()} bars)
                  </div>
                  {barLimitReached && (
                    <div
                      style={{
                        background: C.red + '10',
                        border: `1px solid ${C.red}40`,
                        borderRadius: 4,
                        padding: '8px 12px',
                        marginBottom: 12,
                        fontSize: 10,
                        color: C.red,
                      }}
                    >
                      ⚠ Maximum capacity reached: Only first {MAX_BARS.toLocaleString()} bars loaded (performance limit for 3 multi-timeframe charts). Consider using a smaller date range or higher timeframe data.
                    </div>
                  )}
                </>
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

            {/* Timezone Selection */}
            <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={head}>Data Timezone</span>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                    Select the timezone of your data source (MT4/MT5 usually uses broker server time)
                  </div>
                </div>
                <div style={{
                  background: C.amber + '15',
                  border: `1px solid ${C.amber}40`,
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 12,
                  color: C.amber,
                  fontWeight: 600,
                }}>
                  {TIMEZONE_OPTIONS.find(tz => tz.value === selectedTimezone)?.label || 'GMT+3 (Moscow/Istanbul)'}
                </div>
              </div>
              <select
                value={selectedTimezone}
                onChange={(e) => setSelectedTimezone(Number(e.target.value))}
                style={{
                  ...inp,
                  cursor: 'pointer',
                  width: '100%',
                  fontSize: 13,
                }}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label} (UTC{tz.value >= 0 ? '+' : ''}{tz.value})
                  </option>
                ))}
              </select>
              <div style={{
                marginTop: 8,
                padding: '8px 10px',
                background: C.surf2,
                borderRadius: 4,
                fontSize: 10,
                color: C.muted,
              }}>
                💡 <strong>MT4/MT5:</strong> Default is usually GMT+2 or GMT+3 (broker server time). DST is handled automatically by MT5.
              </div>
            </div>

            {/* Timeframe Selection (Multi-Select) */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 4 }}>Select Timeframes (up to 3)</div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 12 }}>
                {detectedTimeframe && <>Detected: <strong>{tfDisplayMap[detectedTimeframe] || detectedTimeframe}</strong> — select this or higher only</>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {TIMEFRAME_OPTIONS.map((tf) => {
                  const detectedMs = detectedTimeframe ? getTimeframeMs(detectedTimeframe) : 0
                  const tfMs = getTimeframeMs(tf)
                  const isLowerTf = tfMs < detectedMs
                  const isAtLimit = selectedTimeframes.length >= 3 && !selectedTimeframes.includes(tf)
                  const isDisabled = isLowerTf || isAtLimit

                  return (
                    <button
                      key={tf}
                      onClick={() => {
                        if (!isLowerTf) handleToggleTimeframe(tf)
                      }}
                      title={isLowerTf ? `Cannot select lower timeframes than ${tfDisplayMap[detectedTimeframe] || detectedTimeframe}` : ''}
                      style={{
                        padding: '10px',
                        border: `2px solid ${selectedTimeframes.includes(tf) ? C.amber : isLowerTf ? C.red + '60' : C.border2}`,
                        background: selectedTimeframes.includes(tf) ? C.amber + '20' : isLowerTf ? C.red + '08' : C.surf2,
                        borderRadius: 4,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        fontSize: 11,
                        fontFamily: FONT,
                        fontWeight: selectedTimeframes.includes(tf) ? 600 : 400,
                        color: isLowerTf ? C.muted : C.text,
                        opacity: isDisabled ? 0.4 : 1,
                        transition: 'all .15s',
                      }}
                      disabled={isDisabled}
                    >
                      {tfDisplayMap[tf] || tf}
                    </button>
                  )
                })}
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