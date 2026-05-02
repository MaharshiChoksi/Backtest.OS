import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { useTheme, useThemeStore } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { buildLine } from '../../utils/indicators'
import { msToSeconds } from '../../utils/tradingUtils'

/**
 * RSI sub-pane chart. Only mounted when indicator.rsi is enabled.
 * Populates `rsiR` refs for the sim engine.
 *
 * @param {{ rsiR, bars, times, rsiVals }} props
 */
export function RsiPane({ rsiR, bars, times, rsiVals, mainChartRef }) {
  const containerRef = useRef(null)
  const C = useTheme()
  const dark = useThemeStore((s) => s.dark)
  const cursor = useSimStore((s) => s.cursor)
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

    const rsiSeries = chart.addLineSeries({
      color: C.purple, lineWidth: 1, lastValueVisible: true, priceLineVisible: true,
    })
    const ob = chart.addLineSeries({
      color: C.red + '60', lineWidth: 1, lastValueVisible: true, priceLineVisible: true, lineStyle: 2,
    })
    const os = chart.addLineSeries({
      color: C.green + '60', lineWidth: 1, lastValueVisible: true, priceLineVisible: true, lineStyle: 2,
    })

    // Set initial data up to cursor only
    if (rsiVals && rsiVals.length > 0) {
      rsiSeries.setData(buildLine(rsiVals, cursor, times))
    }
    // ob/os lines also sliced to cursor
    const slicedBars = bars.slice(0, cursor)
    ob.setData(slicedBars.map((b) => ({ time: msToSeconds(b.time), value: 70 })))
    os.setData(slicedBars.map((b) => ({ time: msToSeconds(b.time), value: 30 })))

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
      if (param && param.time) {
        // Set crosshair on RSI chart at the same time position
        chart.setCrosshairPosition(
          { price: 50, time: param.time },
          rsiSeries
        )
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
  }, [bars]) // ← Added rsiR to deps

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