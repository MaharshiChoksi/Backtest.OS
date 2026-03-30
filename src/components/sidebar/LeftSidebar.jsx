import { useState, useMemo } from 'react'
import { useTheme }          from '../../store/useThemeStore'
import { useSimStore }       from '../../store/useSimStore'
import { useTradeStore }     from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { getDecimalPlaces, getExitPrice } from '../../utils/tradingUtils'
import { FONT }              from '../../constants'
import { fmt, fmtPnl, fmtShortDate } from '../../utils/format'
import { TabBar, Kv, SectionHeader, Divider, pill }  from '../ui/atoms'

export function LeftSidebar({ ema20v, ema50v, bbData, rsiVals }) {
  const C       = useTheme()
  const [tab, setTab] = useState('info')

  return (
    <div style={{ width: 210, background: C.surf, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <TabBar tabs={['info', 'indic']} active={tab} onChange={setTab} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {tab === 'info'  && <InfoTab />}
        {tab === 'indic' && <IndicTab ema20v={ema20v} ema50v={ema50v} bbData={bbData} rsiVals={rsiVals} />}
      </div>
    </div>
  )
}

// ── INFO tab ──────────────────────────────────────────────────
function InfoTab() {
  const C        = useTheme()
  const bars     = useSimStore((s) => s.bars)
  const cursor   = useSimStore((s) => s.cursor)
  const fileName = useSimStore((s) => s.fileName)
  const trades   = useTradeStore((s) => s.trades)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const accountConfig = useSimStore((s) => s.accountConfig)

  const currentBar = bars[cursor - 1]
  const openTrades  = useMemo(() => trades.filter((t) => t.status === 'open'),   [trades])
  const closedTrades= useMemo(() => trades.filter((t) => t.status === 'closed'), [trades])

  const totalPnl = useMemo(() =>
    closedTrades.reduce((s, t) => s + (t.pnl || 0), 0), [closedTrades])

  const floatingPnl = useMemo(() =>
    openTrades.reduce((s, t) => {
      if (!currentBar || !symbolConfig) return s
      const pip_size = symbolConfig.pip_size || 0.0001
      const pip_value = symbolConfig.pip_value || 10
      const spreadInPips = accountConfig ? (accountConfig.spread || 0) : 0
      const exitPrice = getExitPrice(currentBar.close, t.side, spreadInPips, pip_size)
      const priceDiff = exitPrice - t.entry
      const pips = (priceDiff / pip_size) * (t.side === 'sell' ? -1 : 1)
      const pnl = pips * pip_value * t.size
      return s + pnl
    }, 0), [openTrades, currentBar, symbolConfig, accountConfig])

  const wins    = closedTrades.filter((t) => t.pnl > 0)
  const losses  = closedTrades.filter((t) => t.pnl <= 0)
  const winRate = closedTrades.length
    ? Math.round(wins.length / closedTrades.length * 100) + '%'
    : '—'

  const avgWin  = wins.length   ? wins.reduce((s, t) => s + t.pnl, 0)   / wins.length   : null
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : null

  // Account stats
  const currentBalance = useMemo(() =>
    (accountConfig?.starting_balance || 0) + totalPnl, [accountConfig, totalPnl])
  const returnPercent = useMemo(() =>
    accountConfig?.starting_balance 
      ? ((currentBalance - accountConfig.starting_balance) / accountConfig.starting_balance * 100).toFixed(2)
      : 0, [currentBalance, accountConfig])

  return (
    <>
      {symbolConfig && (
        <>
          <SectionHeader>Symbol</SectionHeader>
          <Kv label="Pair"       value={symbolConfig.symbol} />
          <Kv label="Pip Size"   value={symbolConfig.pip_size} />
          <Kv label="Spread"     value={`${accountConfig?.spread || 0} pips`} />
          <Kv label="Leverage"   value={`${accountConfig?.leverage || 0}:1`} />
          <Divider />
        </>
      )}

      {accountConfig && (
        <>
          <SectionHeader>Account</SectionHeader>
          <Kv label="Starting"    value={`$${(accountConfig.starting_balance || 0).toLocaleString()}`} />
          <Kv label="Balance"     value={`$${currentBalance.toLocaleString()}`} color={currentBalance >= accountConfig.starting_balance ? C.green : C.red} />
          <Kv label="Return"      value={`${returnPercent}%`} color={returnPercent >= 0 ? C.green : C.red} />
          <Divider />
        </>
      )}

      <SectionHeader>Session</SectionHeader>
      <Kv label="File"        value={<span style={{ color: C.muted, fontSize: 11, wordBreak: 'break-all' }}>{fileName.replace(/\.(csv|tsv|txt)$/i, '')}</span>} />
      <Kv label="Total bars"  value={bars.length.toLocaleString()} />
      <Kv label="Visible"     value={cursor.toLocaleString()} />
      <Kv label="From"        value={bars[0]     ? fmtShortDate(bars[0].time)     : '—'} />
      <Kv label="To"          value={currentBar  ? fmtShortDate(currentBar.time)  : '—'} />
      <Kv label="Progress"    value={`${(cursor / Math.max(bars.length, 1) * 100).toFixed(1)}%`} />
      <Divider />
      <SectionHeader>Performance</SectionHeader>
      <Kv label="Open"        value={openTrades.length} />
      <Kv label="Closed"      value={closedTrades.length} />
      <Kv label="Win rate"    value={winRate} />
      <Kv label="Realized"    value={fmtPnl(totalPnl)}    color={totalPnl    >= 0 ? C.green : C.red} />
      <Kv label="Floating"    value={fmtPnl(floatingPnl)} color={floatingPnl >= 0 ? C.green : C.red} />
      {closedTrades.length > 0 && (
        <>
          <Kv label="Best trade"  value={'+' + Math.max(...closedTrades.map((t) => t.pnl)).toFixed(2)} color={C.green} />
          <Kv label="Worst trade" value={Math.min(...closedTrades.map((t) => t.pnl)).toFixed(2)}       color={C.red}   />
          {avgWin  !== null && <Kv label="Avg win"  value={'+' + avgWin.toFixed(2)}  color={C.green} />}
          {avgLoss !== null && <Kv label="Avg loss" value={avgLoss.toFixed(2)}        color={C.red}   />}
        </>
      )}
    </>
  )
}

// ── INDIC tab ─────────────────────────────────────────────────
function IndicTab({ ema20v, ema50v, bbData, rsiVals }) {
  const C        = useTheme()
  const indic    = useIndicatorStore()
  const cursor   = useSimStore((s) => s.cursor)
  const bars     = useSimStore((s) => s.bars)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  
  // Use symbolConfig precision for consistent decimal places
  const dec = useMemo(() => 
    symbolConfig 
      ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001)
      : 4,
    [symbolConfig]
  )

  const OVERLAYS = [
    { key: 'ema20', label: 'EMA 20',          color: C.amber  },
    { key: 'ema50', label: 'EMA 50',          color: C.purple },
    { key: 'bb',    label: 'Bollinger (20,2)', color: C.blue   },
  ]

  return (
    <>
      <SectionHeader>Overlay</SectionHeader>
      {OVERLAYS.map(({ key, label, color }) => (
        <div
          key={key}
          onClick={() => indic.toggle(key)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer', borderBottom: `1px solid ${C.border}22` }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 2, background: indic[key] ? color : C.surf3, border: `1px solid ${indic[key] ? color : C.border2}`, flexShrink: 0, transition: 'all .15s' }} />
          <div style={{ width: 18, height: 2, background: color, opacity: indic[key] ? 1 : 0.15, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: indic[key] ? C.text : C.muted, fontFamily: FONT }}>{label}</span>
        </div>
      ))}

      <div style={{ height: 1, background: C.border, margin: '12px 0' }} />
      <SectionHeader>Sub-Pane</SectionHeader>

      <div onClick={() => indic.toggle('rsi')} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer' }}>
        <div style={{ width: 12, height: 12, borderRadius: 2, background: indic.rsi ? C.purple : C.surf3, border: `1px solid ${indic.rsi ? C.purple : C.border2}`, flexShrink: 0, transition: 'all .15s' }} />
        <span style={{ fontSize: 12, color: indic.rsi ? C.text : C.muted, fontFamily: FONT }}>RSI (14)</span>
        {indic.rsi && rsiVals[cursor - 1] !== null && (
          <span style={{ ...pill(C.purple), marginLeft: 'auto' }}>{rsiVals[cursor - 1]?.toFixed(1)}</span>
        )}
      </div>

      {/* Live values */}
      {(indic.ema20 || indic.ema50 || indic.bb) && (
        <>
          <div style={{ height: 1, background: C.border, margin: '12px 0' }} />
          <SectionHeader>Live Values</SectionHeader>
          {indic.ema20 && ema20v[cursor - 1] !== null && <Kv label="EMA 20"    value={fmt(ema20v[cursor - 1], dec)} color={C.amber}  />}
          {indic.ema50 && ema50v[cursor - 1] !== null && <Kv label="EMA 50"    value={fmt(ema50v[cursor - 1], dec)} color={C.purple} />}
          {indic.bb    && bbData.upper[cursor - 1] !== null && (
            <>
              <Kv label="BB Upper" value={fmt(bbData.upper[cursor - 1], dec)} color={C.blue} />
              <Kv label="BB Mid"   value={fmt(bbData.mid[cursor - 1],   dec)} color={C.blue + 'aa'} />
              <Kv label="BB Lower" value={fmt(bbData.lower[cursor - 1], dec)} color={C.blue} />
            </>
          )}
        </>
      )}
    </>
  )
}