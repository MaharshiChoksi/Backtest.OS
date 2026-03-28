import { useRef, useMemo } from 'react'
import { useTheme }          from '../../store/useThemeStore'
import { useSimStore }       from '../../store/useSimStore'
import { useTradeStore }     from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { calcEMA, calcRSI, calcBB } from '../../utils/indicators'
import { useSimEngine }      from '../../hooks/useSimEngine'
import { Header }            from './Header'
import { SimBar }            from './SimBar'
import { LeftSidebar }       from '../sidebar/LeftSidebar'
import { ChartPane }         from '../chart/ChartPane'
import { RsiPane }           from '../chart/RsiPane'
import { RightPanel }        from '../trading/RightPanel'

export function Workspace({ onLoadNew }) {
  const C      = useTheme()
  const bars   = useSimStore((s) => s.bars)
  const reset  = useSimStore((s) => s.reset)
  const resetTrades = useTradeStore((s) => s.reset)
  const showRsi     = useIndicatorStore((s) => s.rsi)

  // ── Pre-compute full indicator arrays (memoized per bars) ──
  const times  = useMemo(() => bars.map((b) => b.time), [bars])
  const closes = useMemo(() => bars.map((b) => b.close), [bars])
  const ema20v = useMemo(() => calcEMA(closes, 20),  [closes])
  const ema50v = useMemo(() => calcEMA(closes, 50),  [closes])
  const bbData = useMemo(() => calcBB(closes, 20, 2), [closes])
  const rsiVals= useMemo(() => calcRSI(closes, 14),  [closes])

  // ── Chart series refs (populated by ChartPane / RsiPane) ──
  const chartR = {
    chart:  useRef(null),
    candle: useRef(null),
    vol:    useRef(null),
    ema20:  useRef(null),
    ema50:  useRef(null),
    bbMid:  useRef(null),
    bbUp:   useRef(null),
    bbLow:  useRef(null),
  }
  const rsiR = {
    chart:  useRef(null),
    series: useRef(null),
  }

  // ── Simulation engine ──────────────────────────────────────
  const { seekTo, step, cursorRef } = useSimEngine({
    bars, times, ema20v, ema50v, bbData, rsiVals, chartR, rsiR,
  })

  const handleReset = () => {
    reset()                           // rewind cursor to 30, stop playing
    resetTrades()                     // clear all trade state
    setTimeout(() => seekTo(30), 30)  // rebuild chart to bar 30 after store settles
  }

  const { setPlaying, togglePlaying } = useSimStore.getState()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, fontFamily: '"JetBrains Mono","SF Mono",monospace', color: C.text, overflow: 'hidden' }}>
      <Header onLoadNew={onLoadNew} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <LeftSidebar ema20v={ema20v} ema50v={ema50v} bbData={bbData} rsiVals={rsiVals} />

        {/* Chart column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${C.border}` }}>
          <ChartPane
            chartR={chartR}
            bars={bars}
            times={times}
            ema20v={ema20v}
            ema50v={ema50v}
            bbData={bbData}
          />
          {showRsi && (
            <RsiPane
              rsiR={rsiR}
              bars={bars}
              times={times}
              rsiVals={rsiVals}
            />
          )}
        </div>

        <RightPanel />
      </div>

      <SimBar
        onPlay={() => togglePlaying()}
        onStepBack={() => { setPlaying(false); seekTo(cursorRef.current - 1) }}
        onStepFwd={() => { setPlaying(false); step() }}
        onSeek={(ratio) => { setPlaying(false); seekTo(Math.round(ratio * bars.length)) }}
        onReset={handleReset}
      />
    </div>
  )
}