import { useEffect, useRef, useCallback } from 'react'
import { useSimStore }       from '../store/useSimStore'
import { useTradeStore }     from '../store/useTradeStore'
import { useIndicatorStore } from '../store/useIndicatorStore'
import { BASE_MS, getTimeframeMs } from '../constants'
import { buildLine }         from '../utils/indicators'
import { msToSeconds }       from '../utils/tradingUtils'

const G33 = '#36d47c33'
const R33 = '#f0505033'

/**
 * Central simulation engine hook.
 *
 * Features:
 * - Multi-timeframe sync: all charts run at the same cursor position
 * - Future data prevention: higher timeframe bars don't show until they complete
 * - High-performance hot loop: refs-only state during playback
 * - Speed controls: 1x, 5x, 10x, 50x, MAX
 */
export function useSimEngine({ bars, times, ema20v, ema50v, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, rsiR }) {
  // For backwards compatibility with single-timeframe mode, build chartR
  const chartR = isMultiTimeframe ? simChartData[primaryTF]?.refs : { candle: { current: null }, vol: { current: null }, ema20: { current: null }, ema50: { current: null }, bbMid: { current: null }, bbUp: { current: null }, bbLow: { current: null } }
  
  // ── Ref mirrors for all hot-loop state ────────────────────
  const cursorRef   = useRef(useSimStore.getState().cursor)
  const playingRef  = useRef(false)
  const speedRef    = useRef(1)
  const indicRef    = useRef(useIndicatorStore.getState())
  const symbolConfigRef = useRef(useSimStore.getState().symbolConfig)
  const accountConfigRef = useRef(useSimStore.getState().accountConfig)
  const selectedTimeframesRef = useRef(useSimStore.getState().selectedTimeframes)

  // Stable action refs
  const evaluateFillsRef = useRef(null)
  useEffect(() => {
    evaluateFillsRef.current = useTradeStore.getState().evaluateFills
    return useTradeStore.subscribe((s) => { evaluateFillsRef.current = s.evaluateFills })
  }, [])

  // ── Keep all refs in sync with their stores ───────────────
  useEffect(() => {
    const s = useSimStore.getState()
    cursorRef.current  = s.cursor
    playingRef.current = s.playing
    speedRef.current   = s.speed
    symbolConfigRef.current = s.symbolConfig
    accountConfigRef.current = s.accountConfig
    selectedTimeframesRef.current = s.selectedTimeframes

    const unsub = useSimStore.subscribe((s) => {
      if (!playingRef.current) cursorRef.current = s.cursor
      playingRef.current = s.playing
      speedRef.current   = s.speed
      symbolConfigRef.current = s.symbolConfig
      accountConfigRef.current = s.accountConfig
      selectedTimeframesRef.current = s.selectedTimeframes
    })
    return unsub
  }, [])

  useEffect(
    () => useIndicatorStore.subscribe((s) => { indicRef.current = s }),
    [],
  )

  // ── Helper: find latest COMPLETED bar index that doesn't exceed given time ──
  // For higher timeframes, a bar must be FULLY complete to be shown
  const findCompletedBarIndex = useCallback((bars, time, tfMs) => {
    // For the bar to be "completed", the next bar's start time must be <= current time
    // This means we've passed the close of the current bar
    for (let i = bars.length - 1; i >= 0; i--) {
      const bar = bars[i]
      // The bar is complete if:
      // 1. Its start time is <= current time
      // 2. The NEXT bar's start time (bar end + 1ms to ensure we passed it) <= current time
      // OR it's the last bar (always show it)
      if (bar.time <= time) {
        // Check if this is truly complete or still forming
        // A bar is complete if either:
        // - It's the last bar in the dataset
        // - OR the current time >= next bar's start time
        const nextBar = bars[i + 1]
        if (!nextBar || time >= nextBar.time) {
          return i
        }
        // If next bar hasn't started yet, this bar is still forming - use previous bar
        if (i > 0) {
          return i - 1
        }
      }
    }
    return -1
  }, [])

  // ── Helper: find latest bar index that doesn't exceed given time (simple version) ──
  const findBarIndex = useCallback((bars, time) => {
    let idx = -1
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].time <= time) idx = i
      else break
    }
    return idx
  }, [])

  // ── Update a single chart with bar data ──
  const updateSingleChart = useCallback((refs, barData, idx, ic, data) => {
    if (!refs || !refs.candle?.current) return
    
    // Candlestick
    refs.candle.current?.update(barData)
    
    // Volume
    refs.vol.current?.update({
      time: barData.time,
      value: barData.volume,
      color: barData.close >= barData.open ? G33 : R33,
    })
    
    // EMA20
    if (ic.ema20 && data.ema20 && data.ema20[idx] !== null) {
      refs.ema20.current?.update({ time: barData.time, value: data.ema20[idx] })
    }
    
    // EMA50
    if (ic.ema50 && data.ema50 && data.ema50[idx] !== null) {
      refs.ema50.current?.update({ time: barData.time, value: data.ema50[idx] })
    }
    
    // Bollinger Bands
    if (ic.bb && data.bb && data.bb.upper[idx] !== null) {
      refs.bbMid.current?.update({ time: barData.time, value: data.bb.mid[idx] })
      refs.bbUp.current?.update({ time: barData.time, value: data.bb.upper[idx] })
      refs.bbLow.current?.update({ time: barData.time, value: data.bb.lower[idx] })
    }
  }, [])

  // ── Chart update for a single bar (all timeframes) ──
  const updateChartForBar = useCallback(
    (bar, idx) => {
      const ic = indicRef.current
      
      // Convert time to seconds for TradingView
      const barForChart = { ...bar, time: msToSeconds(bar.time) }
      
      // Update primary chart (or single chart)
      const primaryData = isMultiTimeframe ? simChartData[primaryTF]?.data : { ema20: ema20v, ema50: ema50v, bb: bbData, rsi: rsiVals }
      const primaryRefs = isMultiTimeframe ? simChartData[primaryTF]?.refs : chartR
      
      updateSingleChart(primaryRefs, barForChart, idx, ic, primaryData)
      
      // Update RSI (only in single timeframe mode)
      if (!isMultiTimeframe && ic.rsi && rsiVals[idx] !== null) {
        rsiR.series.current?.update({ time: barForChart.time, value: rsiVals[idx] })
      }
      
      // ── Update other timeframes in multi-timeframe mode ──
      if (isMultiTimeframe && simChartData) {
        const currentTime = bar.time
        
        Object.keys(simChartData).forEach((tf) => {
          if (tf === primaryTF) return  // Already updated above
          
          const tfData = simChartData[tf]?.data
          const tfRefs = simChartData[tf]?.refs
          if (!tfData || !tfRefs || !tfRefs.candle?.current) return
          
          // Get timeframe in milliseconds for future data prevention
          const tfMs = getTimeframeMs(tf)
          
          // Find the latest COMPLETED bar that doesn't exceed current time
          const tfBarIdx = findCompletedBarIndex(tfData.bars, currentTime, tfMs)
          
          // If no completed bar yet, or bar hasn't changed, skip update
          if (tfBarIdx < 0) return
          
          const tfBar = tfData.bars[tfBarIdx]
          if (!tfBar) return
          
          // Convert time to seconds for TradingView
          const tfBarForChart = { ...tfBar, time: msToSeconds(tfBar.time) }
          
          // Update the other timeframe's chart
          updateSingleChart(tfRefs, tfBarForChart, tfBarIdx, ic, tfData)
        })
      }
    },
    [chartR, rsiR, ema20v, ema50v, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, updateSingleChart, findCompletedBarIndex],
  )

  // ── processBar — chart update + trade fill evaluation ─────
  const processBar = useCallback(
    (bar, idx) => {
      updateChartForBar(bar, idx)
      evaluateFillsRef.current?.(bar, symbolConfigRef.current, accountConfigRef.current)
    },
    [updateChartForBar],
  )

  // ── Single step forward ───────────────────────────────────
  const step = useCallback(() => {
    const cur = cursorRef.current
    if (cur >= bars.length) return
    processBar(bars[cur], cur)
    cursorRef.current = cur + 1
    useSimStore.getState().setCursor(cur + 1)
  }, [bars, processBar])

  // ── Seek — full series rebuild at target index ────────────
  const seekTo = useCallback(
    (idx) => {
      const target = Math.max(1, Math.min(bars.length, idx))
      cursorRef.current = target
      useSimStore.getState().setCursor(target)

      const ic    = indicRef.current
      const slice = bars.slice(0, target)
      
      // Get target time for syncing other timeframes
      const targetTime = bars[target - 1]?.time
      
      // Convert times to seconds for TradingView
      const candleData = slice.map(b => ({ ...b, time: msToSeconds(b.time) }))
      const volData = slice.map((b) => ({
        time:  msToSeconds(b.time),
        value: b.volume,
        color: b.close >= b.open ? G33 : R33,
      }))

      // Update primary chart (or single chart)
      const primaryData = isMultiTimeframe ? simChartData[primaryTF]?.data : { ema20: ema20v, ema50: ema50v, bb: bbData, rsi: rsiVals, times }
      const primaryRefs = isMultiTimeframe ? simChartData[primaryTF]?.refs : chartR
      
      primaryRefs.candle.current?.setData(candleData)
      primaryRefs.vol.current?.setData(volData)
      primaryRefs.ema20.current?.setData(ic.ema20 ? buildLine(primaryData.ema20, target, primaryData.times) : [])
      primaryRefs.ema50.current?.setData(ic.ema50 ? buildLine(primaryData.ema50, target, primaryData.times) : [])
      if (ic.bb) {
        primaryRefs.bbMid.current?.setData(buildLine(primaryData.bb.mid, target, primaryData.times))
        primaryRefs.bbUp.current?.setData(buildLine(primaryData.bb.upper, target, primaryData.times))
        primaryRefs.bbLow.current?.setData(buildLine(primaryData.bb.lower, target, primaryData.times))
      } else {
        primaryRefs.bbMid.current?.setData([])
        primaryRefs.bbUp.current?.setData([])
        primaryRefs.bbLow.current?.setData([])
      }
      
      if (!isMultiTimeframe) {
        rsiR.series.current?.setData(ic.rsi ? buildLine(rsiVals, target, times) : [])
      }
      
      // ── Update other timeframes in multi-timeframe mode ──
      if (isMultiTimeframe && simChartData && targetTime) {
        Object.keys(simChartData).forEach((tf) => {
          if (tf === primaryTF) return
          
          const tfData = simChartData[tf]?.data
          const tfRefs = simChartData[tf]?.refs
          if (!tfData || !tfRefs || !tfRefs.candle?.current) return
          
          // Get timeframe in ms for future data prevention
          const tfMs = getTimeframeMs(tf)
          
          // Find the latest COMPLETED bar
          const tfTarget = findCompletedBarIndex(tfData.bars, targetTime, tfMs)
          if (tfTarget < 0) {
            // No completed bars yet - clear the chart
            tfRefs.candle.current?.setData([])
            tfRefs.vol.current?.setData([])
            tfRefs.ema20.current?.setData([])
            tfRefs.ema50.current?.setData([])
            tfRefs.bbMid.current?.setData([])
            tfRefs.bbUp.current?.setData([])
            tfRefs.bbLow.current?.setData([])
            return
          }
          
          const tfSlice = tfData.bars.slice(0, tfTarget + 1)
          
          // Convert times to seconds for TradingView
          const tfCandleData = tfSlice.map(b => ({ ...b, time: msToSeconds(b.time) }))
          const tfVolData = tfSlice.map((b) => ({
            time:  msToSeconds(b.time),
            value: b.volume,
            color: b.close >= b.open ? G33 : R33,
          }))
          
          // Update this timeframe's chart
          tfRefs.candle.current?.setData(tfCandleData)
          tfRefs.vol.current?.setData(tfVolData)
          tfRefs.ema20.current?.setData(ic.ema20 ? buildLine(tfData.ema20, tfTarget + 1, tfData.times) : [])
          tfRefs.ema50.current?.setData(ic.ema50 ? buildLine(tfData.ema50, tfTarget + 1, tfData.times) : [])
          if (ic.bb) {
            tfRefs.bbMid.current?.setData(buildLine(tfData.bb.mid, tfTarget + 1, tfData.times))
            tfRefs.bbUp.current?.setData(buildLine(tfData.bb.upper, tfTarget + 1, tfData.times))
            tfRefs.bbLow.current?.setData(buildLine(tfData.bb.lower, tfTarget + 1, tfData.times))
          } else {
            tfRefs.bbMid.current?.setData([])
            tfRefs.bbUp.current?.setData([])
            tfRefs.bbLow.current?.setData([])
          }
        })
      }
    },
    [bars, times, chartR, rsiR, ema20v, ema50v, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, findCompletedBarIndex],
  )

  // ── HOT LOOP ─────────────────────────────────────────────
  useEffect(() => {
    if (!bars.length) return

    let tickId  = null
    let syncId  = null
    let genId = 0
    let shouldTick = false

    const tick = (currentGen) => {
      if (currentGen !== genId) return
      if (!shouldTick || !playingRef.current) return

      const cur = cursorRef.current
      if (cur >= bars.length) {
        useSimStore.getState().setPlaying(false)
        return
      }

      processBar(bars[cur], cur)
      cursorRef.current = cur + 1

      if (currentGen === genId && shouldTick && useSimStore.getState().playing) {
        // Calculate delay based on speed
        const speed = speedRef.current
        // BASE_MS is ~420ms at 1x speed
        // At 1x: 420ms per bar, At 5x: 84ms, At 10x: 42ms, At 50x: 8.4ms, At MAX: ~0.2ms
        const delay = Math.max(1, Math.floor(BASE_MS / speed))
        tickId = setTimeout(() => tick(currentGen), delay)
      }
    }

    const unsubPlaying = useSimStore.subscribe((s, prev) => {
      if (s.playing && !(prev && prev.playing)) {
        genId++
        shouldTick = true
        if (tickId) clearTimeout(tickId)
        tickId = null
        tick(genId)
      }
      if (!s.playing && prev && prev.playing) {
        genId++
        shouldTick = false
        if (tickId) clearTimeout(tickId)
        tickId = null
      }
    })

    if (playingRef.current) {
      shouldTick = true
      tick(genId)
    }

    // UI sync timer - flushes cursor to store at 60fps (16ms) for smooth progress bar
    syncId = setInterval(() => {
      if (playingRef.current) {
        useSimStore.getState().setCursor(cursorRef.current)
      }
    }, 16)

    return () => {
      genId++
      shouldTick = false
      if (tickId) clearTimeout(tickId)
      if (syncId) clearInterval(syncId)
      unsubPlaying()
    }
  }, [bars, processBar])

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.code === 'Space') {
        e.preventDefault()
        useSimStore.getState().togglePlaying()
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        useSimStore.getState().setPlaying(false)
        step()
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        useSimStore.getState().setPlaying(false)
        seekTo(cursorRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, seekTo])

  return { processBar, seekTo, step, cursorRef }
}