import { useRef, useMemo, useState, useEffect } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { calcEMA, calcRSI, calcBB } from '../../utils/indicators'
import { useSimEngine } from '../../hooks/useSimEngine'
import { Header } from './Header'
import { SimBar } from './SimBar'
import { LeftSidebar } from '../sidebar/LeftSidebar'
import { ChartPane } from '../chart/ChartPane'
import { MultiChartPane } from '../chart/MultiChartPane'
import { RsiPane } from '../chart/RsiPane'
import { RightPanel } from '../trading/RightPanel'
import { JournalTab } from '../trading/JournalTab'
import { FONT } from '../../constants'

// Helper to compute all EMA values for given periods
function calcEMAs(closes, periods) {
  const result = {}
  periods.forEach((period) => {
    result[period] = calcEMA(closes, period)
  })
  return result
}


export function Workspace({ onLoadNew }) {
  const [rightWidth, setRightWidth] = useState(310)
  const [journalHeight, setJournalHeight] = useState(220)

  const C = useTheme()
  const bars = useSimStore((s) => s.bars)
  const analysisMode = useSimStore((s) => s.analysisMode)
  const selectedTimeframes = useSimStore((s) => s.selectedTimeframes)
  const barsMap = useSimStore((s) => s.barsMap)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const showRsi = useIndicatorStore((s) => s.rsi.enabled)

  const _rsiChart = useRef(null)
  const _rsiSeries = useRef(null)
  const _rsiOb = useRef(null)
  const _rsiOs = useRef(null)

  /** Single-chart / default RSI bundle (synced from sim engine) */
  const rsiRDefault = useMemo(
    () => ({
      chart: _rsiChart,
      series: _rsiSeries,
      ob: _rsiOb,
      os: _rsiOs,
    }),
    [],
  )

  /** Multi-chart RSI bundles (slot 1–3 map to ordered selected timeframes) */
  const _rsiChart_m1 = useRef(null)
  const _rsiSeries_m1 = useRef(null)
  const _rsiOb_m1 = useRef(null)
  const _rsiOs_m1 = useRef(null)
  const _rsiChart_m2 = useRef(null)
  const _rsiSeries_m2 = useRef(null)
  const _rsiOb_m2 = useRef(null)
  const _rsiOs_m2 = useRef(null)
  const _rsiChart_m3 = useRef(null)
  const _rsiSeries_m3 = useRef(null)
  const _rsiOb_m3 = useRef(null)
  const _rsiOs_m3 = useRef(null)
  // Force re-render by subscribing to entire store (ensures mount/unmount works)
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    return useIndicatorStore.subscribe(() => forceUpdate(v => v + 1))
  }, [])

  // Determine if using multi-timeframe or single timeframe
  const isMultiTimeframe = selectedTimeframes && selectedTimeframes.length > 0 && Object.keys(barsMap).length > 0
  const barData = isMultiTimeframe ? barsMap[selectedTimeframes[0]] : bars

  // Get indicator config from store
  const indicatorConfig = useIndicatorStore((s) => s)
  const emaPeriods = indicatorConfig.ema.periods
  const bbPeriod = indicatorConfig.bb.period
  const bbStdDev = indicatorConfig.bb.stdDev
  const rsiPeriod = indicatorConfig.rsi.period

  // ── Pre-compute indicators for ALL timeframes in multi-timeframe mode ──
  const allTimeframeData = useMemo(() => {
    if (!isMultiTimeframe) {
      // Single timeframe
      const closes = barData.map((b) => b.close)
      const times = barData.map((b) => b.time)
      const emaValues = calcEMAs(closes, emaPeriods)
      return {
        'default': {
          bars: barData,
          times,
          closes,
          ema: emaValues,
          emaPeriods,
          bb: calcBB(closes, bbPeriod, bbStdDev),
          rsi: calcRSI(closes, rsiPeriod),
        }
      }
    }

    // Multi-timeframe: pre-compute all
    const result = {}
    selectedTimeframes.forEach((tf) => {
      const tfBars = barsMap[tf] || []
      const closes = tfBars.map((b) => b.close)
      const times = tfBars.map((b) => b.time)
      const emaValues = calcEMAs(closes, emaPeriods)
      result[tf] = {
        bars: tfBars,
        times,
        closes,
        ema: emaValues,
        emaPeriods,
        bb: calcBB(closes, bbPeriod, bbStdDev),
        rsi: calcRSI(closes, rsiPeriod),
      }
    })
    return result
  }, [isMultiTimeframe, barData, selectedTimeframes, barsMap, emaPeriods, bbPeriod, bbStdDev, rsiPeriod])

  // Get primary timeframe data
  const primaryTF = isMultiTimeframe ? selectedTimeframes[0] : 'default'
  const times = allTimeframeData[primaryTF]?.times || []
  const closes = allTimeframeData[primaryTF]?.closes || []
  // ema values now stored as object with period keys
  const emaValues = allTimeframeData[primaryTF]?.ema || {}
  const bbData = allTimeframeData[primaryTF]?.bb || { mid: [], upper: [], lower: [] }
  const rsiVals = allTimeframeData[primaryTF]?.rsi || []

  // Build ema20v, ema50v etc for backward compatibility
  const ema20v = emaValues[20] || []
  const ema50v = emaValues[50] || []
  const ema100v = emaValues[100] || []

  // ── Chart series refs (populated by ChartPane / RsiPane) ──
  // Create all refs at component level (NOT inside useMemo/useEffect)

  // For single timeframe - support up to 5 EMAs
  const _chart = useRef(null)
  const _candle = useRef(null)
  const _vol = useRef(null)
  const _bbMid = useRef(null)
  const _bbUp = useRef(null)
  const _bbLow = useRef(null)

  // For multi-timeframe (create up to 3 sets)
  const _chart1 = useRef(null)
  const _candle1 = useRef(null)
  const _vol1 = useRef(null)
  const _bbMid1 = useRef(null)
  const _bbUp1 = useRef(null)
  const _bbLow1 = useRef(null)

  const _chart2 = useRef(null)
  const _candle2 = useRef(null)
  const _vol2 = useRef(null)
  const _bbMid2 = useRef(null)
  const _bbUp2 = useRef(null)
  const _bbLow2 = useRef(null)

  const _chart3 = useRef(null)
  const _candle3 = useRef(null)
  const _vol3 = useRef(null)
  const _bbMid3 = useRef(null)
  const _bbUp3 = useRef(null)
  const _bbLow3 = useRef(null)

  // Build chartRefsMap from individual refs
  const chartRefsMap = useMemo(() => {
    const map = {}
    if (isMultiTimeframe && selectedTimeframes.length > 0) {
      // Map each selected timeframe to its ref set
       const refSets = [
         { chart: _chart1, candle: _candle1, vol: _vol1, ema: {}, bbMid: _bbMid1, bbUp: _bbUp1, bbLow: _bbLow1 },
         { chart: _chart2, candle: _candle2, vol: _vol2, ema: {}, bbMid: _bbMid2, bbUp: _bbUp2, bbLow: _bbLow2 },
         { chart: _chart3, candle: _candle3, vol: _vol3, ema: {}, bbMid: _bbMid3, bbUp: _bbUp3, bbLow: _bbLow3 },
       ]
      selectedTimeframes.forEach((tf, idx) => {
        if (idx < refSets.length) {
          map[tf] = refSets[idx]
        }
      })
    } else {
      // Single timeframe
       map['default'] = { chart: _chart, candle: _candle, vol: _vol, ema: {}, bbMid: _bbMid, bbUp: _bbUp, bbLow: _bbLow }
    }
    return map
  }, [isMultiTimeframe, selectedTimeframes])

  /** RSI refs per timeframe key (matches chartRefsMap keys) */
  const rsiRefsMap = useMemo(() => {
    const map = {}
    const multiBundles = [
      {
        chart: _rsiChart_m1,
        series: _rsiSeries_m1,
        ob: _rsiOb_m1,
        os: _rsiOs_m1,
      },
      {
        chart: _rsiChart_m2,
        series: _rsiSeries_m2,
        ob: _rsiOb_m2,
        os: _rsiOs_m2,
      },
      {
        chart: _rsiChart_m3,
        series: _rsiSeries_m3,
        ob: _rsiOb_m3,
        os: _rsiOs_m3,
      },
    ]
    if (isMultiTimeframe && selectedTimeframes.length > 1) {
      selectedTimeframes.forEach((tf, idx) => {
        if (idx < multiBundles.length) map[tf] = multiBundles[idx]
      })
    } else if (isMultiTimeframe && selectedTimeframes.length === 1) {
      map[selectedTimeframes[0]] = rsiRDefault
    } else {
      map.default = rsiRDefault
    }
    return map
  }, [isMultiTimeframe, selectedTimeframes, rsiRDefault])

  // For simulation: collect all chart refs and data for multi-timeframe
  const simChartData = useMemo(() => {
    if (!isMultiTimeframe) {
      return {
        default: {
          refs: chartRefsMap.default,
          data: allTimeframeData.default,
          rsiR: rsiRefsMap.default,
        },
      }
    }

    const result = {}
    selectedTimeframes.forEach((tf) => {
      result[tf] = {
        refs: chartRefsMap[tf],
        data: allTimeframeData[tf],
        rsiR: rsiRefsMap[tf],
      }
    })
    return result
  }, [isMultiTimeframe, selectedTimeframes, chartRefsMap, allTimeframeData, rsiRefsMap])

  // ── Simulation engine ──────────────────────────────────────
  /** Bundle used by seek/step for RSI (primary driving timeframe) */
  const primaryRsiR = useMemo(() => {
    if (!isMultiTimeframe) return simChartData.default?.rsiR
    return simChartData[primaryTF]?.rsiR
  }, [isMultiTimeframe, simChartData, primaryTF])

  const { seekTo, step, cursorRef } = useSimEngine({
    bars: allTimeframeData[primaryTF].bars,
    times,
    emaValues: emaValues,
    emaPeriods: emaPeriods,
    bbData,
    rsiVals,
    isMultiTimeframe,
    simChartData,
    primaryTF,
    rsiR: primaryRsiR,
  })

  // Initialize charts when workspace loads or bars change
  // This ensures cursor position is reflected in the chart
  const initRef = useRef(false)
  useEffect(() => {
    if (bars.length > 0 && !initRef.current) {
      initRef.current = true
      // Small delay to ensure chart refs are ready
      setTimeout(() => {
        seekTo(useSimStore.getState().cursor)
      }, 50)
    }
  }, [bars.length, seekTo])

  // RSI pans mount with empty series; after toggling RSI on, repaint from engine.
  const prevShowRsiRef = useRef(showRsi)
  useEffect(() => {
    if (showRsi && !prevShowRsiRef.current) {
      const cur = useSimStore.getState().cursor
      if (cur >= 1) queueMicrotask(() => seekTo(cur))
    }
    prevShowRsiRef.current = showRsi
  }, [showRsi, seekTo])

  const handleReset = () => {
    // Write to store directly — no reactive reads here, no stale closures
    useSimStore.getState().setPlaying(false)
    useTradeStore.getState().reset()
    seekTo(Math.min(30, bars.length))
  }

  // SimBar handlers
  const handlePlay = () => useSimStore.getState().togglePlaying()
  const handleStepBack = () => {
    useSimStore.getState().setPlaying(false)
    seekTo(useSimStore.getState().cursor - 1)
  }
  const handleStepFwd = () => {
    useSimStore.getState().setPlaying(false)
    step()
  }
  const handleSeek = (ratio) => {
    useSimStore.getState().setPlaying(false)
    seekTo(Math.round(ratio * bars.length))
  }

  // Resize Right Panel tracker
  const startResizeRight = (e) => {
    e.preventDefault()

    const startX = e.clientX
    const startWidth = rightWidth

    const onMove = (e) => {
      const dx = startX - e.clientX
      const newWidth = Math.min(600, Math.max(220, startWidth + dx))
      setRightWidth(newWidth)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Resize Journal tab tracker
  const startResizeJournal = (e) => {
    e.preventDefault()

    const startY = e.clientY
    const startHeight = journalHeight

    const onMove = (e) => {
      const dy = startY - e.clientY
      const newHeight = Math.min(500, Math.max(120, startHeight + dy))
      setJournalHeight(newHeight)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }



  // ── ANALYSIS MODE ──
  // When analysis mode is active, show only metrics + journal (frees memory from charts)
  if (analysisMode) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: C.bg,
        fontFamily: FONT,
        color: C.text
      }}>
        {/* Analysis Mode Header */}
        <div style={{
          height: 46,
          background: C.surf,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ color: C.amber, fontWeight: 700, fontSize: 15, letterSpacing: 2 }}>
            BACKTEST<span style={{ color: C.muted }}>.</span>OS
          </div>
          <div style={{
            background: C.amber + '20',
            color: C.amber,
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            border: `1px solid ${C.amber}40`,
          }}>
            ANALYSIS MODE
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            Performance review — market data cleared for better performance
          </div>

          {/* Exit buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => useSimStore.getState().exitAnalysisMode()}
              style={{
                background: C.red + '15',
                border: `1px solid ${C.red}50`,
                color: C.red,
                borderRadius: 4,
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: FONT,
                fontWeight: 600,
              }}
            >
              ✕ Exit to Upload
            </button>
          </div>
        </div>

        {/* Full-screen metrics + journal */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Metrics/Sidebar */}
          <div style={{
            width: 280,
            flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            overflow: 'auto',
            background: C.surf,
          }}>
            <LeftSidebar emaValues={emaValues} bbData={bbData} rsiVals={rsiVals} />
          </div>

          {/* Right: Full-height Journal */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <JournalTab />
          </div>
        </div>

        {/* Bottom bar with summary */}
        <div style={{
          height: 50,
          background: C.surf,
          borderTop: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 20,
          fontSize: 12,
          color: C.muted,
        }}>
          <span>
            Trades: <strong style={{ color: C.text }}>{useTradeStore.getState().trades.length}</strong>
          </span>
          <span>
            Closed: <strong style={{ color: C.green }}>
              {useTradeStore.getState().trades.filter(t => t.status === 'closed').length}
            </strong>
          </span>
          <span>
            Open: <strong style={{ color: C.amber }}>
              {useTradeStore.getState().trades.filter(t => t.status === 'open').length}
            </strong>
          </span>
          <span style={{ marginLeft: 'auto' }}>
            Click <strong style={{ color: C.amber }}>Exit to Upload</strong> to start a new backtest
          </span>
        </div>
      </div>
    )
  }

  // ── NORMAL BACKTESTING MODE ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, fontFamily: '"JetBrains Mono","SF Mono",monospace', color: C.text, overflow: 'hidden' }}>
      <Header onLoadNew={onLoadNew} />

      <div style={{ display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <LeftSidebar emaValues={emaValues} bbData={bbData} rsiVals={rsiVals} />

        {/* Chart column */}
        <div style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>
          {selectedTimeframes.length > 1 ? (
            <MultiChartPane
              chartRefs={chartRefsMap}
              rsiRefsMap={rsiRefsMap}
              showRsi={showRsi}
            />
          ) : (
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                {selectedTimeframes[0]}
              </div>
              <ChartPane
                chartR={chartRefsMap[primaryTF]}
                bars={barData}
                times={times}
                emaValues={emaValues}
                emaPeriods={emaPeriods}
                bbData={bbData}
                symbolConfig={symbolConfig}
              />
            </div>
          )
          }
          {showRsi && selectedTimeframes.length === 1 && (
            <RsiPane
              rsiR={rsiRDefault}
              bars={barData}
              times={times}
              rsiVals={rsiVals}
              mainChartRef={chartRefsMap[primaryTF]?.chart}
            />
          )}
        </div>

        {/* Right Panel */}
        <DragHandle direction="vertical" onMouseDown={startResizeRight} C={C} />
        <div style={{ width: rightWidth, flexShrink: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <RightPanel PanWidth={rightWidth} />
        </div>
      </div>

      <SimBar
        onPlay={handlePlay}
        onStepBack={handleStepBack}
        onStepFwd={handleStepFwd}
        onSeek={handleSeek}
        onReset={handleReset}
      />

      {/* ── Journal bottom panel ── */}
      <DragHandle direction="horizontal" onMouseDown={startResizeJournal} C={C} />
      <div style={{
        height: journalHeight,
        flexShrink: 0,
        borderTop: `1px solid ${C.border}`,
        background: C.surf,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <JournalTab />
      </div>
    </div>
  )
}

// ── Drag handle component ──────────────────────────────────────
// Shows a subtle visual indicator on hover so the user knows it's draggable.
function DragHandle({ direction, onMouseDown, C }) {
  const [hover, setHover] = useState(false)
  const isV = direction === 'vertical'   // left/right resize

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        width: isV ? 5 : '100%',
        height: isV ? '100%' : 5,
        cursor: isV ? 'col-resize' : 'row-resize',
        background: hover ? C.amber + '60' : C.border,
        transition: 'background .15s',
        zIndex: 10,
      }}
    />
  )
}