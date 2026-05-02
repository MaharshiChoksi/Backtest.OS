import { useState, useMemo, useRef, useEffect } from 'react'
import { useTheme } from '../../store/useThemeStore'
import { useSimStore } from '../../store/useSimStore'
import { useTradeStore } from '../../store/useTradeStore'
import { useIndicatorStore } from '../../store/useIndicatorStore'
import { useJournalStore } from '../../store/useJournalStore'
import { calculateMetrics, calculateWebSummary } from '../../utils/metrics'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { RadarChart } from './RadarChart'
import { FONT } from '../../constants'
import { fmt, fmtPnl, fmtShortDate } from '../../utils/format'

const ACCOUNTS = ['All', '5%ers - 2.5K', 'ICMkt Real', 'ICMkt Demo', 'BackTest', 'ForwardTest', 'StressTest']
const SYMBOLS = ["EURUSD", "USDJPY", "GBPUSD", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "EURGBP", "EURJPY", "AUDCHF", "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD", "XTIUSD", "SP500 / US500 / SPX500", "USTECH / US100 / NASDAQ", "US30 / DJI30 / DOW"]


/**
 * Metrics Tab Component
 * Shows analysis and metrics at end of backtest
 */
export function MetricsTab() {
  const C = useTheme()
  const trades = useTradeStore((s) => s.trades)
  const journalEntries = useJournalStore((s) => s.entries)
  const accountConfig = useSimStore((s) => s.accountConfig)
  const bars = useSimStore((s) => s.bars)
  const metricsFilters = useSimStore((s) => s.metricsFilters)
  const setMetricsFilters = useSimStore((s) => s.setMetricsFilters)
  const resetMetricsFilters = useSimStore((s) => s.resetMetricsFilters)
  const metricsLoading = useSimStore((s) => s.metricsLoading)
  const setMetricsLoading = useSimStore((s) => s.setMetricsLoading)

  const [activeSubTab, setActiveSubTab] = useState('summary') // summary, balance, strategy, pairs, radar
  const balanceChartRef = useRef(null)
  const pairsChartRef = useRef(null)

  // Get unique pairs for filter - derived from journal entries (authoritative source)
  const availablePairs = useMemo(() => {
    const pairs = new Set(journalEntries.map(entry => entry.pair).filter(Boolean))
    return ['All', ...Array.from(pairs).sort()]
  }, [journalEntries])

  const normalizeTimestamp = (value) => {
    if (typeof value === 'number') {
      return value > 1e12 ? value : value * 1000
    }
    if (typeof value === 'string') {
      const parsed = new Date(value).getTime()
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const normalizeEntryTimestamp = (entry) => {
    const fromTimestamp = normalizeTimestamp(entry.timestamp)
    if (fromTimestamp) return fromTimestamp

    if (entry.entryDate && entry.entryTime) {
      const parsed = new Date(`${entry.entryDate} ${entry.entryTime}`).getTime()
      if (Number.isFinite(parsed)) return parsed
    }

    return null
  }

  const normalizeSide = (value) => {
    if (!value) return null
    const normalized = String(value).trim().toLowerCase()
    if (['buy', 'long', 'b', 'l'].includes(normalized)) return 'long'
    if (['sell', 'short', 's', 'sh'].includes(normalized)) return 'short'
    return normalized
  }

  // Apply all filters to journal entries
  const filteredJournalEntries = useMemo(() => {
    if (!journalEntries || journalEntries.length === 0) return []

    const defaultStartDate = bars && bars.length > 0 ? new Date(normalizeTimestamp(bars[0].time)) : null
    const defaultEndDate = bars && bars.length > 0 ? new Date(normalizeTimestamp(bars[bars.length - 1].time)) : null

    const parseDate = (dateStr) => {
      if (!dateStr) return null
      if (dateStr.includes('-')) {
        const d = new Date(dateStr)
        return isNaN(d.getTime()) ? null : d
      }
      return null
    }

    const startDate = metricsFilters.startDate ? parseDate(metricsFilters.startDate) : defaultStartDate
    const endDate = metricsFilters.endDate ? parseDate(metricsFilters.endDate) : defaultEndDate
    const pairFilter = metricsFilters.pair && metricsFilters.pair !== 'All' ? metricsFilters.pair : null
    const accountFilter = metricsFilters.account && metricsFilters.account !== 'All' ? metricsFilters.account : null

    return journalEntries.filter(entry => {
      const entryDateMs = normalizeEntryTimestamp(entry)
      const entryDate = entryDateMs ? new Date(entryDateMs) : null
      if (startDate && (!entryDate || entryDate < startDate)) return false
      if (endDate && (!entryDate || entryDate > endDate)) return false
      if (pairFilter && entry.pair !== pairFilter) return false
      if (accountFilter && entry.account !== accountFilter) return false
      return true
    })
  }, [journalEntries, metricsFilters, bars])

  // Convert filtered journal entries to trades format for metrics calculation
  const filteredTrades = useMemo(() => {
    return filteredJournalEntries.map(entry => {
      const parsedOpenTime = normalizeEntryTimestamp(entry)
      const parsedCloseTime = normalizeTimestamp(entry.exitTimestamp || entry.exitDate) || parsedOpenTime
      const normalizedSide = normalizeSide(entry.side || entry.direction || entry.type)

      return {
        id: entry.tradeId,
        pair: entry.pair,
        side: normalizedSide,
        direction: normalizedSide,
        openTime: parsedOpenTime,
        closeTime: parsedCloseTime,
        entryPrice: entry.entryPrice,
        exitPrice: entry.exitPrice,
        lotSize: entry.lotSize,
        pnl: entry.pnlUsd || 0,
        pnlPips: entry.pnlPips || 0,
        fees: entry.fees || 0,
        status: entry.exitPrice ? 'closed' : 'open',
      }
    })
  }, [filteredJournalEntries])

  // Get closed trades from filtered set
  const closedTrades = useMemo(() => filteredTrades.filter(t => t.status === 'closed'), [filteredTrades])

  // Calculate metrics with filters
  const metrics = useMemo(() => {
    // Get default dates from bars (backtesting period)
    const defaultStartDate = bars && bars.length > 0 ? new Date(normalizeTimestamp(bars[0].time)) : null
    const defaultEndDate = bars && bars.length > 0 ? new Date(normalizeTimestamp(bars[bars.length - 1].time)) : null

    const startDate = metricsFilters.startDate ? new Date(metricsFilters.startDate) : defaultStartDate
    const endDate = metricsFilters.endDate ? new Date(metricsFilters.endDate) : defaultEndDate

    return calculateMetrics(closedTrades, accountConfig, startDate, endDate, null)
  }, [closedTrades, accountConfig, metricsFilters, bars])

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

    const dataMap = new Map()

    metrics.balanceCurve.forEach(point => {
      let timeKey = null

      if (typeof point.time === 'number' && !isNaN(point.time) && point.time > 0) {
        timeKey = Math.round(point.time / 1000)
      } else if (point.time instanceof Date && !isNaN(point.time.getTime())) {
        timeKey = Math.round(point.time.getTime() / 1000)
      } else if (typeof point.time === 'string') {
        const parsed = new Date(point.time).getTime()
        if (!isNaN(parsed)) {
          timeKey = Math.round(parsed / 1000)
        }
      }

      if (timeKey !== null) {
        dataMap.set(timeKey, {
          time: timeKey,
          value: point.balance,
        })
      }
    })

    const data = Array.from(dataMap.values()).sort((a, b) => a.time - b.time)
    lineSeries.setData(data)
    chart.timeScale().fitContent()

    return () => {
      chart.remove()
    }
  }, [activeSubTab, metrics.balanceCurve, C])


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 8px' }}>
        {['summary', 'balance', 'strategy', 'pairs', 'radar', 'journal'].map(tab => (
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
        {activeSubTab === 'journal' && (
          <JournalView metricsFilters={metricsFilters} bars={bars} C={C} />
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
  const backtestStartDate = useSimStore((s) => s.backtestStartDate)
  const backtestEndDate = useSimStore((s) => s.backtestEndDate)

  // Use store dates directly — no more computing from bars
  const defaultStartDate = backtestStartDate || ''
  const defaultEndDate = backtestEndDate || ''

  useEffect(() => {
    if (!defaultStartDate || !defaultEndDate) return
    if (!metricsFilters.startDate && !metricsFilters.endDate) {
      setMetricsFilters({ startDate: defaultStartDate, endDate: defaultEndDate })
    }
  }, [defaultStartDate, defaultEndDate]) // eslint-disable-line react-hooks/exhaustive-deps


  // Seed the store filters on mount so metrics calculations use real dates
  useEffect(() => {
    if (!defaultStartDate || !defaultEndDate) return
    if (!metricsFilters.startDate) {
      setMetricsFilters({ startDate: defaultStartDate })
    }
    if (!metricsFilters.endDate) {
      setMetricsFilters({ endDate: defaultEndDate })
    }
  }, [defaultStartDate, defaultEndDate, metricsFilters.startDate, metricsFilters.endDate, setMetricsFilters])

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
            value={metricsFilters.startDate || defaultStartDate}
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
            value={metricsFilters.endDate || defaultEndDate}
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
          <select
            value={metricsFilters.account || 'All'}
            onChange={(e) => setMetricsFilters({ account: e.target.value === 'All' ? null : e.target.value })}
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
            {ACCOUNTS.map(account => (
              <option key={account} value={account}>{account}</option>
            ))}
          </select>
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
          value={metrics.largestWinningDay.date ? `${fmtShortDate(new Date(metrics.largestWinningDay.date).getTime())}: ${fmtPnl(metrics.largestWinningDay.amount)}` : 'N/A'}
          C={C}
          color={C.green}
        />
        <MetricCard
          label="Largest Losing Day"
          value={metrics.largestLosingDay.date ? `${fmtShortDate(new Date(metrics.largestLosingDay.date).getTime())}: ${fmtPnl(metrics.largestLosingDay.amount)}` : 'N/A'}
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
function PairsDistributionView({ metrics, C }) {
  const pairs = Object.entries(metrics.pairsDistribution)
  if (pairs.length === 0) return (
    <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 12 }}>
      No pairs data available
    </div>
  )

  const maxAbs = Math.max(...pairs.map(([, d]) => Math.abs(d.pnl)), 1)

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12, textTransform: 'uppercase' }}>
        Pairs Distribution
      </div>

      {pairs.map(([pair, data]) => {
        const barWidth = Math.abs(data.pnl) / maxAbs * 100
        const isPositive = data.pnl >= 0
        return (
          <div key={pair} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: C.text, fontWeight: 600 }}>{pair}</span>
              <span style={{ color: C.muted }}>
                {data.count} trades · LONG:{data.longs} ({data.longWins} Win/{data.longLosses} Loss) · SHORT:{data.shorts} ({data.shortWins} Win/{data.shortLosses} Loss)
              </span>
              <span style={{ color: isPositive ? C.green : C.red, fontWeight: 600 }}>
                {fmtPnl(data.pnl)}
              </span>
            </div>
            <div style={{ height: 8, background: C.border + '40', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${barWidth}%`,
                background: isPositive ? C.green : C.red,
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )
      })}
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
  if (!trade) return null

  const openTimeStr = trade.openTime ? fmtShortDate(trade.openTime) : 'N/A'

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
        {trade.pair} | {trade.side} | {openTimeStr}
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
      <RadarChart metrics={metrics} />
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

/**
 * Journal View Component
 * Shows filtered journal entries based on metrics filters in table format
 */
function JournalView({ metricsFilters, bars, C }) {
  const journalEntries = useJournalStore((s) => s.entries)

  // Get default dates from bars (backtesting period)
  const defaultStartDate = useMemo(() => {
    if (!bars || bars.length === 0) return null
    return new Date(bars[0].time)
  }, [bars])

  const defaultEndDate = useMemo(() => {
    if (!bars || bars.length === 0) return null
    return new Date(bars[bars.length - 1].time)
  }, [bars])

  // Filter journal entries based on metrics filters
  const filteredEntries = useMemo(() => {
    const parseDate = (dateStr) => {
      if (!dateStr) return null
      const d = new Date(dateStr)  // yyyy-mm-dd parses natively
      return isNaN(d.getTime()) ? null : d
    }

    const startDate = metricsFilters.startDate ? parseDate(metricsFilters.startDate) : defaultStartDate
    const endDate = metricsFilters.endDate ? parseDate(metricsFilters.endDate) : defaultEndDate
    const pairFilter = metricsFilters.pair && metricsFilters.pair !== 'All' ? metricsFilters.pair : null
    const accountFilter = metricsFilters.account && metricsFilters.account !== 'All' ? metricsFilters.account : null

    return journalEntries.filter(entry => {
      const entryDate = new Date(entry.timestamp)
      if (startDate && entryDate < startDate) return false
      if (endDate && entryDate > endDate) return false
      if (pairFilter && entry.pair !== pairFilter) return false
      if (accountFilter && entry.account !== accountFilter) return false
      return true
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [journalEntries, metricsFilters, defaultStartDate, defaultEndDate])

  const formatDate = (timestamp) => {
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const year = date.getFullYear()
    return `${month}/${day}/${year}`
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '—'
    const date = new Date(timestamp)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  const columns = [
    { key: 'account', label: 'ACCOUNT', width: 100 },
    { key: 'balance', label: 'BALANCE', width: 90, format: (v) => `$${(v || 0).toFixed(0)}` },
    { key: 'deposits', label: 'DEPOSITS', width: 90, format: (v) => `$${(v || 0).toFixed(0)}` },
    { key: 'withdrawals', label: 'WITHDRAWALS', width: 100, format: (v) => `$${(v || 0).toFixed(0)}` },
    { key: 'entryDate', label: 'ENTRY DATE', width: 100 },
    { key: 'entryTime', label: 'ENTRY TIME', width: 90 },
    { key: 'pair', label: 'PAIR', width: 80 },
    { key: 'direction', label: 'DIRECTION', width: 80 },
    { key: 'entryPrice', label: 'ENTRY PRICE', width: 100, format: (v) => v !== undefined && v !== null ? fmt(v) : '—' },
    { key: 'lotSize', label: 'LOT SIZE', width: 80, format: (v) => (v || 0).toFixed(2) },
    { key: 'session', label: 'SESSION', width: 100 },
    { key: 'macroRegime', label: 'MACRO REGIME', width: 120 },
    { key: 'strategyType', label: 'STRATEGY TYPE', width: 120 },
    { key: 'analysisTf', label: 'ANALYSIS TF', width: 100 },
    { key: 'entryTf', label: 'ENTRY TF', width: 100 },
    { key: 'stopLoss', label: 'STOP LOSS', width: 100, format: (v) => v !== undefined && v !== null ? fmt(v) : '—' },
    { key: 'takeProfit', label: 'TAKE PROFIT', width: 110, format: (v) => v !== undefined && v !== null ? fmt(v) : '—' },
    { key: 'risk', label: 'RISK ($)', width: 90, format: (v) => `$${(v || 0).toFixed(2)}` },
    { key: 'fees', label: 'FEES ($)', width: 85, format: (v) => `$${(v || 0).toFixed(2)}` },
    { key: 'pnlUsd', label: 'P/L ($)', width: 90, format: (v) => fmtPnl(v) },
    { key: 'pnlPips', label: 'P/L (PIPS)', width: 100, format: (v) => (v || 0).toFixed(1) },
    { key: 'rr', label: 'RR', width: 70, format: (v) => (v || 0).toFixed(2) },
    { key: 'exitPrice', label: 'EXIT PRICE', width: 110, format: (v) => v !== undefined && v !== null ? fmt(v) : '—' },
    { key: 'exitDate', label: 'EXIT DATE', width: 100 },
    { key: 'exitTime', label: 'EXIT TIME', width: 90 },
    { key: 'winLoss', label: 'WIN/LOSS', width: 80 },
    { key: 'notes', label: 'NOTES', width: 150 },
  ]

  const renderCell = (entry, col) => {
    const rawValue = entry[col.key]
    let value = rawValue
    if (col.key === 'entryDate') {
      value = rawValue || formatDate(entry.timestamp)
    }
    if (col.key === 'entryTime') {
      value = rawValue || formatTime(entry.timestamp)
    }
    if (col.key === 'direction') {
      value = entry.direction || entry.type?.toUpperCase() || '—'
    }
    if (col.key === 'exitDate') {
      value = rawValue || (entry.exitPrice ? formatDate(entry.exitTimestamp || entry.timestamp) : '—')
    }
    if (col.key === 'exitTime') {
      value = rawValue || (entry.exitPrice ? formatTime(entry.exitTimestamp || entry.timestamp) : '—')
    }
    if (col.key === 'winLoss') {
      if (entry.pnlUsd === undefined || entry.pnlUsd === null) return '—'
      return entry.pnlUsd >= 0 ? 'WIN' : 'LOSS'
    }

    const formatted = col.format ? col.format(rawValue) : value
    return formatted !== undefined && formatted !== null ? formatted : '—'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <h3 style={{ color: C.text, margin: 0, fontSize: '14px', fontWeight: 600 }}>
          Trading Journal ({filteredEntries.length} entries)
        </h3>
      </div>

      {filteredEntries.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
          No journal entries found for the selected filters.
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10, fontFamily: FONT }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{
                      width: col.width,
                      minWidth: col.width,
                      padding: '8px 6px',
                      textAlign: 'left',
                      color: C.muted,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      borderRight: `1px solid ${C.border}`,
                      background: C.bg,
                      fontSize: 11,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, index) => (
                <tr key={entry.id || index} style={{ borderBottom: `1px solid ${C.border}`, background: index % 2 === 0 ? C.surf : C.bg }}>
                  {columns.map(col => {
                    const cellValue = renderCell(entry, col)
                    const color = col.key === 'direction'
                      ? (entry.direction === 'BUY' ? C.green : entry.direction === 'SELL' ? C.red : C.text)
                      : col.key === 'pnlUsd'
                        ? (entry.pnlUsd >= 0 ? C.green : C.red)
                        : C.text

                    return (
                      <td key={col.key} style={{ padding: '8px 6px', color, textAlign: 'left', borderRight: `1px solid ${C.border}`, fontWeight: col.key === 'direction' ? 600 : 400 }}>
                        {cellValue}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}