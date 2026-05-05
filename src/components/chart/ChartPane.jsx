import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
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
 * Drawing interaction is implemented manually because lightweight-charts-drawing
 * has no built-in setActiveTool() interactive mode. We follow the exact pattern
 * from the library's demo:
 *   1. On click → convert pixel to { time, price } anchor
 *   2. Accumulate anchors until we have requiredAnchors for the active tool
 *   3. Show a rubber-band preview drawing during placement
 *   4. On final anchor → call registry.createDrawing() then manager.addDrawing()
 *
 * @prop {string} [chartId='default']  Unique key per chart for the DrawingManager map.
 */
export function ChartPane({ chartR, bars, times, emaValues, emaPeriods, bbData, symbolConfig, chartId = 'default' }) {
  const containerRef = useRef(null)
  const lastSizeRef  = useRef({ width: 0, height: 0 })
  const resizeObserverRef = useRef(null)

  // Drawing interaction state — kept in refs so event listeners always see current values
  const managerRef       = useRef(null)
  const pendingAnchors   = useRef([])
  const previewDrawing   = useRef(null)
  const activeToolRef    = useRef(null)  // mirrors store, accessible in closures

  const C    = useTheme()
  const dark = useThemeStore((s) => s.dark)
  const cursor     = useSimStore((s) => s.cursor)
  const setHoverBar = useSimStore((s) => s.setHoverBar)
  const indic  = useIndicatorStore()
  const trades = useTradeStore((s) => s.trades)
  const tradeMarkersRef = useRef({})

  const decimals = symbolConfig ? getDecimalPlaces(symbolConfig.tick_size) : 5

  // ── Chart init ─────────────────────────────────────────────────────────────
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

    const candle = chart.addCandlestickSeries({
      upColor: C.green, downColor: C.red,
      borderUpColor: C.green, borderDownColor: C.red,
      wickUpColor: C.green + '99', wickDownColor: C.red + '99',
      priceFormat: { type: 'price', precision: decimals, minMove },
    })

    const vol = chart.addHistogramSeries({
      priceFormat: { type: 'volume' }, priceScaleId: 'vol',
      lastValueVisible: false, priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })

    const mkLine = (color, w = 1, style = 0) =>
      chart.addLineSeries({ color, lineWidth: w, lastValueVisible: false, priceLineVisible: false, lineStyle: style })

    const emaLines = {}
    chartR.ema = {}
    if (indic.ema.enabled && emaPeriods) {
      emaPeriods.forEach((period, idx) => {
        const line = mkLine(indic.ema.colors[idx] || C.amber)
        emaLines[period] = line
        chartR.ema[period] = { current: line }
      })
    }

    let bMid, bUp, bLow
    if (indic.bb.enabled) {
      bMid = mkLine(C.blue + 'aa')
      bUp  = mkLine(C.blue + '55')
      bLow = mkLine(C.blue + '55')
    }

    const slice      = bars.slice(0, cursor)
    const candleData = slice.map(b => ({ ...b, time: msToSeconds(b.time) }))
    const volData    = slice.map(b => ({
      time: msToSeconds(b.time), value: b.volume,
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

    chartR.chart.current  = chart
    chartR.candle.current = candle
    chartR.vol.current    = vol
    chartR.bbMid.current  = bMid
    chartR.bbUp.current   = bUp
    chartR.bbLow.current  = bLow

    // Init DrawingManager and store ref for interaction effects
    const manager = useDrawingStore.getState().initManager(chartId, chart, candle, containerRef.current)
    managerRef.current = manager

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
      chartR.bbMid.current = chartR.bbUp.current = chartR.bbLow.current = null
      chartR.ema = {}
    }
  }, [bars, symbolConfig, indic.ema.enabled, indic.bb.enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drawing interaction ────────────────────────────────────────────────────
  // This effect re-runs whenever activeTool changes, wiring/unwiring the correct
  // click and mousemove handlers for the currently selected drawing tool.
  useEffect(() => {
    return useDrawingStore.subscribe(
      (state) => state.activeTool,
      (tool) => { activeToolRef.current = tool }
    )
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Helpers to convert DOM pixel coords → chart anchor
    const toAnchor = (event) => {
      const chart   = chartR.chart.current
      const candle  = chartR.candle.current
      if (!chart || !candle) return null

      const rect  = container.getBoundingClientRect()
      const x     = event.clientX - rect.left
      const y     = event.clientY - rect.top
      const time  = chart.timeScale().coordinateToTime(x)
      const price = candle.coordinateToPrice(y)
      if (time === null || price === null) return null
      return { time, price }
    }

    const PREVIEW_ID = `__preview_${chartId}__`

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

    // ── Click handler ──────────────────────────────────────────────────────
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
        // Drawing is complete — create the final drawing
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
        // First anchor placed — init/update preview
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

    // ── Mouse move handler — rubber-band preview ──────────────────────────
    const handleMouseMove = (event) => {
      const tool = useDrawingStore.getState().activeTool
      if (!tool || !previewDrawing.current || pendingAnchors.current.length === 0) return

      const anchor = toAnchor(event)
      if (!anchor) return

      const registry = getToolRegistry()
      const toolDef  = registry.get(tool)
      if (!toolDef) return

      // Update the "in-flight" anchor (the one following the mouse)
      const updateIndex = pendingAnchors.current.length
      try {
        previewDrawing.current.updateAnchor(updateIndex, anchor)
      } catch (_) {}
    }

    // ── Escape — cancel in-progress drawing ──────────────────────────────
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') cancelDrawing()
    }

    container.addEventListener('click', handleClick)
    container.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('keydown', handleKeyDown)

    // When tool changes (including to null/cursor), cancel any in-progress drawing
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

  // ── Theme update ────────────────────────────────────────────────────────────
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

  // ── Resize on cursor change ─────────────────────────────────────────────────
  useEffect(() => {
    if (!chartR.chart.current || !containerRef.current) return
    const w = containerRef.current.clientWidth
    const h = containerRef.current.clientHeight
    if (w > 0 && h > 0 && (w !== lastSizeRef.current.width || h !== lastSizeRef.current.height)) {
      lastSizeRef.current = { width: w, height: h }
      chartR.chart.current?.resize(w, h)
    }
  }, [cursor, chartR])

  // ── Trade markers ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartR.chart.current || !bars.length) return
    const chart   = chartR.chart.current
    const markers = tradeMarkersRef.current

    trades.forEach((trade) => {
      const tid    = trade.id
      const isOpen = trade.status === 'open'
      const entryTime = msToSeconds(trade.openTime)

      if (!markers[tid] && isOpen) {
        const mkLine = (color) => chart.addLineSeries({
          color, lineWidth: 1.5, lineStyle: 2,
          lastValueVisible: true, priceLineVisible: true, priceLineColor: color,
        })
        const entryLine = mkLine(C.amber)
        entryLine.setData([{ time: entryTime, value: trade.entry }])
        markers[tid] = { entry: entryLine, sl: null, tp: null }
      }

      if (markers[tid] && isOpen) {
        if (trade.sl) {
          if (!markers[tid].sl) {
            const sl = chart.addLineSeries({ color: C.red, lineWidth: 1.5, lineStyle: 2, lastValueVisible: true, priceLineVisible: true, priceLineColor: C.red })
            sl.setData([{ time: entryTime, value: trade.sl }])
            markers[tid].sl = sl
          } else { try { markers[tid].sl.update({ time: entryTime, value: trade.sl }) } catch (_) {} }
        } else if (markers[tid].sl) {
          try { chart.removeSeries(markers[tid].sl); markers[tid].sl = null } catch (_) {}
        }

        if (trade.tp) {
          if (!markers[tid].tp) {
            const tp = chart.addLineSeries({ color: C.green, lineWidth: 1.5, lineStyle: 2, lastValueVisible: true, priceLineVisible: true, priceLineColor: C.blue })
            tp.setData([{ time: entryTime, value: trade.tp }])
            markers[tid].tp = tp
          } else { try { markers[tid].tp.update({ time: entryTime, value: trade.tp }) } catch (_) {} }
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
