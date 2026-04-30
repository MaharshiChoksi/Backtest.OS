import { useState, useMemo, useRef, useEffect } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { calculateMetrics, calculateWebSummary } from '../../utils/metrics'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { RadarChart } from './RadarChart'
import { FONT } from '../../constants'
import { fmt, fmtPnl, fmtShortDate } from '../../utils/format'

/**
 * Metrics Tab Component
 * Shows analysis and metrics at end of backtest
 */
export function MetricsTab() {
  const C = useTheme()
  const trades = useTradeStore((s) => s.trades)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const metricsFilters = useSimStore((s) => s.metricsFilters)
  const setMetricsFilters = useSimStore((s) => s.setMetricsFilters)
  const resetMetricsFilters = useSimStore((s) => s.resetMetricsFilters)
  const metricsLoading = useSimStore((s) => s.metricsLoading)
  const setMetricsLoading = useSimStore((s) => s.setMetricsLoading)

  const [activeSubTab, setActiveSubTab] = useState('summary') // summary, balance, strategy, pairs, radar
  const balanceChartRef = useRef(null)
  const pairsChartRef = useRef(null)

  // Get closed trades
  const closedTrades = useMemo(() => trades.filter(t => t.status === 'closed'), [trades])

  // Get unique pairs for filter
  const availablePairs = useMemo(() => {
    const pairs = new Set(closedTrades.map(t => t.pair).filter(Boolean))
    return ['All', ...Array.from(pairs)]
  }, [closedTrades])

  // Calculate metrics with filters
  const metrics = useMemo(() => {
    const sortedEntries = [...trades].sort((a, b) => new Date(a.entryDate + ' ' + a.entryTime) - new Date(b.entryDate + ' ' + b.entryTime))
    const startdate = sortedEntries[0] ? sortedEntries[0].entryDate : 'null'
    const enddate = sortedEntries[sortedEntries.length - 1] ? sortedEntries[sortedEntries.length - 1].entryDate : 'null'


    const startDate = metricsFilters.startDate ? new Date(metricsFilters.startDate) : new Date(startdate)
    const endDate = metricsFilters.endDate ? new Date(metricsFilters.endDate) : new Date(enddate)
    const pairFilter = metricsFilters.pair && metricsFilters.pair !== 'All' ? metricsFilters.pair : null
    
    return calculateMetrics(closedTrades, accountConfig, startDate, endDate, pairFilter)
  }, [closedTrades, accountConfig, metricsFilters])

  // Calculate web summary
  const webSummary = useMemo(() => {
    return calculateWebSummary(closedTrades)
  }, [closedTrades])

  // Initialize balance curve chart
  useEffect(() => {
    if (activeSubTab !== 'balance' || !balanceChartRef.current || metrics.balanceCurve.length === 0) return

    const chart = createChart(balanceChartRef.current, {
      layout: {
        background: { color: C.bg },
        textColor: C.muted,
        fontFamily: FONT,
        fontSize: 12,
      },
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        locale: 'en-US',
        dateFormat: 'yyyy-MM-dd',
        timeFormat: 'HH:mm',
      },
    })

    const lineSeries = chart.addLineSeries({
      color: C.green,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
    })

    const data = metrics.balanceCurve.map(point => ({
      time: typeof point.time === 'number' ? Math.floor(point.time / 1000) : point.time,
      value: point.balance,
    }))

    lineSeries.setData(data)
    chart.timeScale().fitContent()

    return () => {
      chart.remove()
    }
  }, [activeSubTab, metrics.balanceCurve, C])

  // Initialize pairs distribution chart
  useEffect(() => {
    if (activeSubTab !== 'pairs' || !pairsChartRef.current) return

    const pairs = Object.entries(metrics.pairsDistribution)
    if (pairs.length === 0) return

    const chart = createChart(pairsChartRef.current, {
      layout: {
        background: { color: C.bg },
        textColor: C.muted,
        fontFamily: FONT,
        fontSize: 12,
      },
      grid: {
        vertLines: { color: C.border },
        horzLines: { color: C.border },
      },
    })

    const histogramSeries = chart.addHistogramSeries({
      color: C.amber + '99',
      priceFormat: { type: 'volume' },
    })

    const data = pairs.map(([pair, data]) => ({
      time: pair,
      value: data.pnl,
      color: data.pnl >= 0 ? C.green + '99' : C.red + '99',
    }))

    histogramSeries.setData(data)

    return () => {
      chart.remove()
    }
  }, [activeSubTab, metrics.pairsDistribution, C])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 8px' }}>
        {['summary', 'balance', 'strategy', 'pairs', 'radar'].map(tab => (
          <div
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              borderBottom: activeSubTab === tab ? `2px solid ${C.amber}` : '2px solid transparent',
              color: activeSubTab === tab ? C.text : C.muted,
              fontSize: 12,
              fontWeight: activeSubTab === tab ? 600 : 400,
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
        {/* Filters Section */}
        <FilterSection
          metricsFilters={metricsFilters}
          setMetricsFilters={setMetricsFilters}
          resetMetricsFilters={resetMetricsFilters}
          availablePairs={availablePairs}
          metricsLoading={metricsLoading}
          setMetricsLoading={setMetricsLoading}
        />

        {/* Content based on active sub-tab */}
        {activeSubTab === 'summary' && (
          <SummaryView metrics={metrics} webSummary={webSummary} />
        )}
        {activeSubTab === 'balance' && (
          <BalanceCurveView chartRef={balanceChartRef} metrics={metrics} C={C} />
        )}
        {activeSubTab === 'strategy' && (
          <StrategyBreakdownView metrics={metrics} C={C} />
        )}
        {activeSubTab === 'pairs' && (
          <PairsDistributionView chartRef={pairsChartRef} metrics={metrics} C={C} />
        )}
        {activeSubTab === 'radar' && (
          <RadarChartView metrics={metrics} C={C} />
        )}
      </div>
    </div>
  )
}

/**
 * Filter Section Component
 */
function FilterSection({ metricsFilters, setMetricsFilters, resetMetricsFilters, availablePairs, metricsLoading, setMetricsLoading }) {
  const C = useTheme()

  const handleApply = async () => {
    setMetricsLoading(true)
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 300))
    setMetricsLoading(false)
  }

  return (
    <div style={{ marginBottom: 16, padding: '12px', background: C.surf2, borderRadius: 6, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8, textTransform: 'uppercase' }}>
        Filters
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {/* Start Date */}
        <div>
          <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Start Date</label>
          <input
            type="date"
            value={metricsFilters.startDate || ''}
            onChange={(e) => setMetricsFilters({ startDate: e.target.value || null })}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 11,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              background: C.surf,
              color: C.text,
              fontFamily: FONT,
            }}
          />
        </div>

        {/* End Date */}
        <div>
          <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>End Date</label>
          <input
            type="date"
            value={metricsFilters.endDate || ''}
            onChange={(e) => setMetricsFilters({ endDate: e.target.value || null })}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 11,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              background: C.surf,
              color: C.text,
              fontFamily: FONT,
            }}
          />
        </div>

        {/* Pair Filter */}
        <div>
          <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Pair</label>
          <select
            value={metricsFilters.pair || 'All'}
            onChange={(e) => setMetricsFilters({ pair: e.target.value === 'All' ? null : e.target.value })}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 11,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              background: C.surf,
              color: C.text,
              fontFamily: FONT,
            }}
          >
            {availablePairs.map(pair => (
              <option key={pair} value={pair}>{pair}</option>
            ))}
          </select>
        </div>

        {/* Account */}
        <div>
          <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 4 }}>Account</label>
          <div style={{ 
            padding: '6px 8px', 
            fontSize: 11, 
            color: C.text, 
            background: C.surf, 
            border: `1px solid ${C.border}`,
            borderRadius: 4,
          }}>
            {useSimStore.getState().accountConfig?.starting_balance 
              ? `$${useSimStore.getState().accountConfig.starting_balance.toLocaleString()}`
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleApply}
          disabled={metricsLoading}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: 11,
            background: metricsLoading ? C.muted : C.green,
            color: metricsLoading ? C.text : C.bg,
            border: 'none',
            borderRadius: 4,
            cursor: metricsLoading ? 'not-allowed' : 'pointer',
            fontFamily: FONT,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: metricsLoading ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
        >
          {metricsLoading ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
              Processing...
            </>
          ) : (
            <>
              Apply Filters
              <span>→</span>
            </>
          )}
        </button>

        <button
          onClick={resetMetricsFilters}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            background: C.red + '15',
            color: C.red,
            border: `1px solid ${C.red}50`,
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: FONT,
            fontWeight: 600,
            transition: 'all 0.2s',
          }}
          title="Clear all filters and show all entries"
        >
          ✕ Remove Filters
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

/**
 * Summary View - Main metrics display
 */
function SummaryView({ metrics, webSummary }) {
  const C = useTheme()

  return (
    <div>
      {/* Key Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <MetricCard label="Total Trades" value={metrics.totalTrades} C={C} />
        <MetricCard label="Win Rate" value={`${metrics.winRate}%`} C={C} color={parseFloat(metrics.winRate) > 50 ? C.green : C.red} />
        <MetricCard label="Total P&L" value={fmtPnl(metrics.totalPnl)} C={C} color={metrics.totalPnl >= 0 ? C.green : C.red} />
        <MetricCard label="Avg RR" value={metrics.avgRR} C={C} />
        <MetricCard label="Sharpe Ratio" value={metrics.sharpeRatio} C={C} />
        <MetricCard label="Profit Factor" value={metrics.profitFactor} C={C} />
      </div>

      {/* Consecutive Stats */}
      <SectionHeader title="Consecutive Stats" C={C} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <MetricCard label="Max Consecutive Wins" value={metrics.maxConsecutiveWins} C={C} color={C.green} />
        <MetricCard label="Max Consecutive Losses" value={metrics.maxConsecutiveLosses} C={C} color={C.red} />
      </div>

      {/* Largest Trades */}
      <SectionHeader title="Largest Trades" C={C} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {metrics.largestWinnerLong && (
          <TradeCard title="Largest Winner (Long)" trade={metrics.largestWinnerLong} C={C} color={C.green} />
        )}
        {metrics.largestWinnerShort && (
          <TradeCard title="Largest Winner (Short)" trade={metrics.largestWinnerShort} C={C} color={C.green} />
        )}
        {metrics.largestLoserLong && (
          <TradeCard title="Largest Loser (Long)" trade={metrics.largestLoserLong} C={C} color={C.red} />
        )}
        {metrics.largestLoserShort && (
          <TradeCard title="Largest Loser (Short)" trade={metrics.largestLoserShort} C={C} color={C.red} />
        )}
      </div>

      {/* Day-based Metrics */}
      <SectionHeader title="Day-based Metrics" C={C} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <MetricCard 
          label="Largest Winning Day" 
          value={metrics.largestWinningDay.date ? `${fmtShortDate(new Date(metrics.largestWinningDay.date))}: ${fmtPnl(metrics.largestWinningDay.amount)}` : 'N/A'} 
          C={C} 
          color={C.green}
        />
        <MetricCard 
          label="Largest Losing Day" 
          value={metrics.largestLosingDay.date ? `${fmtShortDate(new Date(metrics.largestLosingDay.date))}: ${fmtPnl(metrics.largestLosingDay.amount)}` : 'N/A'} 
          C={C} 
          color={C.red}
        />
      </div>

      {/* Other Metrics */}
      <SectionHeader title="Other Metrics" C={C} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <MetricCard label="Total Fees" value={fmtPnl(-metrics.totalFees)} C={C} />
        <MetricCard label="Avg Risk %" value={`${metrics.avgRiskPercent}%`} C={C} />
        <MetricCard label="Avg Duration" value={metrics.avgTradeDuration} C={C} />
      </div>

      {/* Web Summary Table */}
      <SectionHeader title="Web Summary (Avg for All Trades)" C={C} />
      <WebSummaryTable webSummary={webSummary} C={C} />
    </div>
  )
}

/**
 * Balance Curve View
 */
function BalanceCurveView({ chartRef, metrics, C }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12, textTransform: 'uppercase' }}>
        Balance Curve
      </div>
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: 300, 
          background: C.surf,
          borderRadius: 6,
          border: `1px solid ${C.border}`,
        }} 
      />
      {metrics.balanceCurve.length === 0 && (
        <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 12 }}>
          No balance curve data available
        </div>
      )}
    </div>
  )
}

/**
 * Strategy Breakdown View
 */
function StrategyBreakdownView({ metrics, C }) {
  return (
    <div>
      <SectionHeader title="By Day of Week" C={C} />
      <div style={{ marginBottom: 16 }}>
        {Object.entries(metrics.strategyBreakdown.byDayOfWeek).map(([day, data]) => (
          <div key={day} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '6px 0',
            borderBottom: `1px solid ${C.border}22`,
            fontSize: 11,
          }}>
            <span style={{ color: C.text }}>{day}</span>
            <span style={{ color: data.pnl >= 0 ? C.green : C.red }}>{fmtPnl(data.pnl)}</span>
            <span style={{ color: C.muted }}>{data.count} trades ({data.wins}W)</span>
          </div>
        ))}
      </div>

      <SectionHeader title="By Hour" C={C} />
      <div style={{ marginBottom: 16 }}>
        {Object.entries(metrics.strategyBreakdown.byHour).map(([hour, data]) => (
          <div key={hour} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '6px 0',
            borderBottom: `1px solid ${C.border}22`,
            fontSize: 11,
          }}>
            <span style={{ color: C.text }}>{hour}:00 - {hour}:59</span>
            <span style={{ color: data.pnl >= 0 ? C.green : C.red }}>{fmtPnl(data.pnl)}</span>
            <span style={{ color: C.muted }}>{data.count} trades ({data.wins}W)</span>
          </div>
        ))}
      </div>

      <SectionHeader title="By Side" C={C} />
      <div>
        {Object.entries(metrics.strategyBreakdown.bySide).map(([side, data]) => (
          <div key={side} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '6px 0',
            borderBottom: `1px solid ${C.border}22`,
            fontSize: 11,
          }}>
            <span style={{ color: C.text, textTransform: 'capitalize' }}>{side}</span>
            <span style={{ color: C.muted }}>{data.total} trades ({data.wins}W / {data.total - data.wins}L)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Pairs Distribution View
 */
function PairsDistributionView({ chartRef, metrics, C }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12, textTransform: 'uppercase' }}>
        Pairs Distribution
      </div>
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: 300, 
          background: C.surf,
          borderRadius: 6,
          border: `1px solid ${C.border}`,
          marginBottom: 16,
        }} 
      />
      
      <div>
        {Object.entries(metrics.pairsDistribution).map(([pair, data]) => (
          <div key={pair} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '8px 0',
            borderBottom: `1px solid ${C.border}22`,
            fontSize: 11,
          }}>
            <span style={{ color: C.text, fontWeight: 600 }}>{pair}</span>
            <span style={{ color: data.pnl >= 0 ? C.green : C.red, fontWeight: 600 }}>{fmtPnl(data.pnl)}</span>
            <span style={{ color: C.muted }}>{data.count} trades ({data.wins}W)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Metric Card Component
 */
function MetricCard({ label, value, C, color }) {
  return (
    <div style={{ 
      padding: 10, 
      background: C.surf2, 
      borderRadius: 6,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: color || C.text, fontFamily: FONT }}>
        {value}
      </div>
    </div>
  )
}

/**
 * Trade Card Component
 */
function TradeCard({ title, trade, C, color }) {
  return (
    <div style={{ 
      padding: 10, 
      background: C.surf2, 
      borderRadius: 6,
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: color || C.text, marginBottom: 4 }}>
        {fmtPnl(trade.pnl)}
      </div>
      <div style={{ fontSize: 10, color: C.muted }}>
        {trade.pair} | {trade.side} | {fmtShortDate(trade.openTime)}
      </div>
    </div>
  )
}

/**
 * Web Summary Table Component
 */
function WebSummaryTable({ webSummary, C }) {
  const rows = [
    { label: 'Avg Win Rate', value: `${webSummary.avgWinRate}%`, color: parseFloat(webSummary.avgWinRate) > 50 ? C.green : C.red },
    { label: 'Avg RR Ratio', value: webSummary.avgRRRatio, color: parseFloat(webSummary.avgRRRatio) > 1 ? C.green : C.red },
    { label: 'Avg Risk %', value: `${webSummary.avgRiskPercent}%`, color: C.text },
    { label: 'Avg Profit Factor', value: webSummary.avgProfitFactor, color: parseFloat(webSummary.avgProfitFactor) > 1 ? C.green : C.red },
    { label: 'Sharpe Ratio', value: webSummary.sharpeRatio, color: parseFloat(webSummary.sharpeRatio) > 1 ? C.green : C.red },
    { label: 'Avg Duration', value: webSummary.avgTradeDuration, color: C.text },
  ]

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {rows.map((row, idx) => (
        <div 
          key={row.label}
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: idx % 2 === 0 ? C.surf2 : C.surf,
            borderBottom: idx < rows.length - 1 ? `1px solid ${C.border}22` : 'none',
            fontSize: 11,
          }}>
          <span style={{ color: C.muted }}>{row.label}</span>
          <span style={{ color: row.color, fontWeight: 600 }}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Section Header Component
 */
function SectionHeader({ title, C }) {
  return (
    <div style={{ 
      fontSize: 11, 
      fontWeight: 600, 
      color: C.muted, 
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>
      {title}
    </div>
  )
}

/**
 * Radar Chart View
 */
function RadarChartView({ metrics, C }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12, textTransform: 'uppercase' }}>
        Performance Metrics Overview
      </div>
      <RadarChart metrics={metrics} width={400} height={400} />
      <div style={{ marginTop: 16, padding: 12, background: C.surf2, borderRadius: 6, border: `1px solid ${C.border}`, maxWidth: 400, fontSize: 11, color: C.muted }}>
        <p style={{ margin: '0 0 8px 0' }}>The radar chart displays normalized values for key performance metrics:</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Win Rate: Win percentage (0-100%)</li>
          <li>RR Ratio: Risk-Reward ratio (normalized to 0-3)</li>
          <li>Risk %: Average risk per trade (0-5%)</li>
          <li>Profit Factor: Total wins / total losses (normalized to 0-2)</li>
          <li>Sharpe Ratio: Risk-adjusted returns (normalized to 0-2)</li>
          <li>Recovery Factor: Total P&L / Total Fees</li>
        </ul>
      </div>
    </div>
  )
}
