import { useEffect, useRef, useCallback } from 'react'
import { useSimStore }       from '../store/useSimStore'
import { useTradeStore }     from '../store/useTradeStore'
import { useIndicatorStore } from '../store/useIndicatorStore'
import { BASE_MS }           from '../constants'
import { buildLine }         from '../utils/indicators'
import { msToSeconds }       from '../utils/tradingUtils'

const G33 = '#36d47c33'
const R33 = '#f0505033'

/**
 * Central simulation engine hook.
 *
 * HOT LOOP DESIGN — why refs everywhere:
 *  At 50× speed the interval fires every 16ms (~60 ticks/sec).
 *  Calling setCursor() inside the loop triggers a Zustand state update on every
 *  tick, which queues a React re-render on every tick, which starves the event
 *  loop so that button clicks (pause/step/seek) cannot be processed until the
 *  loop naturally slows down.
 *
 *  Solution: the hot loop reads and writes ONLY refs. A separate 80ms UI-sync
 *  timer is the only place that flushes cursorRef → Zustand store for display.
 *  Button actions write to the store synchronously; the hot loop reads the store
 *  via getState() on the next tick so it never needs to be a reactive subscriber.
 */
export function useSimEngine({ bars, times, ema20v, ema50v, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, rsiR }) {
  // For backwards compatibility with single-timeframe mode, build chartR
  const chartR = isMultiTimeframe ? simChartData[primaryTF]?.refs : { candle: { current: null }, vol: { current: null }, ema20: { current: null }, ema50: { current: null }, bbMid: { current: null }, bbUp: { current: null }, bbLow: { current: null } }
  // ── Ref mirrors for all hot-loop state ────────────────────
  // These are kept in sync by store subscriptions (below), not reactive hooks.
  const cursorRef   = useRef(useSimStore.getState().cursor)
  const playingRef  = useRef(false)
  const speedRef    = useRef(1)
  const indicRef    = useRef(useIndicatorStore.getState())
  const symbolConfigRef = useRef(useSimStore.getState().symbolConfig)
  const accountConfigRef = useRef(useSimStore.getState().accountConfig)

  // Stable action refs — Zustand actions never change identity, but we store
  // them here so the hot loop never has to close over any reactive value.
  const evaluateFillsRef = useRef(null)
  useEffect(() => {
    evaluateFillsRef.current = useTradeStore.getState().evaluateFills
    return useTradeStore.subscribe((s) => { evaluateFillsRef.current = s.evaluateFills })
  }, [])

  // ── Keep all refs in sync with their stores ───────────────
  useEffect(() => {
    // Sync on mount
    const s = useSimStore.getState()
    cursorRef.current  = s.cursor
    playingRef.current = s.playing
    speedRef.current   = s.speed
    symbolConfigRef.current = s.symbolConfig
    accountConfigRef.current = s.accountConfig

    const unsub = useSimStore.subscribe((s) => {
      // Only update cursor ref when NOT playing — during playback the loop
      // owns cursorRef; external seeks update it via seekTo() directly.
      if (!playingRef.current) cursorRef.current = s.cursor
      playingRef.current = s.playing
      speedRef.current   = s.speed
      symbolConfigRef.current = s.symbolConfig
      accountConfigRef.current = s.accountConfig
    })
    return unsub
  }, [])

  useEffect(
    () => useIndicatorStore.subscribe((s) => { indicRef.current = s }),
    [],
  )

  // ── Helper: find latest bar index in timeframe that doesn't exceed given time ──
  const findBarIndex = (bars, time) => {
    let idx = -1
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].time <= time) idx = i
      else break
    }
    return idx
  }

  // ── Chart update for a single bar (pure side-effects, no state) ──
  const updateChartForBar = useCallback(
    (bar, idx) => {
      const ic = indicRef.current
      
      // Convert time to seconds for TradingView before passing
      const barForChart = { ...bar, time: msToSeconds(bar.time) }
      
      // Update primary chart
      chartR.candle.current?.update(barForChart)
      chartR.vol.current?.update({
        time:  barForChart.time,
        value: bar.volume,
        color: bar.close >= bar.open ? G33 : R33,
      })
      if (ic.ema20 && ema20v[idx] !== null)
        chartR.ema20.current?.update({ time: barForChart.time, value: ema20v[idx] })
      if (ic.ema50 && ema50v[idx] !== null)
        chartR.ema50.current?.update({ time: barForChart.time, value: ema50v[idx] })
      if (ic.bb && bbData.upper[idx] !== null) {
        chartR.bbMid.current?.update({ time: barForChart.time, value: bbData.mid[idx]   })
        chartR.bbUp.current?.update(  { time: barForChart.time, value: bbData.upper[idx] })
        chartR.bbLow.current?.update( { time: barForChart.time, value: bbData.lower[idx] })
      }
      if (ic.rsi && rsiVals[idx] !== null)
        rsiR.series.current?.update({ time: barForChart.time, value: rsiVals[idx] })
      
      // ── Update other timeframes in multi-timeframe mode ──
      if (isMultiTimeframe && simChartData) {
        Object.keys(simChartData).forEach((tf) => {
          if (tf === primaryTF) return  // Already updated above
          
          const tfData = simChartData[tf]?.data
          const tfRefs = simChartData[tf]?.refs
          if (!tfData || !tfRefs) return
          
          // Find latest bar in this timeframe that doesn't exceed current time
          const tfBarIdx = findBarIndex(tfData.bars, bar.time)
          if (tfBarIdx < 0) return
          
          const tfBar = tfData.bars[tfBarIdx]
          if (!tfBar) return
          
          // Convert time to seconds for TradingView
          const tfBarForChart = { ...tfBar, time: msToSeconds(tfBar.time) }
          
          // Update the other timeframe's chart
          tfRefs.candle.current?.update(tfBarForChart)
          tfRefs.vol.current?.update({
            time:  tfBarForChart.time,
            value: tfBar.volume,
            color: tfBar.close >= tfBar.open ? G33 : R33,
          })
          if (ic.ema20 && tfData.ema20[tfBarIdx] !== null)
            tfRefs.ema20.current?.update({ time: tfBarForChart.time, value: tfData.ema20[tfBarIdx] })
          if (ic.ema50 && tfData.ema50[tfBarIdx] !== null)
            tfRefs.ema50.current?.update({ time: tfBarForChart.time, value: tfData.ema50[tfBarIdx] })
          if (ic.bb && tfData.bb.upper[tfBarIdx] !== null) {
            tfRefs.bbMid.current?.update({ time: tfBarForChart.time, value: tfData.bb.mid[tfBarIdx]   })
            tfRefs.bbUp.current?.update(  { time: tfBarForChart.time, value: tfData.bb.upper[tfBarIdx] })
            tfRefs.bbLow.current?.update( { time: tfBarForChart.time, value: tfData.bb.lower[tfBarIdx] })
          }
        })
      }
    },
    [chartR, rsiR, ema20v, ema50v, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF],
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
    useSimStore.getState().setCursor(cur + 1)  // step is always a single render, safe
  }, [bars, processBar])

  // ── Seek — full series rebuild at target index ────────────
  const seekTo = useCallback(
    (idx) => {
      const target = Math.max(1, Math.min(bars.length, idx))
      cursorRef.current = target
      useSimStore.getState().setCursor(target)  // one render on seek, fine

      const ic    = indicRef.current
      const slice = bars.slice(0, target)
      
      // Convert times to seconds for TradingView
      const candleData = slice.map(b => ({ ...b, time: msToSeconds(b.time) }))
      const volData = slice.map((b) => ({
        time:  msToSeconds(b.time),
        value: b.volume,
        color: b.close >= b.open ? G33 : R33,
      }))

      // Update primary chart
      chartR.candle.current?.setData(candleData)
      chartR.vol.current?.setData(volData)
      chartR.ema20.current?.setData(ic.ema20 ? buildLine(ema20v, target, times) : [])
      chartR.ema50.current?.setData(ic.ema50 ? buildLine(ema50v, target, times) : [])
      if (ic.bb) {
        chartR.bbMid.current?.setData(buildLine(bbData.mid,   target, times))
        chartR.bbUp.current?.setData( buildLine(bbData.upper, target, times))
        chartR.bbLow.current?.setData(buildLine(bbData.lower, target, times))
      } else {
        chartR.bbMid.current?.setData([])
        chartR.bbUp.current?.setData([])
        chartR.bbLow.current?.setData([])
      }
      rsiR.series.current?.setData(ic.rsi ? buildLine(rsiVals, target, times) : [])
      
      // ── Update other timeframes in multi-timeframe mode ──
      if (isMultiTimeframe && simChartData) {
        // Get the target time from primary chart
        const targetTime = bars[target - 1]?.time
        if (!targetTime) return
        
        Object.keys(simChartData).forEach((tf) => {
          if (tf === primaryTF) return  // Already updated above
          
          const tfData = simChartData[tf]?.data
          const tfRefs = simChartData[tf]?.refs
          if (!tfData || !tfRefs) return
          
          // Find latest bar in this timeframe that doesn't exceed target time
          const tfTarget = findBarIndex(tfData.bars, targetTime)
          if (tfTarget < 0) return
          
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
            tfRefs.bbMid.current?.setData(buildLine(tfData.bb.mid,   tfTarget + 1, tfData.times))
            tfRefs.bbUp.current?.setData( buildLine(tfData.bb.upper, tfTarget + 1, tfData.times))
            tfRefs.bbLow.current?.setData(buildLine(tfData.bb.lower, tfTarget + 1, tfData.times))
          } else {
            tfRefs.bbMid.current?.setData([])
            tfRefs.bbUp.current?.setData([])
            tfRefs.bbLow.current?.setData([])
          }
        })
      }
    },
    [bars, times, chartR, rsiR, ema20v, ema50v, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF],
  )

  // ── HOT LOOP ─────────────────────────────────────────────
  // Runs once per session (bars is stable after load).
  // Reads ONLY refs — zero reactive state reads, zero setCursor calls.
  // The UI-sync timer below is the only thing that writes to the store.
  useEffect(() => {
    if (!bars.length) return

    let tickId  = null
    let syncId  = null
    let genId = 0  // Generation ID: invalidates all old pending timeouts when play/pause changes
    let shouldTick = false

    // Recursive setTimeout instead of setInterval:
    //   - Self-schedules only after current tick completes → no backlog builds up
    //   - Respects speed changes on every tick via speedRef
    //   - Naturally responsive: if the JS thread is busy (e.g. processing a click),
    //     the next tick simply fires a few ms late — it does NOT queue up dozens of
    //     pending executions like setInterval would at high speeds
    const tick = (currentGen) => {
      // Exit if this tick belongs to an old generation (pause happened, then play happened again)
      if (currentGen !== genId) return
      if (!shouldTick || !playingRef.current) return

      const cur = cursorRef.current
      if (cur >= bars.length) {
        useSimStore.getState().setPlaying(false)
        return
      }

      processBar(bars[cur], cur)
      cursorRef.current = cur + 1

      // Before rescheduling, verify generation ID hasn't changed AND playing state is still true
      // This prevents orphaned timeouts during rapid play/pause toggles at high speeds
      if (currentGen === genId && shouldTick && useSimStore.getState().playing) {
        const delay = Math.max(16, BASE_MS / speedRef.current)
        tickId = setTimeout(() => tick(currentGen), delay)
      }
    }

    // Start the loop when playing becomes true
    const unsubPlaying = useSimStore.subscribe((s, prev) => {
      // Transition: not playing → playing
      if (s.playing && !(prev && prev.playing)) {
        genId++  // Increment generation to invalidate all old pending ticks
        shouldTick = true
        if (tickId) {
          clearTimeout(tickId)
          tickId = null
        }
        tick(genId)
      }
      // Transition: playing → not playing
      if (!s.playing && prev && prev.playing) {
        genId++  // Increment generation to invalidate any pending ticks
        shouldTick = false
        if (tickId) {
          clearTimeout(tickId)
          tickId = null
        }
      }
    })

    // If already playing when this effect runs (e.g. bars hot-reloaded mid-play)
    if (playingRef.current) {
      shouldTick = true
      tick(genId)
    }

    // ── UI sync timer ────────────────────────────────────────
    // Flushes cursorRef → Zustand store at most every 80ms.
    // This is the ONLY place that triggers a React re-render during playback.
    // 80ms means ~12 renders/sec for the progress bar — imperceptible lag,
    // but the event queue stays clear for button interactions at any speed.
    syncId = setInterval(() => {
      if (playingRef.current) {
        useSimStore.getState().setCursor(cursorRef.current)
      }
    }, 80)

    return () => {
      genId++  // Invalidate any pending ticks on cleanup
      shouldTick = false
      if (tickId) clearTimeout(tickId)
      if (syncId) clearInterval(syncId)
      unsubPlaying()
    }
  }, [bars, processBar]) // bars and processBar are both stable after session load

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