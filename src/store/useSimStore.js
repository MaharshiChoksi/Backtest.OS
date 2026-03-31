import { create } from 'zustand'

export const useSimStore = create((set, get) => ({
  bars: [],
  fileName: '',
  cursor: 30,
  playing: false,
  speed: 1,
  hoverBar: null,
  analysisMode: false,  // New: when true, shows only metrics + journal

  // Symbol configuration
  symbolConfig: null,
  accountConfig: null,
  timeframe: '1h',
  
  // Multi-timeframe support
  selectedTimeframes: ['1h'],
  barsMap: {},

  /** Load a new session — replaces bars and resets cursor */
  loadSession: (bars, fileName) =>
    set({ bars, fileName, cursor: Math.min(30, bars.length), playing: false, analysisMode: false }),
  
  /** Load multi-timeframe session */
  loadMultiTimeframeSession: (barsMap, selectedTimeframes, fileName) =>
    set({ 
      bars: barsMap[selectedTimeframes[0]] || [],  // Set bars to first timeframe for navigation
      barsMap, 
      selectedTimeframes, 
      fileName, 
      cursor: Math.min(30, barsMap[selectedTimeframes[0]]?.length || 0), 
      playing: false,
      analysisMode: false,
    }),

  /** Set symbol configuration */
  setSymbolConfig: (symbolConfig) => set({ symbolConfig }),

  /** Set account configuration */
  setAccountConfig: (accountConfig) => set({ accountConfig }),

  /** Set timeframe */
  setTimeframe: (timeframe) => set({ timeframe }),

  setCursor: (cursor) => set({ cursor }),
  setPlaying: (value) =>
    set((state) => ({
      playing: typeof value === 'function' ? value(state.playing) : value
    })),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setHoverBar: (bar) => set({ hoverBar: bar }),

  /** Enable analysis mode - clears market data but keeps symbol/account config */
  enterAnalysisMode: () =>
    set((s) => ({ 
      playing: false,
      bars: [],  // Clear market data
      barsMap: {},
      hoverBar: null,
      analysisMode: true,
    })),

  /** Exit analysis mode - go back to upload screen */
  exitAnalysisMode: () =>
    set({ 
      bars: [], 
      fileName: '', 
      cursor: 30, 
      playing: false, 
      speed: 1, 
      hoverBar: null, 
      symbolConfig: null, 
      accountConfig: null, 
      timeframe: '1h', 
      barsMap: {}, 
      selectedTimeframes: ['1h'],
      analysisMode: false,
    }),

  /** Soft reset — rewind to bar 30 without clearing bars */
  reset: () =>
    set((s) => ({ cursor: Math.min(30, s.bars.length), playing: false })),

  /** Full reset — clears bars so App routes back to UploadScreen */
  clearSession: () =>
    set({ bars: [], fileName: '', cursor: 30, playing: false, speed: 1, hoverBar: null, symbolConfig: null, accountConfig: null, timeframe: '1h', barsMap: {}, selectedTimeframes: ['1h'], analysisMode: false }),
}))