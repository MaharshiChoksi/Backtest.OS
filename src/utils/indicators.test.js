import test from 'node:test'
import assert from 'node:assert/strict'

import { calcEMA, calcATR, calcNormalizedSlope, calcSlopeEntrySignals } from './indicators.js'

function makeRisingBars(length = 80, start = 100) {
  return Array.from({ length }, (_, i) => ({
    time: i * 60_000,
    open: start + i * 0.35,
    high: start + i * 0.42 + 0.6,
    low: start + i * 0.28 - 0.5,
    close: start + i * 0.38,
    volume: 1000,
  }))
}

test('calcNormalizedSlope respects slope lookback and ATR normalization', () => {
  const bars = makeRisingBars(120)
  const slopes = calcNormalizedSlope(bars, [20, 50], 14, 3)

  const ema20 = calcEMA(bars.map((b) => b.close), 20)
  const atr = calcATR(bars, 14)
  const expected = ((ema20[30] - ema20[27]) / (atr[30] * 3))

  assert.ok(slopes[20][30] !== null)
  assert.ok(Math.abs((slopes[20][30] ?? 0) - expected) < 1e-8)
})

test('calcSlopeEntrySignals returns long and short arrays for the chart overlay', () => {
  const bars = makeRisingBars(120)
  const signals = calcSlopeEntrySignals(bars, [20, 50], 14, 3, { pbEmaFilter: false })

  assert.equal(signals.long.length, bars.length)
  assert.equal(signals.short.length, bars.length)
  assert.equal(signals.pbTop.length, bars.length)
  assert.equal(signals.pbBot.length, bars.length)
})
