import { useState } from 'react'
import { useTheme }        from '../../store/useThemeStore'
import { useSimStore }     from '../../store/useSimStore'
import { useJournalStore } from '../../store/useJournalStore'
import { FONT }            from '../../constants'
import { fmtDate }         from '../../utils/format'
import { mkInp, SectionHeader, pill } from '../ui/atoms'

export function JournalTab() {
  const C          = useTheme()
  const bars       = useSimStore((s) => s.bars)
  const cursor     = useSimStore((s) => s.cursor)
  const { notes, addNote, removeNote, clearAll, exportCSV } = useJournalStore()

  const [text,        setText]        = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const currentBar = bars[cursor - 1]
  const inp        = mkInp(C)

  const handleAdd = () => {
    if (!text.trim() || !currentBar) return
    addNote({ barIdx: cursor, barTime: currentBar.time, text: text.trim() })
    setText('')
  }

  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); return }
    clearAll()
    setConfirmClear(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Entry area */}
      <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <SectionHeader>
          Note at Bar {cursor}
          {currentBar ? ` · ${fmtDate(currentBar.time)}` : ''}
        </SectionHeader>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd() }}
          placeholder="Confluences, emotion, market state, why you took or skipped this trade… (Ctrl+Enter to save)"
          style={{ ...inp, height: 90, resize: 'none', lineHeight: 1.5 }}
        />

        <button
          onClick={handleAdd}
          disabled={!text.trim() || !currentBar}
          style={{
            marginTop:    8,
            width:        '100%',
            padding:      '7px 0',
            background:   C.amber + '18',
            border:       `1px solid ${C.amber}44`,
            color:        C.amber,
            borderRadius: 4,
            cursor:       text.trim() && currentBar ? 'pointer' : 'not-allowed',
            fontSize:     11,
            fontFamily:   FONT,
            opacity:      text.trim() && currentBar ? 1 : 0.45,
          }}
        >
          + Save Note
        </button>
      </div>

      {/* Toolbar: count + export + clear */}
      {notes.length > 0 && (
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ color: C.muted, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', flex: 1 }}>
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </span>
          <button onClick={exportCSV} style={toolBtn(C)}>↓ Export CSV</button>
          <button
            onClick={handleClear}
            style={{
              ...toolBtn(C),
              background: confirmClear ? C.red + '20' : 'transparent',
              border:     `1px solid ${confirmClear ? C.red : C.border2}`,
              color:      confirmClear ? C.red : C.muted,
            }}
            onBlur={() => setConfirmClear(false)}
          >
            {confirmClear ? 'Confirm clear' : 'Clear all'}
          </button>
        </div>
      )}

      {/* Note list (reversed — newest first) */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {[...notes].reverse().map((n) => (
          <NoteCard key={n.id} note={n} onRemove={() => removeNote(n.id)} />
        ))}
        {notes.length === 0 && (
          <div style={{ textAlign: 'center', color: C.dim, fontSize: 11, marginTop: 32, lineHeight: 1.8 }}>
            No notes yet.<br />
            Add observations as you replay.<br />
            <span style={{ fontSize: 9, color: C.muted }}>Notes are saved locally and survive page refresh.</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Single note card ───────────────────────────────────────────
function NoteCard({ note: n, onRemove }) {
  const C = useTheme()
  return (
    <div style={{ background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ ...pill(C.amber) }}>
          Bar #{n.barIdx} · {fmtDate(n.barTime)}
        </span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 11, fontFamily: FONT, padding: 0, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={{ color: C.text, fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.text}</div>
    </div>
  )
}

// ── Toolbar button style ───────────────────────────────────────
const toolBtn = (C) => ({
  background:   'transparent',
  border:       `1px solid ${C.border2}`,
  color:        C.muted,
  borderRadius: 4,
  padding:      '3px 10px',
  cursor:       'pointer',
  fontSize:     9,
  fontFamily:   FONT,
  letterSpacing:'0.5px',
  textTransform:'uppercase',
})