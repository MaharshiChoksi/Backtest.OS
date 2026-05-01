import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { useTheme, useThemeStore }    from '../../store/useThemeStore'
import { useSimStore }                from '../../store/useSimStore'
import { buildLine }                  from '../../utils/indicators'
import { msToSeconds }                from '../../utils/tradingUtils'

/**
 * RSI sub-pane chart. Only mounted when indicator.rsi is enabled.
 * Populates `rsiR` refs for the sim engine.
 *
 * @param {{ rsiR, bars, times, rsiVals }} props
 */
export function RsiPane({ rsiR, bars, times, rsiVals }) {
  const containerRef = useRef(null)
  const C            = useTheme()
  const dark         = useThemeStore((s) => s.dark)
  const cursor       = useSimStore((s) => s.cursor)

  useEffect(() => {
    if (!containerRef.current || !bars.length) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: C.bg },
        textColor:  C.muted,
        fontFamily: '"JetBrains Mono","SF Mono",monospace',
      },
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border },
      timeScale:       { borderColor: C.border, timeVisible: true, secondsVisible: false, visible: false },
      leftPriceScale:  { visible: false },
    })

    const rsiSeries = chart.addLineSeries({
      color: C.purple, lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
    })
    const ob = chart.addLineSeries({
      color: C.red + '60', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, lineStyle: 2,
    })
    const os = chart.addLineSeries({
      color: C.green + '60', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, lineStyle: 2,
    })

    // Set initial data
    if (rsiVals && rsiVals.length > 0) {
      const rsiData = buildLine(rsiVals, cursor, times)
      rsiSeries.setData(rsiData)
    }
    ob.setData(bars.map((b) => ({ time: msToSeconds(b.time), value: 70 })))
    os.setData(bars.map((b) => ({ time: msToSeconds(b.time), value: 30 })))

    // Fit content to show all data
    chart.timeScale().fitContent()

    // ✓ Store ONLY the rsiSeries (not the chart) in the ref so updates work
    rsiR.chart.current  = chart
    rsiR.series.current = rsiSeries

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      rsiR.chart.current  = null
      rsiR.series.current = null
    }
  }, [bars, rsiVals, cursor, times, C.bg, C.muted, C.border, C.purple, C.red, C.green, rsiR]) // ← Added rsiR to deps

  // Theme update
  useEffect(() => {
    if (!rsiR.chart.current) return
    rsiR.chart.current.applyOptions({
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid:   { vertLines: { color: C.border }, horzLines: { color: C.border } },
    })
  }, [dark, C.bg, C.muted, C.border, rsiR]) // ← Added C.* and rsiR to deps

  return (
    <div style={{ position: 'relative', flexShrink: 0, zIndex: -10 }}>
      <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 11, color: C.purple, letterSpacing: '1px', zIndex: 10, pointerEvents: 'none' }}>
        RSI 14
      </span>
      <div ref={containerRef} style={{ height: 100 }} />
    </div>
  )
}