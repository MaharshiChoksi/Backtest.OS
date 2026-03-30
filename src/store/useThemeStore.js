import { create } from 'zustand'
import { DARK_THEME, LIGHT_THEME } from '../constants/index'

const prefersDark =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true

export const useThemeStore = create((set, get) => ({
  dark: prefersDark,
  C:    prefersDark ? DARK_THEME : LIGHT_THEME,

  toggleTheme: () => {
    const dark = !get().dark
    set({ dark, C: dark ? DARK_THEME : LIGHT_THEME })
  },
}))

/** Convenience selector — returns the full C color object. Reactive. */
export const useTheme = () => useThemeStore((s) => s.C)