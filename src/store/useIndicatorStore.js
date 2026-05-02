import { create } from 'zustand'

export const useIndicatorStore = create((set) => ({
  // Indicator enabled/disabled state
  ema: {
    enabled: true,
    periods: [20, 50, 100],  // Default: 3 EMA with periods 20, 50, 100
    colors: ['#f59e0b', '#a855f7', '#3b82f6'],  // amber, purple, blue
  },
  bb: {
    enabled: false,
    period: 20,
    stdDev: 2,
  },
  rsi: {
    enabled: false,
    period: 14,
  },

  /** Toggle indicator on/off */
  toggleIndicator: (indicator) => set((s) => ({
    [indicator]: { ...s[indicator], enabled: !s[indicator].enabled }
  })),

  /** Update EMA configuration */
  setEmaConfig: (periods, colors) => set((s) => ({
    ema: { ...s.ema, periods: periods || s.ema.periods, colors: colors || s.ema.colors }
  })),

  /** Update Bollinger Bands configuration */
  setBbConfig: (period, stdDev) => set((s) => ({
    bb: { ...s.bb, period: period ?? s.bb.period, stdDev: stdDev ?? s.bb.stdDev }
  })),

  /** Update RSI configuration */
  setRsiConfig: (period) => set((s) => ({
    rsi: { ...s.rsi, period: period ?? s.rsi.period }
  })),

  /** Reset to defaults */
  resetIndicators: () => set({
    ema: { enabled: true, periods: [20, 50, 100], colors: ['#f59e0b', '#a855f7', '#3b82f6'] },
    bb: { enabled: false, period: 20, stdDev: 2 },
    rsi: { enabled: false, period: 14 },
  }),
}))