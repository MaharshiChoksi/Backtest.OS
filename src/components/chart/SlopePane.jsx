import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineSeries } from 'lightweight-charts'
import { useTheme, useThemeStore } from '../../store/useThemeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { chartUnixSeconds, seriesTimeSeconds } from '../../utils/tradingUtils'

export function SlopePane({ slopeR, bars, times, slopeData, mainChartRef }) {
  const containerRef = useRef(null)
  const C = useTheme()
  const dark = useThemeStore((s) => s.dark)

  // ── Chart init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !bars.length) return

    const ic = useIndicatorStore.getState()
    const periods = ic.ema.periods
    const colors = ic.ema.colors

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
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
        visible: false,
      },
      leftPriceScale: { visible: false },
    })

    const series = {}
    periods.forEach((period, idx) => {
      const s = chart.addSeries(LineSeries, {
        color: colors[idx],
        lineWidth: 1,
        lastValueVisible: true,
        priceLineVisible: false,
      })
      s.setData([])
      series[period] = s
    })

    // Anchor series — invisible, spans all bar times so logical ranges match main chart
    const anchor = chart.addSeries(LineSeries, {
      color: 'transparent',
      lineWidth: 0,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    anchor.setData([])

    slopeR.chart.current = chart
    slopeR.series.current = series
    slopeR.anchor.current = anchor

    // ── Time-scale sync (bidirectional logical range, same as RsiPane) ──────
    const syncSlopeFromMain = (range) => {
      if (range) chart.timeScale().setVisibleLogicalRange(range)
    }
    const syncMainFromSlope = (range) => {
      if (range && mainChartRef.current) mainChartRef.current.timeScale().setVisibleLogicalRange(range)
    }

    mainChartRef.current?.timeScale().subscribeVisibleLogicalRangeChange(syncSlopeFromMain)
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncMainFromSlope)

    // ── Crosshair sync ──────────────────────────────────────────────────────────
    const handleMainCrosshairMove = (param) => {
      const firstSeries = Object.values(series)[0]
      if (!firstSeries) return
      if (param?.time !== undefined && param.time !== null) {
        const raw = param.time
        const time =
          typeof raw === 'number'
            ? chartUnixSeconds(raw)
            : typeof raw === 'object' && raw?.timestamp !== undefined
              ? chartUnixSeconds(raw.timestamp)
              : null
        if (time) {
          chart.setCrosshairPosition({ price: 0, time }, firstSeries)
        } else {
          chart.clearCrosshairPosition()
        }
      } else {
        chart.clearCrosshairPosition()
      }
    }

    mainChartRef.current?.subscribeCrosshairMove(handleMainCrosshairMove)

    return () => {
      mainChartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(syncSlopeFromMain)
      mainChartRef.current?.unsubscribeCrosshairMove(handleMainCrosshairMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainFromSlope)
      chart.remove()
      slopeR.chart.current = null
      slopeR.series.current = null
      slopeR.anchor.current = null
    }
  }, [bars, mainChartRef, slopeR])

  // ── Theme update ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slopeR.chart.current) return
    slopeR.chart.current.applyOptions({
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
    })
  }, [dark, C.bg, C.muted, C.border, slopeR])

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: 8,
          fontSize: 11,
          color: C.green,
          letterSpacing: '1px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        Slope
      </span>
      <div ref={containerRef} style={{ height: 100 }} />
    </div>
  )
}
