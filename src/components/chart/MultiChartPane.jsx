import { useMemo } from 'react'
import { useSimStore } from '../../store/useSimStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { calcRSI, calcBB, calcEMAs } from '../../utils/indicators'
import { ChartPane } from './ChartPane'
import { RsiPane } from './RsiPane'

// No lightweight-charts API is called here — MultiChartPane is layout only.
// All v5 migration changes are confined to ChartPane and RsiPane.

const TF_LABEL = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1', '4h': 'H4', '1d': 'D1' }

export function MultiChartPane({ chartRefs, rsiRefsMap, showRsi }) {
  const selectedTimeframes = useSimStore((s) => s.selectedTimeframes)
  const barsMap            = useSimStore((s) => s.barsMap)
  const symbolConfig       = useSimStore((s) => s.symbolConfig)
  const indic              = useIndicatorStore()
  const emaPeriods         = indic.ema.enabled ? indic.ema.periods : []

  const indicByTF = useMemo(() => {
    const result = {}
    selectedTimeframes.forEach((tf) => {
      const bars   = barsMap[tf] || []
      const closes = bars.map((b) => b.close)
      const times  = bars.map((b) => b.time)
      result[tf] = {
        times, closes,
        ema:       indic.ema.enabled ? calcEMAs(closes, emaPeriods) : {},
        emaPeriods,
        bb:        calcBB(closes, indic.bb.period, indic.bb.stdDev),
        rsi:       calcRSI(closes, indic.rsi.period),
      }
    })
    return result
  }, [selectedTimeframes, barsMap, emaPeriods, indic.bb, indic.rsi])

  // chartId = the timeframe string — required for per-chart DrawingManager isolation
  const renderChart = (tf) => (
    <ChartPane
      chartId={tf}
      chartR={chartRefs[tf]}
      bars={barsMap[tf] || []}
      times={indicByTF[tf]?.times || []}
      emaValues={indicByTF[tf]?.ema || {}}
      emaPeriods={emaPeriods}
      bbData={indicByTF[tf]?.bb || { mid: [], upper: [], lower: [] }}
      symbolConfig={symbolConfig}
    />
  )

  const renderRsi = (tf) =>
    showRsi && rsiRefsMap[tf] ? (
      <RsiPane
        rsiR={rsiRefsMap[tf]}
        bars={barsMap[tf] || []}
        times={indicByTF[tf]?.times || []}
        rsiVals={indicByTF[tf]?.rsi || []}
        mainChartRef={chartRefs[tf]?.chart}
      />
    ) : null

  const header = (tf, size = 14) => (
    <div style={{
      padding: '8px 14px',
      background: 'var(--surf)',
      borderBottom: '1px solid var(--border)',
      fontSize: size,
      fontWeight: 600,
      color: 'var(--text)',
    }}>
      {TF_LABEL[tf] || tf}
    </div>
  )

  if (selectedTimeframes.length === 1) {
    const [tf] = selectedTimeframes
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {header(tf)}{renderChart(tf)}{renderRsi(tf)}
        </div>
      </div>
    )
  }

  if (selectedTimeframes.length === 2) {
    const [tf1, tf2] = selectedTimeframes
    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          {header(tf1)}{renderChart(tf1)}{renderRsi(tf1)}
        </div>
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {header(tf2, 12)}{renderChart(tf2)}{renderRsi(tf2)}
        </div>
      </div>
    )
  }

  const [tf1, tf2, tf3] = selectedTimeframes
  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
        {header(tf1)}{renderChart(tf1)}{renderRsi(tf1)}
      </div>
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
          {header(tf2, 12)}{renderChart(tf2)}{renderRsi(tf2)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {header(tf3, 12)}{renderChart(tf3)}{renderRsi(tf3)}
        </div>
      </div>
    </div>
  )
}
