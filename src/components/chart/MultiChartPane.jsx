import { useMemo } from 'react'
import { useSimStore } from '../../store/useSimStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { calcEMA, calcRSI, calcBB, calcEMAs } from '../../utils/indicators'
import { ChartPane } from './ChartPane'
import { RsiPane } from './RsiPane'

/**
 * Renders 1-3 charts in custom layout:
 * - 1 chart on left side (full height)
 * - 2 charts on right side (stacked vertically)
 */
export function MultiChartPane({ chartRefs, rsiRefsMap, showRsi }) {
  const selectedTimeframes = useSimStore((s) => s.selectedTimeframes)
  const barsMap = useSimStore((s) => s.barsMap)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  
  // Get indicator config
  const indic = useIndicatorStore()
  const emaPeriods = indic.ema.enabled ? indic.ema.periods : []
  
  // Display format for timeframe (M1, M5, etc)
  const tfDisplayMap = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D1' }

  // Pre-compute indicators for each timeframe
  const indicatorsByTimeframe = useMemo(() => {
    const result = {}
    
    selectedTimeframes.forEach((tf) => {
      const bars = barsMap[tf] || []
      const times = bars.map((b) => b.time)
      const closes = bars.map((b) => b.close)
      
      // Calculate EMAs
      const emaValues = indic.ema.enabled ? calcEMAs(closes, emaPeriods) : {}
      
      result[tf] = {
        times,
        closes,
        ema: emaValues,
        emaPeriods,
        bb: calcBB(closes, indic.bb.period, indic.bb.stdDev),
        rsi: calcRSI(closes, indic.rsi.period),
      }
    })
    
    return result
  }, [selectedTimeframes, barsMap, emaPeriods, indic.bb, indic.rsi])

  // Layout: 1 chart left (full height), 2 charts right (stacked)
  if (selectedTimeframes.length === 1) {
    // Single chart - full width (fallback to fullscreen)
    const tf = selectedTimeframes[0]
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf] || tf}
          </div>
          <ChartPane
            chartR={chartRefs[tf]}
            bars={barsMap[tf] || []}
            times={indicatorsByTimeframe[tf]?.times || []}
            emaValues={indicatorsByTimeframe[tf]?.ema || {}}
            emaPeriods={emaPeriods}
            bbData={indicatorsByTimeframe[tf]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
          {showRsi && rsiRefsMap[tf] ? (
            <RsiPane
              rsiR={rsiRefsMap[tf]}
              bars={barsMap[tf] || []}
              times={indicatorsByTimeframe[tf]?.times || []}
              rsiVals={indicatorsByTimeframe[tf]?.rsi || []}
              mainChartRef={chartRefs[tf]?.chart}
            />
          ) : null}
        </div>
      </div>
    )
  }

  if (selectedTimeframes.length === 2) {
    // 2 charts: left (100%) and right (100%) - side by side
    const [tf1, tf2] = selectedTimeframes
    return (
      <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>
        {/* Left chart */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf1] || tf1}
          </div>
          <ChartPane
            chartR={chartRefs[tf1]}
            bars={barsMap[tf1] || []}
            times={indicatorsByTimeframe[tf1]?.times || []}
            emaValues={indicatorsByTimeframe[tf1]?.ema || {}}
            emaPeriods={emaPeriods}
            bbData={indicatorsByTimeframe[tf1]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
          {showRsi && rsiRefsMap[tf1] ? (
            <RsiPane
              rsiR={rsiRefsMap[tf1]}
              bars={barsMap[tf1] || []}
              times={indicatorsByTimeframe[tf1]?.times || []}
              rsiVals={indicatorsByTimeframe[tf1]?.rsi || []}
              mainChartRef={chartRefs[tf1]?.chart}
            />
          ) : null}
        </div>
        
        {/* Right chart */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf2] || tf2}
          </div>
          <ChartPane
            chartR={chartRefs[tf2]}
            bars={barsMap[tf2] || []}
            times={indicatorsByTimeframe[tf2]?.times || []}
            emaValues={indicatorsByTimeframe[tf2]?.ema || {}}
            emaPeriods={emaPeriods}
            bbData={indicatorsByTimeframe[tf2]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
          {showRsi && rsiRefsMap[tf2] ? (
            <RsiPane
              rsiR={rsiRefsMap[tf2]}
              bars={barsMap[tf2] || []}
              times={indicatorsByTimeframe[tf2]?.times || []}
              rsiVals={indicatorsByTimeframe[tf2]?.rsi || []}
              mainChartRef={chartRefs[tf2]?.chart}
            />
          ) : null}
        </div>
      </div>
    )
  }

  // 3 charts: left (66%) and right (33% with 2 stacked charts)
  const [tf1, tf2, tf3] = selectedTimeframes
  return (
    <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>
      {/* Left chart - 66% width, full height */}
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {tfDisplayMap[tf1] || tf1}
        </div>
        <ChartPane
          chartR={chartRefs[tf1]}
          bars={barsMap[tf1] || []}
          times={indicatorsByTimeframe[tf1]?.times || []}
          emaValues={indicatorsByTimeframe[tf1]?.ema || {}}
          emaPeriods={emaPeriods}
          bbData={indicatorsByTimeframe[tf1]?.bb || { mid: [], upper: [], lower: [] }}
          symbolConfig={symbolConfig}
        />
        {showRsi && rsiRefsMap[tf1] ? (
          <RsiPane
            rsiR={rsiRefsMap[tf1]}
            bars={barsMap[tf1] || []}
            times={indicatorsByTimeframe[tf1]?.times || []}
            rsiVals={indicatorsByTimeframe[tf1]?.rsi || []}
            mainChartRef={chartRefs[tf1]?.chart}
          />
        ) : null}
      </div>
      
      {/* Right side - 33% width, 2 stacked charts */}
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top right chart */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf2] || tf2}
          </div>
          <ChartPane
            chartR={chartRefs[tf2]}
            bars={barsMap[tf2] || []}
            times={indicatorsByTimeframe[tf2]?.times || []}
            emaValues={indicatorsByTimeframe[tf2]?.ema || {}}
            emaPeriods={emaPeriods}
            bbData={indicatorsByTimeframe[tf2]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
          {showRsi && rsiRefsMap[tf2] ? (
            <RsiPane
              rsiR={rsiRefsMap[tf2]}
              bars={barsMap[tf2] || []}
              times={indicatorsByTimeframe[tf2]?.times || []}
              rsiVals={indicatorsByTimeframe[tf2]?.rsi || []}
              mainChartRef={chartRefs[tf2]?.chart}
            />
          ) : null}
        </div>
        
        {/* Bottom right chart */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf3] || tf3}
          </div>
          <ChartPane
            chartR={chartRefs[tf3]}
            bars={barsMap[tf3] || []}
            times={indicatorsByTimeframe[tf3]?.times || []}
            emaValues={indicatorsByTimeframe[tf3]?.ema || {}}
            emaPeriods={emaPeriods}
            bbData={indicatorsByTimeframe[tf3]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
          {showRsi && rsiRefsMap[tf3] ? (
            <RsiPane
              rsiR={rsiRefsMap[tf3]}
              bars={barsMap[tf3] || []}
              times={indicatorsByTimeframe[tf3]?.times || []}
              rsiVals={indicatorsByTimeframe[tf3]?.rsi || []}
              mainChartRef={chartRefs[tf3]?.chart}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
