import { create } from 'zustand'

const TRADE_STORAGE_KEY = 'backtestos_trades_v2'

/**
 * Load trades from localStorage
 */
function loadTrades() {
  try {
    const stored = localStorage.getItem(TRADE_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (err) {
    console.warn('Failed to load trades from localStorage:', err)
    return []
  }
}

/**
 * Save trades to localStorage
 */
function saveTrades(trades) {
  try {
    localStorage.setItem(TRADE_STORAGE_KEY, JSON.stringify(trades))
  } catch (err) {
    console.warn('Failed to save trades to localStorage:', err)
  }
}

/**
 * Calculate PnL using pip-based formula
 */
function calculateTradePnL(entry, exit, side, size, symbolConfig, accountConfig) {
  if (!symbolConfig || !accountConfig) {
    // Fallback: simple price-based calculation
    return side === 'buy'
      ? (exit - entry) * size
      : (entry - exit) * size
  }

  const pipSize = symbolConfig.pip_size || 0.0001
  const pipValue = symbolConfig.pip_value || 10
  
  // Calculate pips moved: for SELL orders, negate because profit when price falls
  const priceDiff = exit - entry
  const pnlPips = (priceDiff / pipSize) * (side === 'sell' ? -1 : 1)
  const rawPnL = pnlPips * pipValue * size

  // Apply commission (scaled by lot size: entry + exit)
  const commission = accountConfig.commission || 0
  const pnlWithCommission = rawPnL - (commission * size * 2)

  return pnlWithCommission
}

export const useTradeStore = create((set, get) => {
  // Load initial trades from localStorage
  const initialTrades = loadTrades()
  const maxId = initialTrades.length > 0 
    ? Math.max(...initialTrades.map(t => t.id || 0)) + 1
    : 1

  return {
    trades: initialTrades,
    _nextId: maxId,

  /**
   * Open a new market trade.
   * @param {{ side, size, entry, sl, tp, openTime, openBar, comment }} data
   * @returns {number} new trade id
   */
  openTrade: (data) => {
    const id = get()._nextId
    set((s) => {
      const newTrades = [...s.trades, { id, status: 'open', ...data }]
      saveTrades(newTrades)
      return {
        _nextId: s._nextId + 1,
        trades: newTrades,
      }
    })
    return id
  },

  /**
   * Manually close an open trade at the current market price.
   */
  closeTrade: (id, closePrice, closeTime, reason = 'Manual', symbolConfig = null, accountConfig = null) =>
    set((s) => {
      const updated = s.trades.map((t) => {
        if (t.id !== id || t.status !== 'open') return t
        const pnl = calculateTradePnL(t.entry, closePrice, t.side, t.size, symbolConfig, accountConfig)
        return { ...t, status: 'closed', closePrice, closeTime, pnl, closeReason: reason }
      })
      saveTrades(updated)
      return { trades: updated }
    }),

  /**
   * Update one or more fields on an open trade (e.g. sl, tp, comment).
   */
  modifyTrade: (id, fields) =>
    set((s) => {
      const updated = s.trades.map((t) => (t.id !== id ? t : { ...t, ...fields }))
      saveTrades(updated)
      return { trades: updated }
    }),

  /**
   * Called every tick — checks each open trade's SL/TP against the current bar.
   * Mutates state only when at least one fill occurs.
   */
  evaluateFills: (bar, symbolConfig = null, accountConfig = null) => {
    const trades  = get().trades
    let   changed = false

    const updated = trades.map((t) => {
      if (t.status !== 'open') return t

      if (t.side === 'buy') {
        if (t.sl && bar.low <= t.sl) {
          changed = true
          const pnl = calculateTradePnL(t.entry, t.sl, t.side, t.size, symbolConfig, accountConfig)
          return { ...t, status: 'closed', closePrice: t.sl, closeTime: bar.time, pnl, closeReason: 'SL', fees: t.fees }
        }
        if (t.tp && bar.high >= t.tp) {
          changed = true
          const pnl = calculateTradePnL(t.entry, t.tp, t.side, t.size, symbolConfig, accountConfig)
          return { ...t, status: 'closed', closePrice: t.tp, closeTime: bar.time, pnl, closeReason: 'TP', fees: t.fees }
        }
      } else if (t.side === 'sell') {
        if (t.sl && bar.high >= t.sl) {
          changed = true
          const pnl = calculateTradePnL(t.entry, t.sl, t.side, t.size, symbolConfig, accountConfig)
          return { ...t, status: 'closed', closePrice: t.sl, closeTime: bar.time, pnl, closeReason: 'SL', fees: t.fees }
        }
        if (t.tp && bar.low <= t.tp) {
          changed = true
          const pnl = calculateTradePnL(t.entry, t.tp, t.side, t.size, symbolConfig, accountConfig)
          return { ...t, status: 'closed', closePrice: t.tp, closeTime: bar.time, pnl, closeReason: 'TP', fees: t.fees }
        }
      }
      return t
    })

    if (changed) {
      saveTrades(updated)
      set({ trades: updated })
    }
  },

  reset: () => {
    saveTrades([])
    set({ trades: [], _nextId: 1 })
  },

  // ── Derived selectors ──────────────────────────────────────
  getOpen:   () => get().trades.filter((t) => t.status === 'open'),
  getClosed: () => get().trades.filter((t) => t.status === 'closed'),
  }
})