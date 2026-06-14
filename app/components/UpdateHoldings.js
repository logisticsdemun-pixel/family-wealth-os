'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { load, applyImport, KEYS } from '../lib/storage'
import { useStore } from '../lib/store'
import { MEMBERS, firstName, formatINR } from '../lib/format'
import { takeSnapshotFromStorage } from '../lib/snapshot'
import { SEED_INVESTMENTS } from '../lib/seedData'

// ── Shared helpers ─────────────────────────────────────────

function parseNum(val) {
  if (val == null || val === '') return null
  const n = parseFloat(String(val).replace(/[,₹\s%]/g, ''))
  return isNaN(n) ? null : n
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function deterministicId(member, key) {
  return `${slugify(member)}|${slugify(key)}|na`
}

// ── Option A: Family Finance Tracker ──────────────────────

function normKey(s) { return String(s || '').toLowerCase().replace(/[\s_\-.]/g, '') }

function pickCol(row, ...names) {
  for (const name of names) {
    const k = normKey(name)
    if (k in row) return row[k]
  }
}

function sheetRows(ws) {
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  if (raw.length < 2) return []
  const headers = raw[0].map(h => normKey(h))
  return raw.slice(1)
    .filter(row => row.some(c => c !== '' && c != null))
    .map(row => {
      const obj = {}
      headers.forEach((h, i) => { if (h) obj[h] = row[i] })
      return obj
    })
}

function findSheet(wb, ...names) {
  const keys = Object.keys(wb.Sheets)
  for (const name of names) {
    const found = keys.find(k => normKey(k) === normKey(name))
    if (found) return wb.Sheets[found]
  }
  return null
}

function parseTrackerHoldings(wb) {
  const ws = findSheet(wb, 'Holdings', 'Investments', 'Equity', 'Portfolio', 'Stocks')
  if (!ws) throw new Error('No "Holdings" or "Investments" sheet found in this workbook.')
  return sheetRows(ws).map(row => {
    const type = String(pickCol(row, 'type', 'assettype', 'category') || 'Stock').trim()
    const isMF = /mutual|mf|etf|short/i.test(type)
    return {
      id: crypto.randomUUID(),
      name: String(pickCol(row, 'name', 'stockname', 'fundname', 'security') || '').trim(),
      member: String(pickCol(row, 'member', 'owner', 'person') || '').trim(),
      type, isMF,
      ticker: isMF ? null : (String(pickCol(row, 'ticker', 'symbol', 'nseticker') || '').trim() || null),
      mfCode: isMF ? (String(pickCol(row, 'mfcode', 'schemecode', 'amficode') || '').trim() || null) : null,
      units: parseNum(pickCol(row, 'units', 'quantity', 'shares')) ?? 0,
      buyPrice: parseNum(pickCol(row, 'buyprice', 'purchaseprice', 'avgprice', 'nav', 'costprice')) ?? 0,
      currentPrice: parseNum(pickCol(row, 'currentprice', 'marketprice', 'ltp', 'price')),
      buyDate: String(pickCol(row, 'buydate', 'purchasedate', 'date') || ''),
      flags: [],
    }
  }).filter(i => i.name && i.units > 0 && i.buyPrice > 0)
}

function mergeByKey(existing, incoming) {
  const key = item => `${String(item.name || '').toLowerCase().trim()}|${String(item.member || '').toLowerCase().trim()}`
  const map = new Map(existing.map(e => [key(e), e]))
  incoming.forEach(item => {
    const k = key(item)
    map.set(k, map.has(k) ? { ...map.get(k), ...item, id: map.get(k).id } : item)
  })
  return [...map.values()]
}

function trackerDiff(incoming, existing) {
  const key = item => `${String(item.name || '').toLowerCase().trim()}|${String(item.member || '').toLowerCase().trim()}`
  const existingKeys = new Set(existing.map(key))
  return {
    toAdd: incoming.filter(i => !existingKeys.has(key(i))).length,
    toUpdate: incoming.filter(i => existingKeys.has(key(i))).length,
  }
}

// ── Option B: Zerodha Holdings Statement ──────────────────

// ISIN → AMFI scheme code for known MFs
const AMFI_BY_ISIN = {
  'INF209K01UR9': '119533',
  'INF754K01NB3': '147946',
  'INF179K01WA6': '118989',
  'INF247L01445': '120503',
  'INF879O01027': '122639',
  'INF966L01689': '120828',
}

// Symbols that trade on BSE only (override default .NS suffix)
const BSE_EXCEPTIONS = {
  'CPPLUS': 'CPPLUS.BO',
}

function mapInstrType(raw) {
  const t = String(raw || '').trim()
  if (!t || t === '-') return { isMF: false, type: 'Stock' }
  if (t === 'Others - Index Funds/ETFs') return { isMF: true, type: 'ETF' }
  if (t.startsWith('Debt -')) return { isMF: true, type: 'Short Term Fund' }
  if (t.startsWith('Hybrid -')) return { isMF: true, type: 'Mutual Fund' }
  if (t.startsWith('Equity -')) return { isMF: true, type: 'Mutual Fund' }
  return { isMF: false, type: 'Stock' }
}

function parseZerodhaStatement(wb) {
  const sheetKeys = Object.keys(wb.Sheets)
  const combinedKey = sheetKeys.find(k => k.trim().toLowerCase() === 'combined')
  if (!combinedKey) {
    throw new Error(
      'No "Combined" sheet found in this file.\n' +
      'Please upload the Zerodha Holdings Statement from console.zerodha.com → Portfolio → Holdings → Download'
    )
  }

  const ws = wb.Sheets[combinedKey]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })

  // Extract statement date
  let statementDate = null
  for (const row of data) {
    const text = row.map(c => String(c)).join(' ')
    if (text.toLowerCase().includes('combined holdings statement')) {
      const m = text.match(/(\d{4}-\d{2}-\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4})/)
      if (m) statementDate = m[1]
      break
    }
  }

  // Extract summary invested value for validation
  let summaryInvested = null
  for (const row of data) {
    const lower = row.map(c => String(c).toLowerCase())
    if (lower.some(c => c.includes('invested value'))) {
      const nums = row.map(c => parseNum(c)).filter(n => n !== null && n > 100)
      if (nums.length) summaryInvested = nums[nums.length - 1]
    }
  }

  // Dynamic header detection: find row where first non-empty cell is "Symbol"
  const headerIdx = data.findIndex(row => {
    const first = String(row.find(c => c !== '' && c != null) ?? '').trim()
    return first === 'Symbol'
  })
  if (headerIdx === -1) {
    throw new Error('Could not find the data table in the Combined sheet — "Symbol" header row not found.')
  }

  const headers = data[headerIdx].map(h => String(h || '').trim())
  const col = name => headers.indexOf(name)

  const iSymbol   = col('Symbol')
  const iISIN     = col('ISIN')
  const iSector   = col('Sector')
  const iInstrT   = col('Instrument Type')
  const iQty      = col('Quantity Available')
  const iAvgPrice = col('Average Price')
  const iPrev     = col('Previous Closing Price')

  if (iSymbol === -1)   throw new Error('"Symbol" column not found in Combined sheet.')
  if (iQty === -1)      throw new Error('"Quantity Available" column not found.')
  if (iAvgPrice === -1) throw new Error('"Average Price" column not found.')

  const rows = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i]
    const symbol = String(r[iSymbol] ?? '').trim()
    if (!symbol || symbol === '-' || /^-+$/.test(symbol) || symbol.toLowerCase() === 'total') continue

    const qty      = parseNum(r[iQty])
    const avgPrice = parseNum(r[iAvgPrice])
    if (!qty || !avgPrice || qty <= 0 || avgPrice <= 0) continue

    const isin      = String(r[iISIN]   ?? '').trim()
    const sector    = String(r[iSector] ?? '').trim()
    const instrType = String(r[iInstrT] ?? '').trim()
    const prevClose = iPrev !== -1 ? parseNum(r[iPrev]) : null

    const hasSector    = sector    && sector    !== '-'
    const hasInstrType = instrType && instrType !== '-'
    const isStock = hasSector && !hasInstrType

    rows.push({ symbol, isin, sector, instrType, units: qty, avgPrice, prevClose: prevClose && prevClose > 0 ? prevClose : null, isStock })
  }

  if (rows.length === 0) throw new Error('No valid holdings found in the Combined sheet.')

  let warning = null
  if (summaryInvested !== null && summaryInvested > 0) {
    const parsedTotal = rows.reduce((s, r) => s + r.units * r.avgPrice, 0)
    if (Math.abs(parsedTotal - summaryInvested) / summaryInvested > 0.01) {
      const fmt = n => Math.round(n).toLocaleString('en-IN')
      warning = `File totals don't match parsed data (parsed ₹${fmt(parsedTotal)} vs reported ₹${fmt(summaryInvested)}). Some rows may have been skipped.`
    }
  }

  return { rows, warning, date: statementDate }
}

function buildZerodhaStatementDiff(rows, member, existing) {
  return rows.map(row => {
    const { isMF, type } = mapInstrType(row.instrType)
    const isStock = row.isStock

    let ticker = null, detId, amfiCode = null, name

    if (isStock) {
      ticker = BSE_EXCEPTIONS[row.symbol] || `${row.symbol}.NS`
      detId  = deterministicId(member, ticker)
      name   = row.symbol
    } else {
      detId    = deterministicId(member, row.isin)
      amfiCode = AMFI_BY_ISIN[row.isin] || null
      name     = row.symbol
    }

    const match = existing.find(inv => {
      if (inv.member !== member) return false
      if (inv.id === detId) return true
      if (isStock) return !inv.isMF && (inv.ticker || '').toUpperCase() === (ticker || '').toUpperCase()
      if (row.isin && inv.isin === row.isin) return true
      if (amfiCode && inv.mfCode === amfiCode) return true
      return false
    })

    let action = 'ADD'
    if (match) {
      const unitsChanged = Math.abs((match.units ?? 0) - row.units) > 0.001
      const priceChanged = Math.abs((match.buyPrice ?? 0) - row.avgPrice) > 0.01
      action = (unitsChanged || priceChanged) ? 'UPDATE' : 'UNCHANGED'
    }

    return { row, name, isStock, isMF, ticker, type, amfiCode, detId, existing: match || null, action }
  })
}

// Find ALL holdings for this member that are NOT in the file
function findExitedHoldings(allInvestments, diffRows, memberName) {
  function norm(t) {
    if (!t) return ''
    return String(t).toUpperCase()
      .replace(/\.NS$/, '')
      .replace(/\.BO$/, '')
      .trim()
  }

  // Tickers and ISINs present in the uploaded file
  const fileTickerSet = new Set(
    diffRows.map(r => norm(r.ticker || r.row?.symbol || '')).filter(Boolean)
  )
  const fileISINSet = new Set(
    diffRows.map(r => (r.row?.isin || '').toUpperCase()).filter(Boolean)
  )

  const memberLower = (memberName || '').toLowerCase()
  const memberFirst = memberLower.split(' ')[0]

  // All tradeable investments for this member — no source/institution filter
  const memberInvestments = allInvestments.filter(inv => {
    const invMember = String(
      inv.member || inv.memberId || inv.owner || ''
    ).toLowerCase()
    const memberMatch =
      invMember === memberLower ||
      invMember.includes(memberFirst) ||
      memberLower.includes(invMember.split(' ')[0])
    if (!memberMatch) return false

    const type = String(
      inv.assetClass || inv.type || inv.instrumentType || ''
    ).toLowerCase()
    const excluded = [
      'gold', 'real estate', 'property', 'fixed deposit',
      'cash', 'insurance', 'ppf', 'epf', 'nps', 'fd',
    ]
    return !excluded.some(e => type.includes(e))
  })

  return memberInvestments
    .filter(inv => {
      const appTicker = norm(inv.ticker || inv.symbol || '')
      const appISIN = (inv.isin || '').toUpperCase()
      if (appISIN && fileISINSet.has(appISIN)) return false
      if (appTicker && fileTickerSet.has(appTicker)) return false
      return !!(appTicker || appISIN)
    })
    .map(inv => ({ inv, lastValue: inv.units * (inv.currentPrice ?? inv.buyPrice) }))
}

// ── Option C: Zerodha MF Holdings ─────────────────────────

function detectMFType(name) {
  const n = String(name || '').toLowerCase()
  if (n.includes('etf')) return 'ETF'
  if (n.includes('liquid') || n.includes('overnight') || n.includes('ultra short') || n.includes('money market')) return 'Short Term Fund'
  return 'Mutual Fund'
}

function parseZerodhaMF(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const headerIdx = data.findIndex(row => row.some(c => String(c).toLowerCase().includes('scheme name')))
  if (headerIdx === -1) throw new Error('Column "Scheme Name" not found. Use the MF Holdings export from Zerodha Console.')

  const headers = data[headerIdx].map(h => String(h).toLowerCase().trim())
  const col = name => headers.findIndex(h => h.includes(name))
  const iScheme = col('scheme name'), iUnits = col('units'), iAvgNAV = col('avg nav'), iCurNAV = col('current nav')

  if (iUnits === -1)  throw new Error('Column "Units" not found.')
  if (iAvgNAV === -1) throw new Error('Column "Avg NAV" not found.')

  const rows = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i]
    const schemeName = String(r[iScheme] ?? '').trim()
    if (!schemeName || schemeName.toLowerCase() === 'total' || /^-+$/.test(schemeName)) continue
    const units = parseNum(r[iUnits]), avgNAV = parseNum(r[iAvgNAV])
    if (!units || !avgNAV || units <= 0 || avgNAV <= 0) continue
    const currentNAV = iCurNAV !== -1 ? parseNum(r[iCurNAV]) : null
    rows.push({ schemeName, units, avgNAV, currentNAV: currentNAV && currentNAV > 0 ? currentNAV : null })
  }
  if (rows.length === 0) throw new Error('No valid MF holdings found in the file.')
  return rows
}

function buildMFDiff(rows, member, existing) {
  return rows.map(row => {
    const words = row.schemeName.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    const match = existing.find(inv => {
      if (!inv.isMF || inv.member !== member) return false
      const invWords = new Set(inv.name.toLowerCase().split(/\W+/).filter(w => w.length > 3))
      const overlap = words.filter(w => invWords.has(w)).length
      return overlap >= Math.min(2, Math.ceil(words.length * 0.5))
    })
    return { row, existing: match || null, type: detectMFType(row.schemeName), mfCode: match?.mfCode || null }
  })
}

// ── Main modal component ───────────────────────────────────

export default function UpdateHoldingsModal({ onClose, activeMember }) {
  const { data } = useStore()
  const storeInvestments = data?.investments ?? []

  // If a specific member is already selected in the global filter, lock to it
  const memberFixed = Boolean(activeMember && activeMember !== 'All')

  const [activeTab, setActiveTab] = useState('family')
  const [step, setStep] = useState('upload')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [member, setMember] = useState(memberFixed ? activeMember : MEMBERS[0])

  const [parsedA, setParsedA] = useState(null)
  // parsedB: { rows: DiffRow[], exited: ExitedRow[], warning: string|null, date: string|null }
  const [parsedB, setParsedB] = useState(null)
  const [selectedB, setSelectedB] = useState(new Set())        // ISINs of file rows to import
  const [selectedExited, setSelectedExited] = useState(new Set()) // IDs of exited rows to remove
  const [parsedC, setParsedC] = useState(null)

  const fileRef = useRef(null)

  function switchTab(tab) {
    setActiveTab(tab); setStep('upload'); setError('')
    setParsedA(null); setParsedB(null); setParsedC(null)
    setSelectedB(new Set()); setSelectedExited(new Set())
  }

  function reset() {
    setStep('upload'); setError('')
    setParsedA(null); setParsedB(null); setParsedC(null)
    setSelectedB(new Set()); setSelectedExited(new Set())
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e) {
    console.log('[UpdateHoldings] handleFile called, tab:', activeTab)
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (fileRef.current) fileRef.current.value = ''
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const existing = storeInvestments

      if (activeTab === 'family') {
        const holdings = parseTrackerHoldings(wb)
        setParsedA({ holdings, diff: trackerDiff(holdings, existing) })

      } else if (activeTab === 'zerodha') {
        const { rows: rawRows, warning, date } = parseZerodhaStatement(wb)
        const diffRows = buildZerodhaStatementDiff(rawRows, member, existing)
        const exited   = findExitedHoldings(existing, diffRows, member)
        console.log('[UpdateHoldings] exited found:', exited.length,
          exited.map(({ inv: h }) => h.name || h.ticker || h.symbol))
        console.log('[UpdateHoldings] memberInvestments count from existing:',
          (existing || []).filter(inv => {
            const m = String(inv.member || inv.memberId || '').toLowerCase()
            return m.includes((member || '').toLowerCase().split(' ')[0])
          }).length
        )
        setParsedB({ rows: diffRows, exited, warning, date })
        // Pre-select ADD + UPDATE rows; leave UNCHANGED deselected
        setSelectedB(new Set(diffRows.filter(d => d.action !== 'UNCHANGED').map(d => d.row.isin)))
        // Pre-tick all exited rows (user must untick to keep)
        setSelectedExited(new Set(exited.map(e => e.inv.id)))

      } else {
        const rows = parseZerodhaMF(wb)
        setParsedC(buildMFDiff(rows, member, existing))
      }
      setStep('review')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport() {
    setImporting(true)
    try {
      takeSnapshotFromStorage()
      const existing = storeInvestments

      if (activeTab === 'family') {
        await applyImport({ [KEYS.INVESTMENTS]: mergeByKey(existing, parsedA.holdings) })

      } else if (activeTab === 'zerodha') {
        const selected = parsedB.rows.filter(d => selectedB.has(d.row.isin))
        const updated  = [...existing]
        const now      = Date.now()
        const cache    = { ...(load(KEYS.PRICE_CACHE, {}) || {}) }

        // Process ADD and UPDATE rows from the file
        for (const { row, name, isStock, isMF, ticker, type, amfiCode, detId, existing: match } of selected) {
          if (match) {
            const idx = updated.findIndex(i => i.id === match.id)
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                institution: 'Zerodha',
                units: row.units,
                buyPrice: row.avgPrice,
                currentPrice: row.prevClose ?? updated[idx].currentPrice,
                isin: row.isin || updated[idx].isin || null,
                flags: row.prevClose != null
                  ? (updated[idx].flags || []).filter(f => f !== 'manual')
                  : (updated[idx].flags || []),
              }
              if (row.prevClose != null && isStock && updated[idx].ticker) {
                cache[`stock:${updated[idx].ticker}`] = { fetchedAt: now, status: 'ok' }
              }
            }
          } else {
            const newInv = {
              id: detId,
              name,
              member,
              isMF,
              type,
              institution: 'Zerodha',
              isin: row.isin || null,
              ticker: isStock ? ticker : null,
              mfCode: isMF ? (amfiCode || null) : null,
              units: row.units,
              buyPrice: row.avgPrice,
              currentPrice: row.prevClose ?? null,
              buyDate: '',
              flags: isMF && !amfiCode ? ['VERIFY_AMFI'] : [],
            }
            updated.push(newInv)
            if (row.prevClose != null && isStock && ticker) {
              cache[`stock:${ticker}`] = { fetchedAt: now, status: 'ok' }
            }
          }
        }

        // Process EXITED holdings (Zerodha-sourced, not in latest file)
        for (const { inv } of parsedB.exited) {
          const idx = updated.findIndex(i => i.id === inv.id)
          if (idx === -1) continue
          if (selectedExited.has(inv.id)) {
            // User kept checkbox ticked → remove the holding
            updated.splice(idx, 1)
          } else {
            // User unticked → keep, clear Zerodha source flags so it isn't flagged next time
            const { institution: _inst, ...rest } = updated[idx]
            updated[idx] = {
              ...rest,
              id: crypto.randomUUID(),
              note: parsedB.date
                ? `Not present in Zerodha statement dated ${parsedB.date}`
                : 'Not present in latest Zerodha statement',
            }
          }
        }

        await applyImport({ [KEYS.INVESTMENTS]: updated, [KEYS.PRICE_CACHE]: cache })

      } else {
        const updated = [...existing]
        for (const { row, existing: match, type, mfCode } of parsedC) {
          if (match) {
            const idx = updated.findIndex(i => i.id === match.id)
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                units: row.units,
                buyPrice: row.avgNAV,
                currentPrice: row.currentNAV,
                flags: (updated[idx].flags || []).filter(f => f !== 'manual'),
              }
            }
          } else {
            updated.push({
              id: crypto.randomUUID(),
              name: row.schemeName,
              ticker: null,
              mfCode: mfCode || null,
              member, type,
              isMF: true,
              units: row.units,
              buyPrice: row.avgNAV,
              currentPrice: row.currentNAV,
              buyDate: '',
              flags: mfCode ? [] : ['VERIFY_AMFI'],
            })
          }
        }
        await applyImport({ [KEYS.INVESTMENTS]: updated })
      }

      onClose()
    } catch (err) {
      setError(err.message || 'Import failed.')
      setImporting(false)
    }
  }

  const TABS = [
    { id: 'family',  label: 'Family Tracker' },
    { id: 'zerodha', label: 'Zerodha Holdings' },
    { id: 'mf',      label: 'Zerodha MF' },
  ]

  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
  }
  const labelSt = { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

  // ── Live counts for summary line ───────────────────────
  const b_add  = parsedB?.rows.filter(d => d.action === 'ADD'       && selectedB.has(d.row.isin)).length ?? 0
  const b_upd  = parsedB?.rows.filter(d => d.action === 'UPDATE'    && selectedB.has(d.row.isin)).length ?? 0
  const b_unch = parsedB?.rows.filter(d => d.action === 'UNCHANGED').length ?? 0
  const b_rem  = selectedExited.size
  const hasWork = b_add + b_upd + b_rem > 0

  // ── Review subtitle ─────────────────────────────────────
  let reviewSubtitle = ''
  if (step === 'review') {
    if (activeTab === 'family' && parsedA) {
      reviewSubtitle = `${parsedA.holdings.length} holding${parsedA.holdings.length !== 1 ? 's' : ''} — ${parsedA.diff.toAdd} new, ${parsedA.diff.toUpdate} updated`
    } else if (activeTab === 'zerodha' && parsedB) {
      const exitedN = parsedB.exited.length
      reviewSubtitle = `${parsedB.rows.length} in file, ${exitedN} exited — ${b_add} new, ${b_upd} updated, ${b_unch} unchanged`
    } else if (activeTab === 'mf' && parsedC) {
      const unmatched = parsedC.filter(d => !d.mfCode).length
      reviewSubtitle = `${parsedC.length} scheme${parsedC.length !== 1 ? 's' : ''} for ${firstName(member)}${unmatched > 0 ? ` — ${unmatched} need AMFI code` : ''}`
    }
  }

  // ── JSX ─────────────────────────────────────────────────
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={importing ? undefined : onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 32px)', maxWidth: 660,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '24px 28px', maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 3px', fontSize: '1rem', fontWeight: 600 }}>
              {step === 'upload' ? '↑ Update Holdings' : 'Review Import'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {step === 'upload' ? 'Choose a source and upload a .xlsx file' : reviewSubtitle}
            </p>
          </div>
          {!importing && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, padding: 4 }}>✕</button>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => switchTab(tab.id)} disabled={importing}
              style={{
                padding: '7px 14px', border: 'none', background: 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '0.83rem',
                cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1, transition: 'all 0.15s',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Upload step ──────────────────────────────────── */}
        {step === 'upload' && (
          <>
            {/* Member selector or fixed label */}
            {(activeTab === 'zerodha' || activeTab === 'mf') && (
              memberFixed ? (
                <div style={{ marginBottom: 14, backgroundColor: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>
                    Importing holdings for: <strong>{member}</strong>
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    not you? switch member using the filter above
                  </p>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <span style={labelSt}>Whose holdings are these?</span>
                  <select value={member} onChange={e => setMember(e.target.value)} style={inp}>
                    {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )
            )}

            <div onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 14 }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>
                {activeTab === 'family' ? '📊' : activeTab === 'zerodha' ? '📈' : '📉'}
              </div>
              <p style={{ margin: '0 0 4px', fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                {activeTab === 'zerodha' ? 'Import Zerodha Holdings Statement (.xlsx)' : 'Click to select .xlsx file'}
              </p>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {activeTab === 'family'  && 'Family Finance Tracker workbook (.xlsx)'}
                {activeTab === 'zerodha' && 'Download from console.zerodha.com → Portfolio → Holdings'}
                {activeTab === 'mf'      && 'Zerodha Console → Reports → Holdings (.xlsx)'}
              </p>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {error && (
              <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--loss)', marginBottom: 12, whiteSpace: 'pre-line' }}>
                {error}
              </div>
            )}

            <div style={{ backgroundColor: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {activeTab === 'family' && (
                <><strong style={{ color: 'var(--text-secondary)' }}>Matches by Name + Member.</strong>{' '}
                Existing records are updated; new ones are added.</>
              )}
              {activeTab === 'zerodha' && (
                <><strong style={{ color: 'var(--text-secondary)' }}>Uses the Combined sheet.</strong>{' '}
                Reads both stocks and MFs. Holdings not present in the file are flagged as exited and removed unless you uncheck them.</>
              )}
              {activeTab === 'mf' && (
                <><strong style={{ color: 'var(--text-secondary)' }}>Columns used:</strong> Scheme Name, Units, Avg NAV, Current NAV.
                Matched by scheme name. Unmatched schemes are added with a <code style={{ fontFamily: 'monospace' }}>VERIFY_AMFI</code> flag.</>
              )}
            </div>
          </>
        )}

        {/* ── Review step ──────────────────────────────────── */}
        {step === 'review' && (
          <>
            {/* Statement date */}
            {activeTab === 'zerodha' && parsedB?.date && (
              <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Statement date: <strong style={{ color: 'var(--text-secondary)' }}>{parsedB.date}</strong>
              </p>
            )}

            {/* Total-mismatch warning */}
            {activeTab === 'zerodha' && parsedB?.warning && (
              <div style={{ backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)', borderRadius: 8, padding: '9px 12px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                ⚠ {parsedB.warning}
              </div>
            )}

            {/* ── Option A diff table ─────────────────────── */}
            {activeTab === 'family' && parsedA && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        {['Name', 'Member', 'Units', 'Buy Price', 'Action'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: i >= 2 && i <= 3 ? 'right' : i === 4 ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.7rem', position: 'sticky', top: 0, backgroundColor: 'var(--surface-2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedA.holdings.map((h, i) => {
                        const isNew = !storeInvestments.some(e =>
                          e.name.toLowerCase() === h.name.toLowerCase() && e.member.toLowerCase() === h.member.toLowerCase()
                        )
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 12px', fontWeight: 500, fontSize: '0.82rem' }}>{h.name}</td>
                            <td style={{ padding: '7px 12px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{firstName(h.member)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right' }}>{h.units}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right' }}>{formatINR(h.buyPrice)}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: isNew ? 'var(--gain-faint)' : 'var(--amber-faint)', color: isNew ? 'var(--gain)' : 'var(--amber)' }}>
                                {isNew ? 'New' : 'Update'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Option B: ADD / UPDATE / UNCHANGED table ─── */}
            {activeTab === 'zerodha' && parsedB && (
              <>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                          {['', 'Symbol', 'Kind', 'Units', 'Avg Price', 'Prev Close', 'Status'].map((h, i) => (
                            <th key={i} style={{ padding: '8px 10px', textAlign: i >= 3 && i <= 5 ? 'right' : i === 6 ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.7rem', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'var(--surface-2)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedB.rows.map((d, i) => {
                          const isSelected = selectedB.has(d.row.isin)
                          const badgeColor = d.action === 'ADD'
                            ? { bg: 'var(--gain-faint)', fg: 'var(--gain)' }
                            : d.action === 'UPDATE'
                            ? { bg: 'var(--amber-faint)', fg: 'var(--amber)' }
                            : { bg: 'var(--surface-2)', fg: 'var(--text-muted)' }
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: isSelected ? 1 : 0.45 }}>
                              <td style={{ padding: '7px 10px', width: 32 }}>
                                <input type="checkbox" checked={isSelected}
                                  onChange={() => setSelectedB(prev => {
                                    const next = new Set(prev)
                                    next.has(d.row.isin) ? next.delete(d.row.isin) : next.add(d.row.isin)
                                    return next
                                  })}
                                />
                              </td>
                              <td style={{ padding: '7px 10px' }}>
                                <p style={{ margin: 0, fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>
                                  {d.row.symbol}
                                </p>
                                {d.action === 'UPDATE' && d.existing && (
                                  <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    {Math.abs((d.existing.units ?? 0) - d.row.units) > 0.001 && (
                                      <span>Units: {d.existing.units} → <strong style={{ color: 'var(--amber)' }}>{d.row.units}</strong>{' '}</span>
                                    )}
                                    {Math.abs((d.existing.buyPrice ?? 0) - d.row.avgPrice) > 0.01 && (
                                      <span>Avg: {formatINR(d.existing.buyPrice)} → <strong style={{ color: 'var(--amber)' }}>{formatINR(d.row.avgPrice)}</strong></span>
                                    )}
                                  </p>
                                )}
                                {d.isMF && !d.amfiCode && (
                                  <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--amber)' }}>⚠ VERIFY_AMFI</p>
                                )}
                              </td>
                              <td style={{ padding: '7px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {d.isStock ? 'Stock' : d.type}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{d.row.units}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(d.row.avgPrice)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                {d.row.prevClose != null ? formatINR(d.row.prevClose) : '—'}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: badgeColor.bg, color: badgeColor.fg }}>
                                  {d.action}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-2)', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                    <button onClick={() => setSelectedB(new Set(parsedB.rows.map(d => d.row.isin)))}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>
                      Select all
                    </button>
                    <span>·</span>
                    <button onClick={() => setSelectedB(new Set(parsedB.rows.filter(d => d.action !== 'UNCHANGED').map(d => d.row.isin)))}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>
                      Changes only
                    </button>
                    <span>·</span>
                    <button onClick={() => setSelectedB(new Set())}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>
                      Deselect all
                    </button>
                  </div>
                </div>

                {/* ── EXITED section ─────────────────────── */}
                {parsedB.exited.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: '8px 8px 0 0', padding: '9px 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--loss)' }}>Not in latest statement ({parsedB.exited.length})</strong>
                      {' '}— These Zerodha holdings are missing from the uploaded file.
                      They will be <strong>removed</strong> if checked. Uncheck any you want to keep
                      (e.g. holdings in a different demat account).
                    </div>
                    <div style={{ border: '1px solid var(--loss)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <tbody>
                          {parsedB.exited.map(({ inv, lastValue }) => {
                            const checked = selectedExited.has(inv.id)
                            return (
                              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: checked ? 'var(--loss-faint)' : 'transparent', opacity: checked ? 1 : 0.5 }}>
                                <td style={{ padding: '7px 10px', width: 32 }}>
                                  <input type="checkbox" checked={checked}
                                    onChange={() => setSelectedExited(prev => {
                                      const next = new Set(prev)
                                      next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id)
                                      return next
                                    })}
                                  />
                                </td>
                                <td style={{ padding: '7px 10px' }}>
                                  <p style={{ margin: 0, fontWeight: 500, fontSize: '0.82rem' }}>{inv.name}</p>
                                  <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                    {inv.isMF ? `MF ${inv.mfCode || '—'}` : (inv.ticker || '—')}
                                  </p>
                                  <p style={{ margin: '3px 0 0', fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                                    Uncheck if this holding exists in another demat account
                                  </p>
                                </td>
                                <td style={{ padding: '7px 10px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {inv.isMF ? inv.type : 'Stock'}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: '0.82rem' }}>
                                  {inv.units} units
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                  {lastValue > 0 ? (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--loss)', fontWeight: 500 }}>
                                      {formatINR(lastValue)}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                      No price recorded
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: 'var(--loss-faint)', color: 'var(--loss)' }}>
                                    EXITED
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Live summary line ──────────────────── */}
                <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: b_add > 0 ? 'var(--gain)' : 'var(--text-muted)' }}>Adding {b_add}</strong>
                  {' · '}
                  <strong style={{ color: b_upd > 0 ? 'var(--amber)' : 'var(--text-muted)' }}>Updating {b_upd}</strong>
                  {' · '}
                  <strong style={{ color: b_rem > 0 ? 'var(--loss)' : 'var(--text-muted)' }}>Removing {b_rem}</strong>
                  {' · '}
                  <span style={{ color: 'var(--text-muted)' }}>No change to {b_unch}</span>
                </p>
              </>
            )}

            {/* ── Option C diff table ─────────────────────── */}
            {activeTab === 'mf' && parsedC && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        {['Scheme', 'Units', 'Avg NAV', 'Type', 'Action'].map((h, i) => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: i >= 1 && i <= 2 ? 'right' : i === 4 ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.7rem', position: 'sticky', top: 0, backgroundColor: 'var(--surface-2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedC.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 12px', maxWidth: 220 }}>
                            <p style={{ margin: 0, fontWeight: 500, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.row.schemeName}</p>
                            {!d.mfCode && <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: 'var(--amber)' }}>⚠ VERIFY_AMFI</p>}
                          </td>
                          <td style={{ padding: '7px 12px', textAlign: 'right' }}>{d.row.units.toFixed(3)}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right' }}>{formatINR(d.row.avgNAV)}</td>
                          <td style={{ padding: '7px 12px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{d.type}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: d.existing ? 'var(--amber-faint)' : 'var(--gain-faint)', color: d.existing ? 'var(--amber)' : 'var(--gain)' }}>
                              {d.existing ? 'Update' : 'New'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && (
              <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--loss)', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ backgroundColor: 'var(--accent-faint)', border: '1px solid var(--accent)', borderRadius: 8, padding: '9px 12px', marginBottom: 18, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              A net worth snapshot will be taken before the import.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleImport}
                disabled={importing || (activeTab === 'zerodha' && !hasWork)}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none', fontSize: '0.875rem', fontWeight: 500,
                  backgroundColor: (importing || (activeTab === 'zerodha' && !hasWork)) ? 'var(--text-muted)' : 'var(--accent)',
                  color: '#fff', cursor: (importing || (activeTab === 'zerodha' && !hasWork)) ? 'not-allowed' : 'pointer',
                }}
              >
                {importing ? 'Importing…' : activeTab === 'zerodha'
                  ? `Import (${b_add + b_upd} updates${b_rem > 0 ? `, ${b_rem} removed` : ''})`
                  : 'Import Now'}
              </button>
              <button onClick={reset} disabled={importing}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: importing ? 'not-allowed' : 'pointer' }}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
