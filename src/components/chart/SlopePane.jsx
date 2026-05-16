import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineSeries } from 'lightweight-charts'
import { useTheme, useThemeStore } from '../../store/useThemeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { chartUnixSeconds } from '../../utils/tradingUtils'

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

    slopeR.chart.current = chart
    slopeR.series.current = series

    // ── Time-scale sync ─────────────────────────────────────────────────────────
    // subscribeVisibleLogicalRangeChange fires for ALL scroll/zoom/pan events
    // including empty space — reliable trigger.
    // We use time ranges (via getVisibleRange) rather than logical indices because
    // the slope chart has fewer data points (EMA warmup skips the first ~N bars).
    // Initial sync is handled by seekTo after slope data is set.
    let syncing = false

    const syncSlopeFromMain = () => {
      if (syncing) return
      const range = mainChartRef.current?.timeScale().getVisibleRange()
      if (!range) return
      syncing = true
      try { chart.timeScale().setVisibleRange(range) } catch (_) {}
      syncing = false
    }

    const syncMainFromSlope = () => {
      if (syncing || !mainChartRef.current) return
      const range = chart.timeScale().getVisibleRange()
      if (!range) return
      syncing = true
      try { mainChartRef.current.timeScale().setVisibleRange(range) } catch (_) {}
      syncing = false
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
