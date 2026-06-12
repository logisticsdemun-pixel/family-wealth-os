'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { load, KEYS, applyImport } from '../lib/storage'
import { takeSnapshotFromStorage } from '../lib/snapshot'

// ── Helpers ────────────────────────────────────────────────
function norm(s) { return String(s || '').toLowerCase().replace(/[\s_\-\.]/g, '') }

function pick(row, ...candidates) {
  for (const c of candidates) {
    const k = norm(c)
    if (k in row) return row[k]
  }
  return undefined
}

function parseDate(val) {
  if (val == null || val === '') return ''
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400000))
    return d.toISOString().slice(0, 10)
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d) ? '' : d.toISOString().slice(0, 10)
}

function parseNum(val) {
  if (val == null || val === '') return null
  const n = parseFloat(String(val).replace(/[,₹\s]/g, ''))
  return isNaN(n) ? null : n
}

function findSheet(wb, ...names) {
  const keys = Object.keys(wb.Sheets)
  for (const name of names) {
    const match = keys.find(k => norm(k) === norm(name))
    if (match) return wb.Sheets[match]
  }
  return null
}

function sheetToRows(ws) {
  if (!ws) return []
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  if (raw.length < 2) return []
  const headers = raw[0].map(h => norm(h))
  return raw.slice(1)
    .filter(row => row.some(c => c !== '' && c != null))
    .map(row => {
      const obj = {}
      headers.forEach((h, i) => { if (h) obj[h] = row[i] })
      return obj
    })
}

// ── Sheet parsers ──────────────────────────────────────────
function parseInvestments(ws) {
  return sheetToRows(ws).map(row => {
    const type = String(pick(row, 'type', 'assettype', 'category') || 'Stock').trim()
    const isMF = /mutual|mf|etf|short/i.test(type)
    return {
      id: crypto.randomUUID(),
      name: String(pick(row, 'name', 'stockname', 'fundname', 'security') || '').trim(),
      member: String(pick(row, 'member', 'owner', 'person') || '').trim(),
      type, isMF,
      ticker: isMF ? null : (String(pick(row, 'ticker', 'symbol', 'nseticker') || '').trim() || null),
      mfCode: isMF ? (String(pick(row, 'mfcode', 'schemecode', 'amficode') || '').trim() || null) : null,
      units: parseNum(pick(row, 'units', 'quantity', 'shares')) ?? 0,
      buyPrice: parseNum(pick(row, 'buyprice', 'purchaseprice', 'avgprice', 'nav', 'costprice')) ?? 0,
      buyDate: parseDate(pick(row, 'buydate', 'purchasedate', 'date')),
      currentPrice: parseNum(pick(row, 'currentprice', 'marketprice', 'ltp', 'price')),
      flags: [],
    }
  }).filter(i => i.name && i.units > 0 && i.buyPrice > 0)
}

function parseFixedIncome(ws) {
  return sheetToRows(ws).map(row => ({
    id: crypto.randomUUID(),
    name: String(pick(row, 'name', 'fdname', 'scheme', 'bank') || '').trim(),
    member: String(pick(row, 'member', 'owner', 'person') || '').trim(),
    principal: parseNum(pick(row, 'principal', 'amount', 'investedamount')) ?? 0,
    rate: parseNum(pick(row, 'rate', 'interestrate', 'roi')) ?? 0,
    startDate: parseDate(pick(row, 'startdate', 'opendate', 'date')),
    maturityValue: parseNum(pick(row, 'maturityvalue', 'maturityamount', 'finalamount')),
    maturityDate: parseDate(pick(row, 'maturitydate', 'duedate', 'enddate')),
    flags: [],
  })).filter(i => i.name && i.principal > 0)
}

function parseGold(ws) {
  return sheetToRows(ws).map(row => ({
    id: crypto.randomUUID(),
    category: String(pick(row, 'category', 'type', 'goldtype') || 'Investment').trim(),
    name: String(pick(row, 'name', 'description', 'item') || 'Gold').trim(),
    member: String(pick(row, 'member', 'owner', 'person') || '').trim(),
    carat: String(pick(row, 'carat', 'purity', 'karat') || '24K').trim(),
    grams: parseNum(pick(row, 'grams', 'weight', 'quantity')) ?? 0,
    flags: [],
  })).filter(i => i.grams > 0)
}

function parseLoans(ws) {
  return sheetToRows(ws).map(row => ({
    id: crypto.randomUUID(),
    name: String(pick(row, 'name', 'loanname', 'bank', 'lender') || '').trim(),
    type: String(pick(row, 'type', 'loantype', 'category') || 'Home Loan').trim(),
    member: String(pick(row, 'member', 'owner', 'borrower') || '').trim(),
    principal: parseNum(pick(row, 'principal', 'loanamount', 'amount')) ?? 0,
    rate: parseNum(pick(row, 'rate', 'interestrate', 'roi')) ?? 0,
    emi: parseNum(pick(row, 'emi', 'monthlyemi', 'monthlypayment')) ?? 0,
    startDate: parseDate(pick(row, 'startdate', 'disbursaldate', 'date')),
    months: parseNum(pick(row, 'months', 'tenure', 'tenuremonths')),
    isShared: false, outstandingOverride: null,
  })).filter(i => i.name && i.principal > 0)
}

function parseInsurance(ws) {
  return sheetToRows(ws).map(row => ({
    id: crypto.randomUUID(),
    name: String(pick(row, 'name', 'policyname', 'insurer', 'company') || '').trim(),
    type: String(pick(row, 'type', 'policytype', 'category') || 'Term Life').trim(),
    member: String(pick(row, 'member', 'insured', 'owner') || '').trim(),
    sumAssured: parseNum(pick(row, 'sumassured', 'coveramount', 'coverage', 'suminsured')),
    premium: parseNum(pick(row, 'premium', 'annualpremium', 'yearlypremium')),
    renewalDate: parseDate(pick(row, 'renewaldate', 'duedate', 'expirydate', 'maturitydate')),
  })).filter(i => i.name)
}

function parseCash(ws) {
  return sheetToRows(ws).map(row => ({
    id: crypto.randomUUID(),
    name: String(pick(row, 'name', 'accountname', 'bank', 'description') || '').trim(),
    type: String(pick(row, 'type', 'accounttype', 'category') || 'Cash & Savings').trim(),
    member: String(pick(row, 'member', 'owner', 'person') || '').trim(),
    value: parseNum(pick(row, 'value', 'balance', 'amount', 'currentvalue')) ?? 0,
    isShared: false,
  })).filter(i => i.name && i.value > 0)
}

// ── Merge: upsert incoming into existing by key fields ─────
function mergeByKey(existing, incoming, keyFields) {
  const key = item => keyFields.map(k => String(item[k] || '').toLowerCase().trim()).join('|')
  const map = new Map(existing.map(e => [key(e), e]))
  incoming.forEach(item => {
    const k = key(item)
    map.set(k, map.has(k) ? { ...map.get(k), ...item, id: map.get(k).id } : item)
  })
  return [...map.values()]
}

// ── Diff computation ───────────────────────────────────────
function computeDiff(storageKey, incoming, keyFields) {
  const current = load(storageKey, []) || []
  const key = item => keyFields.map(k => String(item[k] || '').toLowerCase().trim()).join('|')
  const currentKeys = new Set(current.map(key))
  return {
    curr: current.length,
    added: incoming.filter(i => !currentKeys.has(key(i))).length,
    updated: incoming.filter(i => currentKeys.has(key(i))).length,
  }
}

// ── Template download ──────────────────────────────────────
function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  const sheets = {
    Investments: [['Name','Member','Type','Ticker','MFCode','Units','BuyPrice','BuyDate','CurrentPrice']],
    'Fixed Income': [['Name','Member','Principal','Rate','StartDate','MaturityValue','MaturityDate']],
    Gold: [['Category','Name','Member','Carat','Grams']],
    Loans: [['Name','Type','Member','Principal','Rate','EMI','StartDate','Months']],
    Insurance: [['Name','Type','Member','SumAssured','Premium','RenewalDate']],
    Cash: [['Name','Type','Member','Value']],
  }
  Object.entries(sheets).forEach(([name, data]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name)
  })
  XLSX.writeFile(wb, 'Family_Finance_Tracker_Template.xlsx')
}

// ── Main wizard component ──────────────────────────────────
export default function ExcelImportWizard({ onClose }) {
  const [step, setStep] = useState('upload')
  const [parsed, setParsed] = useState(null)
  const [diffs, setDiffs] = useState(null)
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  const SHEET_CONFIG = [
    { label: 'Investments', key: KEYS.INVESTMENTS, dataKey: 'investments', keyFields: ['name', 'member'] },
    { label: 'Fixed Income', key: KEYS.FIXED_INCOME, dataKey: 'fixedIncome', keyFields: ['name', 'member'] },
    { label: 'Gold', key: KEYS.GOLD, dataKey: 'gold', keyFields: ['name', 'member', 'carat'] },
    { label: 'Loans', key: KEYS.LOANS, dataKey: 'loans', keyFields: ['name', 'member'] },
    { label: 'Insurance', key: KEYS.INSURANCE, dataKey: 'insurance', keyFields: ['name', 'member'] },
    { label: 'Cash & Assets', key: KEYS.CASH_ASSETS, dataKey: 'cash', keyFields: ['name', 'member'] },
  ]

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })

      const result = {
        investments: parseInvestments(findSheet(wb, 'Investments', 'Equity', 'Portfolio', 'Stocks')),
        fixedIncome: parseFixedIncome(findSheet(wb, 'FixedIncome', 'Fixed Income', 'FD', 'Deposits', 'FDs')),
        gold: parseGold(findSheet(wb, 'Gold', 'Jewellery', 'GoldJewellery')),
        loans: parseLoans(findSheet(wb, 'Loans', 'Debt', 'Liabilities', 'Borrowings')),
        insurance: parseInsurance(findSheet(wb, 'Insurance', 'Policies', 'Coverage')),
        cash: parseCash(findSheet(wb, 'Cash', 'CashAssets', 'Savings', 'Banks', 'Accounts')),
      }

      const total = Object.values(result).reduce((s, arr) => s + arr.length, 0)
      if (total === 0) {
        setError('No data found. Check that your file has sheets named Investments, Gold, Loans, Fixed Income, Insurance, or Cash.')
        e.target.value = ''
        return
      }

      const d = {}
      SHEET_CONFIG.forEach(({ label, key, dataKey, keyFields }) => {
        d[label] = computeDiff(key, result[dataKey], keyFields)
      })

      setParsed(result)
      setDiffs(d)
      setStep('review')
    } catch {
      setError('Could not read the file. Please select a valid .xlsx file.')
    }
    e.target.value = ''
  }

  async function handleImport() {
    setImporting(true)
    takeSnapshotFromStorage()  // auto-snapshot before overwriting

    const toImport = {}
    SHEET_CONFIG.forEach(({ key, dataKey, keyFields }) => {
      const current = load(key, []) || []
      toImport[key] = mergeByKey(current, parsed[dataKey], keyFields)
    })

    await applyImport(toImport)
    window.location.reload()
  }

  const labelStyle = { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={importing ? undefined : onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 520,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px', maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
              {step === 'upload' ? 'Import from Excel' : 'Review Import'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {step === 'upload'
                ? 'Supports .xlsx files with named sheets'
                : 'Existing records will be updated; new ones will be added'
              }
            </p>
          </div>
          {!importing && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
          )}
        </div>

        {/* ── Upload step ──────────────────────────────────── */}
        {step === 'upload' && (
          <>
            <div style={{
              border: '2px dashed var(--border)', borderRadius: 12,
              padding: '32px', textAlign: 'center', marginBottom: 16,
              cursor: 'pointer', transition: 'border-color 0.15s',
            }} onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📊</div>
              <p style={{ margin: '0 0 4px', fontWeight: 500, color: 'var(--text-primary)' }}>Click to select an Excel file</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>.xlsx format — max 10MB</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {error && (
              <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.82rem', color: 'var(--loss)' }}>
                {error}
              </div>
            )}

            <div style={{ backgroundColor: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <span style={labelStyle}>Expected sheet names</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', marginTop: 6 }}>
                {['Investments', 'Fixed Income', 'Gold', 'Loans', 'Insurance', 'Cash'].map(s => (
                  <code key={s} style={{ fontSize: '0.78rem', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', color: 'var(--accent)' }}>{s}</code>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Column headers are matched by name (case-insensitive). Only sheets present in the file are imported.
              </p>
            </div>

            <button onClick={downloadTemplate} style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center' }}>
              ↓ Download blank template
            </button>
          </>
        )}

        {/* ── Review step ──────────────────────────────────── */}
        {step === 'review' && diffs && (
          <>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Sheet', 'Found', 'New', 'Updated'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SHEET_CONFIG.map(({ label, dataKey }) => {
                    const d = diffs[label]
                    const count = parsed[dataKey].length
                    if (count === 0) return null
                    return (
                      <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{label}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{count}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: d.added > 0 ? 600 : 400, color: d.added > 0 ? 'var(--gain)' : 'var(--text-muted)' }}>{d.added}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: d.updated > 0 ? 600 : 400, color: d.updated > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{d.updated}</td>
                      </tr>
                    )
                  }).filter(Boolean)}
                </tbody>
              </table>
            </div>

            <div style={{ backgroundColor: 'var(--accent-faint)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', marginBottom: 20, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              A net worth snapshot will be taken automatically before the import.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleImport}
                disabled={importing}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: importing ? 'var(--text-muted)' : 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: importing ? 'not-allowed' : 'pointer' }}
              >
                {importing ? 'Importing…' : 'Import Now'}
              </button>
              <button
                onClick={() => { setStep('upload'); setParsed(null); setDiffs(null) }}
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
