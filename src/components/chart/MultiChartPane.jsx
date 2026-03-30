import { useMemo } from 'react'
import { useSimStore } from '../../store/useSimStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { calcEMA, calcRSI, calcBB } from '../../utils/indicators'
import { ChartPane } from './ChartPane'

/**
 * Renders 1-3 charts in custom layout:
 * - 1 chart on left side (full height)
 * - 2 charts on right side (stacked vertically)
 */
export function MultiChartPane({ chartRefs, rsiRefs }) {
  const selectedTimeframes = useSimStore((s) => s.selectedTimeframes)
  const barsMap = useSimStore((s) => s.barsMap)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  
  // Display format for timeframe (M1, M5, etc)
  const tfDisplayMap = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D1' }

  // Pre-compute indicators for each timeframe
  const indicatorsByTimeframe = useMemo(() => {
    const result = {}
    
    selectedTimeframes.forEach((tf) => {
      const bars = barsMap[tf] || []
      const times = bars.map((b) => b.time)
      const closes = bars.map((b) => b.close)
      
      result[tf] = {
        times,
        closes,
        ema20: calcEMA(closes, 20),
        ema50: calcEMA(closes, 50),
        bb: calcBB(closes, 20, 2),
        rsi: calcRSI(closes, 14),
      }
    })
    
    return result
  }, [selectedTimeframes, barsMap])

  // Layout: 1 chart left (full height), 2 charts right (stacked)
  if (selectedTimeframes.length === 1) {
    // Single chart - full width (fallback to fullscreen)
    const tf = selectedTimeframes[0]
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf] || tf}
          </div>
          <ChartPane
            chartR={chartRefs[tf]}
            bars={barsMap[tf] || []}
            times={indicatorsByTimeframe[tf]?.times || []}
            ema20v={indicatorsByTimeframe[tf]?.ema20 || []}
            ema50v={indicatorsByTimeframe[tf]?.ema50 || []}
            bbData={indicatorsByTimeframe[tf]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
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
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf1] || tf1}
          </div>
          <ChartPane
            chartR={chartRefs[tf1]}
            bars={barsMap[tf1] || []}
            times={indicatorsByTimeframe[tf1]?.times || []}
            ema20v={indicatorsByTimeframe[tf1]?.ema20 || []}
            ema50v={indicatorsByTimeframe[tf1]?.ema50 || []}
            bbData={indicatorsByTimeframe[tf1]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
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
            ema20v={indicatorsByTimeframe[tf2]?.ema20 || []}
            ema50v={indicatorsByTimeframe[tf2]?.ema50 || []}
            bbData={indicatorsByTimeframe[tf2]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
        </div>
      </div>
    )
  }

  // 3 charts: 1 on left (full height), 2 on right (stacked)
  const [tf1, tf2, tf3] = selectedTimeframes
  return (
    <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>
      {/* Left chart - full height, 50% width */}
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
          {tfDisplayMap[tf1] || tf1}
        </div>
        <ChartPane
          chartR={chartRefs[tf1]}
          bars={barsMap[tf1] || []}
          times={indicatorsByTimeframe[tf1]?.times || []}
          ema20v={indicatorsByTimeframe[tf1]?.ema20 || []}
          ema50v={indicatorsByTimeframe[tf1]?.ema50 || []}
          bbData={indicatorsByTimeframe[tf1]?.bb || { mid: [], upper: [], lower: [] }}
          symbolConfig={symbolConfig}
        />
      </div>
      
      {/* Right side - 50% width, split vertically */}
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top right chart - 50% of right side */}
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf2] || tf2}
          </div>
          <ChartPane
            chartR={chartRefs[tf2]}
            bars={barsMap[tf2] || []}
            times={indicatorsByTimeframe[tf2]?.times || []}
            ema20v={indicatorsByTimeframe[tf2]?.ema20 || []}
            ema50v={indicatorsByTimeframe[tf2]?.ema50 || []}
            bbData={indicatorsByTimeframe[tf2]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
        </div>
        
        {/* Bottom right chart - 50% of right side */}
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surf)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            {tfDisplayMap[tf3] || tf3}
          </div>
          <ChartPane
            chartR={chartRefs[tf3]}
            bars={barsMap[tf3] || []}
            times={indicatorsByTimeframe[tf3]?.times || []}
            ema20v={indicatorsByTimeframe[tf3]?.ema20 || []}
            ema50v={indicatorsByTimeframe[tf3]?.ema50 || []}
            bbData={indicatorsByTimeframe[tf3]?.bb || { mid: [], upper: [], lower: [] }}
            symbolConfig={symbolConfig}
          />
        </div>
      </div>
    </div>
  )
}
