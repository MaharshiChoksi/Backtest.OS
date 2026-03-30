import { FONT } from '../../constants'
import { useTheme } from '../../store/useThemeStore'

// ── Style factories (call with C from useTheme()) ──────────────
export const mkInp = (C) => ({
  background:  C.surf3,
  border:      `1px solid ${C.border2}`,
  color:       C.text,
  borderRadius: 4,
  padding:     '5px 9px',
  fontSize:    13,
  fontFamily:  FONT,
  outline:     'none',
  width:       '100%',
  boxSizing:   'border-box',
})

export const mkLabel = (C) => ({
  color:          C.muted,
  fontSize:       11,
  letterSpacing:  '1.2px',
  textTransform:  'uppercase',
  display:        'block',
  marginBottom:   3,
})

export const mkDivider = (C) => ({
  width:      '100%',
  height:     1,
  background: C.border,
  margin:     '12px 0',
})

export const mkSectionHead = (C) => ({
  color:          C.muted,
  fontSize:       11,
  letterSpacing:  '1.5px',
  textTransform:  'uppercase',
  marginBottom:   10,
  display:        'block',
})

/** Pill badge — color is a full hex string, e.g. C.amber */
export const pill = (color) => ({
  background:    color + '20',
  color,
  border:        `1px solid ${color}44`,
  borderRadius:  3,
  padding:       '1px 7px',
  fontSize:      11,
  letterSpacing: '0.5px',
})

// ── Reusable components ────────────────────────────────────────
export function TabBar({ tabs, active, onChange }) {
  const C = useTheme()
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            flex:          1,
            padding:       '10px 0',
            background:    'transparent',
            border:        'none',
            borderBottom:  `2px solid ${active === t ? C.amber : 'transparent'}`,
            color:         active === t ? C.amber : C.muted,
            cursor:        'pointer',
            fontSize:      12,
            fontFamily:    FONT,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            transition:    'all .15s',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

export function Kv({ label, value, color }) {
  const C = useTheme()
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
      <span style={{ color: color || C.text, fontSize: 12 }}>{value ?? '—'}</span>
    </div>
  )
}

export function SectionHeader({ children }) {
  const C = useTheme()
  return <span style={mkSectionHead(C)}>{children}</span>
}

export function Divider() {
  const C = useTheme()
  return <div style={mkDivider(C)} />
}