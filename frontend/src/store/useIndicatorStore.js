import { create } from 'zustand'

export const useIndicatorStore = create((set) => ({
  ema20: true,
  ema50: false,
  bb:    false,
  rsi:   false,

  /** Toggle a single indicator by key */
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
}))