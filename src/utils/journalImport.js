const REQUIRED_KEYS = [
  'account', 'balance', 'deposits', 'withdrawals',
  'entryDate', 'entryTime', 'pair', 'direction', 'entryPrice', 'lotSize',
  'session', 'macroRegime', 'strategyType', 'analysisTf', 'entryTf',
  'stopLoss', 'takeProfit', 'risk', 'fees',
  'pnlUsd', 'pnlPips', 'rr', 'exitPrice', 'exitDate', 'exitTime', 'winLoss', 'notes',
]

const HEADER_ALIASES = {
  account: 'account',
  balance: 'balance',
  deposits: 'deposits',
  withdrawals: 'withdrawals',
  entrydate: 'entryDate',
  'entry date': 'entryDate',
  entrytime: 'entryTime',
  'entry time': 'entryTime',
  pair: 'pair',
  direction: 'direction',
  entryprice: 'entryPrice',
  'entry price': 'entryPrice',
  lotsize: 'lotSize',
  'lot size': 'lotSize',
  session: 'session',
  macroregime: 'macroRegime',
  'macro regime': 'macroRegime',
  strategytype: 'strategyType',
  'strategy type': 'strategyType',
  analysistf: 'analysisTf',
  'analysis tf': 'analysisTf',
  entrytf: 'entryTf',
  'entry tf': 'entryTf',
  stoploss: 'stopLoss',
  'stop loss': 'stopLoss',
  takeprofit: 'takeProfit',
  'take profit': 'takeProfit',
  risk: 'risk',
  'risk ($)': 'risk',
  fees: 'fees',
  'fees ($)': 'fees',
  pnlusd: 'pnlUsd',
  'p/l ($)': 'pnlUsd',
  pnlpips: 'pnlPips',
  'p/l (pips)': 'pnlPips',
  rr: 'rr',
  exitprice: 'exitPrice',
  'exit price': 'exitPrice',
  exitdate: 'exitDate',
  'exit date': 'exitDate',
  exittime: 'exitTime',
  'exit time': 'exitTime',
  winloss: 'winLoss',
  'win/loss': 'winLoss',
  notes: 'notes',
}

function normHeader(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseNumber(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,%]/g, '').trim())
  return Number.isFinite(n) ? n : fallback
}

function parseOptionalNumber(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === '-' || s === '—') return null
  const n = Number(s.replace(/[$,%]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseTimestamp(entryDate, entryTime) {
  const d = String(entryDate || '').trim()
  const t = String(entryTime || '').trim()
  if (!d) return null
  const isoCandidate = t ? `${d} ${t}` : d
  const ms = new Date(isoCandidate).getTime()
  return Number.isFinite(ms) ? ms : null
}

function buildHeaderMap(headers) {
  const map = {}
  headers.forEach((h) => {
    const n = normHeader(h)
    const canonical = HEADER_ALIASES[n] || HEADER_ALIASES[n.replace(/[()]/g, '')]
    if (canonical) map[canonical] = h
  })
  return map
}

export function validateJournalHeaders(headers) {
  const map = buildHeaderMap(headers || [])
  const missing = REQUIRED_KEYS.filter((k) => !map[k])
  return {
    valid: missing.length === 0,
    missing,
    map,
  }
}

export function parseJournalRows(headers, rows) {
  const check = validateJournalHeaders(headers)
  if (!check.valid) return { entries: [], missing: check.missing }

  const entries = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const get = (k) => row[check.map[k]]

    const entryDate = String(get('entryDate') || '').trim()
    const entryTime = String(get('entryTime') || '').trim()
    const timestamp = parseTimestamp(entryDate, entryTime)
    if (!timestamp) continue

    const exitDateRaw = String(get('exitDate') || '').trim()
    const exitTimeRaw = String(get('exitTime') || '').trim()
    const exitTimestamp = exitDateRaw ? parseTimestamp(exitDateRaw, exitTimeRaw) : null

    const entry = {
      tradeId: `imp-${timestamp}-${i}`,
      account: String(get('account') || 'BackTest'),
      balance: parseNumber(get('balance')),
      deposits: parseNumber(get('deposits')),
      withdrawals: parseNumber(get('withdrawals')),
      timestamp,
      entryDate,
      entryTime,
      pair: String(get('pair') || 'N/A'),
      direction: String(get('direction') || '').toUpperCase(),
      entryPrice: parseNumber(get('entryPrice')),
      lotSize: parseNumber(get('lotSize'), 0),
      session: String(get('session') || ''),
      macroRegime: String(get('macroRegime') || ''),
      strategyType: String(get('strategyType') || ''),
      analysisTf: String(get('analysisTf') || ''),
      entryTf: String(get('entryTf') || ''),
      stopLoss: parseOptionalNumber(get('stopLoss')),
      takeProfit: parseOptionalNumber(get('takeProfit')),
      risk: parseNumber(get('risk')),
      fees: parseNumber(get('fees')),
      exitPrice: parseOptionalNumber(get('exitPrice')),
      exitTimestamp,
      exitDate: exitDateRaw || null,
      exitTime: exitTimeRaw || null,
      pnlUsd: parseNumber(get('pnlUsd')),
      pnlPips: parseNumber(get('pnlPips')),
      rr: parseNumber(get('rr')),
      winLoss: String(get('winLoss') || ''),
      notes: String(get('notes') || ''),
      closureReason: null,
    }

    entries.push(entry)
  }

  entries.sort((a, b) => a.timestamp - b.timestamp)
  return { entries, missing: [] }
}

