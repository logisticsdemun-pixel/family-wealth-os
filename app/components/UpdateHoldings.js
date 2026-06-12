'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { load, applyImport, KEYS } from '../lib/storage'
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

function deterministicId(member, ticker) {
  return `${slugify(member)}|${slugify(ticker)}|na`
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

// ── Option B: Zerodha Holdings ─────────────────────────────

function parseZerodhaHoldings(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const headerIdx = data.findIndex(row =>
    row.some(c => String(c).toLowerCase().includes('instrument') || String(c).toLowerCase().includes('tradingsymbol'))
  )
  if (headerIdx === -1) throw new Error('Column "Instrument" not found. Use the Holdings export from Zerodha Kite.')

  const headers = data[headerIdx].map(h => String(h).toLowerCase().trim())
  if (headers.some(h => h.includes('trade type'))) {
    throw new Error('This is a P&L report, not a Holdings export. Go to Zerodha Kite → Portfolio → Holdings → Download.')
  }

  const col = name => headers.findIndex(h => h.includes(name))
  const iInst = col('instrument'), iQty = col('qty'), iAvg = col('avg cost'), iLTP = col('ltp')
  if (iQty === -1) throw new Error('Column "Qty" not found.')
  if (iAvg === -1) throw new Error('Column "Avg cost" not found.')

  const rows = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const r = data[i]
    const instrument = String(r[iInst] ?? '').trim()
    if (!instrument || instrument.toLowerCase() === 'total' || /^-+$/.test(instrument)) continue
    const qty = parseNum(r[iQty]), avgCost = parseNum(r[iAvg])
    if (!qty || !avgCost || qty <= 0 || avgCost <= 0) continue
    const ltp = iLTP !== -1 ? parseNum(r[iLTP]) : null
    rows.push({ instrument: instrument.toUpperCase(), qty, avgCost, ltp: ltp && ltp > 0 ? ltp : null })
  }
  if (rows.length === 0) throw new Error('No valid holdings found in the file.')
  return rows
}

function buildZerodhaDiff(rows, member, existing) {
  return rows.map(row => {
    const detId = deterministicId(member, row.instrument)
    const match = existing.find(inv => {
      if (inv.isMF || inv.member !== member) return false
      if (inv.id === detId) return true
      const t = (inv.ticker || '').toUpperCase()
      return t === `${row.instrument}.NS` || t === `${row.instrument}.BO` || t === row.instrument
    })
    return { row, existing: match || null, detId }
  })
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

  if (iUnits === -1) throw new Error('Column "Units" not found.')
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
    return {
      row,
      existing: match || null,
      type: detectMFType(row.schemeName),
      mfCode: match?.mfCode || null,
    }
  })
}

// ── Main modal component ───────────────────────────────────

export default function UpdateHoldingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('family')
  const [step, setStep] = useState('upload')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [member, setMember] = useState(MEMBERS[0])

  // Per-option parsed state
  const [parsedA, setParsedA] = useState(null)  // { holdings, diff }
  const [parsedB, setParsedB] = useState(null)  // array of { row, existing, detId }
  const [selectedB, setSelectedB] = useState(new Set())
  const [parsedC, setParsedC] = useState(null)  // array of { row, existing, type, mfCode }

  const fileRef = useRef(null)

  function switchTab(tab) {
    setActiveTab(tab)
    setStep('upload')
    setError('')
    setParsedA(null)
    setParsedB(null)
    setParsedC(null)
    setSelectedB(new Set())
  }

  function reset() {
    setStep('upload')
    setError('')
    setParsedA(null)
    setParsedB(null)
    setParsedC(null)
    setSelectedB(new Set())
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (fileRef.current) fileRef.current.value = ''
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const existing = load(KEYS.INVESTMENTS, SEED_INVESTMENTS) || []

      if (activeTab === 'family') {
        const holdings = parseTrackerHoldings(wb)
        const diff = trackerDiff(holdings, existing)
        setParsedA({ holdings, diff })
      } else if (activeTab === 'zerodha') {
        const rows = parseZerodhaHoldings(wb)
        const diff = buildZerodhaDiff(rows, member, existing)
        setParsedB(diff)
        setSelectedB(new Set(diff.map(d => d.row.instrument)))
      } else {
        const rows = parseZerodhaMF(wb)
        const diff = buildMFDiff(rows, member, existing)
        setParsedC(diff)
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
      const existing = load(KEYS.INVESTMENTS, SEED_INVESTMENTS) || []

      if (activeTab === 'family') {
        const merged = mergeByKey(existing, parsedA.holdings)
        await applyImport({ [KEYS.INVESTMENTS]: merged })

      } else if (activeTab === 'zerodha') {
        const selected = parsedB.filter(d => selectedB.has(d.row.instrument))
        const updated = [...existing]
        const now = Date.now()
        const cache = { ...(load(KEYS.PRICE_CACHE, {}) || {}) }

        for (const { row, existing: match, detId } of selected) {
          if (match) {
            const idx = updated.findIndex(i => i.id === match.id)
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                units: row.qty,
                buyPrice: row.avgCost,
                currentPrice: row.ltp != null ? row.ltp : updated[idx].currentPrice,
                flags: row.ltp != null ? (updated[idx].flags || []).filter(f => f !== 'manual') : (updated[idx].flags || []),
              }
              if (row.ltp != null) cache[`stock:${updated[idx].ticker}`] = { fetchedAt: now, status: 'ok' }
            }
          } else {
            const ticker = `${row.instrument}.NS`
            updated.push({
              id: detId,
              name: row.instrument,
              ticker,
              member,
              type: 'Stock',
              isMF: false,
              mfCode: null,
              units: row.qty,
              buyPrice: row.avgCost,
              currentPrice: row.ltp,
              buyDate: '',
              flags: [],
            })
            if (row.ltp != null) cache[`stock:${ticker}`] = { fetchedAt: now, status: 'ok' }
          }
        }
        await applyImport({ [KEYS.INVESTMENTS]: updated, [KEYS.PRICE_CACHE]: cache })

      } else {
        // Option C — MF
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
              member,
              type,
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

      window.location.reload()
    } catch (err) {
      setError(err.message || 'Import failed.')
      setImporting(false)
    }
  }

  const TABS = [
    { id: 'family', label: 'Family Tracker' },
    { id: 'zerodha', label: 'Zerodha Holdings' },
    { id: 'mf', label: 'Zerodha MF' },
  ]

  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
  }
  const labelSt = { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

  // Computed summary for review header
  let reviewSubtitle = ''
  if (step === 'review') {
    if (activeTab === 'family' && parsedA) {
      reviewSubtitle = `${parsedA.holdings.length} holding${parsedA.holdings.length !== 1 ? 's' : ''} — ${parsedA.diff.toAdd} new, ${parsedA.diff.toUpdate} updated`
    } else if (activeTab === 'zerodha' && parsedB) {
      const total = parsedB.filter(d => selectedB.has(d.row.instrument)).length
      const newCount = parsedB.filter(d => selectedB.has(d.row.instrument) && !d.existing).length
      reviewSubtitle = `${total} selected — ${newCount} new, ${total - newCount} updated for ${firstName(member)}`
    } else if (activeTab === 'mf' && parsedC) {
      const unmatched = parsedC.filter(d => !d.mfCode).length
      reviewSubtitle = `${parsedC.length} scheme${parsedC.length !== 1 ? 's' : ''} for ${firstName(member)}${unmatched > 0 ? ` — ${unmatched} need AMFI code` : ''}`
    }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={importing ? undefined : onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 32px)', maxWidth: 620,
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
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              disabled={importing}
              style={{
                padding: '7px 14px', border: 'none', background: 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '0.83rem',
                cursor: 'pointer', borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1, transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Upload step ───────────────────────────────────── */}
        {step === 'upload' && (
          <>
            {/* Member selector (Options B and C) */}
            {(activeTab === 'zerodha' || activeTab === 'mf') && (
              <div style={{ marginBottom: 14 }}>
                <span style={labelSt}>Assign holdings to member</span>
                <select value={member} onChange={e => setMember(e.target.value)} style={inp}>
                  {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            {/* Drop zone */}
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 14 }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>
                {activeTab === 'family' ? '📊' : activeTab === 'zerodha' ? '📈' : '📉'}
              </div>
              <p style={{ margin: '0 0 4px', fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                Click to select .xlsx file
              </p>
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {activeTab === 'family' && 'Family Finance Tracker workbook (.xlsx)'}
                {activeTab === 'zerodha' && 'Zerodha Kite → Portfolio → Holdings → Download (.xlsx)'}
                {activeTab === 'mf' && 'Zerodha Console → Reports → Holdings (.xlsx)'}
              </p>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {error && (
              <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--loss)', marginBottom: 12 }}>
                {error}
              </div>
            )}

            {/* Instructions */}
            <div style={{ backgroundColor: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {activeTab === 'family' && (
                <>
                  <strong style={{ color: 'var(--text-secondary)' }}>Matches by Name + Member.</strong>{' '}
                  Existing records are updated; new ones are added. MFAPI codes and tickers from the sheet overwrite stored values.
                </>
              )}
              {activeTab === 'zerodha' && (
                <>
                  <strong style={{ color: 'var(--text-secondary)' }}>Columns used:</strong> Instrument, Qty, Avg cost, LTP.
                  Matched by ticker for {firstName(member)}. New tickers get a .NS suffix and a deterministic ID.
                  Deselect rows in the review step to skip them.
                </>
              )}
              {activeTab === 'mf' && (
                <>
                  <strong style={{ color: 'var(--text-secondary)' }}>Columns used:</strong> Scheme Name, Units, Avg NAV, Current NAV.
                  Matched by scheme name against existing holdings for {firstName(member)}.
                  Unmatched schemes are added with a <code style={{ fontFamily: 'monospace' }}>VERIFY_AMFI</code> flag — set the MFAPI code manually afterwards.
                </>
              )}
            </div>
          </>
        )}

        {/* ── Review step ───────────────────────────────────── */}
        {step === 'review' && (
          <>
            {/* Option A diff table */}
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
                        const isNew = !load(KEYS.INVESTMENTS, [])?.some(e =>
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

            {/* Option B diff table with checkboxes */}
            {activeTab === 'zerodha' && parsedB && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        {['', 'Instrument', 'Qty', 'Avg Cost', 'LTP', 'Action'].map((h, i) => (
                          <th key={i} style={{ padding: '8px 10px', textAlign: i >= 2 && i <= 4 ? 'right' : i === 5 ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.7rem', position: 'sticky', top: 0, backgroundColor: 'var(--surface-2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedB.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: selectedB.has(d.row.instrument) ? 1 : 0.4 }}>
                          <td style={{ padding: '7px 10px' }}>
                            <input
                              type="checkbox"
                              checked={selectedB.has(d.row.instrument)}
                              onChange={() => setSelectedB(prev => {
                                const next = new Set(prev)
                                next.has(d.row.instrument) ? next.delete(d.row.instrument) : next.add(d.row.instrument)
                                return next
                              })}
                            />
                          </td>
                          <td style={{ padding: '7px 10px', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.row.instrument}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{d.row.qty}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatINR(d.row.avgCost)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{d.row.ltp != null ? formatINR(d.row.ltp) : '—'}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: d.existing ? 'var(--amber-faint)' : 'var(--gain-faint)', color: d.existing ? 'var(--amber)' : 'var(--gain)' }}>
                              {d.existing ? 'Update' : 'New'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-2)', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                  <button onClick={() => setSelectedB(new Set(parsedB.map(d => d.row.instrument)))} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>Select all</button>
                  <span>·</span>
                  <button onClick={() => setSelectedB(new Set())} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>Deselect all</button>
                </div>
              </div>
            )}

            {/* Option C diff table */}
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
                            {!d.mfCode && (
                              <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: 'var(--amber)' }}>⚠ VERIFY_AMFI — set MFAPI code after import</p>
                            )}
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
                disabled={importing || (activeTab === 'zerodha' && selectedB.size === 0)}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: (importing || (activeTab === 'zerodha' && selectedB.size === 0)) ? 'var(--text-muted)' : 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: (importing || (activeTab === 'zerodha' && selectedB.size === 0)) ? 'not-allowed' : 'pointer' }}
              >
                {importing ? 'Importing…' : activeTab === 'zerodha' ? `Import Selected (${selectedB.size})` : 'Import Now'}
              </button>
              <button
                onClick={reset}
                disabled={importing}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: importing ? 'not-allowed' : 'pointer' }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
