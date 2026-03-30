import { useState, useMemo } from 'react'
import { useTheme }      from '../../store/useThemeStore'
import { useSimStore }   from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { getDecimalPlaces, getExitPrice } from '../../utils/tradingUtils'
import { FONT }          from '../../constants'
import { fmt, fmtPnl, fmtDate } from '../../utils/format'
import { mkInp, mkLabel } from '../ui/atoms'
/**
 * Renders a single open position card.
 * Reads current bar from sim store to calculate live floating P&L.
 * @param {{ trade }} props
 */
export function OpenPositionCard({ trade: t }) {
  const C               = useTheme()
  const bars           = useSimStore((s) => s.bars)
  const cursor         = useSimStore((s) => s.cursor)
  const symbolConfig   = useSimStore((s) => s.symbolConfig)
  const accountConfig  = useSimStore((s) => s.accountConfig)
  const closeTrade     = useTradeStore((s) => s.closeTrade)
  const modifyTrade    = useTradeStore((s) => s.modifyTrade)

  const currentBar = bars[cursor - 1]
  
  // Use symbolConfig precision for consistent decimal places
  const dec = symbolConfig
    ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001)
    : 4;

  // Calculate floating PnL using journal's correct logic with stored fees
  const fp = useMemo(() => {
    if (!currentBar || !symbolConfig || !accountConfig) return 0
    
    const pipSize = symbolConfig.pip_size || 0.0001
    const pipValue = symbolConfig.pip_value || 10
    
    // Calculate exit price with spread adjustment (what they'd get if closing at market now)
    const spreadInPips = accountConfig.spread || 0
    const exitPrice = getExitPrice(currentBar.close, t.side, spreadInPips, pipSize)
    
    // Use stored fees (already calculated as entry + exit commissions)
    const totalFees = t.fees || 0
    
    // Calculate PnL: priceDiff -> pips -> account for direction -> multiply by pip value and size -> subtract fees
    const priceDiff = exitPrice - t.entry
    const pnlPips = (priceDiff / pipSize) * (t.side === 'sell' ? -1 : 1)
    const pnl = (pnlPips * pipValue * t.size) - totalFees
    
    return pnl
  }, [currentBar, t.entry, t.size, t.side, t.fees, symbolConfig, accountConfig])

  const [editing, setEditing] = useState(false)
  const [sl, setSl] = useState(t.sl?.toString() || '')
  const [tp, setTp] = useState(t.tp?.toString() || '')

  const inp = mkInp(C)
  const lbl = mkLabel(C)

  const save = () => {
    modifyTrade(t.id, { sl: parseFloat(sl) || null, tp: parseFloat(tp) || null })
    setEditing(false)
  }

  const handleClose = () => {
    if (!currentBar || !symbolConfig || !accountConfig) return
    // Apply spread adjustment for exit: long receives bid (close - spread), short pays ask (close + spread)
    const spreadInPips = accountConfig.spread || 0
    const pipSize = symbolConfig.pip_size || 0.0001
    const exitPrice = getExitPrice(currentBar.close, t.side, spreadInPips, pipSize)
    closeTrade(t.id, exitPrice, currentBar.time, 'Manual', symbolConfig, accountConfig)
  }

  const accent = t.side === 'buy' ? C.green : C.red

  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}18` }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <span style={{ color: accent, fontWeight: 700, fontSize: 13 }}>
            {t.side === 'buy' ? '▲' : '▼'} #{t.id}
          </span>
          <span style={{ color: C.muted, fontSize: 11 }}>×{t.size}</span>
          {t.comment && (
            <span style={{ color: C.muted, fontSize: 9, fontStyle: 'italic', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.comment}
            </span>
          )}
        </div>
        <span style={{ color: fp >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 700 }}>
          {fmtPnl(fp)}
        </span>
      </div>

      {/* Entry / time */}
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
        Entry:&nbsp;<span style={{ color: C.text }}>{fmt(t.entry, dec)}</span>
        &nbsp;·&nbsp;{fmtDate(t.openTime)}
      </div>

      {/* SL / TP display or edit */}
      {!editing ? (
        <>
          <div style={{ display: 'flex', gap: 10, fontSize: 11, marginBottom: 8 }}>
            {t.sl
              ? <span style={{ color: C.red   }}>SL: {fmt(t.sl, dec)}</span>
              : <span style={{ color: C.dim   }}>No SL</span>
            }
            {t.tp
              ? <span style={{ color: C.green }}>TP: {fmt(t.tp, dec)}</span>
              : <span style={{ color: C.dim   }}>No TP</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setSl(t.sl?.toString() || ''); setTp(t.tp?.toString() || ''); setEditing(true) }}
              style={ghostBtn(C)}
            >
              Modify
            </button>
            <button onClick={handleClose} style={dangerBtn(C)}>Close</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            {[['SL', sl, setSl], ['TP', tp, setTp]].map(([l, v, set]) => (
              <div key={l}>
                <label style={lbl}>{l}</label>
                <input
                  type="number" step={symbolConfig.pip_size}
                  min={0.00}
                  value={v}
                  onChange={(e) => set(e.target.value)}
                  style={inp}
                  placeholder="optional"
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={save}               style={amberBtn(C)}>Save</button>
            <button onClick={() => setEditing(false)} style={ghostBtn(C)}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Button style helpers ───────────────────────────────────────
const base = (C) => ({
  flex: 1, padding: '4px 0', borderRadius: 3,
  cursor: 'pointer', fontSize: 10, fontFamily: FONT,
})
const ghostBtn  = (C) => ({ ...base(C), background: 'transparent',        border: `1px solid ${C.border2}`, color: C.muted  })
const dangerBtn = (C) => ({ ...base(C), background: C.red  + '15',        border: `1px solid ${C.red}44`,   color: C.red    })
const amberBtn  = (C) => ({ ...base(C), background: C.amber + '18',       border: `1px solid ${C.amber}44`, color: C.amber  })