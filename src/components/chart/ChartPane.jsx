import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { useTheme, useThemeStore } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { buildLine } from '../../utils/indicators'
import { getDecimalPlaces, msToSeconds } from '../../utils/tradingUtils'

/**
 * Renders the main candlestick + overlay chart.
 * Populates `chartR` refs on mount so the sim engine can call .update() directly.
 */
export function ChartPane({ chartR, bars, times, ema20v, ema50v, bbData, symbolConfig }) {
  const containerRef = useRef(null)
  const lastSizeRef = useRef({ width: 0, height: 0 })
  const resizeObserverRef = useRef(null)
  const C = useTheme()
  const dark = useThemeStore((s) => s.dark)
  const cursor = useSimStore((s) => s.cursor)
  const setHoverBar = useSimStore((s) => s.setHoverBar)
  const indic = useIndicatorStore()
  const trades = useTradeStore((s) => s.trades)

  // Keep track of which trades have markers deployed
  const tradeMarkersRef = useRef({})  // { tradeId: { entry, sl, tp } }

  // Get decimal places from symbol config
  const decimals = symbolConfig ? getDecimalPlaces(symbolConfig.tick_size) : 5

  // ── Initialize chart on first mount (or when bars change) ──
  useEffect(() => {
    // Guard: need container, bars, and symbolConfig
    if (!containerRef.current || !bars || bars.length === 0 || !symbolConfig) {
      return
    }

    // Calculate minMove from tick_size
    const minMove = symbolConfig.tick_size || 0.00001

    const chart = createChart(containerRef.current, {
      // autoSize:true,
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
      localization: {
        locale: 'en-US',
        dateFormat: 'yyyy-MM-dd',
        timeFormat: 'HH:mm',
      },
    })

    // ── Candle series ──
    const candle = chart.addCandlestickSeries({
      upColor: C.green,
      downColor: C.red,
      borderUpColor: C.green,
      borderDownColor: C.red,
      wickUpColor: C.green + '99',
      wickDownColor: C.red + '99',
      priceFormat: { type: 'price', precision: decimals, minMove },
    })

    // ── Volume histogram (hidden price scale) ──
    const vol = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })

    // ── Overlay line series ──
    const mkLine = (color, w = 1, style = 0) =>
      chart.addLineSeries({ color, lineWidth: w, lastValueVisible: false, priceLineVisible: false, lineStyle: style })

    const e20 = mkLine(C.amber)
    const e50 = mkLine(C.purple)
    const bMid = mkLine(C.blue + 'aa')
    const bUp = mkLine(C.blue + '55')
    const bLow = mkLine(C.blue + '55')

    // ── Seed initial data up to current cursor ──
    const slice = bars.slice(0, cursor)
    // Convert millisecond timestamps to seconds for TradingView
    const candleData = slice.map(b => ({ ...b, time: msToSeconds(b.time) }))
    const volData = slice.map((b) => ({
      time: msToSeconds(b.time),
      value: b.volume,
      color: b.close >= b.open ? C.green + '33' : C.red + '33',
    }))

    candle.setData(candleData)
    vol.setData(volData)
    e20.setData(indic.ema20 ? buildLine(ema20v, cursor, times) : [])
    e50.setData(indic.ema50 ? buildLine(ema50v, cursor, times) : [])
    bMid.setData(indic.bb ? buildLine(bbData.mid, cursor, times) : [])
    bUp.setData(indic.bb ? buildLine(bbData.upper, cursor, times) : [])
    bLow.setData(indic.bb ? buildLine(bbData.lower, cursor, times) : [])

    // ── Adjust price scale to show more granular price levels ──
    chart.priceScale('right').applyOptions({
      autoScale: true,
      mode: 0,  // linear scale
    })
    chart.timeScale().fitContent()

    // ── Crosshair OHLCV tooltip ──
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setHoverBar(null); return }
      const d = param.seriesData.get(candle)
      if (d) setHoverBar(d)
    })

    // ── Populate refs for sim engine ──
    chartR.chart.current = chart
    chartR.candle.current = candle
    chartR.vol.current = vol
    chartR.ema20.current = e20
    chartR.ema50.current = e50
    chartR.bbMid.current = bMid
    chartR.bbUp.current = bUp
    chartR.bbLow.current = bLow

    // ── ResizeObserver for responsive sizing (fires when container size changes) ──
    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (chartR.chart.current && entry.contentRect) {
          requestAnimationFrame(() => {
            const width = entry.contentRect.width
            const height = entry.contentRect.height
            if (width > 0 && height > 0) {
              chartR.chart.current?.resize(width, height)
            }
          })
        }
      }
    })
    resizeObserverRef.current.observe(containerRef.current)

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      chart.remove()
      chartR.chart.current = null
      chartR.candle.current = null
      chartR.vol.current = null
      chartR.ema20.current = null
      chartR.ema50.current = null
      chartR.bbMid.current = null
      chartR.bbUp.current = null
      chartR.bbLow.current = null
    }
  }, [bars, symbolConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update chart theme when dark/light toggles ────────────
  useEffect(() => {
    if (!chartR.chart.current) return
    chartR.chart.current.applyOptions({
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      crosshair: {
        vertLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
        horzLine: { color: C.amber + '50', labelBackgroundColor: C.amberD },
      },
    })
    chartR.candle.current?.applyOptions({
      upColor: C.green,
      downColor: C.red,
      borderUpColor: C.green,
      borderDownColor: C.red,
    })
  }, [dark]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trigger resize check on cursor changes (for during playback) ──
  useEffect(() => {
    if (!chartR.chart.current || !containerRef.current) return
    
    const currentWidth = containerRef.current.clientWidth
    const currentHeight = containerRef.current.clientHeight
    
    if (currentWidth > 0 && currentHeight > 0 && 
        (currentWidth !== lastSizeRef.current.width || 
         currentHeight !== lastSizeRef.current.height)) {
      lastSizeRef.current = { width: currentWidth, height: currentHeight }
      chartR.chart.current?.resize(currentWidth, currentHeight)
    }
  }, [cursor, chartR])
  useEffect(() => {
    if (!chartR.chart.current || !bars.length) return

    const chart = chartR.chart.current
    const markers = tradeMarkersRef.current

    // Sync trade markers with current trades
    trades.forEach((trade) => {
      const tid = trade.id
      const isOpen = trade.status === 'open'
      const entryTime = msToSeconds(trade.openTime)

      // If trade markers don't exist and trade is open, create them
      if (!markers[tid] && isOpen) {
        // Create line series for entry, SL, TP
        const mkLine = (color) =>
          chart.addLineSeries({
            color,
            lineWidth: 1.5,
            lineStyle: 2,  // Dashed line
            lastValueVisible: true,
            priceLineVisible: true,
            priceLineColor: color,
          })

        const entryLine = mkLine(C.amber)

        // Add entry line
        entryLine.setData([{ time: entryTime, value: trade.entry }])

        markers[tid] = { entry: entryLine, sl: null, tp: null }
      }

      // Handle SL line - create if missing, update if exists
      if (markers[tid] && isOpen) {
        if (trade.sl) {
          if (!markers[tid].sl) {
            // Create SL line if it doesn't exist
            const slLine = chart.addLineSeries({
              color: C.red,
              lineWidth: 1.5,
              lineStyle: 2,
              lastValueVisible: true,
              priceLineVisible: true,
              priceLineColor: C.red,
            })
            slLine.setData([{ time: entryTime, value: trade.sl }])
            markers[tid].sl = slLine
          } else {
            // Update existing SL line
            try {
              markers[tid].sl.update({ time: entryTime, value: trade.sl })
            } catch (e) { }
          }
        } else if (markers[tid].sl) {
          // Remove SL line if trade no longer has SL
          try {
            chart.removeSeries(markers[tid].sl)
            markers[tid].sl = null
          } catch (e) { }
        }

        // Handle TP line - create if missing, update if exists
        if (trade.tp) {
          if (!markers[tid].tp) {
            // Create TP line if it doesn't exist
            const tpLine = chart.addLineSeries({
              color: C.green,
              lineWidth: 1.5,
              lineStyle: 2,
              lastValueVisible: true,
              priceLineVisible: true,
              priceLineColor: C.blue,
            })
            tpLine.setData([{ time: entryTime, value: trade.tp }])
            markers[tid].tp = tpLine
          } else {
            // Update existing TP line
            try {
              markers[tid].tp.update({ time: entryTime, value: trade.tp })
            } catch (e) { }
          }
        } else if (markers[tid].tp) {
          // Remove TP line if trade no longer has TP
          try {
            chart.removeSeries(markers[tid].tp)
            markers[tid].tp = null
          } catch (e) { }
        }
      }

      // If trade was open but is now closed, remove markers
      if (markers[tid] && !isOpen) {
        try {
          if (markers[tid].entry) chart.removeSeries(markers[tid].entry)
          if (markers[tid].sl) chart.removeSeries(markers[tid].sl)
          if (markers[tid].tp) chart.removeSeries(markers[tid].tp)
        } catch (e) { }
        delete markers[tid]
      }
    })
  }, [trades, bars, chartR, C]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} style={{ display: 'flex', flex: 1, minWidth: 0, overflow: 'hidden' }} />
  )
}
