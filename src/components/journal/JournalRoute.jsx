import { useRef, useState } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useJournalStore } from '../../store/useJournalStore'
import { parseDelimitedAsync } from '../../utils/parser'
import { parseJournalRows, validateJournalHeaders } from '../../utils/journalImport'
import { JournalTab } from '../trading/JournalTab'
import { MetricsTab } from '../metrics/MetricsTab'
import { FONT } from '../../constants'

export function JournalRoute({ onBack }) {
  const C = useTheme()
  const fileRef = useRef(null)
  const importEntries = useJournalStore((s) => s.importEntries)
  const entries = useJournalStore((s) => s.entries)

  const [showMetrics, setShowMetrics] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleImport = async (file) => {
    if (!file) return
    setError('')
    setStatus('')
    setLoading(true)
    try {
      const text = await file.text()
      setStatus('Parsing file...')
      const parsed = await parseDelimitedAsync(text)
      if (!parsed?.headers?.length) throw new Error('Could not parse headers from file.')

      const check = validateJournalHeaders(parsed.headers)
      if (!check.valid) {
        throw new Error(`Missing required columns: ${check.missing.join(', ')}`)
      }

      setStatus('Validating rows...')
      const { entries: imported } = parseJournalRows(parsed.headers, parsed.rows || [])
      if (!imported.length) {
        throw new Error('No valid journal rows found after validation.')
      }

      importEntries(imported, { replace: true })
      setStatus(`Imported ${imported.length} journal rows.`)
    } catch (e) {
      setError(e.message || 'Failed to import journal file.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, fontFamily: FONT }}>
      <div
        style={{
          height: 50,
          borderBottom: `1px solid ${C.border}`,
          background: C.surf,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: C.muted,
            borderRadius: 4,
            padding: '4px 10px',
            cursor: 'pointer',
            fontFamily: FONT,
            fontSize: 11,
          }}
        >
          ← Back
        </button>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Journal</div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          style={{
            marginLeft: 12,
            background: loading ? C.muted : C.amber,
            border: 'none',
            color: '#000',
            borderRadius: 4,
            padding: '6px 12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {loading ? 'Importing...' : 'Upload CSV/TSV'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt"
          style={{ display: 'none' }}
          onChange={(e) => handleImport(e.target.files?.[0])}
        />
        <button
          onClick={() => setShowMetrics((v) => !v)}
          style={{
            background: showMetrics ? C.green : 'transparent',
            border: `1px solid ${showMetrics ? C.green : C.border}`,
            color: showMetrics ? C.bg : C.muted,
            borderRadius: 4,
            padding: '6px 12px',
            cursor: 'pointer',
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {showMetrics ? 'Metrics Enabled' : 'Enable Metrics'}
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: C.muted }}>
          Entries: {entries.length}
        </div>
      </div>

      {(status || error) && (
        <div
          style={{
            padding: '8px 14px',
            fontSize: 11,
            borderBottom: `1px solid ${C.border}`,
            background: error ? C.red + '15' : C.green + '12',
            color: error ? C.red : C.green,
            flexShrink: 0,
          }}
        >
          {error || status}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {showMetrics ? <MetricsTab /> : <JournalTab />}
      </div>
    </div>
  )
}

