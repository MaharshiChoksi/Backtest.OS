import { create } from 'zustand'

export const useSimStore = create((set, get) => ({
  bars:     [],
  fileName: '',
  cursor:   30,
  playing:  false,
  speed:    1,
  hoverBar: null,

  /** Load a new session — replaces bars and resets cursor */
  loadSession: (bars, fileName) =>
    set({ bars, fileName, cursor: Math.min(30, bars.length), playing: false }),

  setCursor:     (cursor)  => set({ cursor }),
  setPlaying:    (playing) => set({ playing }),
  togglePlaying: ()        => set((s) => ({ playing: !s.playing })),
  setSpeed:      (speed)   => set({ speed }),
  setHoverBar:   (bar)     => set({ hoverBar: bar }),

  /** Soft reset — rewind to bar 30 without clearing bars */
  reset: () =>
    set((s) => ({ cursor: Math.min(30, s.bars.length), playing: false })),

  /** Full reset — clears bars so App routes back to UploadScreen */
  clearSession: () =>
    set({ bars: [], fileName: '', cursor: 30, playing: false, speed: 1, hoverBar: null }),
}))