import { useState, useMemo } from 'react'
import { useTheme }          from '../../store/useThemeStore'
import { useSimStore }       from '../../store/useSimStore'
import { useTradeStore }     from '../../store/useTradeStore'
import { fmtPnl, fmtDate, fmt, guessDecimals } from '../../utils/format'
import { TabBar, SectionHeader, pill }           from '../ui/atoms'
import { TradeForm }           from './TradeForm'
import { OpenPositionCard }    from './OpenPositionCard'
import { getExitPrice } from '../../utils/tradingUtils'

export function RightPanel({PanWidth}) {
  const C     = useTheme()
  const [tab, setTab] = useState('trades')

  return (
    <div style={{ width: PanWidth, minWidth: PanWidth, background: C.surf, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', transition: 'width 0s'}}>
      <TabBar tabs={['trades', 'history']} active={tab} onChange={setTab} />
      {tab === 'trades' && <TradesTab  />}
      {tab === 'history' && <HistoryTab />}
    </div>
  )
}

// ── TRADES tab ────────────────────────────────────────────────
function TradesTab() {
  const C               = useTheme()
  const bars           = useSimStore((s) => s.bars)
  const cursor         = useSimStore((s) => s.cursor)
  const symbolConfig   = useSimStore((s) => s.symbolConfig)
  const accountConfig  = useSimStore((s) => s.accountConfig)
  const trades         = useTradeStore((s) => s.trades)

  const currentBar  = bars[cursor - 1]
  const openTrades  = useMemo(() => trades.filter((t) => t.status === 'open'), [trades])

  const floatingPnl = useMemo(() => {
    if (!currentBar || !openTrades.length || !symbolConfig || !accountConfig) return 0
    
    return openTrades.reduce((sum, t) => {
      const pipSize = symbolConfig.pip_size || 0.0001
      const pipValue = symbolConfig.pip_value || 10
      
      // Calculate exit price with spread adjustment
      const spreadInPips = accountConfig.spread || 0
      const exitPrice = getExitPrice(currentBar.close, t.side, spreadInPips, pipSize)
      
      // Use stored fees (already calculated as entry + exit commissions)
      const totalFees = t.fees || 0
      
      // Calculate PnL: priceDiff -> pips -> account for direction -> multiply by pip value and size -> subtract fees
      const priceDiff = exitPrice - t.entry
      const pnlPips = (priceDiff / pipSize) * (t.side === 'sell' ? -1 : 1)
      const pnl = (pnlPips * pipValue * t.size) - totalFees
      
      return sum + pnl
    }, 0)
  }, [openTrades, currentBar, symbolConfig, accountConfig])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <TradeForm />

      {/* Open positions list */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {openTrades.length > 0 ? (
          <>
            <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: C.muted, fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase' }}>
                Open ({openTrades.length})
              </span>
              <span style={{ color: floatingPnl >= 0 ? C.green : C.red, fontSize: 12 }}>
                {fmtPnl(floatingPnl)}
              </span>
            </div>
            {openTrades.map((t) => <OpenPositionCard key={t.id} trade={t} />)}
          </>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: C.dim, fontSize: 13, lineHeight: 1.8 }}>
            No open positions.<br />Press Play and open a trade.
          </div>
        )}
      </div>
    </div>
  )
}

// ── HISTORY tab ───────────────────────────────────────────────
function HistoryTab() {
  const C          = useTheme()
  const trades     = useTradeStore((s) => s.trades)
  const closedTrades = useMemo(() => trades.filter((t) => t.status === 'closed'), [trades])
  const totalPnl   = useMemo(() => closedTrades.reduce((s, t) => s + (t.pnl || 0), 0), [closedTrades])

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase' }}>
          Closed ({closedTrades.length})
        </span>
        <span style={{ color: totalPnl >= 0 ? C.green : C.red, fontSize: 13, fontWeight: 700 }}>
          {fmtPnl(totalPnl)}
        </span>
      </div>

      {closedTrades.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: C.dim, fontSize: 13 }}>
          No closed trades yet.
        </div>
      )}

      {[...closedTrades].reverse().map((t) => (
        <ClosedTradeRow key={t.id} trade={t} />
      ))}
    </div>
  )
}

// ── Single closed trade row ────────────────────────────────────
function ClosedTradeRow({ trade: t }) {
  const C   = useTheme()
  const dec = guessDecimals(t.entry)

  const reasonColor = t.closeReason === 'SL'
    ? C.red
    : t.closeReason === 'TP'
    ? C.green
    : C.muted

  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}18` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <span style={{ color: t.side === 'buy' ? C.green : C.red, fontSize: 12, fontWeight: 700 }}>
            {t.side === 'buy' ? '▲' : '▼'} #{t.id}
          </span>
          <span style={{ color: C.muted, fontSize: 11 }}>×{t.size}</span>
        </div>
        <span style={{ color: t.pnl >= 0 ? C.green : C.red, fontSize: 14, fontWeight: 700 }}>
          {fmtPnl(t.pnl)}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 3 }}>
        <span>{fmt(t.entry, dec)} → {fmt(t.closePrice, dec)}</span>
        <span style={pill(reasonColor)}>{t.closeReason}</span>
      </div>

      <div style={{ fontSize: 11, color: C.dim }}>
        {fmtDate(t.openTime)} → {fmtDate(t.closeTime)}
      </div>

      {t.comment && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>
          {t.comment}
        </div>
      )}
    </div>
  )
}