import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useThemeStore } from '../../store/useThemeStore'
import { AnalysisSidebar } from './AnalysisSidebar'
import { MetricsTab } from '../metrics/MetricsTab'
import { fmt, fmtShortDate } from '../../utils/format'

export function AnalysisScreen({ onExit }) {
  const C = useThemeStore((s) => s.C)
  const exitAnalysisMode = useSimStore((s) => s.exitAnalysisMode)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const symbolConfig = useSimStore((s) => s.symbolConfig)
  const trades = useTradeStore((s) => s.trades)

  const closedTrades = trades.filter(t => t.status === 'closed')
  const openTrades = trades.filter(t => t.status === 'open')

  const handleExit = () => {
    exitAnalysisMode()
    if (onExit) onExit()
  }

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      background: C.bg,
      fontFamily: '"JetBrains Mono", "SF Mono", monospace',
    }}>
      {/* Left Sidebar */}
      {/* <AnalysisSidebar /> */}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: C.surf2,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              📈 Backtest Analysis
            </span>
            {accountConfig && (
              <span style={{ fontSize: 11, color: C.muted }}>
                {accountConfig.starting_balance ? `$${accountConfig.starting_balance.toLocaleString()}` : ''} 
                {symbolConfig?.symbol ? ` • ${symbolConfig.symbol}` : ''}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleExit}
              style={{
                padding: '8px 16px',
                fontSize: 11,
                fontWeight: 600,
                background: C.red + '20',
                color: C.red,
                border: `1px solid ${C.red}40`,
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: '"JetBrains Mono", "SF Mono", monospace',
              }}
            >
              ✕ Exit Analysis
            </button>
          </div>
        </div>

        {/* Analysis Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 24,
          }}>
            <SummaryCard 
              label="Total Trades" 
              value={closedTrades.length} 
              icon="📊"
              C={C}
            />
            <SummaryCard 
              label="Open Trades" 
              value={openTrades.length} 
              icon="🔄"
              C={C}
            />
            <SummaryCard 
              label="Win Rate" 
              value={closedTrades.length > 0 
                ? `${(closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100).toFixed(2)}%`
                : '0%'
              } 
              icon="🎯"
              C={C}
              color={closedTrades.length > 0 && 
                (closedTrades.filter(t => t.pnl > 0).length / closedTrades.length * 100) > 50 
                ? C.green : C.red}
            />
            <SummaryCard 
              label="Total P&L" 
              value={`$${closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon="💰"
              C={C}
              color={closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) >= 0 ? C.green : C.red}
            />
          </div>

          {/* Detailed Metrics */}
          <div style={{ 
            background: C.surf,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            overflow: 'hidden',
          }}>
            <div style={{ 
              padding: '12px 20px',
              borderBottom: `1px solid ${C.border}`,
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
            }}>
              📊 Detailed Metrics & Charts
            </div>
            <div style={{ padding: 20 }}>
              <MetricsTab />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, icon, C, color }) {
  return (
    <div style={{ 
      padding: 16,
      background: C.surf2,
      borderRadius: 8,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, textTransform: 'uppercase' }}>
        {icon} {label}
      </div>
      <div style={{ 
        fontSize: 18, 
        fontWeight: 700, 
        color: color || C.text,
        fontFamily: '"JetBrains Mono", "SF Mono", monospace',
      }}>
        {value}
      </div>
    </div>
  )
}
