'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { load, save, KEYS } from './lib/storage'
import { useStore } from './lib/store'
import { formatINR, formatPct, gainColor, firstName, MEMBERS, calculateCAGR, yearsElapsed } from './lib/format'
import { SEED_INVESTMENTS, SEED_FIXED_INCOME } from './lib/seedData'
import { takeSnapshotFromStorage } from './lib/snapshot'
import UpdateHoldingsModal from './components/UpdateHoldings'
import MetricCards from './components/MetricCards'
import PageLayout from './components/PageLayout'

const INV_TYPES = ['Stock', 'Mutual Fund', 'Short Term Fund', 'ETF', 'Fixed Income']

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}
const label = {
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)', margin: '0 0 4px', display: 'block',
}
const btnPrimary = { padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }
const btnGhost = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }
const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

// ── Price fetching via server-side API route (no CORS) ─────
async function fetchStockPrice(ticker) {
  try {
    const res = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`)
    const data = await res.json()
    return data.price ?? null
  } catch {
    return null
  }
}

async function fetchSingleMFNav(mfCode, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`/api/price?mf=${encodeURIComponent(mfCode)}`, {
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const nav = data.price
      if (!nav || nav <= 0 || isNaN(nav)) throw new Error(`Invalid NAV: ${nav}`)
      return nav
    } catch (e) {
      console.warn(`[MF] ${mfCode} attempt ${attempt}/${retries}: ${e.message}`)
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, attempt * 1000))
      }
    }
  }
  console.error(`[MF] All ${retries} attempts failed for ${mfCode}`)
  return null
}

function isNAVReasonable(newNAV, previousNAV, fundName) {
  if (!newNAV || newNAV <= 0 || isNaN(newNAV)) {
    console.warn(`[MF] Invalid NAV for ${fundName}: ${newNAV}`)
    return false
  }
  if (previousNAV && previousNAV > 0) {
    const changePct = Math.abs((newNAV - previousNAV) / previousNAV) * 100
    if (changePct > 20) {
      console.warn(
        `[MF] Suspicious NAV for ${fundName}: ₹${previousNAV} → ₹${newNAV} ` +
        `(${changePct.toFixed(1)}% change). Keeping previous.`
      )
      return false
    }
  }
  return true
}

// ── Summary cards ──────────────────────────────────────────
function SummaryCards({ items }) {
  const invested = items.reduce((s, i) => s + (i.units || 0) * (i.buyPrice || 0), 0)
  const current = items.reduce((s, i) => s + (i.units || 0) * (i.currentPrice || i.buyPrice || 0), 0)
  const gain = current - invested
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0

  return (
    <MetricCards cards={[
      {
        label: 'INVESTED',
        value: formatINR(invested),
        sub: null,
        valueColor: 'var(--color-text-primary)',
        subColor: null,
      },
      {
        label: 'CURRENT VALUE',
        value: formatINR(current),
        sub: null,
        valueColor: 'var(--color-accent)',
        subColor: null,
      },
      {
        label: 'GAIN / LOSS',
        value: (gain >= 0 ? '+' : '') + formatINR(gain),
        sub: (gainPct >= 0 ? '+' : '') + gainPct.toFixed(2) + '%',
        valueColor: gain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
        subColor: gain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
      },
    ]} />
  )
}

const PRICE_TTL_MS = 5 * 60 * 1000

function getCacheKey(inv) {
  return inv.isMF ? `mf:${inv.mfCode}` : `stock:${inv.ticker}`
}

function StatusDot({ fetching, cacheEntry }) {
  if (fetching) return (
    <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, flexShrink: 0 }}>↻</span>
  )
  let color = 'var(--text-muted)'
  if (cacheEntry) {
    if (cacheEntry.status === 'error') color = 'var(--loss)'
    else if (Date.now() - cacheEntry.fetchedAt < PRICE_TTL_MS) color = 'var(--gain)'
    else color = 'var(--amber)'
  }
  const title = !cacheEntry ? 'Never fetched'
    : cacheEntry.status === 'error' ? 'Last fetch failed'
    : Date.now() - cacheEntry.fetchedAt < PRICE_TTL_MS ? 'Price is fresh'
    : 'Price is stale'
  return (
    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} title={title} />
  )
}

// ── Investment table row ───────────────────────────────────
function InvRow({ inv, fetching, cacheEntry, onUpdate, onDelete, onSIPConfig, onAddInstalment }) {
  const [editMode, setEditMode] = useState(false)
  const [units, setUnits] = useState(String(inv.units))
  const [buyPrice, setBuyPrice] = useState(String(inv.buyPrice))
  const [manualMode, setManualMode] = useState(false)
  const [manualPrice, setManualPrice] = useState('')

  const invested = inv.units * inv.buyPrice
  const current = inv.currentPrice != null ? inv.units * inv.currentPrice : null
  const gain = current != null ? current - invested : null
  const gainPct = gain != null && invested > 0 ? (gain / invested) * 100 : null
  const years = yearsElapsed(inv.buyDate)
  const cagr = current != null && years ? calculateCAGR(invested, current, years) : null

  function saveEdit() {
    onUpdate({ ...inv, units: parseFloat(units) || inv.units, buyPrice: parseFloat(buyPrice) || inv.buyPrice })
    setEditMode(false)
  }

  function saveManual() {
    const p = parseFloat(manualPrice)
    if (p > 0) onUpdate({ ...inv, currentPrice: p, flags: [...(inv.flags || []).filter(f => f !== 'manual'), 'manual'] })
    setManualMode(false)
    setManualPrice('')
  }

  const td = (content, align = 'left', style = {}) => (
    <td style={{ padding: '12px', textAlign: align, verticalAlign: 'middle', ...style }}>
      {content}
    </td>
  )

  const identifier = inv.isMF ? `MF ${inv.mfCode}` : inv.ticker

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {td(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot fetching={fetching} cacheEntry={cacheEntry} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>{inv.name}</p>
              {inv.isMF && (() => {
                const mode = inv.investmentMode || 'lumpsum'
                if (mode === 'sip') {
                  const freq = inv.sip?.frequency
                  const freqLabel = freq ? ` · ${freq.charAt(0).toUpperCase() + freq.slice(1)}` : ''
                  const effective = inv.sip ? getCurrentSIPAmount(inv.sip) : null
                  const base = inv.sip?.monthlyAmount || inv.sip?.amount || 0
                  return <>
                    <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, backgroundColor: 'var(--accent-faint)', color: 'var(--accent)', fontWeight: 700 }}>SIP{freqLabel}</span>
                    {inv.sip?.hasStepUp && (
                      <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: 'var(--color-positive-bg)', color: 'var(--color-positive)', fontWeight: 600 }}>
                        +{inv.sip.stepUpPct}% p.a.
                      </span>
                    )}
                    {inv.sip?.hasStepUp && effective !== base && (
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                        {formatINR(effective)}/mo
                      </span>
                    )}
                  </>
                }
                return <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 500 }}>Lumpsum</span>
              })()}
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{identifier}</p>
            {inv.investmentMode === 'sip' && inv.sip?.startDate && (
              <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Next: {fmtShortDate(nextSIPDate(inv.sip))}
              </p>
            )}
          </div>
        </div>
      )}
      {td(<span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{firstName(inv.member)}</span>)}
      {td(
        editMode ? (
          <input
            type="number"
            value={units}
            onChange={e => setUnits(e.target.value)}
            style={{ ...inp, marginBottom: 0, width: 80, textAlign: 'right' }}
          />
        ) : (
          <span style={{ fontSize: '0.875rem' }}>{inv.units}</span>
        )
      )}
      {td(
        editMode ? (
          <input
            type="number"
            value={buyPrice}
            onChange={e => setBuyPrice(e.target.value)}
            style={{ ...inp, marginBottom: 0, width: 90, textAlign: 'right' }}
          />
        ) : (
          <span style={{ fontSize: '0.875rem' }}>{formatINR(inv.buyPrice)}</span>
        ),
        'right'
      )}
      {td(formatINR(invested), 'right')}
      {td(
        current != null ? (
          <div>
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{formatINR(current)}</span>
            {(inv.flags || []).includes('manual') && (
              <span style={{ fontSize: '0.65rem', marginLeft: 4, color: 'var(--text-muted)' }}>manual</span>
            )}
          </div>
        ) : fetching ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span>
        ) : manualMode ? (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <input
              type="number"
              step="any"
              value={manualPrice}
              onChange={e => setManualPrice(e.target.value)}
              placeholder="Price"
              autoFocus
              style={{ ...inp, marginBottom: 0, width: 80, textAlign: 'right' }}
            />
            <button onClick={saveManual} style={{ ...btnPrimary, padding: '4px 8px', fontSize: '0.72rem' }}>✓</button>
            <button onClick={() => setManualMode(false)} style={{ ...btnGhost, padding: '4px 8px', fontSize: '0.72rem' }}>✕</button>
          </div>
        ) : (
          <button
            onClick={() => setManualMode(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}
          >
            + set price
          </button>
        ),
        'right'
      )}
      {td(
        gain != null ? (
          <div>
            <span style={{ color: gainColor(gain), fontWeight: 500 }}>
              {formatINR(gain)}
              <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>{formatPct(gainPct)}</span>
            </span>
            {cagr != null && (
              <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                CAGR {formatPct(cagr, 1)}
              </p>
            )}
          </div>
        ) : '—',
        'right'
      )}
      {td(
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {editMode ? (
            <>
              <button onClick={saveEdit} style={{ ...btnPrimary, padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
              <button onClick={() => setEditMode(false)} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.78rem' }}>✕</button>
            </>
          ) : (
            <>
              {inv.isMF && (
                <button onClick={() => onSIPConfig?.()} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', padding: '4px 6px' }} title="SIP / Lumpsum settings">
                  ⚙
                </button>
              )}
              {inv.investmentMode === 'sip' && (
                <button onClick={() => onAddInstalment?.()} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.72rem', padding: '4px 6px' }} title="Record SIP instalment">
                  +inst
                </button>
              )}
              <button onClick={() => setEditMode(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', padding: '4px 6px' }}>Edit</button>
              <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: '0.78rem', padding: '4px 6px' }}>✕</button>
            </>
          )}
        </div>,
        'right'
      )}
    </tr>
  )
}

// ── SIP helpers ────────────────────────────────────────────
function nextSIPDate(sip) {
  if (!sip?.startDate) return null
  const freq = sip.frequency || 'Monthly'
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (freq === 'Monthly') {
    const dayOfMonth = sip.dayOfMonth || new Date(sip.startDate).getDate()
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
    return (thisMonth < today
      ? new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth)
      : thisMonth
    ).toISOString().split('T')[0]
  }

  if (freq === 'Daily') {
    const next = new Date(today)
    next.setDate(next.getDate() + 1)
    return next.toISOString().split('T')[0]
  }

  if (freq === 'Weekly' || freq === 'Fortnightly') {
    const days = freq === 'Weekly' ? 7 : 14
    let next = new Date(sip.startDate)
    while (next <= today) next = new Date(next.getTime() + days * 86400000)
    return next.toISOString().split('T')[0]
  }

  if (freq === 'Quarterly') {
    let next = new Date(sip.startDate)
    while (next <= today) next.setMonth(next.getMonth() + 3)
    return next.toISOString().split('T')[0]
  }

  return null
}

function fmtShortDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`
}

// Current effective SIP amount accounting for annual step-up compounding
function getCurrentSIPAmount(sip) {
  const base = sip.monthlyAmount || sip.amount || sip.sipAmount || 0
  if (!sip.hasStepUp || !sip.stepUpPct || !sip.startDate) return base
  const start = new Date(sip.startDate)
  const yearsElapsed = Math.floor((Date.now() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  if (yearsElapsed <= 0) return base
  return Math.round(base * Math.pow(1 + sip.stepUpPct / 100, yearsElapsed))
}

// Convert SIP amount to monthly equivalent based on frequency
function getMonthlyAmount(sip) {
  const amount = getCurrentSIPAmount(sip)
  const frequency = (sip.frequency || 'Monthly').toLowerCase()
  switch (frequency) {
    case 'weekly':      return amount * 4
    case 'fortnightly': return amount * 2
    case 'quarterly':   return amount / 3
    case 'daily':       return amount * 30
    default:            return amount
  }
}

// ── SIP instalment modal ───────────────────────────────────
function SIPInstalmentModal({ inv, onConfirm, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [amount, setAmount] = useState(String(inv.sip?.monthlyAmount || ''))
  const [fetching, setFetching] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleFetchNav() {
    if (!date || !amount || !inv.mfCode) return
    setFetching(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/price?mf=${encodeURIComponent(inv.mfCode)}&date=${date}`)
      const data = await res.json()
      if (!data.nav) throw new Error(data.error || 'NAV not found for this date')
      const units = parseFloat(amount) / data.nav
      setResult({ nav: data.nav, date: data.date || date, units })
    } catch (e) {
      setError(e.message)
    } finally {
      setFetching(false)
    }
  }

  function handleConfirm() {
    if (!result) return
    const newUnits = parseFloat(amount) / result.nav
    const totalUnits = (inv.units || 0) + newUnits
    const totalCost = (inv.units || 0) * (inv.buyPrice || 0) + parseFloat(amount)
    const newAvgNav = totalCost / totalUnits
    onConfirm({
      ...inv,
      units: totalUnits,
      buyPrice: newAvgNav,
      sip: {
        ...inv.sip,
        instalments: [...(inv.sip?.instalments || []), {
          date: result.date, amount: parseFloat(amount), nav: result.nav, units: newUnits,
        }],
      },
    })
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={onCancel} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 420,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Add SIP Instalment</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{inv.name}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <span style={label}>Instalment Date</span>
            <input type="date" style={inp} value={date} onChange={e => { setDate(e.target.value); setResult(null) }} />
          </div>
          <div>
            <span style={label}>Amount (₹)</span>
            <input type="number" style={inp} placeholder={inv.sip?.monthlyAmount || '0'} value={amount} onChange={e => { setAmount(e.target.value); setResult(null) }} />
          </div>
        </div>

        {!result && (
          <button
            onClick={handleFetchNav}
            disabled={fetching || !date || !amount}
            style={{ ...btnGhost, width: '100%', marginBottom: 12, color: 'var(--accent)' }}
          >
            {fetching ? 'Fetching NAV…' : 'Look up NAV for Date →'}
          </button>
        )}

        {error && <p style={{ color: 'var(--loss)', fontSize: '0.8rem', margin: '0 0 12px' }}>{error}</p>}

        {result && (
          <div style={{ backgroundColor: 'var(--accent-faint)', border: '1px solid var(--accent)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><p style={label}>NAV (₹)</p><p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{result.nav.toFixed(4)}</p></div>
            <div><p style={label}>Units</p><p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{result.units.toFixed(4)}</p></div>
            <div><p style={label}>Date Used</p><p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{result.date}</p></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleConfirm} disabled={!result} style={{ ...btnPrimary, opacity: result ? 1 : 0.5, cursor: result ? 'pointer' : 'not-allowed' }}>
            Confirm Instalment
          </button>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </>
  )
}

// ── SIP configure modal ────────────────────────────────────
const FREQUENCIES = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly']
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const STARTING_MONTHS = ['Jan', 'Apr', 'Jul', 'Oct']

function SIPConfigModal({ inv, onSave, onCancel }) {
  const sipData = inv.sip || {}
  const [form, setForm] = useState({
    investmentMode: inv.investmentMode || 'lumpsum',
    amount: sipData.monthlyAmount ?? '',
    startDate: sipData.startDate ?? '',
    frequency: sipData.frequency || 'Monthly',
    dayOfMonth: sipData.dayOfMonth ?? (sipData.startDate ? new Date(sipData.startDate).getDate() : 1),
    dayOfWeek: sipData.dayOfWeek ?? 'Monday',
    startingMonth: sipData.startingMonth ?? 'Jan',
    status: sipData.status || 'Active',
    hasStepUp: sipData.hasStepUp || false,
    stepUpPct: sipData.stepUpPct || 10,
    instalmentDate: sipData.instalmentDate ?? '',
  })
  const instalments = sipData.instalments || []
  const isSIP = form.investmentMode === 'sip'

  const nextDate = isSIP && form.startDate
    ? nextSIPDate({ ...form, monthlyAmount: parseFloat(form.amount) || 0 })
    : null

  function handleSave() {
    onSave({
      ...inv,
      investmentMode: form.investmentMode,
      sip: isSIP ? {
        ...sipData,
        monthlyAmount: parseFloat(form.amount) || 0,
        startDate: form.startDate,
        frequency: form.frequency,
        dayOfMonth: parseInt(form.dayOfMonth) || 1,
        dayOfWeek: form.dayOfWeek,
        startingMonth: form.startingMonth,
        status: form.status,
        instalments: sipData.instalments || [],
        hasStepUp: form.hasStepUp || false,
        stepUpPct: form.hasStepUp ? (parseFloat(form.stepUpPct) || 10) : 0,
        instalmentDate: form.instalmentDate ? parseInt(form.instalmentDate) : null,
        lastAllotmentDate: sipData.lastAllotmentDate || null,
        allotmentHistory: sipData.allotmentHistory || [],
      } : inv.sip,
    })
  }

  const sectionHead = {
    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--text-muted)',
    margin: '0 0 12px', paddingBottom: 6, borderBottom: '1px solid var(--border)',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={onCancel} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 520,
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>SIP Configuration</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{inv.name}</p>

        {/* ── Mode toggle ── */}
        <div style={{ marginBottom: 16 }}>
          <span style={label}>Investment Mode</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {['lumpsum', 'sip'].map(mode => (
              <button key={mode} type="button" onClick={() => setForm({ ...form, investmentMode: mode })} style={{
                flex: 1, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${form.investmentMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                backgroundColor: form.investmentMode === mode ? 'var(--accent-faint)' : 'transparent',
                color: form.investmentMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: form.investmentMode === mode ? 600 : 400, fontSize: '0.875rem',
              }}>
                {mode === 'lumpsum' ? 'Lumpsum' : 'SIP'}
              </button>
            ))}
          </div>
        </div>

        {/* ── SIP Schedule ── */}
        {isSIP && (
          <>
            <p style={sectionHead}>SIP Schedule</p>

            <div style={{ marginBottom: 12 }}>
              <span style={label}>Frequency</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FREQUENCIES.map(f => (
                  <button key={f} type="button" onClick={() => setForm({ ...form, frequency: f })} style={{
                    padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem',
                    border: `1.5px solid ${form.frequency === f ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: form.frequency === f ? 'var(--accent-faint)' : 'transparent',
                    color: form.frequency === f ? 'var(--accent)' : 'var(--text-secondary)',
                    fontWeight: form.frequency === f ? 600 : 400,
                  }}>{f}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <span style={label}>SIP Amount (₹)</span>
                <input type="number" style={inp} placeholder="e.g. 5000" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <span style={label}>First SIP Date</span>
                <input type="date" style={inp} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
            </div>

            {form.frequency === 'Weekly' && (
              <div style={{ marginBottom: 12 }}>
                <span style={label}>Day of Week</span>
                <select style={inp} value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })}>
                  {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            )}

            {(form.frequency === 'Monthly' || form.frequency === 'Quarterly') && (
              <div style={{ display: 'grid', gridTemplateColumns: form.frequency === 'Quarterly' ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <span style={label}>Day of Month (1–28)</span>
                  <input type="number" min={1} max={28} style={inp} value={form.dayOfMonth} onChange={e => setForm({ ...form, dayOfMonth: e.target.value })} />
                  {parseInt(form.dayOfMonth) > 28 && (
                    <p style={{ margin: '-6px 0 6px', fontSize: '0.7rem', color: 'var(--amber)' }}>
                      Day &gt;28 will be capped at month-end for short months.
                    </p>
                  )}
                </div>
                {form.frequency === 'Quarterly' && (
                  <div>
                    <span style={label}>Starting Month</span>
                    <select style={inp} value={form.startingMonth} onChange={e => setForm({ ...form, startingMonth: e.target.value })}>
                      {STARTING_MONTHS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <span style={label}>Status</span>
                <select style={inp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {['Active', 'Paused', 'Completed'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              {nextDate && (
                <div>
                  <span style={label}>Next Instalment</span>
                  <p style={{ margin: '4px 0 10px', fontSize: '0.875rem', color: 'var(--accent)', fontWeight: 600 }}>
                    {new Date(nextDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>

            {/* Step-up toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <input
                type="checkbox"
                id="hasStepUp"
                checked={form.hasStepUp || false}
                onChange={e => setForm({ ...form, hasStepUp: e.target.checked, stepUpPct: e.target.checked ? (form.stepUpPct || 10) : 0 })}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="hasStepUp" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', flex: 1 }}>
                Step-up SIP (increase amount annually)
              </label>
            </div>

            {form.hasStepUp && (
              <div style={{ marginBottom: 12 }}>
                <span style={label}>Annual step-up percentage</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min="1" max="50"
                    value={form.stepUpPct || 10}
                    onChange={e => setForm({ ...form, stepUpPct: parseFloat(e.target.value) || 10 })}
                    style={{ ...inp, marginBottom: 0, width: 80, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>% per year</span>
                  {form.startDate && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      · First step-up:{' '}
                      {new Date(new Date(form.startDate).setFullYear(new Date(form.startDate).getFullYear() + 1))
                        .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                {form.amount && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Current effective: {formatINR(getCurrentSIPAmount({ ...form, monthlyAmount: parseFloat(form.amount) || 0, startDate: form.startDate }))}
                  </p>
                )}
              </div>
            )}

            {/* Instalment date for auto-allotment */}
            <div style={{ marginBottom: 16 }}>
              <span style={label}>Instalment Date (day of month)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  value={form.instalmentDate}
                  onChange={e => setForm({ ...form, instalmentDate: e.target.value })}
                  style={{ ...inp, marginBottom: 0, width: 100 }}
                >
                  <option value="">— none —</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Units allotted T+1 business day after this date
                </span>
              </div>
              {sipData.lastAllotmentDate && (
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Last allotment: {sipData.lastAllotmentDate}
                  {sipData.allotmentHistory?.length > 0 && ` · ${sipData.allotmentHistory.length} allotment(s) recorded`}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Instalment / allotment history ── */}
        {(instalments.length > 0 || (sipData.allotmentHistory || []).length > 0) && (() => {
          const autoHistory = sipData.allotmentHistory || []
          const allRows = [
            ...instalments.map(r => ({ ...r, _type: 'manual' })),
            ...autoHistory.map(r => ({ ...r, _type: 'auto' })),
          ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          return (
            <div style={{ marginBottom: 16 }}>
              <p style={{ ...label, marginBottom: 8 }}>History ({allRows.length})</p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      {['Date', 'Amount', 'NAV', 'Units', ''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Date' || h === '' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.7rem' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map((inst, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px' }}>{inst.date}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{formatINR(inst.amount)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{inst.nav != null ? inst.nav.toFixed(4) : '—'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{inst.units > 0 ? inst.units.toFixed(4) : '—'}</td>
                        <td style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {inst._type === 'auto' ? 'auto' : ''}
                          {inst.note ? ` · ${inst.note}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} style={btnPrimary}>Save</button>
          <button onClick={onCancel} style={btnGhost}>Cancel</button>
        </div>
      </div>
    </>
  )
}

// ── Add investment form ────────────────────────────────────
function AddInvForm({ onAdd, onCancel, activeMember = 'All' }) {
  const [form, setForm] = useState({
    member: activeMember !== 'All' ? activeMember : MEMBERS[0],
    type: 'Stock', name: '', ticker: '', mfCode: '',
    units: '', buyPrice: '', buyDate: '', investmentMode: 'lumpsum',
    sipMonthlyAmount: '', sipStartDate: '',
  })

  const isMF = form.type === 'Mutual Fund' || form.type === 'Short Term Fund' || form.type === 'ETF'

  function handleSubmit(e) {
    e.preventDefault()
    const isSIP = isMF && form.investmentMode === 'sip'
    onAdd({
      ...form,
      id: crypto.randomUUID(),
      isMF,
      ticker: isMF ? null : form.ticker || null,
      mfCode: isMF ? form.mfCode || null : null,
      units: parseFloat(form.units),
      buyPrice: parseFloat(form.buyPrice),
      currentPrice: null,
      flags: [],
      investmentMode: isMF ? form.investmentMode : undefined,
      sip: isSIP ? {
        monthlyAmount: parseFloat(form.sipMonthlyAmount) || 0,
        startDate: form.sipStartDate || '',
        frequency: 'monthly',
        instalments: [],
      } : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 20, marginTop: 16 }}>
      <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>ADD INVESTMENT</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {activeMember === 'All' && (
          <div>
            <span style={label}>Member</span>
            <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
              {MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div>
          <span style={label}>Type</span>
          <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {INV_TYPES.filter(t => t !== 'Fixed Income').map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>Name</span>
          <input required style={inp} placeholder="Fund / company name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span style={label}>{isMF ? 'MFAPI Scheme Code' : 'Yahoo Ticker'}</span>
          {isMF ? (
            <input required style={inp} placeholder="e.g. 120503" value={form.mfCode} onChange={e => setForm({ ...form, mfCode: e.target.value })} />
          ) : (
            <input required style={inp} placeholder="e.g. RELIANCE.NS" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value })} />
          )}
        </div>
        <div>
          <span style={label}>Units</span>
          <input required type="number" step="any" style={inp} placeholder="0" value={form.units} onChange={e => setForm({ ...form, units: e.target.value })} />
        </div>
        <div>
          <span style={label}>Buy Price / NAV (₹)</span>
          <input required type="number" step="any" style={inp} placeholder="0" value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
        </div>
        <div>
          <span style={label}>Buy Date (optional — for CAGR)</span>
          <input type="date" style={inp} value={form.buyDate} onChange={e => setForm({ ...form, buyDate: e.target.value })} />
        </div>
        {isMF && (
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={label}>Investment Mode</span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {['lumpsum', 'sip'].map(mode => (
                <button key={mode} type="button" onClick={() => setForm({ ...form, investmentMode: mode })} style={{
                  flex: 1, padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${form.investmentMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                  backgroundColor: form.investmentMode === mode ? 'var(--accent-faint)' : 'transparent',
                  color: form.investmentMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: form.investmentMode === mode ? 600 : 400, fontSize: '0.82rem',
                }}>
                  {mode === 'lumpsum' ? 'Lumpsum' : 'SIP'}
                </button>
              ))}
            </div>
          </div>
        )}
        {isMF && form.investmentMode === 'sip' && (
          <>
            <div>
              <span style={label}>Monthly SIP Amount (₹)</span>
              <input type="number" style={inp} placeholder="e.g. 5000" value={form.sipMonthlyAmount} onChange={e => setForm({ ...form, sipMonthlyAmount: e.target.value })} />
            </div>
            <div>
              <span style={label}>SIP Start Date</span>
              <input type="date" style={inp} value={form.sipStartDate} onChange={e => setForm({ ...form, sipStartDate: e.target.value })} />
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" style={btnPrimary}>Add Investment</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Fixed Income section ───────────────────────────────────
function AddFDForm({ onAdd, onCancel, activeMember = 'All' }) {
  const [form, setForm] = useState({ member: activeMember !== 'All' ? activeMember : MEMBERS[0], name: '', principal: '', rate: '', startDate: '', maturityValue: '', maturityDate: '' })

  function handleSubmit(e) {
    e.preventDefault()
    onAdd({ ...form, id: crypto.randomUUID(), flags: [], principal: parseFloat(form.principal), rate: parseFloat(form.rate), maturityValue: parseFloat(form.maturityValue) || null })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 20, marginTop: 16 }}>
      <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>ADD FIXED INCOME</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {activeMember === 'All' && (
          <div>
            <span style={label}>Member</span>
            <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
              {MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div>
          <span style={label}>Name</span>
          <input required style={inp} placeholder="e.g. HDFC FD" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span style={label}>Principal (₹)</span>
          <input required type="number" style={inp} value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
        </div>
        <div>
          <span style={label}>Rate (%)</span>
          <input required type="number" step="0.01" style={inp} value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
        </div>
        <div>
          <span style={label}>Start Date</span>
          <input type="date" style={inp} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
        </div>
        <div>
          <span style={label}>Maturity Value (₹)</span>
          <input type="number" style={inp} value={form.maturityValue} onChange={e => setForm({ ...form, maturityValue: e.target.value })} />
        </div>
        <div>
          <span style={label}>Maturity Date</span>
          <input type="date" style={inp} value={form.maturityDate} onChange={e => setForm({ ...form, maturityDate: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" style={btnPrimary}>Add</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Main Investments component ─────────────────────────────
const UNPRICED_BANNER_KEY = 'fwos-unpriced-dismissed'

export default function Investments({ activeMember }) {
  const { data, set, flush } = useStore()
  const storeSetRef = useRef(null)
  storeSetRef.current = set

  const investments = data?.investments ?? []
  const fixedIncome = data?.fixedIncome ?? []
  const priceCache = data?.priceCache ?? {}

  const [fetchingIds, setFetchingIds] = useState(new Set())
  const [lastUpdated, setLastUpdated] = useState(() => load(KEYS.PRICE_UPDATED, null))
  const [refreshStatus, setRefreshStatus] = useState(null) // { updated, failed, warn }
  const [subTab, setSubTab] = useState('all')
  const [showAddInv, setShowAddInv] = useState(false)
  const [showAddFD, setShowAddFD] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem(UNPRICED_BANNER_KEY) === '1'
  )
  const [showUpdateHoldings, setShowUpdateHoldings] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [sipModal, setSipModal] = useState(null)

  function dismissBanner() {
    setBannerDismissed(true)
    sessionStorage.setItem(UNPRICED_BANNER_KEY, '1')
  }

  function saveInv(updated) { set(KEYS.INVESTMENTS, updated) }
  function saveFD(updated) { set(KEYS.FIXED_INCOME, updated) }

  const refreshPrices = useCallback(async (forceAll = false) => {
    const snapshot = load(KEYS.INVESTMENTS, SEED_INVESTMENTS)
    const cache = { ...load(KEYS.PRICE_CACHE, {}) }
    const map = new Map(snapshot.map(inv => [inv.id, { ...inv }]))
    const now = Date.now()

    const toFetch = forceAll
      ? snapshot
      : snapshot.filter(inv => {
          const entry = cache[getCacheKey(inv)]
          return !entry || entry.status === 'error' || (now - entry.fetchedAt) >= PRICE_TTL_MS
        })

    if (toFetch.length === 0) return

    // ── MF: deduplicate, fetch sequentially, validate ────────
    const mfToFetch = toFetch.filter(inv => inv.isMF && inv.mfCode)
    const uniqueMFCodes = [...new Set(mfToFetch.map(inv => inv.mfCode))]

    setFetchingIds(new Set(mfToFetch.map(inv => inv.id)))

    const navMap = {}
    const mfUpdated = []
    const mfFailed = []

    for (const code of uniqueMFCodes) {
      const representative = mfToFetch.find(inv => inv.mfCode === code)
      const fundName = representative?.name || code
      const previousNAV = representative?.currentPrice || 0

      console.log(`[MF] Fetching ${fundName} (${code})…`)
      const newNAV = await fetchSingleMFNav(code)

      if (newNAV && isNAVReasonable(newNAV, previousNAV, fundName)) {
        navMap[code] = newNAV
        mfUpdated.push({ code, fundName, nav: newNAV })
        console.log(`[MF] ✓ ${fundName}: ₹${newNAV}`)
        cache[`mf:${code}`] = { fetchedAt: now, status: 'ok' }
      } else {
        mfFailed.push({ code, fundName, previousNAV })
        console.warn(`[MF] ✗ ${fundName}: keeping ₹${previousNAV}`)
        cache[`mf:${code}`] = { fetchedAt: cache[`mf:${code}`]?.fetchedAt ?? 0, status: 'error' }
      }

      await new Promise(r => setTimeout(r, 400))
    }

    // Apply validated NAVs to every holding with that mfCode
    for (const inv of snapshot) {
      if (!inv.isMF || !inv.mfCode) continue
      const entry = map.get(inv.id)
      const nav = navMap[inv.mfCode]
      if (nav) {
        entry.currentPrice = nav
        entry.flags = (entry.flags || []).filter(f => f !== 'manual')
      }
    }

    // ── Stocks: parallel fetch (unchanged behaviour) ─────────
    const stocksToFetch = toFetch.filter(inv => !inv.isMF && inv.ticker)
    const BATCH_SIZE = 5

    for (let i = 0; i < stocksToFetch.length; i += BATCH_SIZE) {
      const batch = stocksToFetch.slice(i, i + BATCH_SIZE)
      setFetchingIds(new Set(batch.map(b => b.id)))

      await Promise.all(batch.map(async inv => {
        const key = getCacheKey(inv)
        const price = await fetchStockPrice(inv.ticker)
        if (price != null) {
          const entry = map.get(inv.id)
          entry.currentPrice = price
          entry.flags = (entry.flags || []).filter(f => f !== 'manual')
          cache[key] = { fetchedAt: now, status: 'ok' }
        } else {
          cache[key] = { fetchedAt: cache[key]?.fetchedAt ?? 0, status: 'error' }
        }
      }))

      if (i + BATCH_SIZE < stocksToFetch.length) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    const partial = snapshot.map(inv => map.get(inv.id))
    storeSetRef.current(KEYS.INVESTMENTS, partial)
    storeSetRef.current(KEYS.PRICE_CACHE, cache)

    setFetchingIds(new Set())
    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    setLastUpdated(ts)
    save(KEYS.PRICE_UPDATED, ts)
    takeSnapshotFromStorage()

    if (uniqueMFCodes.length > 0) {
      setRefreshStatus({
        updated: mfUpdated.length,
        failed: mfFailed.length,
        warn: mfFailed.length > 0,
      })
      setTimeout(() => setRefreshStatus(null), 8000)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh on mount and every 15 minutes
  useEffect(() => {
    refreshPrices()
    const interval = setInterval(() => refreshPrices(), 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh when tab becomes visible again (if >15 min since last update)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const stored = load(KEYS.PRICE_UPDATED, null)
        const fifteenMins = 15 * 60 * 1000
        if (!stored || Date.now() - new Date(stored).getTime() > fifteenMins) {
          refreshPrices()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allFiltered = filterByMember(investments, activeMember)
  const fdFiltered = filterByMember(fixedIncome, activeMember)

  const displayed = subTab === 'all'
    ? allFiltered
    : subTab === 'stocks'
    ? allFiltered.filter(i => i.type === 'Stock')
    : subTab === 'mf'
    ? allFiltered.filter(i => i.type === 'Mutual Fund' || i.type === 'Short Term Fund' || i.type === 'ETF')
    : []

  const loading = fetchingIds.size > 0
  const unpricedCount = allFiltered.filter(i => i.currentPrice == null).length

  function upsertInv(item) {
    const exists = investments.some(i => i.id === item.id)
    saveInv(exists ? investments.map(i => i.id === item.id ? item : i) : [...investments, item])
  }
  function upsertFD(item) {
    const exists = fixedIncome.some(f => f.id === item.id)
    saveFD(exists ? fixedIncome.map(f => f.id === item.id ? item : f) : [...fixedIncome, item])
  }

  const SUB_TABS = [
    { id: 'all', label: 'All' },
    { id: 'stocks', label: 'Stocks' },
    { id: 'mf', label: 'Mutual Funds' },
    { id: 'fi', label: 'Fixed Income' },
  ]

  return (
    <PageLayout>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Investments</h2>
          {lastUpdated && (
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Prices updated at {lastUpdated}
              {refreshStatus && (
                <span style={{ marginLeft: 8, color: refreshStatus.warn ? 'var(--amber)' : 'var(--gain)' }}>
                  · {refreshStatus.updated} fund{refreshStatus.updated !== 1 ? 's' : ''} updated
                  {refreshStatus.failed > 0 ? `, ${refreshStatus.failed} kept previous` : ''}
                </span>
              )}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={async () => {
              setSaveStatus('saving')
              await flush()
              setSaveStatus('saved')
              setTimeout(() => setSaveStatus('idle'), 2000)
            }}
            disabled={saveStatus !== 'idle'}
            style={{ ...btnGhost, fontSize: '0.82rem', color: saveStatus === 'saved' ? 'var(--gain)' : 'var(--text-secondary)', minWidth: 80 }}
          >
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save'}
          </button>
          <button
            onClick={() => setShowUpdateHoldings(true)}
            style={{ ...btnPrimary, fontSize: '0.85rem' }}
          >
            ↑ Update Holdings
          </button>
          <button
            onClick={() => refreshPrices()}
            disabled={loading}
            style={{
              ...btnGhost,
              color: loading ? 'var(--text-muted)' : 'var(--accent)',
              display: 'flex', alignItems: 'center', gap: 6, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            {loading ? 'Updating…' : 'Refresh Prices'}
          </button>
          {!loading && (
            <button
              onClick={() => refreshPrices(true)}
              style={{ ...btnGhost, fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Re-fetch all prices ignoring cache"
            >
              Refresh All
            </button>
          )}
        </div>
      </div>

      {/* ── Unpriced assets banner ────────────────────────── */}
      {unpricedCount > 0 && subTab !== 'fi' && !bannerDismissed && (
        <div style={{
          backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 20,
          fontSize: '0.82rem', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠</span>
          <span style={{ flex: 1 }}>
            <strong style={{ color: 'var(--text-primary)' }}>{unpricedCount} holding{unpricedCount > 1 ? 's' : ''}</strong>{' '}
            without a live price — values use buy price as a fallback. Click <strong>Refresh Prices</strong> to fetch current prices.
          </span>
          <button
            onClick={dismissBanner}
            style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}
            title="Dismiss for this session"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Summary cards (non-FI only) ───────────────────── */}
      {subTab !== 'fi' && <SummaryCards items={displayed} />}

      {/* ── Sub-tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.85rem',
              backgroundColor: subTab === t.id ? 'var(--color-background-tertiary)' : 'var(--color-background-secondary)',
              color: subTab === t.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              transition: 'background-color 0.15s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SIP summary (MF tab only) ─────────────────────── */}
      {subTab === 'mf' && (() => {
        const sipInvs = displayed.filter(i => i.investmentMode === 'sip' && i.sip)
        if (sipInvs.length === 0) return null
        const totalMonthly = sipInvs.reduce((s, i) => s + getMonthlyAmount(i.sip), 0)
        const nextSIPs = sipInvs
          .filter(i => i.sip?.startDate)
          .map(i => ({ name: i.name, date: nextSIPDate(i.sip) }))
          .filter(x => x.date)
          .sort((a, b) => a.date < b.date ? -1 : 1)
        return (
          <div style={{ ...card, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <div><p style={label}>ACTIVE SIPS</p><p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)' }}>{sipInvs.length}</p></div>
            <div><p style={label}>MONTHLY OUTGO</p><p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{formatINR(totalMonthly)}</p></div>
            {nextSIPs[0] && (
              <div><p style={label}>NEXT SIP</p><p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{fmtShortDate(nextSIPs[0].date)} · {nextSIPs[0].name}</p></div>
            )}
          </div>
        )
      })()}

      {/* ── Investment table ───────────────────────────────── */}
      {subTab !== 'fi' && (
        <>
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 700 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Member', 'Units', 'Buy Price', 'Invested', 'Current', 'Gain / Loss', ''].map((h, i) => (
                      <th key={h || i} style={{ padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No investments in this view.
                      </td>
                    </tr>
                  ) : displayed.map(inv => (
                    <InvRow
                      key={inv.id}
                      inv={inv}
                      fetching={fetchingIds.has(inv.id)}
                      cacheEntry={priceCache[getCacheKey(inv)]}
                      onUpdate={updated => saveInv(investments.map(i => i.id === updated.id ? updated : i))}
                      onDelete={() => saveInv(investments.filter(i => i.id !== inv.id))}
                      onSIPConfig={() => setSipModal({ type: 'config', inv })}
                      onAddInstalment={() => setSipModal({ type: 'instalment', inv })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            onClick={() => setShowAddInv(v => !v)}
            style={{
              width: '100%', padding: 14, borderRadius: 10,
              border: '2px dashed var(--border)', backgroundColor: 'transparent',
              color: 'var(--accent)', fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            {showAddInv ? 'Cancel' : '+ Add Investment'}
          </button>
          {showAddInv && (
            <AddInvForm
              onAdd={item => { upsertInv(item); setShowAddInv(false) }}
              onCancel={() => setShowAddInv(false)}
              activeMember={activeMember}
            />
          )}
        </>
      )}

      {/* ── Fixed Income sub-tab ──────────────────────────── */}
      {subTab === 'fi' && (
        <>
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 550 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Member', 'Principal', 'Rate', 'Maturity Value', 'Maturity Date', ''].map((h, i) => (
                      <th key={h || i} style={{ padding: '8px 12px', textAlign: i >= 2 ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fdFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        No fixed income instruments recorded.
                      </td>
                    </tr>
                  ) : fdFiltered.map(fd => (
                    <FDRow
                      key={fd.id}
                      fd={fd}
                      onUpdate={updated => saveFD(fixedIncome.map(f => f.id === updated.id ? updated : f))}
                      onDelete={() => saveFD(fixedIncome.filter(f => f.id !== fd.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FI totals */}
          {fdFiltered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'TOTAL PRINCIPAL', value: formatINR(fdFiltered.reduce((s, f) => s + (f.principal || 0), 0)) },
                { label: 'TOTAL MATURITY VALUE', value: formatINR(fdFiltered.reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)) },
              ].map(c => (
                <div key={c.label} style={{ ...card, padding: '16px 20px' }}>
                  <p style={label}>{c.label}</p>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: 'var(--accent)' }}>{c.value}</p>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowAddFD(v => !v)}
            style={{ width: '100%', padding: 14, borderRadius: 10, border: '2px dashed var(--border)', backgroundColor: 'transparent', color: 'var(--accent)', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {showAddFD ? 'Cancel' : '+ Add Fixed Income'}
          </button>
          {showAddFD && (
            <AddFDForm
              onAdd={item => { upsertFD(item); setShowAddFD(false) }}
              onCancel={() => setShowAddFD(false)}
              activeMember={activeMember}
            />
          )}
        </>
      )}

      {showUpdateHoldings && <UpdateHoldingsModal activeMember={activeMember} onClose={() => setShowUpdateHoldings(false)} />}

      {sipModal?.type === 'config' && (
        <SIPConfigModal
          inv={sipModal.inv}
          onSave={updated => { upsertInv(updated); setSipModal(null) }}
          onCancel={() => setSipModal(null)}
        />
      )}
      {sipModal?.type === 'instalment' && (
        <SIPInstalmentModal
          inv={sipModal.inv}
          onConfirm={updated => { upsertInv(updated); setSipModal(null) }}
          onCancel={() => setSipModal(null)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </PageLayout>
  )
}

function fdAccruedValue(fd) {
  if (fd.maturityValue) return fd.maturityValue // user-provided takes precedence
  if (!fd.startDate || !fd.rate || !fd.principal) return fd.principal
  const years = (new Date() - new Date(fd.startDate)) / (1000 * 60 * 60 * 24 * 365.25)
  if (years <= 0) return fd.principal
  return Math.round(fd.principal * Math.pow(1 + fd.rate / 100, years))
}

// ── FD table row ───────────────────────────────────────────
function FDRow({ fd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...fd })

  function saveEdit() {
    onUpdate({ ...form, principal: parseFloat(form.principal), rate: parseFloat(form.rate), maturityValue: parseFloat(form.maturityValue) || null })
    setEditing(false)
  }

  const accrued = fdAccruedValue(fd)
  const isAccrued = !fd.maturityValue && fd.startDate

  if (editing) {
    return (
      <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
        <td colSpan={7} style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div><span style={label}>Name</span><input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><span style={label}>Principal (₹)</span><input type="number" style={inp} value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} /></div>
            <div><span style={label}>Rate (%)</span><input type="number" step="0.01" style={inp} value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} /></div>
            <div><span style={label}>Start Date</span><input type="date" style={inp} value={form.startDate ?? ''} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><span style={label}>Maturity Value (₹)</span><input type="number" style={inp} value={form.maturityValue ?? ''} onChange={e => setForm({ ...form, maturityValue: e.target.value })} /></div>
            <div><span style={label}>Maturity Date</span><input type="date" style={inp} value={form.maturityDate ?? ''} onChange={e => setForm({ ...form, maturityDate: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveEdit} style={{ ...btnPrimary, padding: '7px 14px', fontSize: '0.82rem' }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.82rem' }}>Cancel</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '12px', fontWeight: 500 }}>{fd.name}</td>
      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{firstName(fd.member)}</td>
      <td style={{ padding: '12px', textAlign: 'right' }}>{formatINR(fd.principal)}</td>
      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--gain)' }}>{fd.rate}%</td>
      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
        {formatINR(accrued)}
        {isAccrued && <span style={{ fontSize: '0.65rem', marginLeft: 4, color: 'var(--text-muted)' }}>est.</span>}
      </td>
      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{fd.maturityDate || '—'}</td>
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', marginRight: 8 }}>Edit</button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
      </td>
    </tr>
  )
}

function filterByMember(arr, member) {
  return member === 'All' ? arr : arr.filter(x => x.member === member)
}
// ── end ───────────────────────────────────────────────────