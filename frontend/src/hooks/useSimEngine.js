import { useEffect, useRef, useCallback } from 'react'
import { useSimStore }       from '../store/useSimStore'
import { useTradeStore }     from '../store/useTradeStore'
import { useIndicatorStore } from '../store/useIndicatorStore'
import { BASE_MS }           from '../constants'
import { buildLine }         from '../utils/indicators'

const G33 = '#36d47c33'
const R33 = '#f0505033'

/**
 * Central simulation engine hook.
 *
 * Manages the bar-clock loop, processes each bar (chart update + trade fill
 * evaluation), supports seek (full rebuild) and step (single advance).
 *
 * @param {{ bars, times, ema20v, ema50v, bbData, rsiVals, chartR, rsiR }} opts
 * @returns {{ processBar, seekTo, step, cursorRef }}
 */
export function useSimEngine({ bars, times, ema20v, ema50v, bbData, rsiVals, chartR, rsiR }) {
  const { cursor, playing, speed, setCursor, setPlaying } = useSimStore()
  const evaluateFills = useTradeStore((s) => s.evaluateFills)

  // Mutable refs — avoids stale closures in the hot interval loop
  const cursorRef  = useRef(cursor)
  const indicRef   = useRef(useIndicatorStore.getState())

  // Keep cursorRef in sync with store
  useEffect(() => { cursorRef.current = cursor }, [cursor])

  // Subscribe to indicator changes to keep indicRef current
  useEffect(
    () => useIndicatorStore.subscribe((s) => { indicRef.current = s }),
    [],
  )

  // ── Update chart series for a single bar ──────────────────
  const updateChartForBar = useCallback(
    (bar, idx) => {
      const ic = indicRef.current
      chartR.candle.current?.update(bar)
      chartR.vol.current?.update({
        time:  bar.time,
        value: bar.volume,
        color: bar.close >= bar.open ? G33 : R33,
      })
      if (ic.ema20 && ema20v[idx] !== null)
        chartR.ema20.current?.update({ time: bar.time, value: ema20v[idx] })
      if (ic.ema50 && ema50v[idx] !== null)
        chartR.ema50.current?.update({ time: bar.time, value: ema50v[idx] })
      if (ic.bb && bbData.upper[idx] !== null) {
        chartR.bbMid.current?.update({ time: bar.time, value: bbData.mid[idx]   })
        chartR.bbUp.current?.update(  { time: bar.time, value: bbData.upper[idx] })
        chartR.bbLow.current?.update( { time: bar.time, value: bbData.lower[idx] })
      }
      if (ic.rsi && rsiVals[idx] !== null)
        rsiR.series.current?.update({ time: bar.time, value: rsiVals[idx] })
    },
    [chartR, rsiR, ema20v, ema50v, bbData, rsiVals],
  )

  // ── Process one bar (chart + trade fills) ─────────────────
  const processBar = useCallback(
    (bar, idx) => {
      updateChartForBar(bar, idx)
      evaluateFills(bar)
    },
    [updateChartForBar, evaluateFills],
  )

  // ── Advance exactly one bar ───────────────────────────────
  const step = useCallback(() => {
    const cur = cursorRef.current
    if (cur >= bars.length) return
    processBar(bars[cur], cur)
    cursorRef.current = cur + 1
    setCursor(cur + 1)
  }, [bars, processBar, setCursor])

  // ── Seek to an arbitrary bar index (full series rebuild) ──
  const seekTo = useCallback(
    (idx) => {
      const target = Math.max(1, Math.min(bars.length, idx))
      cursorRef.current = target
      setCursor(target)

      const ic    = indicRef.current
      const slice = bars.slice(0, target)

      chartR.candle.current?.setData(slice)
      chartR.vol.current?.setData(
        slice.map((b) => ({
          time:  b.time,
          value: b.volume,
          color: b.close >= b.open ? G33 : R33,
        })),
      )
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
    },
    [bars, times, setCursor, chartR, rsiR, ema20v, ema50v, bbData, rsiVals],
  )

  // ── Tick loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return
    const interval = setInterval(() => {
      // Guard against state being toggled between ticks
      if (!useSimStore.getState().playing) return
      const cur = cursorRef.current
      if (cur >= bars.length) { setPlaying(false); return }
      processBar(bars[cur], cur)
      cursorRef.current = cur + 1
      setCursor(cur + 1)
    }, Math.max(16, BASE_MS / speed))
    return () => clearInterval(interval)
  }, [playing, speed, bars, processBar, setCursor, setPlaying])

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.code === 'Space')       { e.preventDefault(); setPlaying(!useSimStore.getState().playing) }
      if (e.code === 'ArrowRight')  { e.preventDefault(); setPlaying(false); step() }
      if (e.code === 'ArrowLeft')   { e.preventDefault(); setPlaying(false); seekTo(cursorRef.current - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, seekTo, setPlaying])

  return { processBar, seekTo, step, cursorRef }
}