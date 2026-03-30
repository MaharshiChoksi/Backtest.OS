import { useState } from 'react'
import { useTheme }      from '../../store/useThemeStore'
import { useSimStore }   from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { getDecimalPlaces } from '../../utils/tradingUtils'
import { FONT }          from '../../constants'
import { fmt } from '../../utils/format'
import { mkInp, mkLabel, SectionHeader } from '../ui/atoms'

export function TradeForm() {
  const C          = useTheme()
  const bars       = useSimStore((s) => s.bars)
  const cursor     = useSimStore((s) => s.cursor)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const openTrade  = useTradeStore((s) => s.openTrade)

  const currentBar = bars[cursor - 1]
  
  // Use symbolConfig precision for consistent decimal places
  const dec = symbolConfig
    ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001)
    : 4;

  const [side,    setSide]    = useState('buy')
  const [size,    setSize]    = useState('0.1')
  const [sl,      setSl]      = useState('')
  const [tp,      setTp]      = useState('')
  const [comment, setComment] = useState('')

  const isBuy  = side === 'buy'
  const accent = isBuy ? C.green : C.red

  const inp = mkInp(C)
  const lbl = mkLabel(C)

  // Calculate entry price with spread adjustment
  // BUY: pay ask (close + spread), SELL: receive bid (close - spread)
  const spreadInPips = accountConfig ? (accountConfig.spread || 0) : 0
  const pipSize = symbolConfig ? (symbolConfig.pip_size || 0.0001) : 0.0001
  const spreadInPrice = spreadInPips * pipSize
  const entryPrice = currentBar ? (
    isBuy
      ? currentBar.close + spreadInPrice
      : currentBar.close - spreadInPrice
  ) : null

  const handleOpen = () => {
    if (!currentBar || !entryPrice) return
    openTrade({
      side,
      size:     parseFloat(size) || 0.1,
      entry:    entryPrice,
      sl:       parseFloat(sl) || null,
      tp:       parseFloat(tp) || null,
      openTime: currentBar.time,
      openBar:  cursor,
      comment:  comment.trim(),
    })
    setSl(''); setTp(''); setComment('')
  }

  return (
    <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <SectionHeader>New Position</SectionHeader>

      {/* Side toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['buy', 'sell'].map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex:       1,
              padding:    '7px 0',
              borderRadius: 4,
              cursor:     'pointer',
              fontSize:   13,
              fontFamily: FONT,
              fontWeight: 700,
              letterSpacing: '0.5px',
              transition: 'all .15s',
              background: side === s ? (s === 'buy' ? C.green + '22' : C.red + '22') : 'transparent',
              border:     `1px solid ${side === s ? (s === 'buy' ? C.green : C.red) : C.border2}`,
              color:      side === s ? (s === 'buy' ? C.green : C.red) : C.muted,
            }}
          >
            {s === 'buy' ? '▲ BUY' : '▼ SELL'}
          </button>
        ))}
      </div>

      {/* Size */}
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Lot Size</label>
        <input
          type="number" step="0.01" min="0.01"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          style={inp}
          placeholder="0.10"
        />
      </div>

      {/* SL / TP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Stop Loss</label>
          <input type="number" step="0.001" min="0.001" value={sl} onChange={(e) => setSl(e.target.value)} style={inp} placeholder="optional" />
        </div>
        <div>
          <label style={lbl}>Take Profit</label>
          <input type="number" step="0.001" min="0.001" value={tp} onChange={(e) => setTp(e.target.value)} style={inp} placeholder="optional" />
        </div>
      </div>

      {/* Comment */}
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Comment</label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          style={inp}
          placeholder="Setup tag, note…"
        />
      </div>

      {/* At market (with spread adjustment) */}
      {currentBar && entryPrice !== null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: C.muted }}>
          <span>{isBuy ? 'Ask (buy)' : 'Bid (sell)'}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: C.muted, fontSize: 10 }}>{fmt(currentBar.close, dec)}</span>
            <span style={{ color: accent, fontWeight: 600 }}>{fmt(entryPrice, dec)}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleOpen}
        disabled={!currentBar}
        style={{
          width:        '100%',
          padding:      '9px 0',
          borderRadius: 5,
          cursor:       currentBar ? 'pointer' : 'not-allowed',
          fontSize:     13,
          fontFamily:   FONT,
          fontWeight:   700,
          letterSpacing:'0.5px',
          transition:   'all .15s',
          background:   accent + '22',
          border:       `1px solid ${accent}`,
          color:        accent,
          opacity:      currentBar ? 1 : 0.35,
        }}
      >
        {isBuy ? '▲ OPEN LONG' : '▼ OPEN SHORT'}
      </button>
    </div>
  )
}