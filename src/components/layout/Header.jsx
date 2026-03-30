import { useThemeStore } from "../../store/useThemeStore";
import { useSimStore }   from "../../store/useSimStore";
import { useTradeStore } from "../../store/useTradeStore";
import { getDecimalPlaces, getExitPrice } from "../../utils/tradingUtils";
import { FONT } from "../../constants/index";
import { pill } from "../ui/atoms";
import { fmt, fmtPnl, fmtDate } from "../../utils/format";

export function Header({ onReset, hoverBar }) {
  const C             = useThemeStore((s) => s.C);
  const { theme, toggleTheme } = useThemeStore();
  const { bars, cursor, fileName, symbolConfig, accountConfig } = useSimStore();
  const { trades }    = useTradeStore();

  const currentBar  = bars[cursor - 1];
  const prevBar     = bars[cursor - 2];
  const dispBar     = hoverBar || currentBar;
  
  // Use symbolConfig precision if available, otherwise calculate from tick_size
  const dec = symbolConfig 
    ? getDecimalPlaces(symbolConfig.tick_size || symbolConfig.pip_size || 0.0001)
    : 4;

  const pctChange   = currentBar && prevBar
    ? (currentBar.close - prevBar.close) / prevBar.close * 100
    : 0;

  const openTrades   = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status === "closed");
  const totalPnl     = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const floatingPnl  = openTrades.reduce((s, t) => {
    if (!currentBar || !symbolConfig || !accountConfig) return s;
    
    const pipSize = symbolConfig.pip_size || 0.0001;
    const pipValue = symbolConfig.pip_value || 10;
    
    // Calculate exit price with spread adjustment (what they'd get if closing at market now)
    const spreadInPips = accountConfig.spread || 0;
    const exitPrice = getExitPrice(currentBar.close, t.side, spreadInPips, pipSize);
    
    // Use stored fees (already calculated as entry + exit commissions)
    const totalFees = t.fees || 0;
    
    // Calculate PnL: priceDiff -> pips -> account for direction -> multiply by pip value and size -> subtract fees
    const priceDiff = exitPrice - t.entry;
    const pnlPips = (priceDiff / pipSize) * (t.side === 'sell' ? -1 : 1);
    const pnl = (pnlPips * pipValue * t.size) - totalFees;
    
    return s + pnl;
  }, 0);

  const V = { height: 18, width: 1, background: C.border, margin: "0px 4px" };

  return (
    <div style={{ height: 46, background: C.surf, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, fontFamily: FONT, userSelect: "none" }}>

      {/* Brand */}
      <button onClick={onReset} style={{ color: C.amber, fontWeight: 700, letterSpacing: 3, fontSize: 15, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, padding: 0, flexShrink: 0 }}>
        BACKTEST<span style={{ color: C.muted }}>.</span>OS
      </button>
      <div style={V} />
      <span style={pill(C.amber)}>{fileName}</span>
      <div style={V} />

      {/* OHLCV ticker */}
      {dispBar && (
        <div style={{ display: "flex", gap: 14, fontSize: 13, overflow: "hidden" }}>
          <span style={{ color: C.muted }}>{fmtDate(dispBar.time)}</span>
          <span>O&nbsp;<span style={{ color: C.text }}>{fmt(dispBar.open, dec)}</span></span>
          <span>H&nbsp;<span style={{ color: C.green }}>{fmt(dispBar.high, dec)}</span></span>
          <span>L&nbsp;<span style={{ color: C.red }}>{fmt(dispBar.low, dec)}</span></span>
          <span>C&nbsp;<span style={{ color: dispBar.close >= dispBar.open ? C.green : C.red }}>{fmt(dispBar.close, dec)}</span></span>
          <span>V&nbsp;<span style={{ color: C.muted }}>{dispBar.volume?.toLocaleString()}</span></span>
          <span style={{ color: pctChange >= 0 ? C.green : C.red }}>
            {pctChange >= 0 ? "▲" : "▼"}&nbsp;{Math.abs(pctChange).toFixed(3)}%
          </span>
        </div>
      )}

      {/* Right side — P&L + controls */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", fontSize: 12, flexShrink: 0 }}>
        <span style={{ color: C.muted }}>REALIZED</span>
        <span style={{ color: totalPnl >= 0 ? C.green : C.red, fontSize: 14, fontWeight: 700 }}>{fmtPnl(totalPnl)}</span>
        <div style={V} />
        <span style={{ color: C.muted }}>FLOATING</span>
        <span style={{ color: floatingPnl >= 0 ? C.green : C.red, fontSize: 14 }}>{fmtPnl(floatingPnl)}</span>
        {openTrades.length > 0 && <span style={pill(C.amber)}>{openTrades.length} open</span>}
        <div style={V} />
        <span style={{ color: C.muted, fontSize: 11 }}>Space=Play · →/← Step</span>
        <div style={V} />
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{ background: C.surf2, border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontFamily: FONT }}
        >
          {theme === "dark" ? "☀" : "◑"}
        </button>
      </div>
    </div>
  );
}