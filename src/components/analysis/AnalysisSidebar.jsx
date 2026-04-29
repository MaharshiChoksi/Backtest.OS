import { useState } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { MetricsTab } from '../metrics/MetricsTab'
import { FONT } from '../../constants'

/**
 * Analysis Sidebar - Simplified sidebar for analysis mode
 * Only shows Metrics tab (no chart indicators)
 */
export function AnalysisSidebar() {
  const C = useTheme()
  const [tab, setTab] = useState('metrics')
  const exitAnalysisMode = useSimStore((s) => s.exitAnalysisMode)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const symbolConfig = useSimStore((s) => s.symbolConfig)

  return (
    <div style={{ 
      width: 210, 
      background: C.surf, 
      borderRight: `1px solid ${C.border}`, 
      display: 'flex', 
      flexDirection: 'column', 
      flexShrink: 0, 
      overflow: 'hidden' 
    }}>
      {/* Header */}
      <div style={{ 
        padding: '12px 14px', 
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
          📈 Analysis
        </span>
        <button
          onClick={exitAnalysisMode}
          style={{
            padding: '4px 8px',
            fontSize: 10,
            background: C.red + '20',
            color: C.red,
            border: `1px solid ${C.red}40`,
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          ✕ Exit
        </button>
      </div>

      {/* Account Info */}
      {(accountConfig || symbolConfig) && (
        <div style={{ 
          padding: '8px 14px', 
          borderBottom: `1px solid ${C.border}`,
          fontSize: 10,
          color: C.muted,
        }}>
          {accountConfig?.starting_balance && (
            <div>Account: ${accountConfig.starting_balance.toLocaleString()}</div>
          )}
          {symbolConfig?.symbol && (
            <div>Pair: {symbolConfig.symbol}</div>
          )}
        </div>
      )}

      {/* Metrics Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        <MetricsTab />
      </div>
    </div>
  )
}
