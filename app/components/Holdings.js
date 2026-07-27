'use client'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useStore } from '../lib/store'
import { DonutChart } from './charts'
import { computeTodayChange, classifyFund } from '../lib/wealthMetrics'
import { formatShort } from '../lib/metrics'
import { formatINR, formatINRDecimal, firstName } from '../lib/format'
import { getMembers } from '../lib/members'
import { load, save, KEYS } from '../lib/storage'
import { useUser } from '@clerk/nextjs'
import UpdateHoldingsModal from './UpdateHoldings'

// ── Constants ─────────────────────────────────────────────────────────────

const CLASS_FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'invest',   label: 'Investments' },
  { id: 'gold',     label: 'Gold' },
  { id: 'realty',   label: 'Real Estate' },
  { id: 'deposits', label: 'Deposits & Cash' },
]

const SORT_OPTIONS = [
  { id: 'value',  label: 'Value ↓' },
  { id: 'name',   label: 'Name A–Z' },
  { id: 'change', label: 'Change ↓' },
]

const PRICE_TTL_MS = 5 * 60 * 1000
const VIEW_TO_FILTER = { investments: 'invest', gold: 'gold', deposits: 'deposits', all: 'all' }

// ── Modal style constants ─────────────────────────────────────────────────

const minp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}
const mlbl = {
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)', margin: '0 0 4px', display: 'block',
}
const mbtnP = {
  padding: '9px 16px', borderRadius: 8, border: 'none',
  backgroundColor: 'var(--accent)', color: '#fff',
  fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
}
const mbtnG = {
  padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)',
  backgroundColor: 'transparent', color: 'var(--text-secondary)',
  fontSize: '0.875rem', cursor: 'pointer',
}

// ── SIP helpers ────────────────────────────────────────────────────────────

function nextSIPDate(sip) {
  if (!sip?.startDate) return null
  const freq = sip.frequency || 'Monthly'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (freq === 'Monthly') {
    const dom = sip.dayOfMonth || new Date(sip.startDate).getDate()
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dom)
    return (thisMonth < today
      ? new Date(today.getFullYear(), today.getMonth() + 1, dom)
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
  const [, m, d] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`
}

function getCurrentSIPAmount(sip) {
  const base = sip.monthlyAmount || sip.amount || sip.sipAmount || 0
  if (!sip.hasStepUp || !sip.stepUpPct || !sip.startDate) return base
  const start = new Date(sip.startDate)
  const yearsElapsed = Math.floor((Date.now() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  if (yearsElapsed <= 0) return base
  return Math.round(base * Math.pow(1 + sip.stepUpPct / 100, yearsElapsed))
}

// ── SIP Configure Modal ────────────────────────────────────────────────────

const FREQUENCIES   = ['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly']
const DAYS_OF_WEEK  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const START_MONTHS  = ['Jan', 'Apr', 'Jul', 'Oct']

function SIPConfigModal({ inv, onSave, onCancel }) {
  const sipData = inv.sip || {}
  const [form, setForm] = useState({
    investmentMode: inv.investmentMode || 'lumpsum',
    amount:         sipData.monthlyAmount ?? '',
    startDate:      sipData.startDate ?? '',
    frequency:      sipData.frequency || 'Monthly',
    dayOfMonth:     sipData.dayOfMonth ?? (sipData.startDate ? new Date(sipData.startDate).getDate() : 1),
    dayOfWeek:      sipData.dayOfWeek ?? 'Monday',
    startingMonth:  sipData.startingMonth ?? 'Jan',
    status:         sipData.status || 'Active',
    hasStepUp:      sipData.hasStepUp || false,
    stepUpPct:      sipData.stepUpPct || 10,
    instalmentDate: sipData.instalmentDate ?? '',
  })
  const isSIP = form.investmentMode === 'sip'
  const nextDate = isSIP && form.startDate
    ? nextSIPDate({ ...form, monthlyAmount: parseFloat(form.amount) || 0 })
    : null

  const sectionHead = {
    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--text-muted)',
    margin: '0 0 12px', paddingBottom: 6, borderBottom: '1px solid var(--border)',
  }

  function handleSave() {
    onSave({
      ...inv,
      investmentMode: form.investmentMode,
      sip: isSIP ? {
        ...sipData,
        monthlyAmount:      parseFloat(form.amount) || 0,
        startDate:          form.startDate,
        frequency:          form.frequency,
        dayOfMonth:         parseInt(form.dayOfMonth) || 1,
        dayOfWeek:          form.dayOfWeek,
        startingMonth:      form.startingMonth,
        status:             form.status,
        instalments:        sipData.instalments || [],
        hasStepUp:          form.hasStepUp || false,
        stepUpPct:          form.hasStepUp ? (parseFloat(form.stepUpPct) || 10) : 0,
        instalmentDate:     form.instalmentDate ? parseInt(form.instalmentDate) : null,
        lastAllotmentDate:  sipData.lastAllotmentDate || null,
        allotmentHistory:   sipData.allotmentHistory || [],
      } : inv.sip,
    })
  }

  const allRows = [
    ...(sipData.instalments || []).map(r => ({ ...r, _type: 'manual' })),
    ...(sipData.allotmentHistory || []).map(r => ({ ...r, _type: 'auto' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={onCancel} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 520,
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 28,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>SIP Configuration</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{inv.name}</p>

        {/* Mode toggle */}
        <div style={{ marginBottom: 16 }}>
          <span style={mlbl}>Investment Mode</span>
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

        {isSIP && (
          <>
            <p style={sectionHead}>SIP Schedule</p>

            <div style={{ marginBottom: 12 }}>
              <span style={mlbl}>Frequency</span>
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
                <span style={mlbl}>SIP Amount (₹)</span>
                <input type="number" style={minp} placeholder="e.g. 5000" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <span style={mlbl}>First SIP Date</span>
                <input type="date" style={minp} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
            </div>

            {form.frequency === 'Weekly' && (
              <div style={{ marginBottom: 12 }}>
                <span style={mlbl}>Day of Week</span>
                <select style={minp} value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })}>
                  {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            )}

            {(form.frequency === 'Monthly' || form.frequency === 'Quarterly') && (
              <div style={{ display: 'grid', gridTemplateColumns: form.frequency === 'Quarterly' ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <span style={mlbl}>Day of Month (1–28)</span>
                  <input type="number" min={1} max={28} style={minp} value={form.dayOfMonth} onChange={e => setForm({ ...form, dayOfMonth: e.target.value })} />
                </div>
                {form.frequency === 'Quarterly' && (
                  <div>
                    <span style={mlbl}>Starting Month</span>
                    <select style={minp} value={form.startingMonth} onChange={e => setForm({ ...form, startingMonth: e.target.value })}>
                      {START_MONTHS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <span style={mlbl}>Status</span>
                <select style={minp} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {['Active', 'Paused', 'Completed'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              {nextDate && (
                <div>
                  <span style={mlbl}>Next Instalment</span>
                  <p style={{ margin: '4px 0 10px', fontSize: '0.875rem', color: 'var(--accent)', fontWeight: 600 }}>
                    {new Date(nextDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>

            {/* Step-up */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
              <input
                type="checkbox" id="sipHasStepUp"
                checked={form.hasStepUp || false}
                onChange={e => setForm({ ...form, hasStepUp: e.target.checked, stepUpPct: e.target.checked ? (form.stepUpPct || 10) : 0 })}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="sipHasStepUp" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', flex: 1 }}>
                Step-up SIP (increase amount annually)
              </label>
            </div>
            {form.hasStepUp && (
              <div style={{ marginBottom: 12 }}>
                <span style={mlbl}>Annual step-up %</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min="1" max="50"
                    value={form.stepUpPct || 10}
                    onChange={e => setForm({ ...form, stepUpPct: parseFloat(e.target.value) || 10 })}
                    style={{ ...minp, marginBottom: 0, width: 80, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>% per year</span>
                </div>
                {form.amount && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Current effective: {formatINR(getCurrentSIPAmount({ ...form, monthlyAmount: parseFloat(form.amount) || 0 }))}
                  </p>
                )}
              </div>
            )}

            {/* Instalment date */}
            <div style={{ marginBottom: 16 }}>
              <span style={mlbl}>Instalment Date (day of month)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  value={form.instalmentDate}
                  onChange={e => setForm({ ...form, instalmentDate: e.target.value })}
                  style={{ ...minp, marginBottom: 0, width: 100 }}
                >
                  <option value="">— none —</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Units allotted T+1 after this date</span>
              </div>
              {sipData.lastAllotmentDate && (
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Last allotment: {sipData.lastAllotmentDate}
                  {sipData.allotmentHistory?.length > 0 && ` · ${sipData.allotmentHistory.length} recorded`}
                </p>
              )}
            </div>
          </>
        )}

        {/* History */}
        {allRows.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ ...mlbl, marginBottom: 8 }}>History ({allRows.length})</p>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Date','Amount','NAV','Units',''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Date' || h === '' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.7rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 10px' }}>{r.date}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{formatINR(r.amount)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.nav != null ? r.nav.toFixed(4) : '—'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{r.units > 0 ? r.units.toFixed(4) : '—'}</td>
                      <td style={{ padding: '6px 10px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {r._type === 'auto' ? 'auto' : ''}{r.note ? ` · ${r.note}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} style={mbtnP}>Save</button>
          <button onClick={onCancel} style={mbtnG}>Cancel</button>
        </div>
      </div>
    </>
  )
}

// ── SIP Instalment Modal ───────────────────────────────────────────────────

function SIPInstalmentModal({ inv, onConfirm, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]     = useState(today)
  const [amount, setAmount] = useState(String(inv.sip?.monthlyAmount || ''))
  const [fetching, setFetching] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError]   = useState(null)

  async function handleFetchNav() {
    if (!date || !amount || !inv.mfCode) return
    setFetching(true); setError(null); setResult(null)
    try {
      const res = await fetch(`/api/price?mf=${encodeURIComponent(inv.mfCode)}&date=${date}`)
      const data = await res.json()
      if (!data.nav) throw new Error(data.error || 'NAV not found for this date')
      setResult({ nav: data.nav, date: data.date || date, units: parseFloat(amount) / data.nav })
    } catch (e) {
      setError(e.message)
    } finally {
      setFetching(false)
    }
  }

  function handleConfirm() {
    if (!result) return
    const newUnits  = parseFloat(amount) / result.nav
    const totalUnits = (inv.units || 0) + newUnits
    const totalCost  = (inv.units || 0) * (inv.buyPrice || 0) + parseFloat(amount)
    onConfirm({
      ...inv,
      units:    totalUnits,
      buyPrice: totalCost / totalUnits,
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
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 420,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 28,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Add SIP Instalment</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{inv.name}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <span style={mlbl}>Instalment Date</span>
            <input type="date" style={minp} value={date} onChange={e => { setDate(e.target.value); setResult(null) }} />
          </div>
          <div>
            <span style={mlbl}>Amount (₹)</span>
            <input type="number" style={minp} placeholder={String(inv.sip?.monthlyAmount || '0')} value={amount} onChange={e => { setAmount(e.target.value); setResult(null) }} />
          </div>
        </div>

        {!result && (
          <button
            onClick={handleFetchNav} disabled={fetching || !date || !amount}
            style={{ ...mbtnG, width: '100%', marginBottom: 12, color: 'var(--accent)' }}
          >
            {fetching ? 'Fetching NAV…' : 'Look up NAV for Date →'}
          </button>
        )}
        {error && <p style={{ color: 'var(--loss)', fontSize: '0.8rem', margin: '0 0 12px' }}>{error}</p>}
        {result && (
          <div style={{ backgroundColor: 'var(--accent-faint)', border: '1px solid var(--accent)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><p style={mlbl}>NAV (₹)</p><p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{result.nav.toFixed(4)}</p></div>
            <div><p style={mlbl}>Units</p><p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{result.units.toFixed(4)}</p></div>
            <div><p style={mlbl}>Date Used</p><p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{result.date}</p></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleConfirm} disabled={!result} style={{ ...mbtnP, opacity: result ? 1 : 0.5, cursor: result ? 'pointer' : 'not-allowed' }}>
            Confirm Instalment
          </button>
          <button onClick={onCancel} style={mbtnG}>Cancel</button>
        </div>
      </div>
    </>
  )
}

// ── Price fetch helpers ────────────────────────────────────────────────────

function getCacheKey(inv) {
  return inv.isMF ? `mf:${inv.mfCode}` : `stock:${inv.ticker}`
}

async function fetchStockPrice(ticker) {
  try {
    const res  = await fetch(`/api/price?ticker=${encodeURIComponent(ticker)}`)
    const data = await res.json()
    return data.price ?? null
  } catch { return null }
}

async function fetchSingleMFNav(mfCode, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`/api/price?mf=${encodeURIComponent(mfCode)}`, {
        signal: AbortSignal.timeout(8000), cache: 'no-store',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const nav  = data.price
      if (!nav || nav <= 0 || isNaN(nav)) throw new Error(`Invalid NAV: ${nav}`)
      return nav
    } catch (e) {
      console.warn(`[MF] ${mfCode} attempt ${attempt}/${retries}: ${e.message}`)
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }
  return null
}

function isNAVReasonable(newNAV, previousNAV) {
  if (!newNAV || newNAV <= 0 || isNaN(newNAV)) return false
  if (previousNAV && previousNAV > 0) {
    if (Math.abs((newNAV - previousNAV) / previousNAV) * 100 > 20) return false
  }
  return true
}

// ── Shared style helpers ──────────────────────────────────────────────────

function Th({ children, flex, align = 'right' }) {
  return (
    <div style={{ flex, textAlign: align, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', padding: '0 6px' }}>
      {children}
    </div>
  )
}

function Td({ children, flex, align = 'right', style = {} }) {
  return (
    <div style={{ flex, textAlign: align, fontSize: 12, color: 'var(--color-text-secondary)', padding: '0 6px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  )
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color, background: bg, borderRadius: 3, padding: '1px 4px', marginLeft: 5, flexShrink: 0 }}>
      {label}
    </span>
  )
}

function ChangeCell({ value }) {
  if (value == null) return <Td flex="0 0 70px">—</Td>
  const color = value >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return (
    <Td flex="0 0 70px" style={{ color, fontWeight: 500 }}>
      {value >= 0 ? '+' : ''}{formatShort(value)}
    </Td>
  )
}

function SectionHeader({ label, count, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px', borderTop: '0.5px solid var(--color-border-primary)', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-primary)' }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{count} position{count !== 1 ? 's' : ''}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {formatShort(total)}
      </span>
    </div>
  )
}

// ── Change cell for new Holding|Member|Invested|Current value|Change layout ─

function RowChangeCell({ value, cost, todayChange, costBasisUnknown, changeBasis, isGold, goldFreshToday }) {
  const flex = '0 0 110px'
  if (changeBasis === 'today') {
    if (isGold) {
      return (
        <Td flex={flex} style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
          {goldFreshToday ? '—' : '— Not refreshed today'}
        </Td>
      )
    }
    if (todayChange == null) return <Td flex={flex}>—</Td>
    const color = todayChange >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'
    return <Td flex={flex} style={{ color, fontWeight: 500 }}>{todayChange >= 0 ? '+' : ''}{formatShort(todayChange)}</Td>
  }
  // Since purchase
  if (costBasisUnknown) return <Td flex={flex} style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>cost basis unknown</Td>
  if (!cost) return <Td flex={flex}>—</Td>
  const gain  = (value || 0) - cost
  const pct   = cost > 0 ? (gain / cost) * 100 : 0
  const color = gain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'
  return (
    <Td flex={flex} style={{ color, fontWeight: 500 }}>
      <span>{gain >= 0 ? '+' : ''}{formatShort(gain)}</span>
      <span style={{ fontSize: 9, background: gain >= 0 ? 'var(--color-positive-bg)' : 'var(--color-negative-bg)', color, borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
      </span>
    </Td>
  )
}

// ── Collapsible group band with subtotal ──────────────────────────────────

const COL_TH = { textAlign: 'right', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', padding: '0 6px' }

function GroupBand({ label, rows, changeBasis, goldFreshToday, children }) {
  const [collapsed, setCollapsed] = useState(false)

  const totalValue    = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const validCosts    = rows.filter(r => !r.costBasisUnknown && r.cost != null)
  const totalInvested = validCosts.reduce((s, r) => s + r.cost, 0)
  const hasPartial    = rows.some(r => r.costBasisUnknown)
  const hasTodayChg   = rows.some(r => r.todayChange != null)
  const totalTodayChg = hasTodayChg ? rows.reduce((s, r) => s + (r.todayChange ?? 0), 0) : null

  const changeVal     = changeBasis === 'today' ? totalTodayChg : (validCosts.length > 0 ? totalValue - totalInvested : null)
  const isPos         = changeVal != null && changeVal >= 0
  const sinceGainPct  = (changeVal != null && changeBasis === 'since' && totalInvested > 0) ? (changeVal / totalInvested) * 100 : null

  return (
    <div>
      {/* Tinted band header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', gap: 6, background: 'var(--color-background-tertiary)', borderTop: '0.5px solid var(--color-border-primary)', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-primary)', flex: 1 }}>
          {label}
          <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>({rows.length})</span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {/* Column headers + rows when expanded */}
      {!collapsed && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 4px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ flex: 1, ...COL_TH, textAlign: 'left' }}>Holding</div>
            <div style={{ flex: '0 0 80px', ...COL_TH, textAlign: 'center' }}>Member</div>
            <div style={{ flex: '0 0 90px', ...COL_TH, opacity: changeBasis === 'today' ? 0.5 : 1 }}>Invested</div>
            <div style={{ flex: '0 0 90px', ...COL_TH }}>Current value</div>
            <div style={{ flex: '0 0 110px', ...COL_TH }}>{changeBasis === 'today' ? 'Change · today' : 'Change'}</div>
          </div>
          {children}
        </>
      )}

      {/* Subtotal row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', borderTop: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
        <div style={{ flex: 1, fontSize: 11, color: 'var(--color-text-muted)', fontStyle: collapsed ? 'normal' : 'italic' }}>
          {collapsed ? `${label} (${rows.length})` : 'Subtotal'}
        </div>
        <Td flex="0 0 80px" />
        <Td flex="0 0 90px" style={{ opacity: changeBasis === 'today' ? 0.35 : 1, fontSize: 11 }}>
          {validCosts.length > 0 ? formatShort(totalInvested) : '—'}{hasPartial && validCosts.length > 0 ? '*' : ''}
        </Td>
        <Td flex="0 0 90px" style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 11 }}>
          {formatShort(totalValue)}
        </Td>
        <Td flex="0 0 110px" style={{ color: changeVal != null ? (isPos ? 'var(--color-positive)' : 'var(--color-negative)') : 'var(--color-text-muted)', fontWeight: changeVal != null ? 500 : 400, fontSize: 11 }}>
          {changeVal != null
            ? `${changeVal >= 0 ? '+' : ''}${formatShort(changeVal)}${sinceGainPct != null ? ` (${sinceGainPct >= 0 ? '+' : ''}${sinceGainPct.toFixed(1)}%)` : ''}`
            : '—'
          }{hasPartial && changeBasis === 'since' ? '*' : ''}
        </Td>
      </div>
    </div>
  )
}

// ── Member matching ────────────────────────────────────────────────────────

function matchesMember(item, activeMember) {
  if (!activeMember || activeMember === 'All') return true
  const m      = String(item.member || item.memberId || item.owner || '').toLowerCase()
  const search = activeMember.toLowerCase()
  const fn     = search.split(' ')[0]
  return m === search || m.includes(fn) || search.includes(m.split(' ')[0])
}

// ── Data normalisation ────────────────────────────────────────────────────

function buildInvestmentRows(investments, activeMember, latestSnap) {
  const filtered = investments.filter(i => matchesMember(i, activeMember))
  const stocks   = filtered.filter(i => !i.isMF)
  const mfs      = filtered.filter(i => i.isMF)

  const mfGroups = {}
  for (const mf of mfs) {
    const key = mf.mfCode || String(mf.id)
    if (!mfGroups[key]) mfGroups[key] = []
    mfGroups[key].push(mf)
  }

  const mfRows = Object.values(mfGroups).map(group => {
    const price          = group[0].currentPrice || group[0].buyPrice || 0
    const totalUnits     = group.reduce((s, g) => s + (g.units || 0), 0)
    const hasUnknownCost = group.some(g => g.buyPrice == null || g.buyPrice === 0)
    const totalCost      = group.reduce((s, g) => s + (g.units || 0) * (g.buyPrice || 0), 0)
    let totalChange  = 0
    let hasChange    = false
    for (const g of group) {
      const c = computeTodayChange(g, latestSnap)
      if (c != null) { totalChange += c; hasChange = true }
    }
    const isSIP  = group.some(g => g.investmentMode === 'sip')
    const sipInv = isSIP ? group.find(g => g.investmentMode === 'sip') : null
    return {
      key:      `mf-${group[0].mfCode || group[0].id}`,
      name:     group[0].name,
      badge:    'MF',
      isMF:     true,
      members:  group.map(g => g.member),
      units:    totalUnits,
      price,
      value:            totalUnits * price,
      cost:             hasUnknownCost ? null : totalCost,
      costBasisUnknown: hasUnknownCost,
      todayChange:      hasChange ? totalChange : null,
      isSIP,
      sipAmount:    sipInv?.sip?.monthlyAmount || sipInv?.sip?.amount || 0,
      sipFreq:      sipInv?.sip?.frequency || 'Monthly',
      sipDay:       sipInv?.sip?.instalmentDate,
      hasVerify:    group.some(g => (g.flags || []).includes('VERIFY_AMFI')),
      isMulti:      group.length > 1,
      invId:        group.length === 1 ? group[0].id : null,
      children:     group.length > 1
        ? group.map(g => {
            const childUnknown = g.buyPrice == null || g.buyPrice === 0
            return {
              member:           g.member,
              units:            g.units || 0,
              value:            (g.units || 0) * price,
              cost:             childUnknown ? null : (g.units || 0) * g.buyPrice,
              costBasisUnknown: childUnknown,
              todayChange:      computeTodayChange(g, latestSnap),
              isSIP:            g.investmentMode === 'sip',
            }
          })
        : [],
    }
  })

  const stockRows = stocks.map(s => {
    const costBasisUnknown = s.buyPrice == null || s.buyPrice === 0
    return {
      key:              `stk-${s.id}`,
      name:             s.name,
      badge:            'STK',
      isMF:             false,
      members:          [s.member],
      units:            s.units || 0,
      price:            s.currentPrice || s.buyPrice || 0,
      value:            (s.units || 0) * (s.currentPrice || s.buyPrice || 0),
      cost:             costBasisUnknown ? null : (s.units || 0) * s.buyPrice,
      costBasisUnknown,
      todayChange:      computeTodayChange(s, latestSnap),
      isSIP:            false,
      hasVerify:        (s.flags || []).includes('VERIFY_AMFI'),
      isMulti:          false,
      invId:            null,
      children:         [],
    }
  })

  return [...mfRows, ...stockRows]
}

// ── Investment rows ────────────────────────────────────────────────────────

function InvestmentRow({ row, expanded, onToggle, members, onSIPConfig, changeBasis }) {
  const memberMap    = Object.fromEntries(members.map(m => [m.name, m]))
  const investedOpacity = changeBasis === 'today' ? 0.35 : 1

  return (
    <>
      <div
        onClick={row.isMulti ? () => onToggle(row.key) : undefined}
        style={{
          display: 'flex', alignItems: 'center', padding: '9px 14px', borderRadius: 4,
          background: expanded ? 'var(--color-background-tertiary)' : 'transparent',
          cursor: row.isMulti ? 'pointer' : 'default', transition: 'background 0.1s',
        }}
      >
        {/* Holding name + badges */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.name}
          </span>
          <Badge label={row.badge} color="var(--color-text-muted)" bg="var(--color-border-primary)" />
          {row.isSIP && <Badge label="SIP" color="var(--color-info)" bg="var(--color-info-bg)" />}
          {row.hasVerify && <Badge label="VERIFY" color="var(--color-warning)" bg="var(--color-warning-bg)" />}
          {row.isSIP && row.invId && onSIPConfig && (
            <button
              onClick={e => { e.stopPropagation(); onSIPConfig(row.invId) }}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0 }}
            >⚙</button>
          )}
        </div>

        {/* Member */}
        <Td flex="0 0 80px" align="center">
          {row.isMulti
            ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.members.length} mbrs {expanded ? '▲' : '▼'}</span>
            : <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{firstName(row.members[0] || '')}</span>
          }
        </Td>

        {/* Invested */}
        <Td flex="0 0 90px" style={{ opacity: investedOpacity }}>
          {row.costBasisUnknown
            ? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 11 }}>n/a</span>
            : (row.cost != null ? formatShort(row.cost) : '—')
          }
        </Td>

        {/* Current value */}
        <Td flex="0 0 90px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {row.value > 0 ? formatShort(row.value) : '—'}
        </Td>

        {/* Change */}
        <RowChangeCell value={row.value} cost={row.cost} todayChange={row.todayChange} costBasisUnknown={row.costBasisUnknown} changeBasis={changeBasis} />
      </div>

      {/* SIP sub-line */}
      {row.isSIP && row.sipAmount > 0 && (
        <div style={{ padding: '0 14px 6px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {formatShort(row.sipAmount)}/{row.sipFreq?.toLowerCase() || 'mo'}
            {row.sipDay ? ` · ${row.sipDay}th` : ''}
          </span>
        </div>
      )}

      {/* Expanded per-member breakdown */}
      {expanded && row.children.map((child, i) => {
        const m = memberMap[child.member] || {}
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 14px 6px 32px', borderLeft: `2px solid ${m.color || 'var(--color-accent)'}33`, marginLeft: 14 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: m.color || 'var(--color-text-muted)', fontWeight: 600 }}>{firstName(child.member)}</span>
              {child.isSIP && <Badge label="SIP" color="var(--color-info)" bg="var(--color-info-bg)" />}
            </div>
            <Td flex="0 0 80px" />
            <Td flex="0 0 90px" style={{ opacity: investedOpacity, fontSize: 11 }}>
              {child.costBasisUnknown
                ? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 10 }}>n/a</span>
                : (child.cost != null ? formatShort(child.cost) : '—')
              }
            </Td>
            <Td flex="0 0 90px" style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{formatShort(child.value)}</Td>
            <RowChangeCell value={child.value} cost={child.cost} todayChange={child.todayChange} costBasisUnknown={child.costBasisUnknown} changeBasis={changeBasis} />
          </div>
        )
      })}
    </>
  )
}

function InvestmentsSection({ rows, sort, members, onSIPConfig, changeBasis }) {
  const [expandedRows, setExpandedRows] = useState({})

  function sortRows(arr) {
    const r = [...arr]
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'change') {
      if (changeBasis === 'since') r.sort((a, b) => {
        const da = (!a.costBasisUnknown && a.cost) ? a.value - a.cost : -Infinity
        const db = (!b.costBasisUnknown && b.cost) ? b.value - b.cost : -Infinity
        return db - da
      })
      else r.sort((a, b) => (b.todayChange ?? -Infinity) - (a.todayChange ?? -Infinity))
    }
    else r.sort((a, b) => b.value - a.value)
    return r
  }

  const stockRows = useMemo(() => sortRows(rows.filter(r => !r.isMF)), [rows, sort, changeBasis])
  const mfRows    = useMemo(() => sortRows(rows.filter(r => r.isMF)),  [rows, sort, changeBasis])

  if (rows.length === 0) return null

  const toggleRow = (key) => setExpandedRows(p => ({ ...p, [key]: !p[key] }))

  const renderRow = (row) => (
    <InvestmentRow key={row.key} row={row} expanded={!!expandedRows[row.key]} onToggle={toggleRow} members={members} onSIPConfig={onSIPConfig} changeBasis={changeBasis} />
  )

  return (
    <>
      {stockRows.length > 0 && (
        <GroupBand label="Stocks" rows={stockRows} changeBasis={changeBasis}>
          {stockRows.map(renderRow)}
        </GroupBand>
      )}
      {mfRows.length > 0 && (
        <GroupBand label="Mutual Funds" rows={mfRows} changeBasis={changeBasis}>
          {mfRows.map(renderRow)}
        </GroupBand>
      )}
    </>
  )
}

// ── Stat row (3 cards) ────────────────────────────────────────────────────

function StatRow({ cards }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
      {cards.map((c, i) => (
        <div
          key={i}
          onClick={c.onClick}
          style={{
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-primary)',
            borderRadius: 8, padding: '12px 14px',
            cursor: c.onClick ? 'pointer' : 'default',
          }}
        >
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            {c.label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: c.valueColor || 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
            {c.value}
          </div>
          {c.sub && (
            <div style={{ fontSize: 11, color: c.subColor || 'var(--color-text-secondary)', marginTop: 2 }}>
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Allocation donut (investments view only) ───────────────────────────────

function AllocationDonut({ rows }) {
  const segments = useMemo(() => [
    { label: 'Stocks',    value: rows.filter(r => !r.isMF).reduce((s, r) => s + r.value, 0),                                        color: 'var(--color-accent)' },
    { label: 'Equity MFs', value: rows.filter(r => r.isMF && classifyFund(r.name) === 'equity').reduce((s, r) => s + r.value, 0),   color: 'var(--color-positive)' },
    { label: 'Debt MFs',   value: rows.filter(r => r.isMF && classifyFund(r.name) === 'debt').reduce((s, r) => s + r.value, 0),     color: 'var(--color-warning)' },
  ].filter(s => s.value > 0), [rows])

  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0 || segments.length < 2) return null

  return (
    <div style={{
      background: 'var(--color-background-secondary)',
      border: '0.5px solid var(--color-border-primary)',
      borderRadius: 10, padding: '8px 20px 8px', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ width: 160, flexShrink: 0 }}>
        <DonutChart data={segments} centerLabel={formatShort(total)} centerSub="Total" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: 10 }}>Allocation</div>
        {segments.map(seg => {
          const pct = ((seg.value / total) * 100).toFixed(1)
          return (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>{seg.label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{formatShort(seg.value)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 40, textAlign: 'right' }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Portfolio donut (all-assets view) ─────────────────────────────────────

function PortfolioDonut({ data, onSegmentClick }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0 || data.length < 2) return null

  return (
    <div style={{
      background: 'var(--color-background-secondary)',
      border: '0.5px solid var(--color-border-primary)',
      borderRadius: 10, padding: '8px 20px 8px', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ width: 160, flexShrink: 0 }}>
        <DonutChart data={data} centerLabel={formatShort(total)} centerSub="Net Worth" onSegmentClick={onSegmentClick} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: 10 }}>Assets</div>
        {data.map(seg => {
          const pct = ((seg.value / total) * 100).toFixed(1)
          return (
            <button
              key={seg.label}
              onClick={() => onSegmentClick?.(seg)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: 'none', border: 'none', width: '100%', cursor: 'pointer', padding: 0, textAlign: 'left' }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>{seg.label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{formatShort(seg.value)}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 40, textAlign: 'right' }}>{pct}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Gold section ──────────────────────────────────────────────────────────

const GOLD_CARATS = [24, 22, 18]

function GoldSection({ items, activeMember, goldPrices, sort, goldTypeFilter, changeBasis, goldFreshToday, isAdmin, onUpdateGold, members }) {
  const [open, setOpen]           = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState(null)

  const filtered = items.filter(g =>
    matchesMember(g, activeMember) &&
    (goldTypeFilter === 'all' || (g.category || '').toLowerCase() === goldTypeFilter)
  )

  const rows = useMemo(() => {
    const r = filtered.map(g => {
      const pricePerGram     = goldPrices[g.carat] || 0
      const value            = (g.grams || 0) * pricePerGram
      const costBasisUnknown = g.buyPricePerGram == null
      const cost             = costBasisUnknown ? null : (g.grams || 0) * g.buyPricePerGram
      return { ...g, price: pricePerGram, value, cost, costBasisUnknown }
    })
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name))
    else r.sort((a, b) => b.value - a.value)
    return r
  }, [filtered, goldPrices, sort])

  if (rows.length === 0) return null

  // Totals
  const totalGrams    = rows.reduce((s, r) => s + (r.grams || 0), 0)
  const totalValue    = rows.reduce((s, r) => s + (r.value ?? 0), 0)
  const validCosts    = rows.filter(r => !r.costBasisUnknown && r.cost != null)
  const hasPartial    = rows.some(r => r.costBasisUnknown)
  const totalInvested = validCosts.reduce((s, r) => s + r.cost, 0)
  const changeVal     = changeBasis === 'today' ? null : (validCosts.length > 0 ? totalValue - totalInvested : null)
  const isPos         = changeVal != null && changeVal >= 0
  const sinceGainPct  = (changeVal != null && changeBasis === 'since' && totalInvested > 0) ? (changeVal / totalInvested) * 100 : null

  // Column widths — wider than investments to fit full rupee amounts
  const W = { name: 1, wt: '0 0 72px', mbr: '0 0 80px', inv: '0 0 112px', val: '0 0 112px', chg: '0 0 140px', act: '0 0 36px' }
  const thS = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', padding: '0 6px' }
  const tdS = (extra = {}) => ({ fontSize: 12, color: 'var(--color-text-secondary)', padding: '0 6px', ...extra })

  // ── Edit helpers ─────────────────────────────────────────
  function startEdit(g) {
    setEditingId(g.id)
    setEditDraft({ id: g.id, name: g.name, grams: g.grams, carat: g.carat, buyPricePerGram: g.buyPricePerGram ?? '', member: g.member, category: g.category })
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
    setSaveError(null)
  }

  async function handleSave() {
    if (!isAdmin) return
    setSaving(true)
    setSaveError(null)
    try {
      const original = items.find(g => String(g.id) === String(editDraft.id)) || {}
      const updated = {
        ...original,
        name:             editDraft.name.trim(),
        grams:            parseFloat(editDraft.grams) || 0,
        carat:            parseInt(editDraft.carat) || 24,
        buyPricePerGram:  editDraft.buyPricePerGram !== '' ? parseFloat(editDraft.buyPricePerGram) : null,
        member:           editDraft.member,
        category:         editDraft.category,
      }
      const res = await fetch('/api/gold', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: updated }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.error || `Error ${res.status}`)
        return
      }
      const { item } = await res.json()
      onUpdateGold(item)
      setEditingId(null)
      setEditDraft(null)
    } catch (e) {
      console.error('[gold save]', e)
      setSaveError(`Network error — ${e?.message || 'check your connection'}`)
    } finally {
      setSaving(false)
    }
  }

  const editInputS = { padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--color-border-primary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: 12, outline: 'none' }

  return (
    <div>
      {/* Band header — same visual style as GroupBand */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', gap: 6, background: 'var(--color-background-tertiary)', borderTop: '0.5px solid var(--color-border-primary)', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-primary)', flex: 1 }}>
          Gold <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({rows.length})</span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{open ? '▼' : '▶'}</span>
      </div>

      {open && (
        <>
          {/* Column headers */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ flex: W.name,  ...thS, textAlign: 'left' }}>Holding</div>
            <div style={{ flex: W.wt,   ...thS }}>Weight (g)</div>
            <div style={{ flex: W.mbr,  ...thS, textAlign: 'center' }}>Member</div>
            <div style={{ flex: W.inv,  ...thS, opacity: changeBasis === 'today' ? 0.5 : 1 }}>Invested</div>
            <div style={{ flex: W.val,  ...thS }}>Current value</div>
            <div style={{ flex: W.chg,  ...thS }}>{changeBasis === 'today' ? 'Change · today' : 'Change'}</div>
            <div style={{ flex: W.act }} />
          </div>

          {/* Data rows */}
          {rows.map((g, i) => {
            // ── Inline edit row ─────────────────────────────
            if (editingId === g.id && editDraft) {
              return (
                <div key={g.id} style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-tertiary)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
                    {/* Name */}
                    <div style={{ flex: '1 0 160px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Name</span>
                      <input type="text" value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} style={{ ...editInputS, width: '100%' }} />
                    </div>
                    {/* Weight */}
                    <div style={{ flex: '0 0 88px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Weight (g)</span>
                      <input type="number" value={editDraft.grams} step="0.001" min="0" onChange={e => setEditDraft(d => ({ ...d, grams: e.target.value }))} style={{ ...editInputS, width: '100%', textAlign: 'right' }} />
                    </div>
                    {/* Buy price */}
                    <div style={{ flex: '0 0 100px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Buy ₹/g</span>
                      <input type="number" value={editDraft.buyPricePerGram} step="0.01" min="0" placeholder="n/a" onChange={e => setEditDraft(d => ({ ...d, buyPricePerGram: e.target.value }))} style={{ ...editInputS, width: '100%', textAlign: 'right' }} />
                    </div>
                    {/* Carat */}
                    <div style={{ flex: '0 0 68px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Carat</span>
                      <select value={editDraft.carat} onChange={e => setEditDraft(d => ({ ...d, carat: parseInt(e.target.value) }))} style={{ ...editInputS }}>
                        {GOLD_CARATS.map(c => <option key={c} value={c}>{c}K</option>)}
                      </select>
                    </div>
                    {/* Member */}
                    <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>Member</span>
                      <select value={editDraft.member} onChange={e => setEditDraft(d => ({ ...d, member: e.target.value }))} style={{ ...editInputS }}>
                        {(members || []).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                      </select>
                    </div>
                    {/* Save / Cancel */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={handleSave} disabled={saving} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? '…' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} disabled={saving} style={{ padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-primary)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                  {saveError && (
                    <div style={{ fontSize: 11, color: 'var(--color-negative)', marginTop: 8 }}>⚠ {saveError}</div>
                  )}
                </div>
              )
            }

            // ── Normal row ──────────────────────────────────
            const gain    = !g.costBasisUnknown && g.cost != null ? g.value - g.cost : null
            const gainPct = gain != null && g.cost > 0 ? (gain / g.cost) * 100 : null
            const gainClr = gain == null ? undefined : (gain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)')
            return (
              <div key={g.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
                {/* Name */}
                <div style={{ flex: W.name, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.name}
                  </span>
                  {g.category === 'Jewellery' && <Badge label="Jewellery" color="var(--color-gold)" bg="var(--color-gold-bg)" />}
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{g.carat}K</span>
                </div>
                {/* Weight */}
                <div style={{ flex: W.wt, ...tdS({ textAlign: 'right' }) }}>{(g.grams || 0).toFixed(3)}</div>
                {/* Member */}
                <div style={{ flex: W.mbr, ...tdS({ textAlign: 'center' }) }}>{firstName(g.member)}</div>
                {/* Invested */}
                <div style={{ flex: W.inv, ...tdS({ textAlign: 'right', opacity: changeBasis === 'today' ? 0.35 : 1 }) }}>
                  {g.costBasisUnknown
                    ? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 11 }}>n/a</span>
                    : formatINRDecimal(g.cost)
                  }
                </div>
                {/* Current value */}
                <div style={{ flex: W.val, ...tdS({ textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: 600 }) }}>
                  {formatINRDecimal(g.value)}
                </div>
                {/* Change */}
                <div style={{ flex: W.chg, ...tdS({ textAlign: 'right' }) }}>
                  {changeBasis === 'today' ? (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>
                      {goldFreshToday ? '—' : 'Not refreshed today'}
                    </span>
                  ) : gain == null ? (
                    <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 11 }}>cost unknown</span>
                  ) : (
                    <span style={{ color: gainClr, fontWeight: 500 }}>
                      {gain >= 0 ? '+' : ''}{formatINRDecimal(gain)}
                      {gainPct != null && (
                        <span style={{ fontSize: 9, background: gain >= 0 ? 'var(--color-positive-bg)' : 'var(--color-negative-bg)', color: gainClr, borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>
                          {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {/* Actions column — pencil for admin, empty for others */}
                <div style={{ flex: W.act, textAlign: 'right', padding: '0 6px' }}>
                  {isAdmin && (
                    <button
                      onClick={() => startEdit(g)}
                      title="Edit this item"
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1, opacity: 0.55 }}
                    >
                      ✎
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* Totals row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', borderTop: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
        <div style={{ flex: W.name, fontSize: 11, color: 'var(--color-text-muted)', fontStyle: open ? 'italic' : 'normal' }}>
          {open ? 'Subtotal' : `Gold (${rows.length})`}
        </div>
        <div style={{ flex: W.wt, ...tdS({ textAlign: 'right', fontSize: 11 }) }}>
          {totalGrams.toFixed(3)}
        </div>
        <div style={{ flex: W.mbr }} />
        <div style={{ flex: W.inv, ...tdS({ textAlign: 'right', fontSize: 11, opacity: changeBasis === 'today' ? 0.35 : 1 }) }}>
          {validCosts.length > 0 ? formatINRDecimal(totalInvested) : '—'}{hasPartial && validCosts.length > 0 ? '*' : ''}
        </div>
        <div style={{ flex: W.val, ...tdS({ textAlign: 'right', fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 600 }) }}>
          {formatINRDecimal(totalValue)}
        </div>
        <div style={{ flex: W.chg, fontSize: 11, padding: '0 6px', textAlign: 'right',
          color: changeVal != null ? (isPos ? 'var(--color-positive)' : 'var(--color-negative)') : 'var(--color-text-muted)',
          fontWeight: changeVal != null ? 500 : 400,
        }}>
          {changeVal != null
            ? `${changeVal >= 0 ? '+' : ''}${formatINRDecimal(changeVal)}${sinceGainPct != null ? ` (${sinceGainPct >= 0 ? '+' : ''}${sinceGainPct.toFixed(1)}%)` : ''}`
            : '—'
          }{hasPartial && changeBasis === 'since' ? '*' : ''}
        </div>
        <div style={{ flex: W.act }} />
      </div>
    </div>
  )
}

// ── Real Estate section ───────────────────────────────────────────────────

function RealEstateSection({ items, activeMember, sort }) {
  const rows = useMemo(() => {
    const filtered = activeMember === 'All'
      ? items
      : items.filter(p => {
          if (matchesMember(p, activeMember)) return true
          return (p.coOwners || []).some(c => matchesMember({ member: c.member }, activeMember))
        })

    const r = filtered.map(p => {
      let value = p.currentValue || 0
      if (activeMember !== 'All') {
        if (matchesMember(p, activeMember)) {
          value = value * ((p.ownershipPct ?? 100) / 100)
        } else {
          const co = (p.coOwners || []).find(c => matchesMember({ member: c.member }, activeMember))
          value = co ? value * ((co.pct || 0) / 100) : 0
        }
      }
      const ownerNames = activeMember !== 'All'
        ? [activeMember]
        : [p.member, ...(p.coOwners || []).map(c => c.member)].filter(Boolean)
      return { ...p, displayValue: value, owners: [...new Set(ownerNames)] }
    })

    if (sort === 'name') r.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else r.sort((a, b) => b.displayValue - a.displayValue)
    return r
  }, [items, activeMember, sort])

  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.displayValue, 0)

  return (
    <>
      <SectionHeader label="Real Estate" count={rows.length} total={total} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 14px 6px' }}>
        <Th flex={1} align="left">Property</Th>
        <Th flex="0 0 140px" align="left">Owners</Th>
        <Th flex="0 0 90px">Current Value</Th>
      </div>
      {rows.map((p, i) => (
        <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name || p.address || 'Property'}
          </div>
          <Td flex="0 0 140px" align="left" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {p.owners.map(o => firstName(o)).join(' · ')}
          </Td>
          <Td flex="0 0 90px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatShort(p.displayValue)}</Td>
        </div>
      ))}
    </>
  )
}

// ── Deposits section (FD + Cash combined) ────────────────────────────────

function DepositsSection({ fixedIncome, cashAssets, activeMember, sort, changeBasis }) {
  const rows = useMemo(() => {
    const fdRows   = fixedIncome.filter(f => matchesMember(f, activeMember)).map(f => ({
      id:    f.id, name: f.name, member: f.member,
      value: f.maturityValue || f.principal || 0,
      cost:  f.principal || 0,
      costBasisUnknown: !f.principal,
      todayChange: null,
      sub:   f.maturityDate ? `Matures ${f.maturityDate}${f.rate ? ` · ${f.rate}%` : ''}` : (f.rate ? `${f.rate}%` : null),
      badge: 'FD',
    }))
    const cashRows = cashAssets.filter(a => matchesMember(a, activeMember)).map(a => ({
      id:    a.id, name: a.name, member: a.member,
      value: a.value || 0,
      cost:  a.value || 0,
      costBasisUnknown: false,
      todayChange: null,
      sub:   null,
      badge: 'CASH',
    }))
    const all = [...fdRows, ...cashRows]
    if (sort === 'name')   all.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sort === 'change' && changeBasis === 'since') all.sort((a, b) => (b.value - b.cost) - (a.value - a.cost))
    else all.sort((a, b) => b.value - a.value)
    return all
  }, [fixedIncome, cashAssets, activeMember, sort, changeBasis])

  if (rows.length === 0) return null

  return (
    <GroupBand label="Deposits & Cash" rows={rows} changeBasis={changeBasis}>
      {rows.map((r, i) => (
        <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <Badge label={r.badge} color="var(--color-text-muted)" bg="var(--color-border-primary)" />
            </div>
            {r.sub && <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>{r.sub}</div>}
          </div>
          <Td flex="0 0 80px" align="center">{firstName(r.member)}</Td>
          <Td flex="0 0 90px" style={{ opacity: changeBasis === 'today' ? 0.35 : 1 }}>
            {r.costBasisUnknown
              ? <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 11 }}>n/a</span>
              : formatShort(r.cost)
            }
          </Td>
          <Td flex="0 0 90px" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatShort(r.value)}</Td>
          <RowChangeCell value={r.value} cost={r.cost} todayChange={null} costBasisUnknown={r.costBasisUnknown} changeBasis={changeBasis} />
        </div>
      ))}
    </GroupBand>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function Holdings({ activeMember, isReadOnly, activeView = 'all' }) {
  const { data, set } = useStore()
  const storeSetRef   = useRef(null)
  storeSetRef.current = set

  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'

  const [assetFilter, setAssetFilter] = useState(VIEW_TO_FILTER[activeView] || 'all')
  const [sort, setSort] = useState('value')
  const [goldTypeFilter, setGoldTypeFilter] = useState('all')
  const [changeBasis, setChangeBasis] = useState('since')

  const goldFreshToday = useMemo(() => {
    const updated = load(KEYS.GOLD_PRICE_UPDATED, null)
    return updated ? new Date(updated).toDateString() === new Date().toDateString() : false
  }, [])

  // Sync internal filter when sidebar navigates with a view
  useEffect(() => {
    setAssetFilter(VIEW_TO_FILTER[activeView] || 'all')
  }, [activeView])

  // ── Action state ──────────────────────────────────────────
  const [fetchingPrices,  setFetchingPrices]  = useState(false)
  const [fetchingGold,    setFetchingGold]    = useState(false)
  const [goldPriceError,  setGoldPriceError]  = useState(null)
  const [goldPriceMeta,   setGoldPriceMeta]   = useState(null)
  const [showImport,      setShowImport]      = useState(false)
  const [sipModal,        setSipModal]        = useState(null)
  const [lastPriceUpdate, setLastPriceUpdate] = useState(() => load(KEYS.PRICE_UPDATED, null))

  // ── Gold price refresh ────────────────────────────────────
  const handleRefreshGoldPrices = useCallback(async () => {
    setFetchingGold(true)
    setGoldPriceError(null)
    try {
      const res  = await fetch('/api/gold-price')
      const json = await res.json()
      if (!res.ok || !json.success) {
        setGoldPriceError(json.error || 'Unable to fetch gold price. Enter manually.')
        return
      }
      const normalizedPrices = {
        24: json.prices[24] ?? json.prices['24'],
        22: json.prices[22] ?? json.prices['22'],
        18: json.prices[18] ?? json.prices['18'],
      }
      storeSetRef.current(KEYS.GOLD_PRICES, normalizedPrices)
      save(KEYS.GOLD_PRICE_UPDATED, new Date().toISOString())
      setGoldPriceMeta(json.meta || null)
    } catch (err) {
      setGoldPriceError('Network error. Check connection and try again.')
    } finally {
      setFetchingGold(false)
    }
  }, [])

  // Auto-refresh gold if stale (>12h)
  useEffect(() => {
    const lastUpdated = load(KEYS.GOLD_PRICE_UPDATED, null)
    const isStale = !lastUpdated || Date.now() - new Date(lastUpdated).getTime() > 12 * 60 * 60 * 1000
    if (isStale) handleRefreshGoldPrices()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Investment price refresh ──────────────────────────────
  const refreshPrices = useCallback(async (forceAll = false) => {
    const investments = data?.investments ?? []
    if (investments.length === 0) return
    const cache = { ...(data?.priceCache ?? {}) }
    const map   = new Map(investments.map(inv => [inv.id, { ...inv }]))
    const now   = Date.now()

    const toFetch = forceAll
      ? investments
      : investments.filter(inv => {
          const entry = cache[getCacheKey(inv)]
          return !entry || entry.status === 'error' || (now - entry.fetchedAt) >= PRICE_TTL_MS
        })

    if (toFetch.length === 0) return
    setFetchingPrices(true)

    // MFs — sequential, deduplicated
    const mfToFetch = toFetch.filter(inv => inv.isMF && inv.mfCode)
    const uniqueCodes = [...new Set(mfToFetch.map(inv => inv.mfCode))]
    const navMap = {}

    for (const code of uniqueCodes) {
      const rep    = mfToFetch.find(inv => inv.mfCode === code)
      const newNAV = await fetchSingleMFNav(code)
      if (newNAV && isNAVReasonable(newNAV, rep?.currentPrice || 0)) {
        navMap[code] = newNAV
        cache[`mf:${code}`] = { fetchedAt: now, status: 'ok' }
      } else {
        cache[`mf:${code}`] = { fetchedAt: cache[`mf:${code}`]?.fetchedAt ?? 0, status: 'error' }
      }
      await new Promise(r => setTimeout(r, 400))
    }

    for (const inv of investments) {
      if (!inv.isMF || !inv.mfCode) continue
      const entry = map.get(inv.id)
      const nav   = navMap[inv.mfCode]
      if (nav && entry) {
        entry.currentPrice = nav
        entry.flags = (entry.flags || []).filter(f => f !== 'manual')
      }
    }

    // Stocks — parallel batches
    const stocksToFetch = toFetch.filter(inv => !inv.isMF && inv.ticker)
    for (let i = 0; i < stocksToFetch.length; i += 5) {
      await Promise.all(stocksToFetch.slice(i, i + 5).map(async inv => {
        const key   = getCacheKey(inv)
        const price = await fetchStockPrice(inv.ticker)
        if (price != null) {
          const entry = map.get(inv.id)
          if (entry) { entry.currentPrice = price; entry.flags = (entry.flags || []).filter(f => f !== 'manual') }
          cache[key] = { fetchedAt: now, status: 'ok' }
        } else {
          cache[key] = { fetchedAt: cache[key]?.fetchedAt ?? 0, status: 'error' }
        }
      }))
      if (i + 5 < stocksToFetch.length) await new Promise(r => setTimeout(r, 500))
    }

    storeSetRef.current(KEYS.INVESTMENTS, investments.map(inv => map.get(inv.id) || inv))
    storeSetRef.current(KEYS.PRICE_CACHE, cache)
    setFetchingPrices(false)
    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    setLastPriceUpdate(ts)
    save(KEYS.PRICE_UPDATED, ts)
  }, [data?.investments, data?.priceCache]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh prices on mount, every 15 min
  useEffect(() => {
    refreshPrices()
    const interval = setInterval(() => refreshPrices(), 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── SIP config ────────────────────────────────────────────
  function handleSIPConfig(invId) {
    const inv = (data?.investments ?? []).find(i => i.id === invId)
    if (inv) setSipModal({ type: 'config', inv })
  }
  function handleGoldUpdate(updatedItem) {
    const gold = data?.gold ?? []
    set(KEYS.GOLD, gold.map(g => String(g.id) === String(updatedItem.id) ? updatedItem : g))
  }

  function handleSaveInvestment(updated) {
    const investments = data?.investments ?? []
    set(KEYS.INVESTMENTS, investments.map(i => i.id === updated.id ? updated : i))
    setSipModal(null)
  }

  // ── Derived data ──────────────────────────────────────────
  const latestSnap = useMemo(() => {
    const snaps = data?.snapshots ?? []
    return snaps.length > 0 ? snaps[snaps.length - 1] : null
  }, [data?.snapshots])

  const members = getMembers(data)

  const invRows = useMemo(
    () => buildInvestmentRows(data?.investments ?? [], activeMember, latestSnap),
    [data?.investments, activeMember, latestSnap]
  )

  const goldPrices = data?.goldPrices ?? { 24: 15496, 22: 14205, 18: 9386 }

  // ── Portfolio donut data (all view) ──────────────────────
  const portfolioDonutData = useMemo(() => {
    const invValue   = invRows.reduce((s, r) => s + r.value, 0)
    const goldAll    = (data?.gold ?? []).filter(g => matchesMember(g, activeMember))
    const goldValue  = goldAll.reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || 0), 0)
    const reAll      = activeMember === 'All' ? (data?.realEstate ?? []) : (data?.realEstate ?? []).filter(p => matchesMember(p, activeMember) || (p.coOwners || []).some(c => matchesMember({ member: c.member }, activeMember)))
    const realtyValue = reAll.reduce((s, p) => {
      let v = p.currentValue || 0
      if (activeMember !== 'All') {
        if (matchesMember(p, activeMember)) v = v * ((p.ownershipPct ?? 100) / 100)
        else {
          const co = (p.coOwners || []).find(c => matchesMember({ member: c.member }, activeMember))
          v = co ? v * ((co.pct || 0) / 100) : 0
        }
      }
      return s + v
    }, 0)
    const fdValue    = (data?.fixedIncome ?? []).filter(f => matchesMember(f, activeMember)).reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
    const cashValue  = (data?.cashAssets  ?? []).filter(a => matchesMember(a, activeMember)).reduce((s, a) => s + (a.value || 0), 0)
    return [
      { label: 'Investments',   value: invValue,            color: 'var(--color-accent)',    viewId: 'invest' },
      { label: 'Gold',          value: goldValue,           color: 'var(--color-gold)',       viewId: 'gold' },
      { label: 'Real Estate',   value: realtyValue,         color: 'var(--color-info)',       viewId: 'realty' },
      { label: 'Deposits & Cash', value: fdValue + cashValue, color: 'var(--color-positive)', viewId: 'deposits' },
    ].filter(d => d.value > 0)
  }, [invRows, data, activeMember, goldPrices])

  // ── Per-view stat computations ────────────────────────────
  const statCards = useMemo(() => {
    const invValue = invRows.reduce((s, r) => s + r.value, 0)
    const invCost  = invRows.reduce((s, r) => s + (r.cost || 0), 0)
    const invGain  = invValue - invCost
    const sipCount = invRows.filter(r => r.isSIP).length

    const fdRaw   = (data?.fixedIncome ?? []).filter(f => matchesMember(f, activeMember))
    const cashRaw = (data?.cashAssets  ?? []).filter(a => matchesMember(a, activeMember))
    const fdTotal    = fdRaw.reduce((s, f)  => s + (f.maturityValue || f.principal || 0), 0)
    const cashTotal  = cashRaw.reduce((s, a) => s + (a.value || 0), 0)
    const depTotal   = fdTotal + cashTotal
    const fdCount    = fdRaw.length

    const goldAll = (data?.gold ?? []).filter(g => matchesMember(g, activeMember))
    const goldValue  = goldAll.reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || 0), 0)
    const goldCost      = goldAll.reduce((s, g) => s + (g.grams || 0) * (g.buyPricePerGram || 0), 0)
    const hasKnownCost  = goldAll.some(g => g.buyPricePerGram != null)
    const goldGain      = hasKnownCost ? goldValue - goldCost : null

    const g24 = goldPrices[24] || 0
    const g22 = goldPrices[22] || 0

    if (assetFilter === 'invest') return [
      { label: 'Portfolio Value',  value: formatShort(invValue) },
      { label: 'Invested / Cost',  value: invCost > 0 ? formatShort(invCost) : '—' },
      { label: 'Total Gain',       value: invCost > 0 ? formatShort(invGain) : '—',
        valueColor: invGain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
        sub: sipCount > 0 ? `${sipCount} active SIP${sipCount !== 1 ? 's' : ''}` : null },
    ]
    if (assetFilter === 'gold') return [
      { label: 'Gold Value',       value: formatShort(goldValue), valueColor: 'var(--color-gold)' },
      { label: 'Purchase Cost',    value: goldCost > 0 ? formatShort(goldCost) : '—' },
      { label: 'Appreciation',     value: goldGain != null ? formatShort(goldGain) : '—',
        valueColor: goldGain != null && goldGain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)',
        sub: `24K ₹${(g24/1000).toFixed(0)}K · 22K ₹${(g22/1000).toFixed(0)}K per g` },
    ]
    if (assetFilter === 'deposits') return [
      { label: 'Total Balance',    value: formatShort(depTotal) },
      { label: 'Fixed Deposits',   value: formatShort(fdTotal),
        sub: fdCount > 0 ? `${fdCount} FD${fdCount !== 1 ? 's' : ''}` : 'None' },
      { label: 'Cash & Accounts',  value: formatShort(cashTotal),
        sub: 'Included in liquidity' },
    ]
    // all
    const totalVal  = invValue + goldValue + fdTotal + cashTotal
    const totalCost = invCost + goldCost
    const totalGain = totalCost > 0 ? totalVal - totalCost : null
    return [
      { label: 'Portfolio Value',  value: formatShort(totalVal) },
      { label: 'Invested / Cost',  value: totalCost > 0 ? formatShort(totalCost) : '—' },
      { label: 'Total Gain',       value: totalGain != null ? formatShort(totalGain) : '—',
        valueColor: totalGain != null && totalGain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' },
    ]
  }, [invRows, data, assetFilter, goldPrices, activeMember])

  // 'deposits' shows both FD and Cash sections
  const show = (id) => {
    if (assetFilter === 'all')      return true
    if (assetFilter === 'deposits') return id === 'deposits'
    return assetFilter === id
  }

  const chipBtn = (active) => ({
    padding: '5px 12px', borderRadius: 20, border: '0.5px solid',
    borderColor: active ? 'var(--color-accent)' : 'var(--color-border-primary)',
    background:  active ? 'var(--color-accent-bg)' : 'transparent',
    color:       active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
  })

  const actionBtn = (variant = 'ghost', disabled = false) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 7, fontSize: 12,
    border:      variant === 'primary' ? 'none' : '0.5px solid var(--color-border-primary)',
    background:  variant === 'primary' ? 'var(--color-accent)' : 'var(--color-background-secondary)',
    color:       variant === 'primary' ? '#fff' : 'var(--color-text-secondary)',
    cursor:      disabled ? 'not-allowed' : 'pointer',
    opacity:     disabled ? 0.6 : 1,
  })

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto', fontFamily: 'var(--font-sans)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
            Holdings
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {lastPriceUpdate ? `Prices updated ${lastPriceUpdate}` : 'Unified view · all positions'}
            {activeMember !== 'All' ? ` · ${activeMember}` : ''}
          </p>
        </div>
        {!isReadOnly && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => setShowImport(true)} style={actionBtn('primary')}>
              <i className="ti ti-upload" style={{ fontSize: 13 }} aria-hidden="true" />
              Import
            </button>
            <button
              onClick={() => refreshPrices()}
              disabled={fetchingPrices}
              style={{ ...actionBtn('ghost', fetchingPrices), color: fetchingPrices ? 'var(--color-text-muted)' : 'var(--color-accent)' }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 13, animation: fetchingPrices ? 'spin 1s linear infinite' : 'none' }} aria-hidden="true" />
              {fetchingPrices ? 'Refreshing…' : 'Prices'}
            </button>
            <button
              onClick={handleRefreshGoldPrices}
              disabled={fetchingGold}
              style={{ ...actionBtn('ghost', fetchingGold), color: fetchingGold ? 'var(--color-text-muted)' : 'var(--color-gold)' }}
            >
              <i className="ti ti-refresh" style={{ fontSize: 13, animation: fetchingGold ? 'spin 1s linear infinite' : 'none' }} aria-hidden="true" />
              {fetchingGold ? 'Fetching…' : 'Gold'}
            </button>
          </div>
        )}
      </div>

      {/* ── Gold price error / meta ── */}
      {goldPriceError && (
        <div style={{
          fontSize: 12,
          color: 'var(--color-negative)',
          background: 'var(--color-negative-bg)',
          border: '0.5px solid var(--color-negative)',
          borderRadius: 6,
          padding: '6px 10px',
          marginBottom: 10,
        }}>
          ⚠ {goldPriceError}
        </div>
      )}
      {!goldPriceError && goldPriceMeta?.source && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          Gold · {goldPriceMeta.source} · {goldPriceMeta.fetchedAt ? new Date(goldPriceMeta.fetchedAt).toLocaleTimeString('en-IN') : ''}
        </div>
      )}

      {/* ── Stat cards ── */}
      <StatRow cards={statCards} />

      {/* ── Filter strip + controls ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {/* Row 1: category pills + right-side controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CLASS_FILTERS.map(f => (
              <button key={f.id} onClick={() => { setAssetFilter(f.id); if (f.id !== 'gold') setGoldTypeFilter('all') }} style={chipBtn(assetFilter === f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Change basis toggle */}
            <div style={{ display: 'flex', border: '0.5px solid var(--color-border-primary)', borderRadius: 6, overflow: 'hidden' }}>
              {[{ id: 'since', label: 'Since purchase' }, { id: 'today', label: 'Today' }].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setChangeBasis(opt.id)}
                  style={{
                    padding: '5px 10px', border: 'none', fontSize: 11, cursor: 'pointer',
                    background: changeBasis === opt.id ? 'var(--color-accent)' : 'transparent',
                    color: changeBasis === opt.id ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-primary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}
            >
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {/* Row 2: gold sub-filter — only in gold view, indented */}
        {assetFilter === 'gold' && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 10 }}>
            {[
              { id: 'all',        label: 'All Gold' },
              { id: 'investment', label: 'Investment' },
              { id: 'jewellery',  label: 'Jewellery' },
            ].map(g => (
              <button key={g.id} onClick={() => setGoldTypeFilter(g.id)} style={chipBtn(goldTypeFilter === g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Portfolio donut (all assets view) ── */}
      {assetFilter === 'all' && portfolioDonutData.length >= 2 && (
        <PortfolioDonut data={portfolioDonutData} onSegmentClick={(d) => setAssetFilter(d.viewId)} />
      )}

      {/* ── Allocation donut (investments view only) ── */}
      {assetFilter === 'invest' && invRows.length > 0 && (
        <AllocationDonut rows={invRows} />
      )}

      {/* ── Sections ── */}
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-primary)', borderRadius: 10, overflow: 'hidden', paddingBottom: 8 }}>
        {show('invest') && (
          <InvestmentsSection rows={invRows} sort={sort} members={members} onSIPConfig={handleSIPConfig} changeBasis={changeBasis} />
        )}
        {show('gold') && (
          <GoldSection items={data?.gold ?? []} activeMember={activeMember} goldPrices={goldPrices} sort={sort} goldTypeFilter={goldTypeFilter} changeBasis={changeBasis} goldFreshToday={goldFreshToday} isAdmin={isAdmin} onUpdateGold={handleGoldUpdate} members={members} />
        )}
        {show('realty') && (
          <RealEstateSection items={data?.realEstate ?? []} activeMember={activeMember} sort={sort} />
        )}
        {show('deposits') && (
          <DepositsSection fixedIncome={data?.fixedIncome ?? []} cashAssets={data?.cashAssets ?? []} activeMember={activeMember} sort={sort} changeBasis={changeBasis} />
        )}

        {invRows.length === 0 && (data?.gold ?? []).length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            No holdings to display
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showImport && (
        <UpdateHoldingsModal activeMember={activeMember} onClose={() => setShowImport(false)} />
      )}
      {sipModal?.type === 'config' && (
        <SIPConfigModal
          inv={sipModal.inv}
          onSave={handleSaveInvestment}
          onCancel={() => setSipModal(null)}
        />
      )}
      {sipModal?.type === 'instalment' && (
        <SIPInstalmentModal
          inv={sipModal.inv}
          onConfirm={handleSaveInvestment}
          onCancel={() => setSipModal(null)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
