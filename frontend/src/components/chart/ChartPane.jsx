import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { useTheme, useThemeStore }    from '../../store/useThemeStore'
import { useSimStore }                from '../../store/useSimStore'
import { useIndicatorStore }          from '../../store/useIndicatorStore'
import { buildLine }                  from '../../utils/indicators'

/**
 * Renders the main candlestick + overlay chart.
 * Populates `chartR` refs on mount so the sim engine can call .update() directly.
 *
 * @param {{ chartR, bars, times, ema20v, ema50v, bbData }} props
 */
export function ChartPane({ chartR, bars, times, ema20v, ema50v, bbData }) {
  const containerRef = useRef(null)
  const C            = useTheme()
  const dark         = useThemeStore((s) => s.dark)
  const cursor       = useSimStore((s) => s.cursor)
  const setHoverBar  = useSimStore((s) => s.setHoverBar)
  const indic        = useIndicatorStore()

  // ── Initialize chart on first mount (or when bars change) ─
  useEffect(() => {
    if (!containerRef.current || !bars.length) return

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { color: C.bg },
        textColor:   C.muted,
        fontFamily:  '"JetBrains Mono","SF Mono",monospace',
      },
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
        horzLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
      },
      rightPriceScale: { borderColor: C.border },
      timeScale:       { borderColor: C.border, timeVisible: true, secondsVisible: false },
    })

    // ── Candle series ──
    const candle = chart.addCandlestickSeries({
      upColor:        C.green,
      downColor:      C.red,
      borderUpColor:  C.green,
      borderDownColor:C.red,
      wickUpColor:    C.green + '99',
      wickDownColor:  C.red  + '99',
    })

    // ── Volume histogram (hidden price scale) ──
    const vol = chart.addHistogramSeries({
      priceFormat:      { type: 'volume' },
      priceScaleId:     'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })

    // ── Overlay line series ──
    const mkLine = (color, w = 1) =>
      chart.addLineSeries({ color, lineWidth: w, lastValueVisible: false, priceLineVisible: false })

    const e20  = mkLine(C.amber)
    const e50  = mkLine(C.purple)
    const bMid = mkLine(C.blue  + 'aa')
    const bUp  = mkLine(C.blue  + '55')
    const bLow = mkLine(C.blue  + '55')

    // ── Seed initial data up to current cursor ──
    const slice = bars.slice(0, cursor)
    candle.setData(slice)
    vol.setData(slice.map((b) => ({
      time:  b.time,
      value: b.volume,
      color: b.close >= b.open ? C.green + '33' : C.red + '33',
    })))
    e20.setData(indic.ema20  ? buildLine(ema20v, cursor, times) : [])
    e50.setData(indic.ema50  ? buildLine(ema50v, cursor, times) : [])
    bMid.setData(indic.bb   ? buildLine(bbData.mid,   cursor, times) : [])
    bUp.setData( indic.bb   ? buildLine(bbData.upper, cursor, times) : [])
    bLow.setData(indic.bb   ? buildLine(bbData.lower, cursor, times) : [])

    // ── Crosshair OHLCV tooltip ──
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setHoverBar(null); return }
      const d = param.seriesData.get(candle)
      if (d) setHoverBar(d)
    })

    // ── Populate refs for sim engine ──
    chartR.chart.current  = chart
    chartR.candle.current = candle
    chartR.vol.current    = vol
    chartR.ema20.current  = e20
    chartR.ema50.current  = e50
    chartR.bbMid.current  = bMid
    chartR.bbUp.current   = bUp
    chartR.bbLow.current  = bLow

    // ── Resize observer ──
    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartR.chart.current  = null
      chartR.candle.current = null
      chartR.vol.current    = null
      chartR.ema20.current  = null
      chartR.ema50.current  = null
      chartR.bbMid.current  = null
      chartR.bbUp.current   = null
      chartR.bbLow.current  = null
    }
  }, [bars]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update chart theme when dark/light toggles ────────────
  useEffect(() => {
    if (!chartR.chart.current) return
    chartR.chart.current.applyOptions({
      layout:    { background: { color: C.bg }, textColor: C.muted },
      grid:      { vertLines: { color: C.border }, horzLines: { color: C.border } },
      crosshair: {
        vertLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
        horzLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
      },
    })
    chartR.candle.current?.applyOptions({
      upColor:        C.green,
      downColor:      C.red,
      borderUpColor:  C.green,
      borderDownColor:C.red,
    })
  }, [dark]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
}