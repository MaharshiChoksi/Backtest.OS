import React from "react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════
const C = {
  bg:      "#09090b",
  surf:    "#0f0f12",
  surf2:   "#161619",
  surf3:   "#1c1c21",
  border:  "#1f1f26",
  border2: "#2a2a34",
  text:    "#e2e0d8",
  muted:   "#5e5d5a",
  dim:     "#333235",
  amber:   "#f0a52a",
  amberD:  "#c47d0e",
  green:   "#36d47c",
  red:     "#f05050",
  blue:    "#5b9cf5",
  purple:  "#9b7cf4",
};

const FONT = '"JetBrains Mono","Fira Code","Cascadia Code","SF Mono",monospace';
const SPEEDS = [
  { label: "1×", v: 1 },
  { label: "2×", v: 2 },
  { label: "5×", v: 5 },
  { label: "10×", v: 10 },
  { label: "50×", v: 50 },
  { label: "MAX", v: 2000 },
];
const BASE_MS = 420;

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function parseDelimited(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n").filter(Boolean);
  if (lines.length < 2) return null;
  const first = lines[0];
  let delim = ",", best = 0;
  for (const d of [",", "\t", ";", "|"]) {
    const n = first.split(d).length - 1;
    if (n > best) { best = n; delim = d; }
  }
  const clean = s => s.trim().replace(/^["']|["']$/g, "");
  const headers = first.split(delim).map(clean);
  const rows = lines.slice(1)
    .map(l => { const o = {}; l.split(delim).map(clean).forEach((v, i) => { if (headers[i]) o[headers[i]] = v; }); return o; })
    .filter(r => headers.some(h => r[h]));
  return { headers, rows };
}

function detectMapping(headers) {
  const H = headers.map(h => h.toLowerCase().replace(/[<>]/g, "").trim());
  const m = (...keys) => {
    for (const k of keys) { const i = H.findIndex(h => h === k || h.startsWith(k)); if (i >= 0) return headers[i]; }
    return "";
  };
  return {
    time:   m("time", "date", "datetime", "timestamp", "dt", "period", "bar"),
    open:   m("open", "o"),
    high:   m("high", "h"),
    low:    m("low", "l"),
    close:  m("close", "last", "c", "price"),
    volume: m("volume", "vol", "tickvol", "tick_vol", "v"),
  };
}

function parseTS(str) {
  if (!str) return null;
  const n = Number(str);
  if (!isNaN(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const d = new Date(str.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

function rowToBar(row, mapping) {
  const time = parseTS(row[mapping.time]);
  if (!time) return null;
  const o = parseFloat(row[mapping.open]),
        h = parseFloat(row[mapping.high]),
        l = parseFloat(row[mapping.low]),
        c = parseFloat(row[mapping.close]);
  if ([o, h, l, c].some(isNaN)) return null;
  const vol = parseFloat(row[mapping.volume] || "0");
  return { time, open: o, high: h, low: l, close: c, volume: isNaN(vol) ? 0 : vol };
}

function calcEMA(vals, period) {
  const k = 2 / (period + 1), out = new Array(vals.length).fill(null);
  let ema = null;
  for (let i = 0; i < vals.length; i++) {
    if (i < period - 1) continue;
    ema = ema === null ? vals.slice(0, period).reduce((a, b) => a + b, 0) / period : vals[i] * k + ema * (1 - k);
    out[i] = +ema.toFixed(8);
  }
  return out;
}

function calcRSI(vals, period = 14) {
  const out = new Array(vals.length).fill(null);
  if (vals.length <= period) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) { const d = vals[i] - vals[i - 1]; ag += Math.max(d, 0); al += Math.max(-d, 0); }
  ag /= period; al /= period;
  for (let i = period; i < vals.length; i++) {
    if (i > period) { const d = vals[i] - vals[i - 1]; ag = (ag * (period - 1) + Math.max(d, 0)) / period; al = (al * (period - 1) + Math.max(-d, 0)) / period; }
    out[i] = al === 0 ? 100 : +(100 - 100 / (1 + ag / al)).toFixed(2);
  }
  return out;
}

function calcBB(vals, period = 20, stdDev = 2) {
  const mid = calcEMA(vals, period);
  const upper = new Array(vals.length).fill(null);
  const lower = new Array(vals.length).fill(null);
  for (let i = period - 1; i < vals.length; i++) {
    const slice = vals.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    upper[i] = +(mid[i] + stdDev * std).toFixed(8);
    lower[i] = +(mid[i] - stdDev * std).toFixed(8);
  }
  return { mid, upper, lower };
}

function guessDecimals(price) { return price < 5 ? 5 : price < 100 ? 4 : price < 1000 ? 2 : 1; }
function fmt(n, d) { return typeof n === "number" ? n.toFixed(d ?? guessDecimals(n)) : "—"; }
function fmtPnl(n) { return (n >= 0 ? "+" : "") + n.toFixed(2); }
function fmtDate(ts) { 
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16)
}

function fmtShortDate(ts) { 
  const ms = ts > 1e12 ? ts : ts * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

function generateSampleBars(n = 2000) {
  const bars = []; let price = 1.08500, time = 1704067200000;
  for (let i = 0; i < n; i++) {
    const trend = Math.sin(i / 200) * 0.0003;
    const change = trend + (Math.random() - 0.495) * 0.0018;
    const open = price, close = +(price + change).toFixed(5);
    const range = Math.random() * 0.0025 + 0.0005;
    const high = +(Math.max(open, close) + range * Math.random()).toFixed(5);
    const low = +(Math.min(open, close) - range * Math.random()).toFixed(5);
    bars.push({ time, open, high, low, close, volume: Math.floor(Math.random() * 8000 + 500) });
    price = close; time += 3600000;
  }
  return bars;
}

// ═══════════════════════════════════════════════════════════════
// SHARED STYLE HELPERS
// ═══════════════════════════════════════════════════════════════
const pill = (color) => ({
  background: color + "20", color, border: `1px solid ${color}44`,
  borderRadius: 3, padding: "1px 7px", fontSize: 9, letterSpacing: "0.5px",
});
const inpStyle = {
  background: C.surf3, border: `1px solid ${C.border2}`, color: C.text,
  borderRadius: 4, padding: "5px 9px", fontSize: 11, fontFamily: FONT,
  outline: "none", width: "100%", boxSizing: "border-box",
};
const labelStyle = {
  color: C.muted, fontSize: 9, letterSpacing: "1.2px", textTransform: "uppercase",
  display: "block", marginBottom: 3,
};
const divider = { width: "100%", height: 1, background: C.border, margin: "12px 0" };
const sectionHead = {
  color: C.muted, fontSize: 9, letterSpacing: "1.5px", textTransform: "uppercase",
  marginBottom: 10, display: "block",
};

// ═══════════════════════════════════════════════════════════════
// UPLOAD SCREEN
// ═══════════════════════════════════════════════════════════════
function UploadScreen({ onLoad }) {
  const [drag, setDrag] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef();

  const processFile = (file) => {
    if (!file) return;
    setFileName(file.name); setError(""); setProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setProcessing(false);
      const result = parseDelimited(e.target.result);
      if (!result) { setError("Could not parse file — please check the format."); return; }
      setParsed(result);
      setMapping(detectMapping(result.headers));
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files[0]); };

  const handleLoad = () => {
    const bars = parsed.rows.map(r => rowToBar(r, mapping)).filter(Boolean).sort((a, b) => a.time - b.time);
    const unique = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time);
    if (unique.length < 20) { setError("Too few valid bars found — check column mapping."); return; }
    onLoad({ bars: unique, fileName, rawHeaders: parsed.headers, previewRows: parsed.rows.slice(0, 10) });
  };

  const handleSample = () => {
    onLoad({ bars: generateSampleBars(2000), fileName: "EURUSD_H1_sample.csv", rawHeaders: [], previewRows: [] });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: FONT }}>
      {/* Brand */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 12, color: C.muted, letterSpacing: "5px", textTransform: "uppercase", marginBottom: 8 }}>MULTI-SYMBOL</div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: C.text }}>
          BACKTEST<span style={{ color: C.amber }}>.</span>OS
        </div>
        <div style={{ fontSize: 12, color: C.muted, letterSpacing: "2px", marginTop: 6 }}>SIMULATION ENGINE · REALTIME REPLAY</div>
        <div style={{ width: 40, height: 1, background: C.amber + "50", margin: "18px auto 0" }} />
      </div>

      {!parsed ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            style={{
              width: "100%", minHeight: "100%", border: `1.5px dashed ${drag ? C.amber : C.border2}`,
              borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center",
              padding: "20px 10px", 
              justifyContent: "center", cursor: "pointer", transition: "all .2s",
              background: drag ? C.amber + "08" : C.surf,
            }}
          >
            {processing ? (
              <div style={{ color: C.muted, fontSize: 12}}>Parsing file...</div>
            ) : (
              <>
                <div style={{ color: drag ? C.amber : C.text, fontSize: 14, marginBottom: 8, padding: "5px 10px"}}>
                  Drop your OHLCV data file here
                </div>
                <div style={{ color: C.muted, fontSize: 11, padding: "5px 10px"}}>CSV · TSV · TXT — delimiter auto-detected</div>
                <div style={{ marginTop: 18, padding: "5px 20px", border: `1px solid ${C.border2}`, borderRadius: 4, color: C.muted, fontSize: 11 }}>click to browse</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none"}} onChange={e => processFile(e.target.files[0])} />

          <div style={{ color: C.muted, fontSize: 10 }}>— or —</div>

          <button onClick={handleSample} style={{ padding: "9px 28px", background: C.surf, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: FONT, letterSpacing: "0.5px", transition: "border-color .15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.amber}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border2}
          >
            Load sample EURUSD H1 data (2 000 bars)
          </button>

          <div style={{ marginTop: 8, color: C.muted, fontSize: 11, letterSpacing: "0.3px", textAlign: "center" }}>
            MT5 history · TradingView export · Dukascopy · NinjaTrader · any OHLCV CSV
          </div>
        </div>
      ) : (
        /* Preview + Mapping */
        <div style={{ width: "100%", maxWidth: 1000 }}>
          {/* File info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={pill(C.amber)}>{fileName}</span>
            <span style={{ color: C.muted, fontSize: 11 }}>{parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} cols</span>
            <button onClick={() => { setParsed(null); setFileName(""); setError(""); }}
              style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border2}`, color: C.muted, padding: "4px 14px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: FONT }}>
              ← new file
            </button>
          </div>

          {/* Column mapping */}
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 14 }}>
            <span style={sectionHead}>Column Mapping</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
              {["time", "open", "high", "low", "close", "volume"].map(col => (
                <div key={col}>
                  <label style={labelStyle}>{col}</label>
                  <select value={mapping[col] || ""} onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                    style={{ ...inpStyle, cursor: "pointer" }}>
                    <option value="">— none —</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={sectionHead}>Data Preview — First 10 rows</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ background: C.surf2 }}>
                    {parsed.headers.map(h => {
                      const as = Object.entries(mapping).find(([, v]) => v === h)?.[0];
                      return (
                        <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 400, whiteSpace: "nowrap" }}>
                          {h}
                          {as && <span style={{ ...pill(C.amber), marginLeft: 6 }}>{as}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((row, i) => (
                    <tr key={i} style={{ background: i % 2 ? C.surf2 + "88" : "transparent" }}>
                      {parsed.headers.map(h => (
                        <td key={h} style={{ padding: "5px 14px", color: C.text, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}22` }}>
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <div style={{ color: C.red, fontSize: 11, marginBottom: 12 }}>⚠ {error}</div>}

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={handleLoad} style={{ background: C.amber, border: "none", color: "#000", padding: "11px 36px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: FONT, fontWeight: 700, letterSpacing: "1px" }}>
              LOAD DATA & START SIMULATION →
            </button>
            <span style={{ color: C.muted, fontSize: 10 }}>stays in-browser · nothing uploaded</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SMALL UI ATOMS
// ═══════════════════════════════════════════════════════════════
function Kv({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
      <span style={{ color: C.muted, fontSize: 10 }}>{label}</span>
      <span style={{ color: color || C.text, fontSize: 10 }}>{value ?? "—"}</span>
    </div>
  );
}

function SectionHeader({ children }) {
  return <span style={sectionHead}>{children}</span>;
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          flex: 1, padding: "10px 0", background: "transparent", border: "none",
          borderBottom: `2px solid ${active === t ? C.amber : "transparent"}`,
          color: active === t ? C.amber : C.muted, cursor: "pointer", fontSize: 10,
          fontFamily: FONT, textTransform: "uppercase", letterSpacing: "1px", transition: "all .15s",
        }}>
          {t}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WORKSPACE
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [sessionData, setSessionData] = useState(null);
  if (!sessionData) return <UploadScreen onLoad={setSessionData} />;
  return <Workspace sd={sessionData} onReset={() => setSessionData(null)} />;
}

function Workspace({ sd, onReset }) {
  const { bars, fileName } = sd;

  // ── Refs (mutable, no re-render) ──────────────────────────
  const cursorRef    = useRef(30);
  const playingRef   = useRef(false);
  const speedRef     = useRef(1);
  const tradesRef    = useRef([]);
  const nextIdRef    = useRef(1);
  const chartRef     = useRef();
  const candleRef    = useRef();
  const volRef       = useRef();
  const ema20Ref     = useRef();
  const ema50Ref     = useRef();
  const bbMidRef     = useRef();
  const bbUpRef      = useRef();
  const bbLowRef     = useRef();
  const rsiChartRef  = useRef();
  const rsiRef       = useRef();
  const containerRef = useRef();
  const rsiContRef   = useRef();

  // ── Reactive state ─────────────────────────────────────────
  const [cursor,   setCursor]   = useState(30);
  const [playing,  setPlaying]  = useState(false);
  const [speed,    setSpeed]    = useState(1);
  const [trades,   setTrades]   = useState([]);
  const [rightTab, setRightTab] = useState("trades");
  const [leftTab,  setLeftTab]  = useState("info");
  const [notes,    setNotes]    = useState([]);
  const [noteText, setNoteText] = useState("");
  const [form, setForm] = useState({ side: "buy", size: "0.1", sl: "", tp: "", comment: "" });
  const [indic, setIndic] = useState({ ema20: true, ema50: false, bb: false, rsi: false });
  const [hoverBar, setHoverBar] = useState(null);
  const [showRsi, setShowRsi] = useState(false);

  // ── Derived / memoized ─────────────────────────────────────
  const closes   = useMemo(() => bars.map(b => b.close), [bars]);
  const ema20v   = useMemo(() => calcEMA(closes, 20), [closes]);
  const ema50v   = useMemo(() => calcEMA(closes, 50), [closes]);
  const bbData   = useMemo(() => calcBB(closes, 20, 2), [closes]);
  const rsiVals  = useMemo(() => calcRSI(closes, 14), [closes]);
  const dec      = useMemo(() => guessDecimals(bars[0]?.close || 1), [bars]);

  const currentBar = bars[cursor - 1];
  const prevBar    = bars[cursor - 2];
  const pctChange  = (currentBar && prevBar)
    ? ((currentBar.close - prevBar.close) / prevBar.close * 100)
    : 0;

  const openTrades   = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status === "closed");
  const totalPnl     = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const floatingPnl  = openTrades.reduce((s, t) => {
    if (!currentBar) return s;
    return s + (t.side === "buy"
      ? (currentBar.close - t.entry) * t.size
      : (t.entry - currentBar.close) * t.size);
  }, 0);
  const winRate = closedTrades.length
    ? Math.round(closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100) + "%"
    : "—";

  // ── Build EMA/BB/RSI series data up to index ───────────────
  const buildLine = (vals, idx) =>
    vals.slice(0, idx).map((v, i) => v !== null ? { time: bars[i].time, value: v } : null).filter(Boolean);

  // ── Initialize main chart ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.amber + "50", labelBackgroundColor: C.amberD },
        horzLine: { color: C.amber + "50", labelBackgroundColor: C.amberD },
      },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
    });

    const candle = chart.addCandlestickSeries({
      upColor: C.green, downColor: C.red,
      borderUpColor: C.green, borderDownColor: C.red,
      wickUpColor: C.green + "99", wickDownColor: C.red + "99",
    });
    const vol = chart.addHistogramSeries({
      priceFormat: { type: "volume" }, priceScaleId: "vol",
      lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

    const mkLine = (color, w = 1) => chart.addLineSeries({
      color, lineWidth: w, priceScaleId: "right",
      lastValueVisible: false, priceLineVisible: false,
    });

    const e20 = mkLine(C.amber);
    const e50 = mkLine(C.purple);
    const bMid = mkLine(C.blue + "aa");
    const bUp  = mkLine(C.blue + "55");
    const bLow = mkLine(C.blue + "55");

    const init = bars.slice(0, 30);
    candle.setData(init);
    vol.setData(init.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? C.green + "33" : C.red + "33" })));
    e20.setData(buildLine(ema20v, 30));
    e50.setData([]);
    bMid.setData([]); bUp.setData([]); bLow.setData([]);

    // Crosshair subscription for OHLCV tooltip
    chart.subscribeCrosshairMove(param => {
      if (!param.time) { setHoverBar(null); return; }
      const d = param.seriesData.get(candle);
      if (d) setHoverBar(d);
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;
    ema20Ref.current = e20;
    ema50Ref.current = e50;
    bbMidRef.current = bMid;
    bbUpRef.current  = bUp;
    bbLowRef.current = bLow;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, [bars]);

  // ── Initialize RSI chart ───────────────────────────────────
  useEffect(() => {
    if (!rsiContRef.current || !showRsi) return;
    const rc = createChart(rsiContRef.current, {
      layout: { background: { color: C.bg }, textColor: C.muted },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, visible: false },
      leftPriceScale: { visible: false },
    });
    const rsiS = rc.addLineSeries({ color: C.purple, lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    rsiS.setData(buildLine(rsiVals, cursorRef.current));

    // OB/OS bands
    const ob = rc.addLineSeries({ color: C.red + "60", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
    const os = rc.addLineSeries({ color: C.green + "60", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
    const bandData = bars.map(b => ({ time: b.time }));
    ob.setData(bandData.map(d => ({ ...d, value: 70 })));
    os.setData(bandData.map(d => ({ ...d, value: 30 })));

    rsiChartRef.current = rc;
    rsiRef.current = rsiS;
    const ro = new ResizeObserver(() => {
      if (rsiContRef.current) rc.resize(rsiContRef.current.clientWidth, rsiContRef.current.clientHeight);
    });
    ro.observe(rsiContRef.current);
    return () => { ro.disconnect(); rc.remove(); rsiChartRef.current = null; rsiRef.current = null; };
  }, [showRsi, bars]);

  // ── Keep refs in sync ──────────────────────────────────────
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // ── Indicator toggle effects ───────────────────────────────
  useEffect(() => {
    if (!ema20Ref.current) return;
    ema20Ref.current.setData(indic.ema20 ? buildLine(ema20v, cursorRef.current) : []);
  }, [indic.ema20]);

  useEffect(() => {
    if (!ema50Ref.current) return;
    ema50Ref.current.setData(indic.ema50 ? buildLine(ema50v, cursorRef.current) : []);
  }, [indic.ema50]);

  useEffect(() => {
    if (!bbMidRef.current) return;
    const cur = cursorRef.current;
    if (indic.bb) {
      bbMidRef.current.setData(buildLine(bbData.mid, cur));
      bbUpRef.current.setData(buildLine(bbData.upper, cur));
      bbLowRef.current.setData(buildLine(bbData.lower, cur));
    } else {
      bbMidRef.current.setData([]); bbUpRef.current.setData([]); bbLowRef.current.setData([]);
    }
  }, [indic.bb]);

  useEffect(() => {
    if (!indic.rsi) { setShowRsi(false); return; }
    setShowRsi(true);
  }, [indic.rsi]);

  // ── Process one bar ────────────────────────────────────────
  const processBar = useCallback((bar, idx) => {
    candleRef.current?.update(bar);
    volRef.current?.update({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? C.green + "33" : C.red + "33" });
    if (indic.ema20 && ema20v[idx] !== null) ema20Ref.current?.update({ time: bar.time, value: ema20v[idx] });
    if (indic.ema50 && ema50v[idx] !== null) ema50Ref.current?.update({ time: bar.time, value: ema50v[idx] });
    if (indic.bb && bbData.upper[idx] !== null) {
      bbMidRef.current?.update({ time: bar.time, value: bbData.mid[idx] });
      bbUpRef.current?.update({ time: bar.time, value: bbData.upper[idx] });
      bbLowRef.current?.update({ time: bar.time, value: bbData.lower[idx] });
    }
    if (rsiRef.current && rsiVals[idx] !== null) rsiRef.current.update({ time: bar.time, value: rsiVals[idx] });

    // Evaluate open trades
    const updated = tradesRef.current.map(t => {
      if (t.status !== "open") return t;
      if (t.side === "buy") {
        if (t.sl && bar.low <= t.sl)  return { ...t, status: "closed", closePrice: t.sl,  closeTime: bar.time, pnl: (t.sl  - t.entry) * t.size, closeReason: "SL" };
        if (t.tp && bar.high >= t.tp) return { ...t, status: "closed", closePrice: t.tp,  closeTime: bar.time, pnl: (t.tp  - t.entry) * t.size, closeReason: "TP" };
      } else {
        if (t.sl && bar.high >= t.sl) return { ...t, status: "closed", closePrice: t.sl,  closeTime: bar.time, pnl: (t.entry - t.sl)  * t.size, closeReason: "SL" };
        if (t.tp && bar.low <= t.tp)  return { ...t, status: "closed", closePrice: t.tp,  closeTime: bar.time, pnl: (t.entry - t.tp)  * t.size, closeReason: "TP" };
      }
      return t;
    });
    tradesRef.current = updated;
    setTrades([...updated]);
  }, [indic, ema20v, ema50v, bbData, rsiVals]);

  // ── Simulation tick loop ───────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      if (!playingRef.current) return;
      const cur = cursorRef.current;
      if (cur >= bars.length) { setPlaying(false); return; }
      processBar(bars[cur], cur);
      cursorRef.current = cur + 1;
      setCursor(cur + 1);
    }, Math.max(16, BASE_MS / speed));
    return () => clearInterval(interval);
  }, [playing, speed, bars, processBar]);

  // ── Seek to arbitrary bar index ────────────────────────────
  const seekTo = useCallback((idx) => {
    const target = Math.max(1, Math.min(bars.length, idx));
    cursorRef.current = target;
    setCursor(target);
    const slice = bars.slice(0, target);
    candleRef.current?.setData(slice);
    volRef.current?.setData(slice.map(b => ({ time: b.time, value: b.volume, color: b.close >= b.open ? C.green + "33" : C.red + "33" })));
    ema20Ref.current?.setData(indic.ema20 ? buildLine(ema20v, target) : []);
    ema50Ref.current?.setData(indic.ema50 ? buildLine(ema50v, target) : []);
    if (indic.bb) {
      bbMidRef.current?.setData(buildLine(bbData.mid, target));
      bbUpRef.current?.setData(buildLine(bbData.upper, target));
      bbLowRef.current?.setData(buildLine(bbData.lower, target));
    }
    rsiRef.current?.setData(buildLine(rsiVals, target));
  }, [bars, indic, ema20v, ema50v, bbData, rsiVals]);

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
      if (e.code === "ArrowRight") { setPlaying(false); const nx = cursorRef.current; if (nx < bars.length) { processBar(bars[nx], nx); cursorRef.current = nx + 1; setCursor(nx + 1); } }
      if (e.code === "ArrowLeft")  { setPlaying(false); seekTo(cursorRef.current - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bars, processBar, seekTo]);

  // ── Open a trade ───────────────────────────────────────────
  const openTrade = () => {
    if (!currentBar) return;
    const id = nextIdRef.current++;
    const t = {
      id, status: "open", side: form.side,
      size: parseFloat(form.size) || 0.1,
      entry: currentBar.close,
      sl: parseFloat(form.sl) || null,
      tp: parseFloat(form.tp) || null,
      openTime: currentBar.time,
      openBar: cursor,
      comment: form.comment,
    };
    const updated = [...tradesRef.current, t];
    tradesRef.current = updated;
    setTrades(updated);
    setForm(f => ({ ...f, sl: "", tp: "", comment: "" }));
  };

  // ── Close a trade ──────────────────────────────────────────
  const closeTrade = (id) => {
    if (!currentBar) return;
    const updated = tradesRef.current.map(t => {
      if (t.id !== id || t.status !== "open") return t;
      const pnl = t.side === "buy"
        ? (currentBar.close - t.entry) * t.size
        : (t.entry - currentBar.close) * t.size;
      return { ...t, status: "closed", closePrice: currentBar.close, closeTime: currentBar.time, pnl, closeReason: "Manual" };
    });
    tradesRef.current = updated;
    setTrades(updated);
  };

  // ── Modify SL/TP ──────────────────────────────────────────
  const modifyTrade = (id, field, value) => {
    const updated = tradesRef.current.map(t => {
      if (t.id !== id) return t;
      return { ...t, [field]: parseFloat(value) || null };
    });
    tradesRef.current = updated;
    setTrades(updated);
  };

  // ── Indicator toggle ───────────────────────────────────────
  const toggleIndic = (key) => setIndic(s => ({ ...s, [key]: !s[key] }));

  // ── Reset everything ───────────────────────────────────────
  const handleReset = () => {
    setPlaying(false); tradesRef.current = []; setTrades([]); nextIdRef.current = 1; setNotes([]);
    setTimeout(() => seekTo(30), 50);
  };

  // ── Tooltip bar (hover or current) ────────────────────────
  const dispBar = hoverBar || currentBar;

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.bg, fontFamily: FONT, color: C.text, overflow: "hidden" }}>

      {/* ══ HEADER ══════════════════════════════════════════ */}
      <div style={{ height: 46, background: C.surf, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0, userSelect: "none" }}>
        <button onClick={onReset} style={{ color: C.amber, fontWeight: 700, letterSpacing: 3, fontSize: 13, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, padding: 0 }}>
          BACKTEST<span style={{ color: C.muted }}>.</span>OS
        </button>
        <div style={{ width: 1, height: 18, background: C.border }} />
        <span style={{ ...pill(C.amber) }}>{fileName}</span>
        <div style={{ width: 1, height: 18, background: C.border }} />
        {/* OHLCV ticker */}
        {dispBar && (
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <span style={{ color: C.muted }}>{fmtDate(dispBar.time)}</span>
            <span>O <span style={{ color: C.text }}>{fmt(dispBar.open, dec)}</span></span>
            <span>H <span style={{ color: C.green }}>{fmt(dispBar.high, dec)}</span></span>
            <span>L <span style={{ color: C.red }}>{fmt(dispBar.low, dec)}</span></span>
            <span>C <span style={{ color: dispBar.close >= dispBar.open ? C.green : C.red }}>{fmt(dispBar.close, dec)}</span></span>
            <span>V <span style={{ color: C.muted }}>{dispBar.volume?.toLocaleString()}</span></span>
            <span style={{ color: pctChange >= 0 ? C.green : C.red }}>
              {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(3)}%
            </span>
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 18, alignItems: "center", fontSize: 10 }}>
          <span style={{ color: C.muted }}>REALIZED</span>
          <span style={{ color: totalPnl >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 700 }}>{fmtPnl(totalPnl)}</span>
          <span style={{ color: C.muted }}>FLOATING</span>
          <span style={{ color: floatingPnl >= 0 ? C.green : C.red, fontSize: 12 }}>{fmtPnl(floatingPnl)}</span>
          {openTrades.length > 0 && <span style={pill(C.amber)}>{openTrades.length} open</span>}
          <div style={{ width: 1, height: 18, background: C.border }} />
          <span style={{ color: C.muted, fontSize: 10 }}>
            Space=Play · → Step · ← Back
          </span>
        </div>
      </div>

      {/* ══ BODY ════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ width: 210, background: C.surf, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <TabBar tabs={["info", "indic"]} active={leftTab} onChange={setLeftTab} />
          <div style={{ flex: 1, overflow: "auto", padding: 14 }}>

            {leftTab === "info" && (
              <>
                <SectionHeader>Session</SectionHeader>
                <Kv label="File" value={<span style={{ color: C.muted, fontSize: 9, wordBreak: "break-all" }}>{fileName.replace(".csv","").replace(".txt","")}</span>} />
                <Kv label="Total bars"   value={bars.length.toLocaleString()} />
                <Kv label="Visible bars" value={cursor.toLocaleString()} />
                <Kv label="From"  value={bars[0] ? fmtShortDate(bars[0].time) : "—"} />
                <Kv label="To"    value={currentBar ? fmtShortDate(currentBar.time) : "—"} />
                <Kv label="Progress" value={`${(cursor / bars.length * 100).toFixed(1)}%`} />
                <div style={divider} />
                <SectionHeader>Performance</SectionHeader>
                <Kv label="Open trades"   value={openTrades.length} />
                <Kv label="Closed trades" value={closedTrades.length} />
                <Kv label="Win rate"      value={winRate} />
                <Kv label="Realized P&L"  value={fmtPnl(totalPnl)} color={totalPnl >= 0 ? C.green : C.red} />
                <Kv label="Floating P&L"  value={fmtPnl(floatingPnl)} color={floatingPnl >= 0 ? C.green : C.red} />
                {closedTrades.length > 0 && (
                  <>
                    <Kv label="Best trade"  value={"+" + Math.max(...closedTrades.map(t => t.pnl)).toFixed(2)} color={C.green} />
                    <Kv label="Worst trade" value={Math.min(...closedTrades.map(t => t.pnl)).toFixed(2)} color={C.red} />
                    <Kv label="Avg win"     value={"+" + (closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / Math.max(1, closedTrades.filter(t => t.pnl > 0).length)).toFixed(2)} color={C.green} />
                    <Kv label="Avg loss"    value={(closedTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0) / Math.max(1, closedTrades.filter(t => t.pnl <= 0).length)).toFixed(2)} color={C.red} />
                  </>
                )}
              </>
            )}

            {leftTab === "indic" && (
              <>
                <SectionHeader>Overlay Indicators</SectionHeader>
                {[
                  { key: "ema20", label: "EMA 20",       color: C.amber  },
                  { key: "ema50", label: "EMA 50",       color: C.purple },
                  { key: "bb",    label: "Bollinger (20,2)", color: C.blue   },
                ].map(({ key, label, color }) => (
                  <div key={key} onClick={() => toggleIndic(key)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", cursor: "pointer", borderBottom: `1px solid ${C.border}22` }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, background: indic[key] ? color : C.surf3, border: `1px solid ${indic[key] ? color : C.border2}`, flexShrink: 0, transition: "all .15s" }} />
                    <div style={{ width: 18, height: 2, background: color, opacity: indic[key] ? 1 : 0.15 }} />
                    <span style={{ fontSize: 10, color: indic[key] ? C.text : C.muted }}>{label}</span>
                  </div>
                ))}

                <div style={divider} />
                <SectionHeader>Sub-Pane Indicators</SectionHeader>
                <div onClick={() => toggleIndic("rsi")}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", cursor: "pointer" }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: indic.rsi ? C.purple : C.surf3, border: `1px solid ${indic.rsi ? C.purple : C.border2}`, flexShrink: 0, transition: "all .15s" }} />
                  <span style={{ fontSize: 10, color: indic.rsi ? C.text : C.muted }}>RSI (14)</span>
                  {indic.rsi && currentBar && rsiVals[cursor-1] !== null && (
                    <span style={{ ...pill(C.purple), marginLeft: "auto" }}>{rsiVals[cursor - 1]?.toFixed(1)}</span>
                  )}
                </div>

                {indic.ema20 && currentBar && ema20v[cursor-1] !== null && (
                  <>
                    <div style={divider} />
                    <SectionHeader>Live Values</SectionHeader>
                    <Kv label="EMA 20" value={fmt(ema20v[cursor-1], dec)} color={C.amber} />
                    {indic.ema50 && ema50v[cursor-1] !== null && <Kv label="EMA 50" value={fmt(ema50v[cursor-1], dec)} color={C.purple} />}
                    {indic.bb && bbData.upper[cursor-1] !== null && (
                      <>
                        <Kv label="BB Upper" value={fmt(bbData.upper[cursor-1], dec)} color={C.blue} />
                        <Kv label="BB Mid"   value={fmt(bbData.mid[cursor-1], dec)}   color={C.blue + "aa"} />
                        <Kv label="BB Lower" value={fmt(bbData.lower[cursor-1], dec)} color={C.blue} />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── CHART AREA ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          <div ref={containerRef} style={{ flex: 1, overflow: "hidden" }} />
          {showRsi && (
            <div ref={rsiContRef} style={{ height: 100, borderTop: `1px solid ${C.border}`, flexShrink: 0, position: "relative" }}>
              <span style={{ position: "absolute", top: 4, left: 8, fontSize: 9, color: C.purple, letterSpacing: "1px", zIndex: 10 }}>RSI 14</span>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ width: 310, background: C.surf, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <TabBar tabs={["trades", "journal", "history"]} active={rightTab} onChange={setRightTab} />

          {/* ── TRADES TAB ── */}
          {rightTab === "trades" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Order form */}
              <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <SectionHeader>New Position</SectionHeader>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {["buy", "sell"].map(side => (
                    <button key={side} onClick={() => setForm(f => ({ ...f, side }))} style={{
                      flex: 1, padding: "7px 0", borderRadius: 4, cursor: "pointer", fontSize: 11,
                      fontFamily: FONT, fontWeight: 700, letterSpacing: "0.5px", transition: "all .15s",
                      background: form.side === side ? (side === "buy" ? C.green + "25" : C.red + "25") : "transparent",
                      border: `1px solid ${form.side === side ? (side === "buy" ? C.green : C.red) : C.border2}`,
                      color: form.side === side ? (side === "buy" ? C.green : C.red) : C.muted,
                    }}>
                      {side === "buy" ? "▲ BUY" : "▼ SELL"}
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Lot Size</label>
                    <input type="number" step="0.01" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} style={inpStyle} placeholder="0.1" />
                  </div>
                  {[["sl","Stop Loss"],["tp","Take Profit"]].map(([k, l]) => (
                    <div key={k}>
                      <label style={labelStyle}>{l}</label>
                      <input type="number" step="any" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inpStyle} placeholder="optional" />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <input type="text" value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} style={inpStyle} placeholder="Comment (optional)" />
                </div>
                {currentBar && (
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "9px 0 8px", fontSize: 10, color: C.muted }}>
                    <span>At market:</span>
                    <span style={{ color: C.text }}>{fmt(currentBar.close, dec)}</span>
                  </div>
                )}
                <button onClick={openTrade} disabled={!currentBar} style={{
                  width: "100%", padding: "9px 0", borderRadius: 5, cursor: currentBar ? "pointer" : "not-allowed",
                  fontSize: 11, fontFamily: FONT, fontWeight: 700, letterSpacing: "0.5px", transition: "all .15s",
                  background: form.side === "buy" ? C.green + "22" : C.red + "22",
                  border: `1px solid ${form.side === "buy" ? C.green : C.red}`,
                  color: form.side === "buy" ? C.green : C.red,
                  opacity: currentBar ? 1 : 0.35,
                }}>
                  {form.side === "buy" ? "▲ OPEN LONG" : "▼ OPEN SHORT"}
                </button>
              </div>

              {/* Open positions */}
              <div style={{ flex: 1, overflow: "auto" }}>
                {openTrades.length > 0 && (
                  <div>
                    <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.muted, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase" }}>Open ({openTrades.length})</span>
                      <span style={{ color: floatingPnl >= 0 ? C.green : C.red, fontSize: 10 }}>{fmtPnl(floatingPnl)}</span>
                    </div>
                    {openTrades.map(t => {
                      const fp = currentBar ? (t.side === "buy" ? (currentBar.close - t.entry) * t.size : (t.entry - currentBar.close) * t.size) : 0;
                      return (
                        <OpenPosition key={t.id} trade={t} fp={fp} dec={dec} onClose={closeTrade} onModify={modifyTrade} />
                      );
                    })}
                  </div>
                )}
                {openTrades.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 11, lineHeight: 1.8 }}>
                    No open positions.<br />Press Play and open a trade.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── JOURNAL TAB ── */}
          {rightTab === "journal" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <SectionHeader>Note at Bar {cursor} {currentBar ? `· ${fmtDate(currentBar.time)}` : ""}</SectionHeader>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Confluences, emotion, market state, why you took or skipped this trade..."
                  style={{ ...inpStyle, height: 90, resize: "none", lineHeight: 1.5 }} />
                <button onClick={() => {
                  if (!noteText.trim() || !currentBar) return;
                  setNotes(n => [...n, { id: Date.now(), barTime: currentBar.time, barIdx: cursor, text: noteText.trim(), tags: [] }]);
                  setNoteText("");
                }} style={{ marginTop: 8, width: "100%", padding: "7px 0", background: C.amber + "18", border: `1px solid ${C.amber}44`, color: C.amber, borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: FONT }}>
                  + Save Note
                </button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
                {[...notes].reverse().map(n => (
                  <div key={n.id} style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: C.amber, fontSize: 9, letterSpacing: "0.5px" }}>Bar #{n.barIdx} · {fmtDate(n.barTime)}</span>
                      <button onClick={() => setNotes(ns => ns.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 10, fontFamily: FONT, padding: 0 }}>✕</button>
                    </div>
                    <div style={{ color: C.text, fontSize: 11, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.text}</div>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div style={{ textAlign: "center", color: C.dim, fontSize: 11, marginTop: 32, lineHeight: 1.8 }}>No notes yet.<br />Add observations as you replay.</div>
                )}
              </div>
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {rightTab === "history" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.muted, fontSize: 9, letterSpacing: "1px", textTransform: "uppercase" }}>Closed Trades ({closedTrades.length})</span>
                <span style={{ color: totalPnl >= 0 ? C.green : C.red, fontSize: 11, fontWeight: 700 }}>{fmtPnl(totalPnl)}</span>
              </div>
              {closedTrades.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: C.dim, fontSize: 11 }}>No closed trades yet.</div>
              )}
              {[...closedTrades].reverse().map(t => (
                <div key={t.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}18` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      <span style={{ color: t.side === "buy" ? C.green : C.red, fontSize: 10, fontWeight: 700 }}>{t.side === "buy" ? "▲" : "▼"} #{t.id}</span>
                      <span style={{ color: C.muted, fontSize: 9 }}>×{t.size}</span>
                    </div>
                    <span style={{ color: t.pnl >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 700 }}>{fmtPnl(t.pnl)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.muted, marginBottom: 3 }}>
                    <span>{fmt(t.entry, dec)} → {fmt(t.closePrice, dec)}</span>
                    <span style={{ ...pill(t.closeReason === "SL" ? C.red : t.closeReason === "TP" ? C.green : C.muted) }}>{t.closeReason}</span>
                  </div>
                  <div style={{ fontSize: 9, color: C.dim }}>{fmtDate(t.openTime)} → {fmtDate(t.closeTime)}</div>
                  {t.comment && <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: "italic" }}>{t.comment}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ SIM BAR ═════════════════════════════════════════ */}
      <SimBar
        cursor={cursor} total={bars.length} playing={playing} speed={speed}
        onPlay={() => setPlaying(p => !p)}
        onStepBack={() => { setPlaying(false); seekTo(cursorRef.current - 1); }}
        onStepFwd={() => {
          setPlaying(false);
          const nx = cursorRef.current;
          if (nx < bars.length) { processBar(bars[nx], nx); cursorRef.current = nx + 1; setCursor(nx + 1); }
        }}
        onSeek={(r) => { setPlaying(false); seekTo(Math.round(r * bars.length)); }}
        onSpeed={setSpeed}
        onReset={handleReset}
        currentBar={currentBar}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OPEN POSITION CARD (inline edit of SL/TP)
// ═══════════════════════════════════════════════════════════════
function OpenPosition({ trade: t, fp, dec, onClose, onModify }) {
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState(t.sl?.toString() || "");
  const [tp, setTp] = useState(t.tp?.toString() || "");

  const save = () => { onModify(t.id, "sl", sl); onModify(t.id, "tp", tp); setEditing(false); };

  return (
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}22` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <span style={{ color: t.side === "buy" ? C.green : C.red, fontWeight: 700, fontSize: 11 }}>
            {t.side === "buy" ? "▲" : "▼"} #{t.id}
          </span>
          <span style={{ color: C.muted, fontSize: 9 }}>×{t.size}</span>
          {t.comment && <span style={{ color: C.muted, fontSize: 9, fontStyle: "italic" }}>{t.comment}</span>}
        </div>
        <span style={{ color: fp >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 700 }}>{fmtPnl(fp)}</span>
      </div>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 6 }}>
        Entry: <span style={{ color: C.text }}>{fmt(t.entry, dec)}</span>
        &nbsp;·&nbsp; Opened: {fmtDate(t.openTime)}
      </div>
      {!editing ? (
        <>
          <div style={{ display: "flex", gap: 10, fontSize: 9, marginBottom: 8 }}>
            {t.sl ? <span style={{ color: C.red }}>SL: {fmt(t.sl, dec)}</span> : <span style={{ color: C.dim }}>No SL</span>}
            {t.tp ? <span style={{ color: C.green }}>TP: {fmt(t.tp, dec)}</span> : <span style={{ color: C.dim }}>No TP</span>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(true)} style={{ flex: 1, padding: "4px 0", background: "transparent", border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: FONT }}>Modify</button>
            <button onClick={() => onClose(t.id)} style={{ flex: 1, padding: "4px 0", background: C.red + "15", border: `1px solid ${C.red}44`, color: C.red, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: FONT }}>Close</button>
          </div>
        </>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            {[["SL", sl, setSl], ["TP", tp, setTp]].map(([l, v, set]) => (
              <div key={l}>
                <label style={labelStyle}>{l}</label>
                <input type="number" step="any" value={v} onChange={e => set(e.target.value)} style={inpStyle} placeholder="optional" />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={save} style={{ flex: 1, padding: "4px 0", background: C.amber + "18", border: `1px solid ${C.amber}44`, color: C.amber, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: FONT }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "4px 0", background: "transparent", border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 3, cursor: "pointer", fontSize: 10, fontFamily: FONT }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIM BAR
// ═══════════════════════════════════════════════════════════════
function SimBar({ cursor, total, playing, speed, onPlay, onStepBack, onStepFwd, onSeek, onSpeed, onReset, currentBar }) {
  const [hoverPct, setHoverPct] = useState(null);
  const barRef = useRef();

  const getPct = (e) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const ctrlBtn = (icon, handler, active = false, special = false) => (
    <button onClick={handler} style={{
      background: special ? (playing ? C.amber + "22" : C.amber) : (active ? C.amber + "18" : "transparent"),
      border: `1px solid ${special ? C.amber : C.border2}`,
      color: special ? (playing ? C.amber : "#000") : C.muted,
      borderRadius: 5, padding: special ? "7px 22px" : "7px 12px", cursor: "pointer",
      fontSize: special ? 14 : 12, fontFamily: FONT, fontWeight: special ? 700 : 400,
      transition: "all .15s", flexShrink: 0,
    }}>
      {icon}
    </button>
  );

  return (
    <div style={{ height: 60, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 18px", gap: 10, flexShrink: 0 }}>
      {ctrlBtn("⏮", () => onSeek(0))}
      {ctrlBtn("◀", onStepBack)}
      {ctrlBtn(playing ? "⏸" : "▶", onPlay, false, true)}
      {ctrlBtn("▶|", onStepFwd)}
      {ctrlBtn("⏭", () => onSeek(1))}

      <div style={{ width: 1, height: 24, background: C.border, margin: "0 2px" }} />

      {/* Speed select */}
      <div style={{ display: "flex", gap: 4 }}>
        {SPEEDS.map(({ label, v }) => (
          <button key={v} onClick={() => onSpeed(v)} style={{
            background: speed === v ? C.amber + "20" : "transparent",
            border: `1px solid ${speed === v ? C.amber : C.border2}`,
            color: speed === v ? C.amber : C.muted,
            borderRadius: 4, padding: "4px 8px", cursor: "pointer",
            fontSize: 10, fontFamily: FONT, transition: "all .15s",
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: C.border, margin: "0 2px" }} />

      {/* Progress track */}
      <span style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>{cursor.toLocaleString()}</span>
      <div style={{ flex: 1, position: "relative" }}
        onMouseMove={e => setHoverPct(getPct(e))}
        onMouseLeave={() => setHoverPct(null)}
        onClick={e => onSeek(getPct(e))}
      >
        {/* Hover tooltip */}
        {hoverPct !== null && (
          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: `${hoverPct * 100}%`, transform: "translateX(-50%)", background: C.surf2, border: `1px solid ${C.border2}`, borderRadius: 4, padding: "3px 8px", fontSize: 9, color: C.text, whiteSpace: "nowrap", pointerEvents: "none" }}>
            Bar {Math.round(hoverPct * total).toLocaleString()}
          </div>
        )}
        <div ref={barRef} style={{ height: 4, background: C.surf3, borderRadius: 2, cursor: "pointer", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(cursor / total) * 100}%`, background: C.amber, borderRadius: 2, transition: playing ? "none" : "width .1s" }} />
        </div>
      </div>
      <span style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>{total.toLocaleString()}</span>

      <div style={{ width: 1, height: 24, background: C.border, margin: "0 2px" }} />

      {currentBar && (
        <span style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>{fmtDate(currentBar.time)}</span>
      )}

      <button onClick={onReset} style={{ background: "transparent", border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontSize: 10, fontFamily: FONT, flexShrink: 0 }}>
        ↺ Reset
      </button>
    </div>
  );
}