import { useState, useRef } from 'react'
import { useTheme }          from '../../store/useThemeStore'
import { useSimStore }       from '../../store/useSimStore'
import { FONT }              from '../../constants'
import { parseDelimited, detectMapping, rowToBar } from '../../utils/parser'
import { generateSampleBars }                      from '../../utils/format'
import { mkInp, mkLabel, mkSectionHead, pill }     from '../ui/atoms'

export function UploadScreen() {
  const C           = useTheme()
  const loadSession = useSimStore((s) => s.loadSession)

  const [drag,       setDrag]       = useState(false)
  const [parsed,     setParsed]     = useState(null)
  const [mapping,    setMapping]    = useState({})
  const [fileName,   setFileName]   = useState('')
  const [error,      setError]      = useState('')
  const [processing, setProcessing] = useState(false)
  const fileRef = useRef()

  const processFile = (file) => {
    if (!file) return
    setFileName(file.name); setError(''); setProcessing(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      setProcessing(false)
      const result = parseDelimited(e.target.result)
      if (!result) { setError('Could not parse file — please check the format.'); return }
      setParsed(result)
      setMapping(detectMapping(result.headers))
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files[0]) }

  const handleLoad = () => {
    const bars   = parsed.rows.map((r) => rowToBar(r, mapping)).filter(Boolean).sort((a, b) => a.time - b.time)
    const unique = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time)
    if (unique.length < 20) { setError('Too few valid bars — check column mapping.'); return }
    loadSession(unique, fileName)
  }

  const inp  = mkInp(C)
  const lbl  = mkLabel(C)
  const head = mkSectionHead(C)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: FONT }}>
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: '5px', textTransform: 'uppercase', marginBottom: 8 }}>MULTI-SYMBOL</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: C.text }}>
          BACKTEST<span style={{ color: C.amber }}>.</span>OS
        </div>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: '2px', marginTop: 6 }}>SIMULATION ENGINE · REALTIME REPLAY</div>
        <div style={{ width: 40, height: 1, background: C.amber + '50', margin: '18px auto 0' }} />
      </div>

      {!parsed ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            style={{
              width: "100%", height: "100%", border: `1.5px dashed ${drag ? C.amber : C.border2}`,
              borderRadius: 12, padding: "20px 20px", display: 'flex', flexDirection: 'column', 
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .2s',
              background: drag ? C.amber + '08' : C.surf,
            }}
          >
            {processing ? (
              <div style={{ color: C.muted, fontSize: 12 }}>Parsing file…</div>
            ) : (
              <>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>⬆</div>
                <div style={{ color: drag ? C.amber : C.text, fontSize: 14, marginBottom: 8 }}>
                  Drop your OHLCV data file here
                </div>
                <div style={{ color: C.muted, fontSize: 11 }}>CSV · TSV · TXT — delimiter auto-detected</div>
                <div style={{ marginTop: 18, padding: '5px 20px', border: `1px solid ${C.border2}`, borderRadius: 4, color: C.muted, fontSize: 11 }}>click to browse</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={(e) => processFile(e.target.files[0])} />

          <div style={{ color: C.muted, fontSize: 10 }}>— or —</div>

          <button
            onClick={() => loadSession(generateSampleBars(2000), 'EURUSD_H1_sample.csv')}
            style={{ padding: '9px 28px', background: C.surf, border: `1px solid ${C.border2}`, color: C.text, borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: FONT, transition: 'border-color .15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.amber)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border2)}
          >
            Load sample EURUSD H1 data (2 000 bars)
          </button>

          <div style={{ color: C.dim, fontSize: 10, textAlign: 'center' }}>
            MT5 history · TradingView export · Dukascopy · NinjaTrader · any OHLCV CSV
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 1000 }}>
          {/* File info bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={pill(C.amber)}>{fileName}</span>
            <span style={{ color: C.muted, fontSize: 11 }}>{parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} cols</span>
            <button
              onClick={() => { setParsed(null); setFileName(''); setError('') }}
              style={{ marginLeft: 'auto', background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: FONT }}
            >
              ← new file
            </button>
          </div>

          {/* Column mapping */}
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 14 }}>
            <span style={head}>Column Mapping</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
              {['time', 'open', 'high', 'low', 'close', 'volume'].map((col) => (
                <div key={col}>
                  <label style={lbl}>{col}</label>
                  <select
                    value={mapping[col] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                    style={{ ...inp, cursor: 'pointer' }}
                  >
                    <option value="">— none —</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          <div style={{ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
              <span style={head}>Data Preview — First 10 rows</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr style={{ background: C.surf2 }}>
                    {parsed.headers.map((h) => {
                      const as = Object.entries(mapping).find(([, v]) => v === h)?.[0]
                      return (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 400, whiteSpace: 'nowrap' }}>
                          {h}
                          {as && <span style={{ ...pill(C.amber), marginLeft: 6 }}>{as}</span>}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((row, i) => (
                    <tr key={i} style={{ background: i % 2 ? C.surf2 + '88' : 'transparent' }}>
                      {parsed.headers.map((h) => (
                        <td key={h} style={{ padding: '5px 14px', color: C.text, whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}22` }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={handleLoad}
              style={{ background: C.amber, border: 'none', color: '#000', padding: '11px 36px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: FONT, fontWeight: 700, letterSpacing: '1px' }}
            >
              LOAD DATA &amp; START SIMULATION →
            </button>
            <span style={{ color: C.muted, fontSize: 10 }}>stays in-browser · nothing uploaded</span>
          </div>
        </div>
      )}
    </div>
  )
}