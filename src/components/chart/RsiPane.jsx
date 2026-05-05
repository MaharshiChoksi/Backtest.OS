import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineSeries } from 'lightweight-charts'
import { useTheme, useThemeStore } from '../../store/useThemeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { chartUnixSeconds } from '../../utils/tradingUtils'

/**
 * RSI sub-pane chart. Only mounted when indicator.rsi is enabled.
 * Populates `rsiR` refs for the sim engine.
 *
 * Series data is filled by {@link ../../hooks/useSimEngine seekTo/processBar}; the pane mounts with empty series to avoid slicing mismatch (primary cursor ≠ higher‑TF indices).
 *
 * @param {{ rsiR, bars, times, rsiVals, mainChartRef }} props
 */
export function RsiPane({ rsiR, bars, times, rsiVals, mainChartRef }) {
  const containerRef = useRef(null)
  const C = useTheme()
  const dark = useThemeStore((s) => s.dark)
  const indic = useIndicatorStore()
  const rsiPeriod = indic.rsi.period

  useEffect(() => {
    if (!containerRef.current || !bars.length) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: C.bg },
        textColor: C.muted,
        fontFamily: '"JetBrains Mono","SF Mono",monospace',
      },
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, visible: false },
      leftPriceScale: { visible: false },
    })

    const rsiSeries = chart.addSeries(LineSeries, {
      color: C.purple, lineWidth: 1, lastValueVisible: true, priceLineVisible: true,
    })
    const ob = chart.addSeries(LineSeries, {
      color: C.red + '60', lineWidth: 1, lastValueVisible: true, priceLineVisible: true, lineStyle: 2,
    })
    const os = chart.addSeries(LineSeries, {
      color: C.green + '60', lineWidth: 1, lastValueVisible: true, priceLineVisible: true, lineStyle: 2,
    })

    rsiSeries.setData([])
    ob.setData([])
    os.setData([])

    // Fit content to show all data
    chart.timeScale().fitContent()

    // ✓ Store ONLY the rsiSeries (not the chart) in the ref so updates work
    rsiR.chart.current = chart
    // ── Sync time scales bidirectionally ──
    const syncRsiFromMain = (range) => {
      if (range) chart.timeScale().setVisibleLogicalRange(range)
    }
    const syncMainFromRsi = (range) => {
      if (range && mainChartRef.current) mainChartRef.current.timeScale().setVisibleLogicalRange(range)
    }

    mainChartRef.current?.timeScale().subscribeVisibleLogicalRangeChange(syncRsiFromMain)
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncMainFromRsi)

    // ── Sync crosshair movement ──
    const handleMainCrosshairMove = (param) => {
      if (param?.time !== undefined && param.time !== null) {
        const raw = param.time
        const time =
          typeof raw === 'number'
            ? chartUnixSeconds(raw)
            : typeof raw === 'object' && raw?.timestamp !== undefined
              ? chartUnixSeconds(raw.timestamp)
              : null
        if (time) {
          chart.setCrosshairPosition({ price: 50, time }, rsiSeries)
        } else {
          chart.clearCrosshairPosition()
        }
      } else {
        chart.clearCrosshairPosition()
      }
    }
    
    // Subscribe to main chart's crosshair moves
    mainChartRef.current?.subscribeCrosshairMove(handleMainCrosshairMove)

    rsiR.series.current = rsiSeries
    rsiR.ob.current = ob
    rsiR.os.current = os

    return () => {
      mainChartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(syncRsiFromMain)
      mainChartRef.current?.unsubscribeCrosshairMove(handleMainCrosshairMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainFromRsi)
      chart.remove()
      rsiR.chart.current = null
      rsiR.series.current = null
      rsiR.ob.current = null
      rsiR.os.current = null
    }
  }, [bars, times, rsiVals, rsiPeriod, mainChartRef, rsiR])

  // Theme update
  useEffect(() => {
    if (!rsiR.chart.current) return
    rsiR.chart.current.applyOptions({
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
    })
  }, [dark, C.bg, C.muted, C.border, rsiR]) // ← Added C.* and rsiR to deps

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 11, color: C.purple, letterSpacing: '1px', zIndex: 10, pointerEvents: 'none' }}>
        RSI {rsiPeriod}
      </span>
      <div ref={containerRef} style={{ height: 100 }} />
    </div>
  )
}