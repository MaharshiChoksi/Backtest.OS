import React, { useMemo } from 'react'
import { useTheme } from '../../store/useThemeStore'

/**
 * Radar Chart Component
 * Displays metrics in a radar/spider chart format
 * Metrics: Win Rate, RR Ratio, Risk %, Profit Factor, Sharpe Ratio, Avg Trade Duration (normalized)
 */
export function RadarChart({ metrics, width = 400, height = 400 }) {
  const C = useTheme()

  // Data points for radar chart
  const dataPoints = useMemo(() => {
    const points = [
      {
        name: 'Win Rate',
        value: Math.min(parseFloat(metrics.winRate) / 100, 1), // Normalize to 0-1
        max: 1,
        formatted: `${metrics.winRate}%`
      },
      {
        name: 'RR Ratio',
        value: Math.min(parseFloat(metrics.avgRR) / 3, 1), // Normalize assuming max 3
        max: 3,
        formatted: `${metrics.avgRR}`
      },
      {
        name: 'Risk %',
        value: Math.min(parseFloat(metrics.avgRiskPercent) / 5, 1), // Normalize assuming max 5%
        max: 5,
        formatted: `${metrics.avgRiskPercent}%`
      },
      {
        name: 'Profit Factor',
        value: Math.min(parseFloat(metrics.profitFactor) / 2, 1), // Normalize assuming max 2
        max: 2,
        formatted: `${metrics.profitFactor}`
      },
      {
        name: 'Sharpe Ratio',
        value: Math.min(parseFloat(metrics.sharpeRatio) / 2, 1), // Normalize assuming max 2
        max: 2,
        formatted: `${metrics.sharpeRatio}`
      },
      {
        name: 'Recovery Factor',
        value: Math.min(Math.abs(metrics.totalPnl / (metrics.totalFees || 1)) / 50, 1), // Recovery ratio
        max: 50,
        formatted: `${(Math.abs(metrics.totalPnl) / (metrics.totalFees || 1)).toFixed(1)}`
      }
    ]
    return points
  }, [metrics])

  const numPoints = dataPoints.length
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) / 2 - 50

  // Generate points on the circle
  const angleSlice = (Math.PI * 2) / numPoints

  // Generate grid circles
  const gridCircles = [0.2, 0.4, 0.6, 0.8, 1.0]

  // Calculate coordinates
  const getCoordinates = (value, index) => {
    const angle = angleSlice * index - Math.PI / 2
    const x = centerX + value * radius * Math.cos(angle)
    const y = centerY + value * radius * Math.sin(angle)
    return { x, y }
  }

  const getAxisPoint = (index) => {
    const angle = angleSlice * index - Math.PI / 2
    const x = centerX + 1 * radius * Math.cos(angle)
    const y = centerY + 1 * radius * Math.sin(angle)
    return { x, y }
  }

  // Generate SVG path for data
  const dataPath = dataPoints
    .map((point, index) => {
      const coords = getCoordinates(point.value, index)
      return `${index === 0 ? 'M' : 'L'} ${coords.x} ${coords.y}`
    })
    .join(' ') + ' Z'

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <svg width={width} height={height} style={{ background: C.surf, borderRadius: 6, border: `1px solid ${C.border}` }}>
        {/* Grid circles */}
        {gridCircles.map((level, idx) => (
          <circle
            key={`grid-${idx}`}
            cx={centerX}
            cy={centerY}
            r={level * radius}
            fill="none"
            stroke={C.border}
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.5"
          />
        ))}

        {/* Axis lines */}
        {dataPoints.map((point, index) => {
          const axisPoint = getAxisPoint(index)
          return (
            <line
              key={`axis-${index}`}
              x1={centerX}
              y1={centerY}
              x2={axisPoint.x}
              y2={axisPoint.y}
              stroke={C.border}
              strokeWidth="1"
              opacity="0.3"
            />
          )
        })}

        {/* Data polygon */}
        <path d={dataPath} fill={C.green} fillOpacity="0.2" stroke={C.green} strokeWidth="2" />

        {/* Data points */}
        {dataPoints.map((point, index) => {
          const coords = getCoordinates(point.value, index)
          return (
            <circle
              key={`point-${index}`}
              cx={coords.x}
              cy={coords.y}
              r={3}
              fill={C.green}
              stroke={C.bg}
              strokeWidth="2"
            />
          )
        })}

        {/* Labels */}
        {dataPoints.map((point, index) => {
          const labelDist = radius + 40
          const angle = angleSlice * index - Math.PI / 2
          const labelX = centerX + labelDist * Math.cos(angle)
          const labelY = centerY + labelDist * Math.sin(angle)

          return (
            <g key={`label-${index}`}>
              {/* Label background */}
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fill={C.text}
                fontSize="11"
                fontWeight="600"
                dy="0.3em"
              >
                {point.name}
              </text>
              {/* Value */}
              <text
                x={labelX}
                y={labelY + 12}
                textAnchor="middle"
                fill={C.green}
                fontSize="10"
                fontWeight="600"
                dy="0.3em"
              >
                {point.formatted}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
