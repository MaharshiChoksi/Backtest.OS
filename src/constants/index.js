export const DARK_THEME = {
  bg:      '#09090b',
  surf:    '#0f0f12',
  surf2:   '#161619',
  surf3:   '#1c1c21',
  border:  '#272729',
  border2: '#49494e',
  text:    '#ffffff',
  muted:   '#72716d',
  dim:     '#333235',
  amber:   '#f0a52a',
  amberD:  '#c47d0e',
  green:   '#36d47c',
  red:     '#f05050',
  blue:    '#5b9cf5',
  purple:  '#9b7cf4',
}

export const LIGHT_THEME = {
  bg:      '#f4f3ef',
  surf:    '#ffffff',
  surf2:   '#eeedea',
  surf3:   '#e4e3de',
  border:  '#d5d4cd',
  border2: '#c4c3bc',
  text:    '#18181a',
  muted:   '#888882',
  dim:     '#bebcb6',
  amber:   '#c07a0a',
  amberD:  '#f0a52a',
  green:   '#1a7a40',
  red:     '#cc3333',
  blue:    '#2060cc',
  purple:  '#6040c8',
}

export const FONT = '"JetBrains Mono","Fira Code","Cascadia Code","SF Mono",monospace'

// Speed options for simulation playback
// BASE_MS = 420ms per bar at 1x speed
// Formula: delay = BASE_MS / speed
export const SPEEDS = [
  { label: '1×',  v: 1    },
  { label: '5×',  v: 5    },
  { label: '10×', v: 10   },
  { label: '50×', v: 50   },
  { label: 'MAX', v: 1000 },  // ~0.4ms per bar, essentially instant
]

export const BASE_MS = 420

// Get timeframe duration in milliseconds
export function getTimeframeMs(timeframe) {
  const map = {
    'M1': 60000,
    'M5': 300000,
    'M15': 900000,
    'M30': 1800000,
    'H1': 3600000,
    'H4': 14400000,
    'D1': 86400000,
    // Also support lowercase for internal use
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000,
  }
  return map[timeframe] || 60000
}