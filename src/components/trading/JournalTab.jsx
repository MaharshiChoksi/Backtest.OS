import { useState, useMemo } from 'react'
import { useTheme }        from '../../store/useThemeStore'
import { useSimStore }     from '../../store/useSimStore'
import { useTradeStore }   from '../../store/useTradeStore'
import { useJournalStore } from '../../store/useJournalStore'
import { getDecimalPlaces } from '../../utils/tradingUtils'
import { FONT }            from '../../constants'
import { fmt, fmtPnl }     from '../../utils/format'
import { SectionHeader }   from '../ui/atoms'

// Dropdown options
const ACCOUNTS = ['5%ers - 2.5K', 'ICMkt Real', 'ICMkt Demo', 'BackTest', 'ForwardTest', 'StressTest']
const SESSION_OPTIONS = ['LONDON', 'NEWYORK', 'TOKYO', 'SYDNEY']
const REGIME_OPTIONS = ['BULLCONT' ,'BULLREV', 'BEARCONT','BEARREV', 'NOISE']
const STRATEGY_OPTIONS = ['INDICES-SETUP-A-REVERSAL', 'INDICES-SETUP-B-CONTINUATION', 'COMMODITY-AMDX', 'CURRENCY-REGIME & TREND CONTINUATION']
const TF_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
const SYMBOLS = ["EURUSD", "USDJPY", "GBPUSD", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP", "EURJPY", "AUDCHF", "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "XTIUSD", "SP500 / US500 / SPX500", "USTECH / US100 / NASDAQ", "US30 / DJI30 / DOW"]

export function JournalTab() {
  const C         = useTheme()
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const trades    = useTradeStore((s) => s.trades)
  const modifyTrade = useTradeStore((s) => s.modifyTrade)
  const entries   = useJournalStore((s) => s.entries)
  const syncOpenTrade = useJournalStore((s) => s.syncOpenTrade)
  const syncClosedTrade = useJournalStore((s) => s.syncClosedTrade)
  const updateEntry = useJournalStore((s) => s.updateEntry)
  const updateTradeDetails = useJournalStore((s) => s.updateTradeDetails)
  const removeEntry = useJournalStore((s) => s.removeEntry)
  const exportCSV = useJournalStore((s) => s.exportCSV)
  const reset = useJournalStore((s) => s.reset)

  const [showClosed, setShowClosed] = useState(false)
  const [scrollX, setScrollX] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)

  // Auto-sync trades to journal
  useMemo(() => {
    trades.forEach(trade => {
      const entryExists = entries.find(e => e.tradeId === trade.id)
      if (!entryExists && trade.status === 'open') {
        syncOpenTrade(trade, symbolConfig, accountConfig)
      }
      
      // Sync closed trades
      if (trade.status === 'closed' && entryExists && !entryExists.exitPrice) {
        syncClosedTrade(trade, symbolConfig)
      }
      
      // Sync SL/TP changes for open trades
      if (entryExists && trade.status === 'open' && (entryExists.stopLoss !== trade.sl || entryExists.takeProfit !== trade.tp)) {
        updateEntry(trade.id, 'stopLoss', trade.sl)
        updateEntry(trade.id, 'takeProfit', trade.tp)
      }
    })
  }, [trades, entries, symbolConfig, accountConfig, updateEntry, syncOpenTrade, syncClosedTrade])

  const displayEntries = useMemo(() => {
    return showClosed
      ? entries.filter(e => e.exitPrice)
      : entries.filter(e => !e.exitPrice)
  }, [entries, showClosed])

  const totalPnl = useMemo(() => {
    return displayEntries.reduce((sum, e) => sum + (e.pnlUsd || 0), 0)
  }, [displayEntries])

  // Get decimal places from symbolConfig for consistent price formatting
  const priceDecimals = symbolConfig
    ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001)
    : 5

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surf }}>
      {/* Header with tabs and export */}
      <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <SectionHeader>Trade Journal</SectionHeader>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => exportCSV()}
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                border: `1px solid ${C.border}`,
                background: 'transparent',
                color: C.muted,
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              ↓ Export TSV
            </button>
            <button
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true)
                } else {
                  reset()
                  setConfirmClear(false)
                }
              }}
              onBlur={() => setConfirmClear(false)}
              style={{
                padding: '4px 10px',
                borderRadius: 3,
                border: `1px solid ${confirmClear ? C.red : C.border}`,
                background: confirmClear ? C.red + '15' : 'transparent',
                color: confirmClear ? C.red : C.muted,
                  fontSize: 12,
                cursor: 'pointer',
                transition: 'all .2s',
              }}
            >
              {confirmClear ? '✓ Clear All?' : 'Clear All'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
          <button
            onClick={() => setShowClosed(false)}
            style={{
              padding: '4px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: showClosed ? 'none' : `2px solid ${C.amber}`,
              color: showClosed ? C.muted : C.amber,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              transition: 'all .2s',
            }}
          >
            Open ({entries.filter(e => !e.exitPrice).length})
          </button>
          <button
            onClick={() => setShowClosed(true)}
            style={{
              padding: '4px 0',
              background: 'transparent',
              border: 'none',
              borderBottom: showClosed ? `2px solid ${C.amber}` : 'none',
              color: showClosed ? C.amber : C.muted,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              transition: 'all .2s',
            }}
          >
            Closed ({entries.filter(e => e.exitPrice).length})
          </button>
          {displayEntries.length > 0 && (
            <div style={{ marginLeft: 'auto', fontSize: 13, color: totalPnl >= 0 ? C.green : C.red }}>
              Total P/L: {fmtPnl(totalPnl)}
            </div>
          )}
        </div>
      </div>

      {/* Table container */}
      {displayEntries.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim }}>
          No {showClosed ? 'closed' : 'open'} trades yet.
        </div>
      ) : (
        <div
          style={{ flex: 1, overflow: 'auto' }}
          onScroll={(e) => setScrollX(e.target.scrollLeft)}
        >
          <JournalTable
            entries={displayEntries}
            updateEntry={updateEntry}
            updateTradeDetails={updateTradeDetails}
            modifyTrade={modifyTrade}
            removeEntry={removeEntry}
            showClosed={showClosed}
            C={C}
            priceDecimals={priceDecimals}
          />
        </div>
      )}
    </div>
  )
}

// ── Journal Table Component ────────────────────────────────────
function JournalTable({ entries, updateEntry, updateTradeDetails, modifyTrade, removeEntry, showClosed, C, priceDecimals }) {
  const columnDefs = [
    // Account Details
    { key: 'account', label: 'ACCOUNT', width: 100, editable: true, type: 'dropdown', options: ACCOUNTS },
    { key: 'balance', label: 'BALANCE', width: 90, editable: false, format: (v) => `$${v.toFixed(0)}` },
    { key: 'deposits', label: 'DEPOSITS', width: 90, editable: false, format: (v) => `$${v.toFixed(0)}` },
    { key: 'withdrawals', label: 'WITHDRAWALS', width: 100, editable: false, format: (v) => `$${v.toFixed(0)}` },
    
    // Trade Entry Details
    { key: 'entryDate', label: 'ENTRY DATE', width: 100, editable: false },
    { key: 'entryTime', label: 'ENTRY TIME', width: 90, editable: false },
    { key: 'pair', label: 'PAIR', width: 80, editable: true, type: 'dropdown', options: SYMBOLS },
    { key: 'direction', label: 'DIRECTION', width: 80, editable: true, type: 'dropdown', options: ['BUY', 'SELL'] },
    { key: 'entryPrice', label: 'ENTRY PRICE', width: 100, editable: false, format: (v) => v.toFixed(priceDecimals) },
    { key: 'lotSize', label: 'LOT SIZE', width: 80, editable: true, format: (v) => v.toFixed(2) },
    
    // Session & Strategy
    { key: 'session', label: 'SESSION', width: 100, editable: true, type: 'dropdown', options: SESSION_OPTIONS },
    { key: 'macroRegime', label: 'MACRO REGIME', width: 120, editable: true, type: 'dropdown', options: REGIME_OPTIONS },
    { key: 'strategyType', label: 'STRATEGY TYPE', width: 120, editable: true, type: 'dropdown', options: STRATEGY_OPTIONS },
    { key: 'analysisTf', label: 'ANALYSIS TF', width: 100, editable: true, type: 'dropdown', options: TF_OPTIONS },
    { key: 'entryTf', label: 'ENTRY TF', width: 100, editable: true, type: 'dropdown', options: TF_OPTIONS },
    
    // Position Management
    { key: 'stopLoss', label: 'STOP LOSS', width: 100, editable: true, format: (v) => v ? v.toFixed(priceDecimals) : '—' },
    { key: 'takeProfit', label: 'TAKE PROFIT', width: 110, editable: true, format: (v) => v ? v.toFixed(priceDecimals) : '—' },
    { key: 'risk', label: 'RISK ($)', width: 90, editable: true, format: (v) => `$${v.toFixed(2)}` },
    { key: 'fees', label: 'FEES ($)', width: 85, editable: true, format: (v) => `$${v.toFixed(2)}` },
    
    // Results (auto-calculated)
    { key: 'pnlUsd', label: 'P/L ($)', width: 90, editable: false, format: (v) => fmtPnl(v) },
    { key: 'pnlPips', label: 'P/L (PIPS)', width: 100, editable: false, format: (v) => v.toFixed(1) },
    { key: 'rr', label: 'RR', width: 70, editable: false, format: (v) => v.toFixed(2) },
    { key: 'exitPrice', label: 'EXIT PRICE', width: 110, editable: false, format: (v) => v ? v.toFixed(priceDecimals) : '—' },
    { key: 'exitDate', label: 'EXIT DATE', width: 100, editable: false },
    { key: 'exitTime', label: 'EXIT TIME', width: 90, editable: false },
    { key: 'winLoss', label: 'WIN/LOSS', width: 80, editable: false },
    { key: 'notes', label: 'NOTES', width: 150, editable: true },
  ]

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10, fontFamily: FONT }}>
      <thead>
        <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
          {columnDefs.map(col => (
            <th
              key={col.key}
              style={{
                width: col.width,
                minWidth: col.width,
                padding: '8px 6px',
                textAlign: 'left',
                color: col.editable ? C.amber : C.muted,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                borderRight: `1px solid ${C.border}`,
                background: C.bg,
                fontSize: 11,
              }}
            >
              {col.label}
            </th>
          ))}
          <th style={{ width: 50, minWidth: 50, padding: '8px', textAlign: 'center' }}>×</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <TableRow
            key={entry.tradeId}
            entry={entry}
            columnDefs={columnDefs}
            updateEntry={updateEntry}
            updateTradeDetails={updateTradeDetails}
            modifyTrade={modifyTrade}
            removeEntry={removeEntry}
            C={C}
          />
        ))}
      </tbody>
    </table>
  )
}

// ── Table Row Component ────────────────────────────────────────
function TableRow({ entry, columnDefs, updateEntry, updateTradeDetails, modifyTrade, removeEntry, C }) {
  const [editing, setEditing] = useState({})

  const handleChange = (key, value) => {
    // Convert numeric fields to numbers
    let finalValue = value
    if (key === 'risk' || key === 'fees' || key === 'lotSize') {
      finalValue = parseFloat(value) || 0
    } else if (key === 'stopLoss' || key === 'takeProfit') {
      finalValue = parseFloat(value) || null
    }
    
    updateEntry(entry.tradeId, key, finalValue)
    
    // Also update trade details for SL/TP
    if (key === 'stopLoss' || key === 'takeProfit') {
      const numValue = parseFloat(value) || null
      updateTradeDetails(entry.tradeId, {
        sl: key === 'stopLoss' ? numValue : entry.stopLoss,
        tp: key === 'takeProfit' ? numValue : entry.takeProfit,
      })
      // Sync to trade store as well
      modifyTrade(entry.tradeId, {
        sl: key === 'stopLoss' ? numValue : entry.stopLoss,
        tp: key === 'takeProfit' ? numValue : entry.takeProfit,
      })
    }
  }

  return (
    <tr style={{ borderBottom: `1px solid ${C.border}18`, background: entry.winLoss === 'WIN' ? C.green + '08' : entry.winLoss === 'LOSS' ? C.red + '08' : 'transparent' }}>
      {columnDefs.map(col => {
        const value = entry[col.key]
        const formatted = col.format ? col.format(value) : value
        const isEditable = col.editable && !editing[col.key]

        return (
          <td
            key={col.key}
            style={{
              width: col.width,
              minWidth: col.width,
              padding: '6px',
              borderRight: `1px solid ${C.border}`,
              color: C.text,
              backgroundColor: editing[col.key] ? C.border + '20' : 'transparent',
            }}
            onDoubleClick={() => col.editable && !editing[col.key] && setEditing({ ...editing, [col.key]: true })}
          >
            {col.type === 'dropdown' && editing[col.key] ? (
              <select
                value={value}
                onChange={(e) => {
                  handleChange(col.key, e.target.value)
                  setEditing({ ...editing, [col.key]: false })
                }}
                onBlur={() => setEditing({ ...editing, [col.key]: false })}
                autoFocus
                style={{
                  width: '100%',
                  padding: '2px 4px',
                  background: C.bg,
                  border: `1px solid ${C.amber}`,
                  color: C.text,
                  borderRadius: 2,
                  fontFamily: 'inherit',
                  fontSize: 10,
                }}
              >
                {col.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : col.editable && editing[col.key] ? (
              <input
                type={col.key.includes('Price') || col.key === 'risk' || col.key === 'fees' ? 'number' : 'text'}
                step={col.key.includes('Price') ? '0.00001' : col.key === 'risk' || col.key === 'fees' ? '0.01' : '0.01'}
                value={value}
                onChange={(e) => handleChange(col.key, e.target.value)}
                onBlur={() => setEditing({ ...editing, [col.key]: false })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditing({ ...editing, [col.key]: false })
                  if (e.key === 'Escape') setEditing({ ...editing, [col.key]: false })
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '2px 4px',
                  background: C.bg,
                  border: `1px solid ${C.amber}`,
                  color: C.text,
                  borderRadius: 2,
                  fontFamily: 'inherit',
                  fontSize: 10,
                }}
              />
            ) : (
              <span
                style={{
                  cursor: col.editable ? 'pointer' : 'default',
                  color: col.editable ? C.amber : value >= 0 && (col.key === 'pnlUsd' || col.key === 'pnlPips') ? C.green : value < 0 && (col.key === 'pnlUsd' || col.key === 'pnlPips') ? C.red : C.text,
                  opacity: col.editable ? 1 : 0.7,
                }}
              >
                {formatted}
              </span>
            )}
          </td>
        )
      })}
      <td
        style={{
          width: 50,
          minWidth: 50,
          textAlign: 'center',
          padding: '6px',
        }}
      >
        <button
          onClick={() => removeEntry(entry.tradeId)}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.red,
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
            opacity: 0.6,
          }}
          title="Delete entry"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}