import { create } from 'zustand'

export const useTradeStore = create((set, get) => ({
  trades:  [],
  _nextId: 1,

  /**
   * Open a new market trade.
   * @param {{ side, size, entry, sl, tp, openTime, openBar, comment }} data
   * @returns {number} new trade id
   */
  openTrade: (data) => {
    const id = get()._nextId
    set((s) => ({
      _nextId: s._nextId + 1,
      trades:  [...s.trades, { id, status: 'open', ...data }],
    }))
    return id
  },

  /**
   * Manually close an open trade at the current market price.
   */
  closeTrade: (id, closePrice, closeTime, reason = 'Manual') =>
    set((s) => ({
      trades: s.trades.map((t) => {
        if (t.id !== id || t.status !== 'open') return t
        const pnl =
          t.side === 'buy'
            ? (closePrice - t.entry) * t.size
            : (t.entry - closePrice) * t.size
        return { ...t, status: 'closed', closePrice, closeTime, pnl, closeReason: reason }
      }),
    })),

  /**
   * Update one or more fields on an open trade (e.g. sl, tp, comment).
   */
  modifyTrade: (id, fields) =>
    set((s) => ({
      trades: s.trades.map((t) => (t.id !== id ? t : { ...t, ...fields })),
    })),

  /**
   * Called every tick — checks each open trade's SL/TP against the current bar.
   * Mutates state only when at least one fill occurs.
   */
  evaluateFills: (bar) => {
    const trades  = get().trades
    let   changed = false

    const updated = trades.map((t) => {
      if (t.status !== 'open') return t

      if (t.side === 'buy') {
        if (t.sl && bar.low <= t.sl) {
          changed = true
          return { ...t, status: 'closed', closePrice: t.sl, closeTime: bar.time, pnl: (t.sl - t.entry) * t.size, closeReason: 'SL' }
        }
        if (t.tp && bar.high >= t.tp) {
          changed = true
          return { ...t, status: 'closed', closePrice: t.tp, closeTime: bar.time, pnl: (t.tp - t.entry) * t.size, closeReason: 'TP' }
        }
      } else {
        if (t.sl && bar.high >= t.sl) {
          changed = true
          return { ...t, status: 'closed', closePrice: t.sl, closeTime: bar.time, pnl: (t.entry - t.sl) * t.size, closeReason: 'SL' }
        }
        if (t.tp && bar.low <= t.tp) {
          changed = true
          return { ...t, status: 'closed', closePrice: t.tp, closeTime: bar.time, pnl: (t.entry - t.tp) * t.size, closeReason: 'TP' }
        }
      }
      return t
    })

    if (changed) set({ trades: updated })
  },

  reset: () => set({ trades: [], _nextId: 1 }),

  // ── Derived selectors ──────────────────────────────────────
  getOpen:   () => get().trades.filter((t) => t.status === 'open'),
  getClosed: () => get().trades.filter((t) => t.status === 'closed'),
}))