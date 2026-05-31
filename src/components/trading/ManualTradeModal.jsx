import { useState } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useJournalStore } from '../../store/useJournalStore'
import { searchSymbol } from '../../utils/symbolUtils'
import { getDecimalPlaces } from '../../utils/tradingUtils'
import { FONT } from '../../constants'
import { fmt } from '../../utils/format'
import { mkInp, mkLabel } from '../ui/atoms'

const SYMBOLS = ["EURUSD", "USDJPY", "GBPUSD", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP", "EURJPY", "AUDCHF", "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD"]

export function ManualTradeModal({ onClose, currentBar, cursor }) {
  const C = useTheme()
  const accountConfig = useSimStore((s) => s.accountConfig)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const openTrade = useTradeStore((s) => s.openTrade)

  const dec = symbolConfig ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001) : 5

  const nowIso = currentBar ? new Date(currentBar.time).toISOString().slice(0,16) : new Date().toISOString().slice(0,16)

  const [pair, setPair] = useState(symbolConfig?.symbol || SYMBOLS[0])
  const [side, setSide] = useState('BUY')
  const [entryPrice, setEntryPrice] = useState(currentBar ? fmt(currentBar.close, dec) : '')
  const [lotSize, setLotSize] = useState('0.10')
  const [exitPrice, setExitPrice] = useState(currentBar ? fmt(currentBar.close, dec) : '')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [balance, setBalance] = useState(accountConfig?.starting_balance ? String(accountConfig.starting_balance) : '')
  const [deposits, setDeposits] = useState(accountConfig?.deposits ? String(accountConfig.deposits) : '')
  const [withdrawals, setWithdrawals] = useState(accountConfig?.withdrawals ? String(accountConfig.withdrawals) : '')
  const [fees, setFees] = useState('')
  const [notes, setNotes] = useState('')
  const [entryDateTime, setEntryDateTime] = useState(nowIso)
  const [exitDateTime, setExitDateTime] = useState(nowIso)

  const inp = mkInp(C)
  const lbl = mkLabel(C)

  const handleSubmit = async () => {
    const entry = parseFloat(entryPrice)
    const size = parseFloat(lotSize) || 0
    const sl = stopLoss === '' ? null : parseFloat(stopLoss)
    const tp = takeProfit === '' ? null : parseFloat(takeProfit)
    const exit = exitPrice === '' ? entry : parseFloat(exitPrice)
    const commissionPerSide = accountConfig?.commission ?? 3
    const feesVal = fees === '' ? (commissionPerSide * size * 2) : parseFloat(fees)
    const openTs = entryDateTime ? new Date(entryDateTime).getTime() : (currentBar ? currentBar.time : Date.now())
    const closeTs = exitDateTime ? new Date(exitDateTime).getTime() : (currentBar ? currentBar.time : Date.now())
    const bal = balance === '' ? null : parseFloat(balance)
    const deps = deposits === '' ? 0 : parseFloat(deposits)
    const wds = withdrawals === '' ? 0 : parseFloat(withdrawals)

    if (!Number.isFinite(entry) || !Number.isFinite(size) || size <= 0 || !Number.isFinite(exit)) return

    // Open trade then explicitly sync journal: create open entry (so we can set balance/deposits/withdrawals), then close and sync closed entry
    const id = openTrade({
      side: side.toLowerCase(),
      size: size,
      entry: entry,
      sl: sl,
      tp: tp,
      fees: feesVal,
      openTime: openTs,
      openBar: cursor,
      comment: notes,
    })
    // Sync open trade to journal so we can set account fields
    try {
      const trade = useTradeStore.getState().trades.find(t => t.id === id)
      if (!trade) throw new Error('Trade not found after creation')

      // Try resolving symbol configuration for the chosen pair so journal calculations are accurate
      let manualSymbolConfig = symbolConfig
      try {
        const found = await searchSymbol(pair)
        if (found) manualSymbolConfig = found
      } catch (err) {
        // ignore lookup errors
      }

      // Create open journal entry using resolved symbol config
      useJournalStore.getState().syncOpenTrade(trade, manualSymbolConfig, accountConfig)

      // Ensure user-provided fields are applied to the journal entry
      useJournalStore.getState().updateEntry(id, 'pair', pair)
      useJournalStore.getState().updateEntry(id, 'fees', feesVal)
      if (bal !== null) useJournalStore.getState().updateEntry(id, 'balance', bal)
      if (!Number.isNaN(deps)) useJournalStore.getState().updateEntry(id, 'deposits', deps)
      if (!Number.isNaN(wds)) useJournalStore.getState().updateEntry(id, 'withdrawals', wds)

      // Close the trade using the provided exit price and close timestamp
      useTradeStore.getState().closeTrade(id, exit, closeTs, 'Manual', manualSymbolConfig, accountConfig)

      const updated = useTradeStore.getState().trades.find(t => t.id === id)
      if (updated) {
        useJournalStore.getState().syncClosedTrade(updated, manualSymbolConfig)
      }
    } catch (err) {
      console.error('Manual trade sync error', err)
    }

    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg + '99', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '95%', background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontFamily: FONT }}>Add Trade</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Pair</label>
            <select value={pair} onChange={(e) => setPair(e.target.value)} style={inp}>
              {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Side</label>
            <select value={side} onChange={(e) => setSide(e.target.value)} style={inp}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Entry Price</label>
            <input type="number" step="0.00001" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Lot Size</label>
            <input type="number" step="0.01" min="0.01" value={lotSize} onChange={(e) => setLotSize(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Exit Price</label>
            <input type="number" step="0.00001" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Stop Loss</label>
            <input type="number" step="0.00001" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Take Profit</label>
            <input type="number" step="0.00001" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Fees (optional)</label>
            <input type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} style={inp} placeholder="auto" />
          </div>
          <div>
            <label style={lbl}>Entry Date & Time</label>
            <input type="datetime-local" value={entryDateTime} onChange={(e) => setEntryDateTime(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Exit Date & Time</label>
            <input type="datetime-local" value={exitDateTime} onChange={(e) => setExitDateTime(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Balance</label>
            <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Deposits</label>
            <input type="number" step="0.01" value={deposits} onChange={(e) => setDeposits(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Withdrawals</label>
            <input type="number" step="0.01" value={withdrawals} onChange={(e) => setWithdrawals(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={inp} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSubmit} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${C.green}`, background: C.green + '22', color: C.green, cursor: 'pointer', fontWeight: 700 }}>Add Trade</button>
          <button onClick={onClose} style={{ padding: '9px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default ManualTradeModal
