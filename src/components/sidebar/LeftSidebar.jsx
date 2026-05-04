import { useState, useMemo } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { useDrawingStore } from '../../store/useDrawingStore'
import { TOOL_DEFINITIONS } from 'lightweight-charts-drawing'
import { getDecimalPlaces, getExitPrice } from '../../utils/tradingUtils'
import { FONT } from '../../constants'
import { fmt, fmtPnl, fmtShortDate } from '../../utils/format'
import { TabBar, Kv, SectionHeader, Divider, pill } from '../ui/atoms'

export function LeftSidebar({ ema20v, ema50v, bbData, rsiVals }) {
  const C = useTheme()
  const [tab, setTab] = useState('info')
  const analysisMode = useSimStore((s) => s.analysisMode)
  const indic = useIndicatorStore()
  const selectedTool = useDrawingStore((s) => s.activeTool)
  const setSelectedTool = useDrawingStore((s) => s.setActiveTool)
  const mockDrawings = useDrawingStore((s) => s.drawings)

  // Build EMA values map for display
  const emaValues = useMemo(() => {
    const result = {}
    if (indic.ema.enabled && ema20v && ema50v) {
      result[20] = ema20v
      result[50] = ema50v
    }
    return result
  }, [indic.ema.enabled, ema20v, ema50v])

  const removeDrawing = useDrawingStore((s) => s.removeDrawing)
  const clearAll = useDrawingStore((s) => s.clearAll)

  return (
    <div style={{ width: 250, background: C.surf, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <TabBar tabs={['info', 'indic', 'tools', 'drawings']} active={tab} onChange={setTab} />
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {tab === 'info' && <InfoTab />}
        {tab === 'indic' && !analysisMode && <IndicTab emaValues={emaValues} bbData={bbData} rsiVals={rsiVals} indic={indic} />}
        {tab === 'tools' && <ToolsTab selectedTool={selectedTool} setSelectedTool={setSelectedTool} />}
        {tab === 'drawings' && (
          <DrawingsManagerTab
            drawings={mockDrawings}
            onRemoveDrawing={removeDrawing}
            onClearAll={clearAll}
          />
        )}
      </div>
    </div>
  )
}

// ── TOOLS tab (dynamic from TOOL_DEFINITIONS) ────────────────────────
// Category label mapping
const CATEGORY_LABELS = {
  line: 'Lines',
  channel: 'Channels',
  pitchfork: 'Pitchforks',
  fibonacci: 'Fibonacci',
  gann: 'Gann',
  forecasting: 'Forecasting',
  measurement: 'Measurement',
  shape: 'Shapes',
  annotation: 'Annotations',
  trading: 'Trading',
}

function ToolsTab({ selectedTool, setSelectedTool }) {
  const C = useTheme()

  // Build tool categories dynamically from TOOL_DEFINITIONS
  const toolCategories = useMemo(() => {
    const grouped = {}

    // Add cursor tool as a special case
    grouped['cursor'] = {
      label: 'General',
      tools: [{ id: 'cursor', label: 'Cursor' }],
    }

    // Group tools by category
    if (TOOL_DEFINITIONS && Array.isArray(TOOL_DEFINITIONS)) {
      TOOL_DEFINITIONS.forEach((tool) => {
        const cat = tool.category || 'other'
        if (!grouped[cat]) {
          grouped[cat] = {
            label: CATEGORY_LABELS[cat] || cat,
            tools: [],
          }
        }
        grouped[cat].tools.push({
          id: tool.type,
          label: tool.name,
        })
      })
    }

    // Return as array in a sensible order
    return Object.values(grouped).sort((a, b) => {
      const order = ['General', 'Lines', 'Channels', 'Pitchforks', 'Fibonacci', 'Gann', 'Forecasting', 'Measurement', 'Shapes', 'Annotations', 'Trading']
      return order.indexOf(a.label) - order.indexOf(b.label)
    })
  }, [])

  const allTools = toolCategories.flatMap((cat) => cat.tools)
  const activeToolLabel = allTools.find((t) => t.id === selectedTool)?.label || 'Cursor'

  return (
    <>
      <SectionHeader>Chart Tools</SectionHeader>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 10, lineHeight: 1.4 }}>
        Select a tool to draw on chart. Click "Cursor" to return to normal interaction.
      </div>

      <Divider />
      <Kv label="Active Tool" value={activeToolLabel} color={C.amber} />
      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {toolCategories.map((cat) => (
          <div key={cat.label}>
            <div style={{ fontSize: 10, color: C.amber, marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>{cat.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {cat.tools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTool(t.id)}
                  style={{
                    border: `1px solid ${selectedTool === t.id ? C.amber : C.border2}`,
                    background: selectedTool === t.id ? C.amber + '20' : C.surf2,
                    color: selectedTool === t.id ? C.text : C.muted,
                    borderRadius: 3,
                    padding: '5px 6px',
                    fontSize: 9,
                    cursor: 'pointer',
                    fontFamily: FONT,
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
// ── DRAWINGS tab (connected to DrawingManager) ─────────────────────────────
function DrawingsManagerTab({ drawings, onRemoveDrawing, onClearAll }) {
  const C = useTheme()
  const selectDrawing = useDrawingStore((s) => s.selectDrawing)
  const deselectAll = useDrawingStore((s) => s.deselectAll)

  const handleSelect = (id) => {
    selectDrawing(id)
  }

  return (
    <>
      <SectionHeader>Drawings Manager</SectionHeader>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 10, lineHeight: 1.4 }}>
        Manage your chart drawings. Click a drawing to select it.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          onClick={onClearAll}
          disabled={!drawings.length}
          style={{
            flex: 1,
            border: `1px solid ${drawings.length ? C.red : C.border2}`,
            background: drawings.length ? C.red + '15' : C.surf2,
            color: drawings.length ? C.red : C.muted,
            borderRadius: 4,
            padding: '7px 8px',
            fontSize: 10,
            cursor: drawings.length ? 'pointer' : 'not-allowed',
            fontFamily: FONT,
          }}
        >
          Clear All
        </button>
        <button
          onClick={deselectAll}
          disabled={!drawings.length}
          style={{
            flex: 1,
            border: `1px solid ${C.border2}`,
            background: C.surf2,
            color: C.muted,
            borderRadius: 4,
            padding: '7px 8px',
            fontSize: 10,
            cursor: drawings.length ? 'pointer' : 'not-allowed',
            fontFamily: FONT,
          }}
        >
          Deselect
        </button>
      </div>
      {!drawings.length ? (
        <div style={{ color: C.dim, fontSize: 11, padding: '10px 0' }}>
          No drawings yet. Select a tool and draw on the chart.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drawings.map((d) => (
            <div
              key={d.id}
              onClick={() => handleSelect(d.id)}
              style={{
                border: `1px solid ${C.border2}`,
                borderRadius: 4,
                background: C.surf2,
                padding: '6px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.amber
                e.currentTarget.style.background = C.surf3
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.border2
                e.currentTarget.style.background = C.surf2
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.typeLabel || d.type || 'Drawing'}
                </div>
                <div style={{ fontSize: 10, color: C.muted }}>ID: {d.id}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveDrawing(d.id)
                }}
                style={{
                  border: `1px solid ${C.red}66`,
                  background: 'transparent',
                  color: C.red,
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: FONT,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── INFO tab ─────────────────────────────────────────
function InfoTab() {
  const C = useTheme()
  const bars = useSimStore((s) => s.bars)
  const cursor = useSimStore((s) => s.cursor)
  const fileName = useSimStore((s) => s.fileName)
  const trades = useTradeStore((s) => s.trades)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const tz = useSimStore((s) => s.timezoneLabel)

  const currentBar = bars[cursor - 1]
  const openTrades = useMemo(() => trades.filter((t) => t.status === 'open'), [trades])
  const closedTrades = useMemo(() => trades.filter((t) => t.status === 'closed'), [trades])

  const totalPnl = useMemo(() =>
    closedTrades.reduce((s, t) => s + (t.pnl || 0), 0), [closedTrades])

  const floatingPnl = useMemo(() =>
    openTrades.reduce((s, t) => {
      if (!currentBar || !symbolConfig || !accountConfig) return s

      const pipSize = symbolConfig.pip_size || 0.0001
      const pipValue = symbolConfig.pip_value || 10

      const spreadInPips = accountConfig.spread || 0
      const exitPrice = getExitPrice(currentBar.close, t.side, spreadInPips, pipSize)

      // Use stored fees (already calculated as entry + exit commissions)
      const totalFees = t.fees || 0

      // Calculate PnL: priceDiff -> pips -> account for direction -> multiply by pip value and size -> subtract fees
      const priceDiff = exitPrice - t.entry
      const pnlPips = (priceDiff / pipSize) * (t.side === 'sell' ? -1 : 1)
      const pnl = pnlPips * pipValue * t.size - totalFees

      return s + pnl
    }, 0), [openTrades, currentBar, symbolConfig, accountConfig])

  const wins = closedTrades.filter((t) => t.pnl > 0)
  const losses = closedTrades.filter((t) => t.pnl <= 0)
  const winRate = closedTrades.length
    ? Math.round(wins.length / closedTrades.length * 100) + '%'
    : '—'

  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : null
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : null

  // Account stats
  const currentBalance = useMemo(() =>
    (accountConfig?.starting_balance || 0) + totalPnl, [accountConfig, totalPnl])
  const returnPercent = useMemo(() =>
    accountConfig?.starting_balance
      ? ((currentBalance - accountConfig.starting_balance) / accountConfig.starting_balance * 100).toFixed(2)
      : 0, [currentBalance, accountConfig])

  const baseUsdLabel = symbolConfig
    ? symbolConfig.quote_currency === 'USD'
      ? '1.0000'
      : symbolConfig.base_usd_rate !== undefined && symbolConfig.base_usd_rate !== ''
        ? Number(symbolConfig.base_usd_rate).toFixed(4)
        : 'required'
    : '—'

  return (
    <>
      {symbolConfig && (
        <>
          <SectionHeader>Symbol</SectionHeader>
          <Kv label="Pair" value={symbolConfig.symbol} />
          <Kv label="Pip Size" value={symbolConfig.pip_size} />
          <Kv label="Spread" value={`${accountConfig?.spread || 0} pips`} />
          <Kv label="Leverage" value={`${accountConfig?.leverage || 0}:1`} />
          {symbolConfig.quote_currency !== 'USD' && (
            <Kv label="Base/USD" value={baseUsdLabel} />
          )}
          <Divider />
        </>
      )}

      {accountConfig && (
        <>
          <SectionHeader>Account</SectionHeader>
          <Kv label="Acc Currency" value='USD' />
          <Kv label="Starting" value={`$${(accountConfig.starting_balance || 0).toLocaleString()}`} />
          <Kv label="Balance" value={`$${currentBalance.toLocaleString()}`} color={currentBalance >= accountConfig.starting_balance ? C.green : C.red} />
          <Kv label="Return" value={`${returnPercent}%`} color={returnPercent >= 0 ? C.green : C.red} />
          <Kv label="Timezone" value={tz} />
          <Divider />
        </>
      )}

      <SectionHeader>Session</SectionHeader>
      <Kv label="File" value={<span style={{ color: C.muted, fontSize: 11, wordBreak: 'break-all' }}>{fileName.replace(/\.(csv|tsv|txt)$/i, '')}</span>} />
      <Kv label="Total bars" value={bars.length.toLocaleString()} />
      <Kv label="Visible" value={cursor.toLocaleString()} />
      <Kv label="From" value={bars[0] ? fmtShortDate(bars[0].time) : '—'} />
      <Kv label="To" value={currentBar ? fmtShortDate(currentBar.time) : '—'} />
      <Kv label="Progress" value={`${(cursor / Math.max(bars.length, 1) * 100).toFixed(1)}%`} />
      <Divider />
      <SectionHeader>Performance</SectionHeader>
      <Kv label="Open" value={openTrades.length} />
      <Kv label="Closed" value={closedTrades.length} />
      <Kv label="Win rate" value={winRate} />
      <Kv label="Realized" value={fmtPnl(totalPnl)} color={totalPnl >= 0 ? C.green : C.red} />
      <Kv label="Floating" value={fmtPnl(floatingPnl)} color={floatingPnl >= 0 ? C.green : C.red} />
      {closedTrades.length > 0 && (
        <>
          <Kv label="Best trade" value={'+' + Math.max(...closedTrades.map((t) => t.pnl)).toFixed(2)} color={C.green} />
          <Kv label="Worst trade" value={Math.min(...closedTrades.map((t) => t.pnl)).toFixed(2)} color={C.red} />
          {avgWin !== null && <Kv label="Avg win" value={'+' + avgWin.toFixed(2)} color={C.green} />}
          {avgLoss !== null && <Kv label="Avg loss" value={avgLoss.toFixed(2)} color={C.red} />}
        </>
      )}
    </>
  )
}

// ── INDIC tab ─────────────────────────────────────────
function IndicTab({ emaValues, bbData, rsiVals, indic }) {
  const C = useTheme()
  const cursor = useSimStore((s) => s.cursor)
  const bars = useSimStore((s) => s.bars)
  const symbolConfig = useSimStore((s) => s.symbolConfig)

  // Use symbolConfig precision for consistent decimal places
  const dec = useMemo(() =>
    symbolConfig
      ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001)
      : 4,
    [symbolConfig]
  )

  return (
    <>
      <SectionHeader>Overlay</SectionHeader>
      {/* EMA toggle */}
      <div
        onClick={() => indic.toggleIndicator('ema')}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer', borderBottom: `1px solid ${C.border}22` }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 2, background: indic.ema.enabled ? C.amber : C.surf3, border: `1px solid ${indic.ema.enabled ? C.amber : C.border2}`, flexShrink: 0, transition: 'all .15s' }} />
        <div style={{ width: 18, height: 2, background: C.amber, opacity: indic.ema.enabled ? 1 : 0.15, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: indic.ema.enabled ? C.text : C.muted, fontFamily: FONT }}>EMA ({indic.ema.periods.join(', ')})</span>
      </div>

      {/* BB toggle */}
      <div
        onClick={() => indic.toggleIndicator('bb')}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer', borderBottom: `1px solid ${C.border}22` }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 2, background: indic.bb.enabled ? C.blue : C.surf3, border: `1px solid ${indic.bb.enabled ? C.blue : C.border2}`, flexShrink: 0, transition: 'all .15s' }} />
        <div style={{ width: 18, height: 2, background: C.blue, opacity: indic.bb.enabled ? 1 : 0.15, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: indic.bb.enabled ? C.text : C.muted, fontFamily: FONT }}>Bollinger ({indic.bb.period}, {indic.bb.stdDev})</span>
      </div>

      <div style={{ height: 1, background: C.border, margin: '12px 0' }} />
      <SectionHeader>Sub-Pane</SectionHeader>

      <div onClick={() => indic.toggleIndicator('rsi')} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer' }}>
        <div style={{ width: 12, height: 12, borderRadius: 2, background: indic.rsi.enabled ? C.purple : C.surf3, border: `1px solid ${indic.rsi.enabled ? C.purple : C.border2}`, flexShrink: 0, transition: 'all .15s' }} />
        <span style={{ fontSize: 12, color: indic.rsi.enabled ? C.text : C.muted, fontFamily: FONT }}>RSI ({indic.rsi.period})</span>
        {indic.rsi.enabled && rsiVals[cursor - 1] !== null && (
          <span style={{ ...pill(C.purple), marginLeft: 'auto' }}>{rsiVals[cursor - 1]?.toFixed(1)}</span>
        )}
      </div>

      {/* Live values */}
      {(indic.ema.enabled || indic.bb.enabled) && (
        <>
          <div style={{ height: 1, background: C.border, margin: '12px 0' }} />
          <SectionHeader>Live Values</SectionHeader>
          {indic.ema.enabled && indic.ema.periods.map((period) => {
            const values = emaValues[period]
            return values && values[cursor - 1] !== null ? (
              <Kv key={period} label={`EMA ${period}`} value={fmt(values[cursor - 1], dec)} color={indic.ema.colors[indic.ema.periods.indexOf(period)] || C.amber} />
            ) : null
          })}
          {indic.bb.enabled && bbData.upper && bbData.upper[cursor - 1] !== null && (
            <>
              <Kv label="BB Upper" value={fmt(bbData.upper[cursor - 1], dec)} color={C.blue} />
              <Kv label="BB Mid" value={fmt(bbData.mid[cursor - 1], dec)} color={C.blue + 'aa'} />
              <Kv label="BB Lower" value={fmt(bbData.lower[cursor - 1], dec)} color={C.blue} />
            </>
          )}
        </>
      )}
    </>
  )
}
