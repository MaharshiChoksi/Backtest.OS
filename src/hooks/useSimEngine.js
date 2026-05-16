import { useEffect, useRef, useCallback } from 'react'
import { useSimStore } from '../store/useSimStore'
import { useTradeStore } from '../store/useTradeStore'
import { useIndicatorStore } from '../store/useIndicatorStore'
import { BASE_MS, getTimeframeMs } from '../constants'
import { buildLine } from '../utils/indicators'
import { chartUnixSeconds, msToSeconds, seriesTimeSeconds } from '../utils/tradingUtils'

const G33 = '#36d47c33'
const R33 = '#f0505033'

function clearRsiSeries(rsiR) {
  rsiR?.series?.current?.setData([])
  rsiR?.ob?.current?.setData([])
  rsiR?.os?.current?.setData([])
}

/**
 * RSI uses only `setData` (never `series.update`): mixing `update` with `setData`
 * triggers lightweight-charts "Cannot update oldest data" when internal bar times differ.
 */
function applyRsiPaneSlice(rsiR, rsiVals, timesArr, allBars, endExclusiveIdx, rsiEnabled) {
  if (!rsiEnabled) {
    clearRsiSeries(rsiR)
    return
  }
  const s = rsiR?.series?.current
  if (!s || !rsiVals?.length || !timesArr?.length || endExclusiveIdx <= 0 || !allBars?.length) {
    clearRsiSeries(rsiR)
    return
  }
  const n = Math.min(endExclusiveIdx, rsiVals.length, timesArr.length, allBars.length)
  if (n <= 0) {
    clearRsiSeries(rsiR)
    return
  }

  const line = buildLine(rsiVals, n, timesArr)
  s.setData(line)
  const bandBars = allBars.slice(0, n)
  const obPts = []
  const osPts = []
  for (const b of bandBars) {
    const t = chartUnixSeconds(b.time)
    if (!t) continue
    obPts.push({ time: t, value: 70 })
    osPts.push({ time: t, value: 30 })
  }
  rsiR.ob.current?.setData(obPts)
  rsiR.os.current?.setData(osPts)
}

function clearSlopeSeries(slopeR) {
  const series = slopeR?.series?.current
  if (series) Object.values(series).forEach(s => s?.setData([]))
  slopeR?.anchor?.current?.setData([])
}

function applySlopePaneSlice(slopeR, slopeData, timesArr, endExclusiveIdx, slopeEnabled) {
  if (!slopeEnabled) {
    clearSlopeSeries(slopeR)
    return
  }
  const series = slopeR?.series?.current
  if (!series || !slopeData || !timesArr?.length || endExclusiveIdx <= 0) {
    clearSlopeSeries(slopeR)
    return
  }
  Object.entries(series).forEach(([period, s]) => {
    const values = slopeData[Number(period)]
    if (values) {
      s.setData(buildLine(values, endExclusiveIdx, timesArr))
    } else {
      s.setData([])
    }
  })
  // Anchor series — spans all bar times so logical ranges match main chart
  const anchor = slopeR?.anchor?.current
  if (anchor) {
    const anchorData = []
    const limit = Math.min(endExclusiveIdx, timesArr.length)
    for (let i = 0; i < limit; i++) {
      const t = seriesTimeSeconds(timesArr[i])
      if (t != null) anchorData.push({ time: t, value: 0 })
    }
    anchor.setData(anchorData)
  }
}

/**
 * Central simulation engine hook.
 *
 * Features:
 * - Multi-timeframe sync: all charts run at the same cursor position
 * - Future data prevention: higher timeframe bars don't show until they complete
 * - High-performance hot loop: refs-only state during playback
 * - Speed controls: 1x, 5x, 10x, 50x, MAX
 */
export function useSimEngine({ bars, times, emaValues, emaPeriods, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, rsiR, slopeR }) {
  // chartR always comes from simChartData refs — never build a fake ref object here.
  // Calling useRef() conditionally inside an expression violates Rules of Hooks.
  // Workspace.jsx owns all refs; this hook just reads them.
  const chartR = simChartData[primaryTF]?.refs

  // ── Ref mirrors for all hot-loop state ────────────────────
  const cursorRef = useRef(useSimStore.getState().cursor)
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const indicRef = useRef(useIndicatorStore.getState())
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
    cursorRef.current = s.cursor
    playingRef.current = s.playing
    speedRef.current = s.speed
    symbolConfigRef.current = s.symbolConfig
    accountConfigRef.current = s.accountConfig
    selectedTimeframesRef.current = s.selectedTimeframes

    const unsub = useSimStore.subscribe((s) => {
      if (!playingRef.current) cursorRef.current = s.cursor
      playingRef.current = s.playing
      speedRef.current = s.speed
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
    // console.log(`updateSingleChart: refs?.candle?.current=${!!refs?.candle?.current}, refs?.emaRefs?.current=${!!refs?.emaRefs?.current}`)

    if (!refs || !refs.candle?.current) {
      // console.log(`updateSingleChart: early return - no candle ref`)
      return
    }

    // Candlestick
    refs.candle.current?.update(barData)

    // Volume
    refs.vol.current?.update({
      time: barData.time,
      value: barData.volume,
      color: barData.close >= barData.open ? G33 : R33,
    })

    // EMA lines — refs.ema is a plain object keyed by period: { 20: { current: lineSeries }, 50: ... }
    const emaData = data.ema || {}
    if (ic.ema.enabled && refs.ema) {
      Object.entries(refs.ema).forEach(([period, ref]) => {
        const values = emaData[Number(period)]
        if (values && idx < values.length && values[idx] !== null && ref?.current) {
          const time = chartUnixSeconds(barData.time)
          if (time) ref.current.update({ time, value: values[idx] })
        }
      })
    }

    // Bollinger Bands - check enabled flag
    if (ic.bb.enabled && data.bb && data.bb.upper[idx] !== null) {
      const tb = chartUnixSeconds(barData.time)
      if (tb) {
        refs.bbMid.current?.update({ time: tb, value: data.bb.mid[idx] })
        refs.bbUp.current?.update({ time: tb, value: data.bb.upper[idx] })
        refs.bbLow.current?.update({ time: tb, value: data.bb.lower[idx] })
      }
    }

    // PDWL levels — draw from prev day/week start to current bar
    const pd = data.pdwl
    if (ic.pdwl.enabled && pd && refs.pdwl) {
      const t = chartUnixSeconds(barData.time)
      if (t) {
        const levels = [
          ['pdHigh', pd.pdHigh, pd.pdDayStart, ic.pdwl.showPDHigh],
          ['pdLow', pd.pdLow, pd.pdDayStart, ic.pdwl.showPDLow],
          ['pdOpen', pd.pdOpen, pd.pdDayStart, ic.pdwl.showPDOpen],
          ['pdClose', pd.pdClose, pd.pdDayStart, ic.pdwl.showPDClose],
          ['pwHigh', pd.pwHigh, pd.pwWeekStart, ic.pdwl.showPWHigh],
          ['pwLow', pd.pwLow, pd.pwWeekStart, ic.pdwl.showPWLow],
          ['pwOpen', pd.pwOpen, pd.pwWeekStart, ic.pdwl.showPWOpen],
          ['pwClose', pd.pwClose, pd.pwWeekStart, ic.pdwl.showPWClose],
        ]
        const labelList = []
        levels.forEach(([name, arr, startArr, show]) => {
          const series = refs.pdwl[name]?.current
          if (series) {
            const v = arr?.[idx]
            const s = startArr?.[idx]
            if (v !== null && show && s != null) {
              const startSec = chartUnixSeconds(s)
              if (startSec) {
                series.setData([
                  { time: startSec, value: v },
                  { time: t, value: v },
                ])
                const cfg = refs.pdwlLabelPrimitive?.configs?.[name]
                if (cfg) labelList.push({ time: startSec, price: v, text: cfg.text, color: cfg.color })
              }
            } else {
              series.setData([])
            }
          }
        })
        const lp = refs.pdwlLabelPrimitive?.current
        if (lp) {
          labelList.length ? lp.setLabels(labelList) : lp.clearLabels()
        }
      }
    } else if (refs?.pdwl) {
      Object.values(refs.pdwl).forEach(ref => ref?.current?.setData([]))
      if (refs.pdwlLabelPrimitive?.current) {
        refs.pdwlLabelPrimitive.current.clearLabels()
      }
    }
  }, [emaPeriods])

  // ── Chart update for a single bar (all timeframes) ──
  const updateChartForBar = useCallback(
    (bar, idx) => {
      const ic = indicRef.current

      // Convert time to seconds for TradingView
      const barForChart = { ...bar, time: msToSeconds(bar.time) }

      // Update primary chart (or single chart)
      const primaryEntry = simChartData?.[primaryTF]
      const primaryData = primaryEntry?.data ?? { ema: emaValues, bb: bbData, rsi: rsiVals, slope: {} }
      const primaryRefs = primaryEntry?.refs ?? chartR
      const primaryRsiRefs = primaryEntry?.rsiR ?? rsiR
      const primarySlopeRefs = primaryEntry?.slopeR ?? slopeR

      updateSingleChart(primaryRefs, barForChart, idx, ic, primaryData)

      applyRsiPaneSlice(
        primaryRsiRefs,
        primaryData.rsi,
        primaryData.times ?? times,
        primaryData.bars ?? bars,
        idx + 1,
        ic.rsi.enabled,
      )
      applySlopePaneSlice(
        primarySlopeRefs,
        primaryData.slope,
        primaryData.times ?? times,
        idx + 1,
        ic.slope.enabled,
      )

      // Sync indicator time scales to main chart
      if (primaryRefs?.chart?.current) {
        const mainApi = primaryRefs.chart.current
        const lr = mainApi.timeScale().getVisibleLogicalRange()
        if (lr) {
          if (ic.rsi.enabled && primaryRsiRefs?.chart?.current) {
            try { primaryRsiRefs.chart.current.timeScale().setVisibleLogicalRange(lr) } catch (_) {}
          }
          if (ic.slope.enabled && primarySlopeRefs?.chart?.current) {
            try { primarySlopeRefs.chart.current.timeScale().setVisibleLogicalRange(lr) } catch (_) {}
          }
        }
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

          applyRsiPaneSlice(
            simChartData[tf]?.rsiR,
            tfData.rsi,
            tfData.times,
            tfData.bars,
            tfBarIdx + 1,
            ic.rsi.enabled,
          )
          applySlopePaneSlice(
            simChartData[tf]?.slopeR,
            tfData.slope,
            tfData.times,
            tfBarIdx + 1,
            ic.slope.enabled,
          )

          // Sync multi-TF indicator charts to their main chart
          const tfRsiR = simChartData[tf]?.rsiR
          const tfSlopeR = simChartData[tf]?.slopeR
          if (tfRefs?.chart?.current) {
            const tfLr = tfRefs.chart.current.timeScale().getVisibleLogicalRange()
            if (tfLr) {
              if (ic.rsi.enabled && tfRsiR?.chart?.current) {
                try { tfRsiR.chart.current.timeScale().setVisibleLogicalRange(tfLr) } catch (_) {}
              }
              if (ic.slope.enabled && tfSlopeR?.chart?.current) {
                try { tfSlopeR.chart.current.timeScale().setVisibleLogicalRange(tfLr) } catch (_) {}
              }
            }
          }
        })
      }
    },
    [chartR, rsiR, emaValues, emaPeriods, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, times, bars, updateSingleChart, findCompletedBarIndex],
  )

  // ── processBar — chart update + trade fill evaluation ─────
  const processBar = useCallback(
    (bar, idx) => {
      // console.log(`processBar: idx=${idx}, bar.time=${bar.time}`)
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

      const ic = indicRef.current
      const slice = bars.slice(0, target)

      // Get target time for syncing other timeframes
      const targetTime = bars[target - 1]?.time

      // Convert times to seconds for TradingView
      const candleData = slice.map(b => ({ ...b, time: msToSeconds(b.time) }))
      const volData = slice.map((b) => ({
        time: msToSeconds(b.time),
        value: b.volume,
        color: b.close >= b.open ? G33 : R33,
      }))

      const primaryEntry = simChartData?.[primaryTF]
      const primaryData = primaryEntry?.data ?? { ema: emaValues, bb: bbData, rsi: rsiVals, slope: {}, times, bars }
      const primaryRefs = primaryEntry?.refs ?? chartR
      const primaryRsiRefs = primaryEntry?.rsiR ?? rsiR
      const primarySlopeRefs = primaryEntry?.slopeR ?? slopeR

      primaryRefs.candle.current?.setData(candleData)
      primaryRefs.vol.current?.setData(volData)

      const primaryTimes = primaryData.times ?? times
      const primaryBarsSeek = primaryData.bars ?? bars

      // Update EMA lines
      if (ic.ema.enabled && primaryRefs.ema) {
        const emaData = primaryData.ema ?? emaValues
        Object.entries(primaryRefs.ema).forEach(([period, ref]) => {
          const values = emaData?.[Number(period)]
          ref?.current?.setData(values ? buildLine(values, target, primaryTimes) : [])
        })
      } else if (primaryRefs.ema) {
        Object.values(primaryRefs.ema).forEach(ref => ref?.current?.setData([]))
      }

      // Update BB
      const pb = primaryData.bb ?? bbData
      if (ic.bb.enabled) {
        primaryRefs.bbMid.current?.setData(buildLine(pb.mid, target, primaryTimes))
        primaryRefs.bbUp.current?.setData(buildLine(pb.upper, target, primaryTimes))
        primaryRefs.bbLow.current?.setData(buildLine(pb.lower, target, primaryTimes))
      } else {
        primaryRefs.bbMid.current?.setData([])
        primaryRefs.bbUp.current?.setData([])
        primaryRefs.bbLow.current?.setData([])
      }

      // PDWL levels at seek position — from prev day/week start to seek bar
      const pdwlDataSeek = primaryData.pdwl
      if (ic.pdwl.enabled && pdwlDataSeek && primaryRefs.pdwl) {
        const lastCandle = candleData[candleData.length - 1]
        const seekTime = lastCandle?.time
        if (seekTime) {
          const seekIdx = target - 1
          const levels = [
            ['pdHigh', pdwlDataSeek.pdHigh, pdwlDataSeek.pdDayStart, ic.pdwl.showPDHigh],
            ['pdLow', pdwlDataSeek.pdLow, pdwlDataSeek.pdDayStart, ic.pdwl.showPDLow],
            ['pdOpen', pdwlDataSeek.pdOpen, pdwlDataSeek.pdDayStart, ic.pdwl.showPDOpen],
            ['pdClose', pdwlDataSeek.pdClose, pdwlDataSeek.pdDayStart, ic.pdwl.showPDClose],
            ['pwHigh', pdwlDataSeek.pwHigh, pdwlDataSeek.pwWeekStart, ic.pdwl.showPWHigh],
            ['pwLow', pdwlDataSeek.pwLow, pdwlDataSeek.pwWeekStart, ic.pdwl.showPWLow],
            ['pwOpen', pdwlDataSeek.pwOpen, pdwlDataSeek.pwWeekStart, ic.pdwl.showPWOpen],
            ['pwClose', pdwlDataSeek.pwClose, pdwlDataSeek.pwWeekStart, ic.pdwl.showPWClose],
          ]
          const seekLabels = []
          levels.forEach(([name, arr, startArr, show]) => {
            const series = primaryRefs.pdwl[name]?.current
            if (series) {
              const v = arr?.[seekIdx]
              const s = startArr?.[seekIdx]
              if (v !== null && show && s != null) {
                const startSec = chartUnixSeconds(s)
                if (startSec) {
                  series.setData([
                    { time: startSec, value: v },
                    { time: seekTime, value: v },
                  ])
                  const cfg = primaryRefs.pdwlLabelPrimitive?.configs?.[name]
                  if (cfg) seekLabels.push({ time: startSec, price: v, text: cfg.text, color: cfg.color })
                }
              } else {
                series.setData([])
              }
            }
          })
          const lp = primaryRefs.pdwlLabelPrimitive?.current
          if (lp) {
            seekLabels.length ? lp.setLabels(seekLabels) : lp.clearLabels()
          }
        }
      } else if (primaryRefs?.pdwl) {
        Object.values(primaryRefs.pdwl).forEach(ref => ref?.current?.setData([]))
        if (primaryRefs.pdwlLabelPrimitive?.current) {
          primaryRefs.pdwlLabelPrimitive.current.clearLabels()
        }
      }

      const pRsi = primaryData.rsi ?? rsiVals
      applyRsiPaneSlice(primaryRsiRefs, pRsi, primaryTimes, primaryBarsSeek, target, ic.rsi.enabled)
      applySlopePaneSlice(primarySlopeRefs, primaryData.slope, primaryTimes, target, ic.slope.enabled)

      // Sync indicator chart time scales to main chart after data is set
      if (primaryRefs?.chart?.current) {
        const mainApi = primaryRefs.chart.current
        const lr = mainApi.timeScale().getVisibleLogicalRange()
        if (lr) {
          if (ic.rsi.enabled && primaryRsiRefs?.chart?.current) {
            try { primaryRsiRefs.chart.current.timeScale().setVisibleLogicalRange(lr) } catch (_) {}
          }
          if (ic.slope.enabled && primarySlopeRefs?.chart?.current) {
            try { primarySlopeRefs.chart.current.timeScale().setVisibleLogicalRange(lr) } catch (_) {}
          }
        }
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
            if (tfRefs.ema) {
              Object.values(tfRefs.ema).forEach(ref => ref?.current?.setData([]))
            }
            tfRefs.bbMid.current?.setData([])
            tfRefs.bbUp.current?.setData([])
            tfRefs.bbLow.current?.setData([])
            if (tfRefs.pdwl) Object.values(tfRefs.pdwl).forEach(ref => ref?.current?.setData([]))
            clearRsiSeries(simChartData[tf]?.rsiR)
            clearSlopeSeries(simChartData[tf]?.slopeR)
            return
          }

          const tfSlice = tfData.bars.slice(0, tfTarget + 1)

          // Convert times to seconds for TradingView
          const tfCandleData = tfSlice.map(b => ({ ...b, time: msToSeconds(b.time) }))
          const tfVolData = tfSlice.map((b) => ({
            time: msToSeconds(b.time),
            value: b.volume,
            color: b.close >= b.open ? G33 : R33,
          }))

          // Update this timeframe's chart
          tfRefs.candle.current?.setData(tfCandleData)
          tfRefs.vol.current?.setData(tfVolData)

           // Update EMA lines
           if (ic.ema.enabled && tfRefs.ema) {
             Object.entries(tfRefs.ema).forEach(([period, ref]) => {
               const values = tfData.ema?.[Number(period)]
               if (values && ref?.current) {
                 ref.current.setData(values ? buildLine(values, tfTarget + 1, tfData.times) : [])
               }
             })
           }

          const tfSliceLen = tfTarget + 1
          // Update BB
          if (ic.bb.enabled) {
            tfRefs.bbMid.current?.setData(buildLine(tfData.bb.mid, tfSliceLen, tfData.times))
            tfRefs.bbUp.current?.setData(buildLine(tfData.bb.upper, tfSliceLen, tfData.times))
            tfRefs.bbLow.current?.setData(buildLine(tfData.bb.lower, tfSliceLen, tfData.times))
          } else {
            tfRefs.bbMid.current?.setData([])
            tfRefs.bbUp.current?.setData([])
            tfRefs.bbLow.current?.setData([])
          }

          // PDWL on other timeframe
          const tfPdwl = tfData.pdwl
          if (ic.pdwl.enabled && tfPdwl && tfRefs.pdwl) {
            const tfLastCandle = tfCandleData[tfCandleData.length - 1]
            const tfSeekTime = tfLastCandle?.time
            if (tfSeekTime) {
              const levels = [
                ['pdHigh', tfPdwl.pdHigh, tfPdwl.pdDayStart, ic.pdwl.showPDHigh],
                ['pdLow', tfPdwl.pdLow, tfPdwl.pdDayStart, ic.pdwl.showPDLow],
                ['pdOpen', tfPdwl.pdOpen, tfPdwl.pdDayStart, ic.pdwl.showPDOpen],
                ['pdClose', tfPdwl.pdClose, tfPdwl.pdDayStart, ic.pdwl.showPDClose],
                ['pwHigh', tfPdwl.pwHigh, tfPdwl.pwWeekStart, ic.pdwl.showPWHigh],
                ['pwLow', tfPdwl.pwLow, tfPdwl.pwWeekStart, ic.pdwl.showPWLow],
                ['pwOpen', tfPdwl.pwOpen, tfPdwl.pwWeekStart, ic.pdwl.showPWOpen],
                ['pwClose', tfPdwl.pwClose, tfPdwl.pwWeekStart, ic.pdwl.showPWClose],
              ]
              const tfLabels = []
              levels.forEach(([name, arr, startArr, show]) => {
                const s = tfRefs.pdwl[name]?.current
                if (s) {
                  const v = arr?.[tfTarget]
                  const st = startArr?.[tfTarget]
                  if (v !== null && show && st != null) {
                    const startSec = chartUnixSeconds(st)
                    if (startSec) {
                      s.setData([
                        { time: startSec, value: v },
                        { time: tfSeekTime, value: v },
                      ])
                      const cfg = tfRefs.pdwlLabelPrimitive?.configs?.[name]
                      if (cfg) tfLabels.push({ time: startSec, price: v, text: cfg.text, color: cfg.color })
                    }
                  } else {
                    s.setData([])
                  }
                }
              })
              const lp = tfRefs.pdwlLabelPrimitive?.current
              if (lp) {
                tfLabels.length ? lp.setLabels(tfLabels) : lp.clearLabels()
              }
            }
          } else if (tfRefs?.pdwl) {
            Object.values(tfRefs.pdwl).forEach(ref => ref?.current?.setData([]))
            if (tfRefs.pdwlLabelPrimitive?.current) {
              tfRefs.pdwlLabelPrimitive.current.clearLabels()
            }
          }

          applyRsiPaneSlice(simChartData[tf]?.rsiR, tfData.rsi, tfData.times, tfData.bars, tfSliceLen, ic.rsi.enabled)
          applySlopePaneSlice(simChartData[tf]?.slopeR, tfData.slope, tfData.times, tfSliceLen, ic.slope.enabled)

          // Sync multi-TF indicator charts to their main chart
          const tfRsiR = simChartData[tf]?.rsiR
          const tfSlopeR = simChartData[tf]?.slopeR
          if (tfRefs?.chart?.current) {
            const tfLr = tfRefs.chart.current.timeScale().getVisibleLogicalRange()
            if (tfLr) {
              if (ic.rsi.enabled && tfRsiR?.chart?.current) {
                try { tfRsiR.chart.current.timeScale().setVisibleLogicalRange(tfLr) } catch (_) {}
              }
              if (ic.slope.enabled && tfSlopeR?.chart?.current) {
                try { tfSlopeR.chart.current.timeScale().setVisibleLogicalRange(tfLr) } catch (_) {}
              }
            }
          }
        })
      }
    },
    [bars, times, chartR, rsiR, slopeR, emaValues, emaPeriods, bbData, rsiVals, isMultiTimeframe, simChartData, primaryTF, findCompletedBarIndex],
  )

  // ── HOT LOOP ─────────────────────────────────────────────
  useEffect(() => {
    if (!bars.length) return

    let tickId = null
    let syncId = null
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

      // console.log(`tick: cur=${cur}, bar.time=${bars[cur]?.time}`)
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
        tick(genId)
      }
      if (!s.playing && prev && prev.playing) {
        genId++
        shouldTick = false
        if (tickId) clearTimeout(tickId)
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