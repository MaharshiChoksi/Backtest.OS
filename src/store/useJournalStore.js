import { create } from 'zustand'
import { fmtDate } from '../utils/format'

const STORAGE_KEY = 'backtestos_journal_v2'

const persist = (entries) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* quota exceeded */ }
}

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

/**
 * Journal store - tracks trade journal entries with auto-sync capabilities
 */
export const useJournalStore = create((set, get) => ({
  entries: load(),

  /**
   * Auto-sync an open trade to journal
   */
  syncOpenTrade: (trade, symbolConfig, accountConfig) => {
    set((s) => {
      const exists = s.entries.find(e => e.tradeId === trade.id)
      if (exists) return s

      const pip_size = symbolConfig?.pip_size || 0.0001
      const contract_size = symbolConfig?.contract_size || 100000
      
      // Calculate risk in USD
      const risk = trade.sl
        ? Math.abs((trade.entry - trade.sl) / pip_size) * (symbolConfig?.pip_value || 10) * trade.size
        : 0

      // Calculate balance: for first trade use starting balance, else prev balance + prev pnl
      let balance = accountConfig?.starting_balance || 0
      if (s.entries.length > 0) {
        const lastEntry = s.entries[s.entries.length - 1]
        balance = lastEntry.balance + (lastEntry.pnlUsd || 0)
      }

      const newEntry = {
        tradeId: trade.id,
        account: accountConfig?.name || 'BackTest',
        balance: balance,
        deposits: accountConfig?.deposits || 0,
        withdrawals: accountConfig?.withdrawals || 0,
        entryDate: fmtDate(trade.openTime).split(' ')[0],
        entryTime: fmtDate(trade.openTime).split(' ')[1],
        pair: symbolConfig?.symbol || 'N/A',
        direction: trade.side.toUpperCase(),
        entryPrice: trade.entry,
        lotSize: trade.size,
        session: '', // User selectable
        macroRegime: '', // User selectable
        strategyType: '', // User selectable
        analysisTf: '', // User selectable
        entryTf: '', // User selectable
        stopLoss: trade.sl || null,
        takeProfit: trade.tp || null,
        risk,
        fees: (accountConfig?.commission || 0) * trade.size * 2,
        exitPrice: null,
        exitDate: null,
        exitTime: null,
        pnlUsd: 0,
        pnlPips: 0,
        rr: 0,
        winLoss: null,
        notes: trade.comment || '',
        closureReason: null,
      }

      const updated = [...s.entries, newEntry]
      persist(updated)
      return { entries: updated }
    })
  },

  /**
   * Update journal entry when trade details change (SL/TP)
   */
  updateTradeDetails: (tradeId, { entry, sl, tp }) => {
    set((s) => {
      const updated = s.entries.map(e => {
        if (e.tradeId !== tradeId) return e
        
        // Recalculate RR if SL/TP changed
        const newEntry = { ...e }
        if (sl !== undefined) newEntry.stopLoss = sl
        if (tp !== undefined) newEntry.takeProfit = tp
        
        return newEntry
      })
      persist(updated)
      return { entries: updated }
    })
  },

  /**
   * Update journal entry when trade closes
   */
  syncClosedTrade: (trade, symbolConfig) => {
    set((s) => {
      const updated = s.entries.map(e => {
        if (e.tradeId !== trade.id) return e

        if (!symbolConfig) return e

        const pip_size = symbolConfig.pip_size || 0.0001
        const pnlPips = (trade.closePrice - e.entryPrice) / pip_size * (e.direction === 'SELL' ? -1 : 1)
        
        // Calculate RR
        let rr = 0
        if (e.stopLoss && e.takeProfit) {
          const riskPips = Math.abs((e.entryPrice - e.stopLoss) / pip_size)
          const rewardPips = Math.abs((e.takeProfit - e.entryPrice) / pip_size)
          rr = riskPips > 0 ? rewardPips / riskPips : 0
        }

        return {
          ...e,
          exitPrice: trade.closePrice,
          exitDate: fmtDate(trade.closeTime).split(' ')[0],
          exitTime: fmtDate(trade.closeTime).split(' ')[1],
          pnlUsd: trade.pnl || 0,  // Trade PnL already has commission deducted, fees column is just for reference
          pnlPips: pnlPips,
          rr: parseFloat(rr.toFixed(2)),
          winLoss: (trade.pnl || 0) >= 0 ? 'WIN' : 'LOSS',
          closureReason: trade.closeReason || 'Manual',
        }
      })
      persist(updated)
      return { entries: updated }
    })
  },

  /**
   * Update user-editable fields and recalculate dependent fields
   */
  updateEntry: (tradeId, field, value) => {
    set((s) => {
      const updated = s.entries.map(e => {
        if (e.tradeId !== tradeId) return e
        
        const newEntry = { ...e, [field]: value }
        
        // Recalculate RR when risk changes or when SL/TP change
        if (field === 'risk' || field === 'stopLoss' || field === 'takeProfit') {
          if (newEntry.stopLoss && newEntry.takeProfit) {
            const pip_size = 0.0001 // Default, can be enhanced
            const riskPips = Math.round(Math.abs((newEntry.entryPrice - newEntry.stopLoss) / pip_size), 2)
            const rewardPips = Math.round(Math.abs((newEntry.takeProfit - newEntry.entryPrice) / pip_size), 2)
            newEntry.rr = riskPips > 0 ? parseFloat((rewardPips / riskPips).toFixed(2)) : 0
          }
        }
        
        return newEntry
      })
      persist(updated)
      return { entries: updated }
    })
  },

  /**
   * Delete journal entry
   */
  removeEntry: (tradeId) => {
    set((s) => {
      const updated = s.entries.filter(e => e.tradeId !== tradeId)
      persist(updated)
      return { entries: updated }
    })
  },

  /**
   * Export journal as CSV (tab-separated for Excel)
   */
  exportCSV: () => {
    const entries = get().entries
    if (!entries.length) return

    const headers = [
      'ACCOUNT', 'BALANCE', 'DEPOSITS', 'WITHDRAWALS',
      'ENTRY DATE', 'ENTRY TIME', 'PAIR', 'DIRECTION', 'ENTRY PRICE', 'LOT SIZE',
      'SESSION', 'MACRO REGIME', 'STRATEGY TYPE', 'ANALYSIS TF', 'ENTRY TF',
      'STOP LOSS', 'TAKE PROFIT', 'RISK ($)', 'FEES ($)',
      'P/L ($)', 'P/L (PIPS)', 'RR', 'EXIT PRICE', 'EXIT DATE', 'EXIT TIME', 'WIN/LOSS', 'NOTES'
    ]

    const rows = entries.map(e => [
      e.account, e.balance.toFixed(2), e.deposits.toFixed(2), e.withdrawals.toFixed(2),
      e.entryDate, e.entryTime, e.pair, e.direction, e.entryPrice.toFixed(5), e.lotSize,
      e.session, e.macroRegime, e.strategyType, e.analysisTf, e.entryTf,
      e.stopLoss ? e.stopLoss.toFixed(5) : '', e.takeProfit ? e.takeProfit.toFixed(5) : '', 
      e.risk.toFixed(2), e.fees.toFixed(2),
      e.pnlUsd.toFixed(2), e.pnlPips.toFixed(2), e.rr.toFixed(2), 
      e.exitPrice ? e.exitPrice.toFixed(5) : '', e.exitDate || '', e.exitTime || '', 
      e.winLoss || '', e.notes
    ])

    const tsv = [
      headers.join('\t'),
      ...rows.map(r => r.join('\t'))
    ].join('\n')

    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' }))
    a.download = `backtestos_journal_${new Date().toISOString().slice(0, 10)}.tsv`
    a.click()
    URL.revokeObjectURL(a.href)
  },

  reset: () => {
    persist([])
    set({ entries: [] })
  },

  // Selectors
  getEntries: () => get().entries,
  getOpenEntries: () => get().entries.filter(e => !e.exitPrice),
  getClosedEntries: () => get().entries.filter(e => e.exitPrice),
  getTotalPnL: () => get().entries.reduce((sum, e) => sum + (e.pnlUsd || 0), 0),
}))