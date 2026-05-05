import { useEffect, useRef } from 'react'
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,  // v5: imported directly, passed to chart.addSeries()
  LineSeries,         // v5: replaces chart.addLineSeries()
  HistogramSeries,    // v5: replaces chart.addHistogramSeries()
} from 'lightweight-charts'
import { getToolRegistry } from 'lightweight-charts-drawing'
import { useTheme, useThemeStore } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { useDrawingStore } from '../../store/useDrawingStore'
import { buildLine } from '../../utils/indicators'
import { getDecimalPlaces, msToSeconds } from '../../utils/tradingUtils'

let drawingIdCounter = 0

/**
 * Renders the main candlestick + overlay chart.
 *
 * v5 migration notes:
 *   - chart.addCandlestickSeries(opts)  →  chart.addSeries(CandlestickSeries, opts)
 *   - chart.addLineSeries(opts)         →  chart.addSeries(LineSeries, opts)
 *   - chart.addHistogramSeries(opts)    →  chart.addSeries(HistogramSeries, opts)
 *   All three series types must now be explicitly imported from 'lightweight-charts'.
 *   chart.removeSeries() is unchanged.
 *
 * @prop {string} [chartId='default']  Unique key per chart for the DrawingManager map.
 */
export function ChartPane({ chartR, bars, times, emaValues, emaPeriods, bbData, symbolConfig, chartId = 'default' }) {
  const containerRef = useRef(null)
  const lastSizeRef  = useRef({ width: 0, height: 0 })
  const resizeObserverRef = useRef(null)

  // Drawing interaction — kept in refs so event listener closures always see current values
  const managerRef     = useRef(null)
  const pendingAnchors = useRef([])
  const previewDrawing = useRef(null)

  const C    = useTheme()
  const dark = useThemeStore((s) => s.dark)
  const cursor      = useSimStore((s) => s.cursor)
  const setHoverBar = useSimStore((s) => s.setHoverBar)
  const indic  = useIndicatorStore()
  const trades = useTradeStore((s) => s.trades)
  const tradeMarkersRef = useRef({})

  const decimals = symbolConfig ? getDecimalPlaces(symbolConfig.tick_size) : 5

  // ── Chart initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !bars?.length || !symbolConfig) return

    const minMove = symbolConfig.tick_size || 0.00001

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: C.bg },
        textColor: C.muted,
        fontFamily: '"JetBrains Mono","SF Mono",monospace',
        fontSize: 13,
      },
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
        horzLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
      },
      rightPriceScale: {
        borderColor: C.border,
        format: { type: 'price', precision: decimals, minMove },
        autoScale: true,
        mode: 0,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
      localization: { locale: 'en-US', dateFormat: 'yyyy-MM-dd', timeFormat: 'HH:mm' },
    })

    // ── v5 series creation ─────────────────────────────────────────────────────
    // All series are now created via chart.addSeries(SeriesType, options).
    // The old chart.addCandlestickSeries / addLineSeries / addHistogramSeries
    // methods no longer exist in v5.

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: C.green,
      downColor: C.red,
      borderUpColor: C.green,
      borderDownColor: C.red,
      wickUpColor: C.green + '99',
      wickDownColor: C.red + '99',
      priceFormat: { type: 'price', precision: decimals, minMove },
    })

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })

    // Shared helper for all overlay line series (EMA, BB bands)
    const mkLine = (color, w = 1, style = 0) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: w,
        lineStyle: style,
        lastValueVisible: false,
        priceLineVisible: false,
      })

    // ── EMA lines ──────────────────────────────────────────────────────────────
    const emaLines = {}
    chartR.ema = {}
    if (indic.ema.enabled && emaPeriods) {
      emaPeriods.forEach((period, idx) => {
        const line = mkLine(indic.ema.colors[idx] || C.amber)
        emaLines[period] = line
        chartR.ema[period] = { current: line }
      })
    }

    // ── Bollinger Bands ─────────────────────────────────────────────────────────
    let bMid, bUp, bLow
    if (indic.bb.enabled) {
      bMid = mkLine(C.blue + 'aa')
      bUp  = mkLine(C.blue + '55')
      bLow = mkLine(C.blue + '55')
    }

    // ── Seed initial data up to current cursor ──────────────────────────────────
    const slice      = bars.slice(0, cursor)
    const candleData = slice.map(b => ({ ...b, time: msToSeconds(b.time) }))
    const volData    = slice.map(b => ({
      time:  msToSeconds(b.time),
      value: b.volume,
      color: b.close >= b.open ? C.green + '33' : C.red + '33',
    }))
    candle.setData(candleData)
    vol.setData(volData)

    if (indic.ema.enabled && emaValues && emaPeriods) {
      emaPeriods.forEach((period) => {
        const values = emaValues[period]
        if (emaLines[period] && values) emaLines[period].setData(buildLine(values, cursor, times))
      })
    }
    if (indic.bb.enabled && bbData) {
      bMid?.setData(buildLine(bbData.mid,   cursor, times))
      bUp?.setData(buildLine(bbData.upper,  cursor, times))
      bLow?.setData(buildLine(bbData.lower, cursor, times))
    }

    chart.priceScale('right').applyOptions({ autoScale: true, mode: 0 })
    chart.timeScale().fitContent()

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setHoverBar(null); return }
      const d = param.seriesData.get(candle)
      if (d) setHoverBar(d)
    })

    // ── Populate refs for sim engine ────────────────────────────────────────────
    chartR.chart.current  = chart
    chartR.candle.current = candle
    chartR.vol.current    = vol
    chartR.bbMid.current  = bMid
    chartR.bbUp.current   = bUp
    chartR.bbLow.current  = bLow

    // ── Drawing manager ─────────────────────────────────────────────────────────
    const manager = useDrawingStore.getState().initManager(chartId, chart, candle, containerRef.current)
    managerRef.current = manager

    // ── ResizeObserver ──────────────────────────────────────────────────────────
    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (chartR.chart.current && entry.contentRect) {
          requestAnimationFrame(() => {
            const { width, height } = entry.contentRect
            if (width > 0 && height > 0) chartR.chart.current?.resize(width, height)
          })
        }
      }
    })
    resizeObserverRef.current.observe(containerRef.current)

    return () => {
      resizeObserverRef.current?.disconnect()
      useDrawingStore.getState().destroyManager(chartId)
      managerRef.current = null
      chart.remove()
      chartR.chart.current = chartR.candle.current = chartR.vol.current = null
      chartR.bbMid.current = chartR.bbUp.current   = chartR.bbLow.current = null
      chartR.ema = {}
    }
  }, [bars, symbolConfig, indic.ema.enabled, indic.bb.enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drawing interaction loop ────────────────────────────────────────────────
  // The library has no built-in interactive mode. Every anchor must be collected
  // manually from DOM click events and fed to registry.createDrawing().
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const PREVIEW_ID = `__preview_${chartId}__`

    const toAnchor = (event) => {
      const chart  = chartR.chart.current
      const candle = chartR.candle.current
      if (!chart || !candle) return null
      const rect  = container.getBoundingClientRect()
      const x     = event.clientX - rect.left
      const y     = event.clientY - rect.top
      const time  = chart.timeScale().coordinateToTime(x)
      const price = candle.coordinateToPrice(y)
      if (time === null || price === null) return null
      return { time, price }
    }

    const removePreview = () => {
      if (previewDrawing.current) {
        try { managerRef.current?.removeDrawing(PREVIEW_ID) } catch (_) {}
        previewDrawing.current = null
      }
    }

    const cancelDrawing = () => {
      removePreview()
      pendingAnchors.current = []
    }

    const handleClick = (event) => {
      const tool = useDrawingStore.getState().activeTool
      if (!tool || !managerRef.current) return

      const anchor = toAnchor(event)
      if (!anchor) return

      const registry = getToolRegistry()
      const toolDef  = registry.get(tool)
      if (!toolDef) return

      const required = toolDef.requiredAnchors ?? 2
      pendingAnchors.current.push(anchor)

      if (pendingAnchors.current.length >= required) {
        removePreview()
        const id      = `drawing-${++drawingIdCounter}`
        const anchors = [...pendingAnchors.current]
        pendingAnchors.current = []

        const drawing = registry.createDrawing(tool, id, anchors, {
          lineColor: '#2962FF',
          lineWidth: 2,
          fillColor: '#2962FF33',
        })
        if (drawing) {
          managerRef.current.addDrawing(drawing)
          managerRef.current.selectDrawing(id)
        }
      } else {
        // First anchor placed — init rubber-band preview
        const previewAnchors = [
          ...pendingAnchors.current,
          ...Array(required - pendingAnchors.current.length).fill(anchor),
        ]
        removePreview()
        const drawing = registry.createDrawing(tool, PREVIEW_ID, previewAnchors, {
          lineColor: '#2962FF99',
          lineWidth: 1,
          fillColor: '#2962FF22',
        })
        if (drawing) {
          managerRef.current.addDrawing(drawing)
          previewDrawing.current = drawing
        }
      }
    }

    const handleMouseMove = (event) => {
      const tool = useDrawingStore.getState().activeTool
      if (!tool || !previewDrawing.current || pendingAnchors.current.length === 0) return

      const anchor = toAnchor(event)
      if (!anchor) return

      const registry = getToolRegistry()
      const toolDef  = registry.get(tool)
      if (!toolDef) return

      try {
        previewDrawing.current.updateAnchor(pendingAnchors.current.length, anchor)
      } catch (_) {}
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') cancelDrawing()
    }

    container.addEventListener('click', handleClick)
    container.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('keydown', handleKeyDown)

    const unsubscribe = useDrawingStore.subscribe(
      (s) => s.activeTool,
      () => cancelDrawing()
    )

    return () => {
      container.removeEventListener('click', handleClick)
      container.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('keydown', handleKeyDown)
      unsubscribe()
    }
  }, [chartId, chartR]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme update ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartR.chart.current) return
    chartR.chart.current.applyOptions({
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid:   { vertLines: { color: C.border }, horzLines: { color: C.border } },
      crosshair: {
        vertLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
        horzLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
      },
    })
    chartR.candle.current?.applyOptions({
      upColor: C.green, downColor: C.red,
      borderUpColor: C.green, borderDownColor: C.red,
    })
  }, [dark]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize on cursor change ───────────────────────────────────────────────────
  useEffect(() => {
    if (!chartR.chart.current || !containerRef.current) return
    const w = containerRef.current.clientWidth
    const h = containerRef.current.clientHeight
    if (w > 0 && h > 0 && (w !== lastSizeRef.current.width || h !== lastSizeRef.current.height)) {
      lastSizeRef.current = { width: w, height: h }
      chartR.chart.current?.resize(w, h)
    }
  }, [cursor, chartR])

  // ── Trade markers ─────────────────────────────────────────────────────────────
  // v5: all addLineSeries() calls replaced with addSeries(LineSeries, opts)
  useEffect(() => {
    if (!chartR.chart.current || !bars.length) return
    const chart   = chartR.chart.current
    const markers = tradeMarkersRef.current

    const mkTradeLine = (color) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 1.5,
        lineStyle: 2,  // dashed
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: color,
      })

    trades.forEach((trade) => {
      const tid     = trade.id
      const isOpen  = trade.status === 'open'
      const entryTime = msToSeconds(trade.openTime)

      if (!markers[tid] && isOpen) {
        const entryLine = mkTradeLine(C.amber)
        entryLine.setData([{ time: entryTime, value: trade.entry }])
        markers[tid] = { entry: entryLine, sl: null, tp: null }
      }

      if (markers[tid] && isOpen) {
        if (trade.sl) {
          if (!markers[tid].sl) {
            const sl = mkTradeLine(C.red)
            sl.setData([{ time: entryTime, value: trade.sl }])
            markers[tid].sl = sl
          } else {
            try { markers[tid].sl.update({ time: entryTime, value: trade.sl }) } catch (_) {}
          }
        } else if (markers[tid].sl) {
          try { chart.removeSeries(markers[tid].sl); markers[tid].sl = null } catch (_) {}
        }

        if (trade.tp) {
          if (!markers[tid].tp) {
            const tp = mkTradeLine(C.green)
            tp.setData([{ time: entryTime, value: trade.tp }])
            markers[tid].tp = tp
          } else {
            try { markers[tid].tp.update({ time: entryTime, value: trade.tp }) } catch (_) {}
          }
        } else if (markers[tid].tp) {
          try { chart.removeSeries(markers[tid].tp); markers[tid].tp = null } catch (_) {}
        }
      }

      if (markers[tid] && !isOpen) {
        try {
          if (markers[tid].entry) chart.removeSeries(markers[tid].entry)
          if (markers[tid].sl)    chart.removeSeries(markers[tid].sl)
          if (markers[tid].tp)    chart.removeSeries(markers[tid].tp)
        } catch (_) {}
        delete markers[tid]
      }
    })
  }, [trades, bars, chartR, C]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} style={{ display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }} />
  )
}