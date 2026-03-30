import { useRef, useMemo, useState } from 'react'
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


export function Workspace({ onLoadNew }) {
  const [rightWidth, setRightWidth] = useState(310)
  const [journalHeight, setJournalHeight] = useState(220)

  const C = useTheme()
  const bars = useSimStore((s) => s.bars)
  const selectedTimeframes = useSimStore((s) => s.selectedTimeframes)
  const barsMap = useSimStore((s) => s.barsMap)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const showRsi = useIndicatorStore((s) => s.rsi)

  // Determine if using multi-timeframe or single timeframe
  const isMultiTimeframe = selectedTimeframes && selectedTimeframes.length > 0 && Object.keys(barsMap).length > 0
  const barData = isMultiTimeframe ? barsMap[selectedTimeframes[0]] : bars

  // ── Pre-compute indicators for ALL timeframes in multi-timeframe mode ──
  const allTimeframeData = useMemo(() => {
    if (!isMultiTimeframe) {
      // Single timeframe
      const closes = barData.map((b) => b.close)
      const times = barData.map((b) => b.time)
      return {
        'default': {
          bars: barData,
          times,
          closes,
          ema20: calcEMA(closes, 20),
          ema50: calcEMA(closes, 50),
          bb: calcBB(closes, 20, 2),
          rsi: calcRSI(closes, 14),
        }
      }
    }
    
    // Multi-timeframe: pre-compute all
    const result = {}
    selectedTimeframes.forEach((tf) => {
      const tfBars = barsMap[tf] || []
      const closes = tfBars.map((b) => b.close)
      const times = tfBars.map((b) => b.time)
      result[tf] = {
        bars: tfBars,
        times,
        closes,
        ema20: calcEMA(closes, 20),
        ema50: calcEMA(closes, 50),
        bb: calcBB(closes, 20, 2),
        rsi: calcRSI(closes, 14),
      }
    })
    return result
  }, [isMultiTimeframe, barData, selectedTimeframes, barsMap])

  // Get primary timeframe data
  const primaryTF = isMultiTimeframe ? selectedTimeframes[0] : 'default'
  const times = allTimeframeData[primaryTF]?.times || []
  const closes = allTimeframeData[primaryTF]?.closes || []
  const ema20v = allTimeframeData[primaryTF]?.ema20 || []
  const ema50v = allTimeframeData[primaryTF]?.ema50 || []
  const bbData = allTimeframeData[primaryTF]?.bb || { mid: [], upper: [], lower: [] }
  const rsiVals = allTimeframeData[primaryTF]?.rsi || []

  // ── Chart series refs (populated by ChartPane / RsiPane) ──
  // Create all refs at component level (NOT inside useMemo/useEffect)
  
  // For single timeframe
  const _chart  = useRef(null)
  const _candle = useRef(null)
  const _vol    = useRef(null)
  const _ema20  = useRef(null)
  const _ema50  = useRef(null)
  const _bbMid  = useRef(null)
  const _bbUp   = useRef(null)
  const _bbLow  = useRef(null)
  
  // For multi-timeframe (create up to 3 sets)
  const _chart1  = useRef(null)
  const _candle1 = useRef(null)
  const _vol1    = useRef(null)
  const _ema201  = useRef(null)
  const _ema501  = useRef(null)
  const _bbMid1  = useRef(null)
  const _bbUp1   = useRef(null)
  const _bbLow1  = useRef(null)
  
  const _chart2  = useRef(null)
  const _candle2 = useRef(null)
  const _vol2    = useRef(null)
  const _ema202  = useRef(null)
  const _ema502  = useRef(null)
  const _bbMid2  = useRef(null)
  const _bbUp2   = useRef(null)
  const _bbLow2  = useRef(null)
  
  const _chart3  = useRef(null)
  const _candle3 = useRef(null)
  const _vol3    = useRef(null)
  const _ema203  = useRef(null)
  const _ema503  = useRef(null)
  const _bbMid3  = useRef(null)
  const _bbUp3   = useRef(null)
  const _bbLow3  = useRef(null)

  // Build chartRefsMap from individual refs
  const chartRefsMap = useMemo(() => {
    const map = {}
    if (isMultiTimeframe && selectedTimeframes.length > 0) {
      // Map each selected timeframe to its ref set
      const refSets = [
        { chart: _chart1, candle: _candle1, vol: _vol1, ema20: _ema201, ema50: _ema501, bbMid: _bbMid1, bbUp: _bbUp1, bbLow: _bbLow1 },
        { chart: _chart2, candle: _candle2, vol: _vol2, ema20: _ema202, ema50: _ema502, bbMid: _bbMid2, bbUp: _bbUp2, bbLow: _bbLow2 },
        { chart: _chart3, candle: _candle3, vol: _vol3, ema20: _ema203, ema50: _ema503, bbMid: _bbMid3, bbUp: _bbUp3, bbLow: _bbLow3 },
      ]
      selectedTimeframes.forEach((tf, idx) => {
        if (idx < refSets.length) {
          map[tf] = refSets[idx]
        }
      })
    } else {
      // Single timeframe
      map['default'] = { chart: _chart, candle: _candle, vol: _vol, ema20: _ema20, ema50: _ema50, bbMid: _bbMid, bbUp: _bbUp, bbLow: _bbLow }
    }
    return map
  }, [isMultiTimeframe, selectedTimeframes])

  // For simulation: collect all chart refs and data for multi-timeframe
  const simChartData = useMemo(() => {
    if (!isMultiTimeframe) {
      return {
        'default': {
          refs: chartRefsMap['default'],
          data: allTimeframeData['default']
        }
      }
    }
    
    const result = {}
    selectedTimeframes.forEach((tf) => {
      result[tf] = {
        refs: chartRefsMap[tf],
        data: allTimeframeData[tf]
      }
    })
    return result
  }, [isMultiTimeframe, selectedTimeframes, chartRefsMap, allTimeframeData])

  const _rsiChart  = useRef(null)
  const _rsiSeries = useRef(null)

  const rsiR = useMemo(() => ({
    chart:  _rsiChart,
    series: _rsiSeries,
  }), [])

  // ── Simulation engine ──────────────────────────────────────
  const { seekTo, step, cursorRef } = useSimEngine({
    bars: allTimeframeData[primaryTF].bars,
    times,
    ema20v,
    ema50v,
    bbData,
    rsiVals,
    isMultiTimeframe,
    simChartData,
    primaryTF,
    rsiR,
  })

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

  

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, fontFamily: '"JetBrains Mono","SF Mono",monospace', color: C.text, overflow: 'scroll' }}>
      <Header onLoadNew={onLoadNew} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LeftSidebar ema20v={ema20v} ema50v={ema50v} bbData={bbData} rsiVals={rsiVals} />

        {/* Chart column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>
          {isMultiTimeframe ? (
            <MultiChartPane
              chartRefs={chartRefsMap}
              rsiRefs={{}}
            />
          ) : (
            <ChartPane
              chartR={chartR}
              bars={barData}
              times={times}
              ema20v={ema20v}
              ema50v={ema50v}
              bbData={bbData}
              symbolConfig={symbolConfig}
            />
          )}
          {showRsi && !isMultiTimeframe && (
            <RsiPane
              rsiR={rsiR}
              bars={barData}
              times={times}
              rsiVals={rsiVals}
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
        height:     journalHeight,
        flexShrink: 0,
        borderTop:  `1px solid ${C.border}`,
        background: C.surf,
        overflow:   'hidden',
        display:    'flex',
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
        flexShrink:  0,
        width:       isV ? 5    : '100%',
        height:      isV ? '100%' : 5,
        cursor:      isV ? 'col-resize' : 'row-resize',
        background:  hover ? C.amber + '60' : C.border,
        transition:  'background .15s',
        zIndex:      10,
      }}
    />
  )
}