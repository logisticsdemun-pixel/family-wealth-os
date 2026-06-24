'use client'
import { useState, useEffect, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { KEYS } from './lib/storage'
import { formatINR, memberColor, memberInitials, firstName, MEMBERS, computeOutstanding } from './lib/format'
import { DEFAULT_GOLD_PRICES } from './lib/seedData'
import { takeSnapshot } from './lib/snapshot'
import { useStore } from './lib/store'
import { computeMemberMetrics } from './lib/metrics'
import PageLayout from './components/PageLayout'
import DailySummary from './components/DailySummary'

const ASSET_TYPES = ['Cash & Savings', 'Fixed Deposit', 'EPF / PPF', 'Real Estate', 'Crypto', 'Other']
const LIABILITY_TYPES = ['Credit Card', 'Personal Loan', 'Education Loan', 'Other Debt']

// ── Shared style atoms ─────────────────────────────────────
const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}
const label = { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', margin: '0 0 4px', display: 'block' }
const btnPrimary = { padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }
const btnGhost = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }

function filterByMember(arr, member) {
  return member === 'All' ? arr : arr.filter(x => x.member === member)
}

// ── Net worth computation helpers ──────────────────────────
function investmentValue(investments, member) {
  return filterByMember(investments, member)
    .reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
}
function goldValue(gold, goldPrices, member) {
  return filterByMember(gold, member)
    .filter(g => g.category === 'Investment')
    .reduce((s, g) => s + g.grams * (goldPrices[g.carat] ?? 0), 0)
}
function jewelleryValue(gold, goldPrices, member) {
  return filterByMember(gold, member)
    .filter(g => g.category === 'Jewellery')
    .reduce((s, g) => s + g.grams * (goldPrices[g.carat] ?? 0), 0)
}
function cashValue(cashAssets, member) {
  return filterByMember(cashAssets, member).reduce((s, a) => s + (a.value || 0), 0)
}
function fdValue(fixedIncome, member) {
  return filterByMember(fixedIncome, member).reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
}
function loanLiabilities(loans, member) {
  const relevant = member === 'All'
    ? loans
    : loans.filter(l => !l.isShared && l.member === member)
  return relevant.reduce((s, l) => {
    const o = computeOutstanding(l)
    return s + (o ?? 0)
  }, 0)
}
function sharedLoanTotal(loans) {
  return loans.filter(l => l.isShared).reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)
}
function manualLiabilityValue(liabilities, member) {
  return filterByMember(liabilities, member).reduce((s, l) => s + (l.value || 0), 0)
}
function realEstateValue(properties, member) {
  if (member === 'All') {
    return properties.reduce((s, p) => s + (p.currentValue || 0), 0)
  }
  return properties.reduce((s, p) => {
    if (p.member === member) return s + (p.currentValue || 0) * ((p.ownershipPct ?? 100) / 100)
    const co = (p.coOwners || []).find(c => c.member === member)
    return co ? s + (p.currentValue || 0) * (co.pct / 100) : s
  }, 0)
}

// ── Chart helpers ──────────────────────────────────────────
function fmtAxisINR(v) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`
  return `₹${v}`
}

// ── Snapshot period helpers ────────────────────────────────
function getValidSnapshots(snapshots) {
  if (!snapshots || snapshots.length < 2) return []
  const sorted = [...snapshots]
    .filter(s => s.date && s.netWorth > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  if (sorted.length === 0) return []
  const latestNW = sorted[0].netWorth
  return sorted.filter(s => Math.abs((s.netWorth - latestNW) / latestNW) * 100 < 50)
}

function findClosestSnapshot(snapshots, targetDate, direction = 'before') {
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)
  const valid = snapshots.filter(s => {
    const d = new Date(s.date)
    if (direction === 'before') return d < target
    return true
  })
  if (valid.length === 0) return null
  return valid.reduce((closest, s) => {
    if (!closest) return s
    const sDiff = Math.abs(new Date(s.date) - target)
    const cDiff = Math.abs(new Date(closest.date) - target)
    return sDiff < cDiff ? s : closest
  })
}

function computeChange(fromSnap, toSnap) {
  if (!fromSnap || !toSnap) return null
  const fromNW = fromSnap.netWorth || 0
  const toNW   = toSnap.netWorth   || 0
  const change    = toNW - fromNW
  const changePct = fromNW > 0 ? (change / fromNW) * 100 : 0
  const byMember  = {}
  for (const m of ['Aseem Saxena', 'Poonam Saxena', 'Devashish Saxena', 'Shivansh Saxena']) {
    const now    = toSnap.byMember?.[m]?.netWorth   || 0
    const before = fromSnap.byMember?.[m]?.netWorth || 0
    byMember[m] = { change: now - before, changePct: before > 0 ? ((now - before) / before) * 100 : 0, current: now }
  }
  const byCategory = {}
  for (const cat of ['investments', 'gold', 'realEstate', 'cash', 'liabilities']) {
    const now    = toSnap.byCategory?.[cat]   || 0
    const before = fromSnap.byCategory?.[cat] || 0
    byCategory[cat] = { change: now - before, changePct: before > 0 ? ((now - before) / before) * 100 : 0 }
  }
  return { change, changePct, fromDate: fromSnap.date, toDate: toSnap.date, fromNW, toNW, byMember, byCategory }
}

function getPeriodChange(snapshots, period, customFrom, customTo) {
  const valid = getValidSnapshots(snapshots)
  if (valid.length < 2) return null
  const latest = valid[0]
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  let compareTarget
  switch (period) {
    case 'today': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      compareTarget = yesterday
      break
    }
    case 'week': {
      const weekAgo = new Date(today)
      weekAgo.setDate(weekAgo.getDate() - 7)
      compareTarget = weekAgo
      break
    }
    case 'month':
      compareTarget = new Date(today.getFullYear(), today.getMonth(), 1)
      break
    case 'year':
      compareTarget = new Date(today.getFullYear(), 0, 1)
      break
    case 'custom': {
      if (!customFrom) return null
      const fromSnap = findClosestSnapshot(valid, new Date(customFrom), 'before')
      if (customTo) {
        const toSnap = findClosestSnapshot(valid, new Date(customTo), 'closest')
        return computeChange(fromSnap, toSnap)
      }
      return computeChange(fromSnap, latest)
    }
    default:
      return null
  }
  const compareSnap = findClosestSnapshot(valid, compareTarget, 'before')
  return computeChange(compareSnap, latest)
}

// ── Allocation bar ─────────────────────────────────────────
function AllocationBar({ segments }) {
  const total = segments.reduce((s, sg) => s + sg.value, 0)
  if (!total) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {segments.map((sg, i) => {
        const pct = (sg.value / total * 100)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 90, fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{sg.label}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--color-border-tertiary)' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: sg.color }} />
            </div>
            <span style={{ width: 40, fontSize: 11, textAlign: 'right', color: 'var(--color-text-primary)', flexShrink: 0 }}>
              {pct.toFixed(1)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Member avatar ──────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: memberColor(name),
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 600, flexShrink: 0,
      letterSpacing: '-0.5px',
    }}>
      {memberInitials(name)}
    </div>
  )
}

// ── Inline editable row ────────────────────────────────────
function EditableRow({ item, onSave, onDelete, valueLabel = 'Value', isLiability = false }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...item })

  function save() {
    onSave({ ...form, value: parseFloat(form.value) || 0 })
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={label}>Name</span>
            <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <span style={label}>Type</span>
            <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {(isLiability ? LIABILITY_TYPES : ASSET_TYPES).map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Member</span>
            <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
              {MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>{valueLabel} (₹)</span>
            <input type="number" style={inp} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
          </div>
          {isLiability && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id={`shared-${item.id}`} checked={!!form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
              <label htmlFor={`shared-${item.id}`} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Shared family liability</label>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} style={btnPrimary}>Save</button>
          <button onClick={() => setEditing(false)} style={btnGhost}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={item.member} size={28} />
        <div>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {item.name}
            {isLiability && item.isShared && (
              <span style={{ marginLeft: 6, fontSize: '0.7rem', backgroundColor: 'var(--amber-faint)', color: 'var(--amber)', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                Shared
              </span>
            )}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.type} · {firstName(item.member)}</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 600, color: isLiability ? 'var(--loss)' : 'var(--text-primary)', fontSize: '0.9rem' }}>
          {formatINR(item.value)}
        </span>
        <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 6px' }}>Edit</button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 6px' }}>✕</button>
      </div>
    </div>
  )
}

// ── Add form ───────────────────────────────────────────────
function AddForm({ onAdd, onCancel, isLiability = false, activeMember = 'All' }) {
  const [form, setForm] = useState({
    name: '', type: isLiability ? LIABILITY_TYPES[0] : ASSET_TYPES[0],
    member: activeMember !== 'All' ? activeMember : MEMBERS[0], value: '', isShared: false,
  })

  function handleSubmit(e) {
    e.preventDefault()
    onAdd({ ...form, value: parseFloat(form.value) || 0, id: crypto.randomUUID() })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 20, marginTop: 12 }}>
      <p style={{ ...label, marginBottom: 12, fontSize: '0.75rem' }}>{isLiability ? 'ADD LIABILITY' : 'ADD CASH / ASSET'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <span style={label}>Name</span>
          <input required style={inp} placeholder="e.g. SBI Savings" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span style={label}>Type</span>
          <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {(isLiability ? LIABILITY_TYPES : ASSET_TYPES).map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {activeMember === 'All' && (
          <div>
            <span style={label}>Member</span>
            <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
              {MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div>
          <span style={label}>Amount (₹)</span>
          <input required type="number" style={inp} placeholder="0" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
        </div>
        {isLiability && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <input type="checkbox" id="new-shared" checked={form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
            <label htmlFor="new-shared" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Shared family liability</label>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" style={btnPrimary}>Add</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Main Dashboard component ───────────────────────────────
export default function Dashboard({ activeMember }) {
  const { data, set } = useStore()

  const investments = data?.investments ?? []
  const gold = data?.gold ?? []
  const goldPrices = data?.goldPrices ?? DEFAULT_GOLD_PRICES
  const loans = data?.loans ?? []
  const fixedIncome = data?.fixedIncome ?? []
  const cashAssets = data?.cashAssets ?? []
  const liabilities = data?.liabilities ?? []
  const realEstate = data?.realEstate ?? []
  const snapshots = data?.snapshots ?? []

  const [showAddCash, setShowAddCash] = useState(false)
  const [showAddLiability, setShowAddLiability] = useState(false)
  const [showDailySummary, setShowDailySummary] = useState(false)
  const [activePeriod, setActivePeriod] = useState('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState(new Date().toISOString().split('T')[0])
  const [appliedCustomFrom, setAppliedCustomFrom] = useState('')
  const [appliedCustomTo, setAppliedCustomTo] = useState('')

  // ── Shared metrics (identical logic to sidebar) ──────────
  const viewMetrics = useMemo(
    () => computeMemberMetrics(data, activeMember),
    [data, activeMember]
  )

  // ── Auxiliary values not in shared metrics ────────────────
  const { unpricedHoldings, invGain, sharedLoans } = useMemo(() => {
    const memberInv = filterByMember(investments, activeMember)
    return {
      unpricedHoldings: memberInv.filter(i => i.currentPrice == null).length,
      invGain: memberInv.reduce((s, i) => s + i.units * ((i.currentPrice ?? i.buyPrice) - i.buyPrice), 0),
      sharedLoans: activeMember !== 'All' ? sharedLoanTotal(loans) : 0,
    }
  }, [investments, loans, activeMember])

  // ── Snapshot on first data load ──────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return
    const allMetrics = computeMemberMetrics(data, 'All')
    const byMember = Object.fromEntries(
      MEMBERS.map(m => {
        const mx = computeMemberMetrics(data, m)
        return [m, {
          netWorth:    Math.round(mx.netWorth),
          investments: Math.round(mx.investments),
          gold:        Math.round(mx.gold),
          realEstate:  Math.round(mx.realEstate),
          cash:        Math.round(mx.cash),
          liabilities: Math.round(mx.liabilities),
        }]
      })
    )
    takeSnapshot(allMetrics.netWorth, {
      totalAssets: Math.round(allMetrics.totalAssets),
      liabilities: Math.round(allMetrics.liabilities),
      byMember,
      byCategory: {
        investments: Math.round(allMetrics.investments),
        gold: Math.round(allMetrics.gold),
        realEstate: Math.round(allMetrics.realEstate),
        cash: Math.round(allMetrics.cash),
        liabilities: Math.round(allMetrics.liabilities),
      },
    })
  }, [!!data])

  // ── Member breakdown rows ────────────────────────────────
  const memberRows = useMemo(() => MEMBERS.map(m => {
    const mx = computeMemberMetrics(data, m)
    return { member: m, inv: mx.investments, re: mx.realEstate, gld: mx.gold, csh: mx.cash, liab: mx.liabilities, net: mx.netWorth }
  }), [data])

  const sharedLiabilities = useMemo(() =>
    (data?.liabilities || [])
      .filter(l => l.isShared || l.shared)
      .reduce((s, l) => s + (l.value || 0), 0) +
    (data?.loans || [])
      .filter(l => l.isShared)
      .reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0),
  [data])

  // ── Allocation segments ──────────────────────────────────
  const allocSegments = useMemo(() => [
    { label: 'Real Estate', value: viewMetrics.realEstate,  color: 'var(--color-accent)' },
    { label: 'Gold',        value: viewMetrics.gold,         color: '#BA7517' },
    { label: 'Investments', value: viewMetrics.investments,  color: '#1D9E75' },
    { label: 'Cash & FDs',  value: viewMetrics.cash,         color: '#378ADD' },
  ].filter(s => s.value > 0), [viewMetrics])

  // ── CRUD helpers ─────────────────────────────────────────
  function saveCash(updated) { set(KEYS.CASH_ASSETS, updated) }
  function saveLiab(updated) { set(KEYS.LIABILITIES, updated) }

  function addCash(item) { saveCash([...cashAssets, item]); setShowAddCash(false) }
  function updateCash(item) { saveCash(cashAssets.map(a => a.id === item.id ? item : a)) }
  function deleteCash(id) { saveCash(cashAssets.filter(a => a.id !== id)) }

  function addLiab(item) { saveLiab([...liabilities, item]); setShowAddLiability(false) }
  function updateLiab(item) { saveLiab(liabilities.map(l => l.id === item.id ? item : l)) }
  function deleteLiab(id) { saveLiab(liabilities.filter(l => l.id !== id)) }

  const filteredCash = filterByMember(cashAssets, activeMember)
  const filteredLiab = filterByMember(liabilities, activeMember)

  // ── Counts for metric card subtitles ─────────────────────
  const invCount       = filterByMember(investments, activeMember).length
  const reCount        = filterByMember(realEstate,  activeMember).length
  const goldCount      = filterByMember(gold,         activeMember).length
  const cashCount      = filterByMember(cashAssets,   activeMember).length
                       + filterByMember(fixedIncome,  activeMember).length
  const totalGoldGrams = filterByMember(gold, activeMember).reduce((s, g) => s + (g.grams || 0), 0)
  const fdCount        = filterByMember(fixedIncome, activeMember).length

  const periodNow = new Date()
  const periodConfig = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'This week' },
    { id: 'month', label: periodNow.toLocaleDateString('en-IN', { month: 'long' }) },
    { id: 'year',  label: periodNow.getFullYear().toString() },
    { id: 'custom', label: 'Custom' },
  ]

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activePeriodData = useMemo(() => {
    if (activePeriod === 'custom') {
      if (!appliedCustomFrom) return null
      return getPeriodChange(snapshots, 'custom', appliedCustomFrom, appliedCustomTo)
    }
    return getPeriodChange(snapshots, activePeriod)
  }, [snapshots, activePeriod, appliedCustomFrom, appliedCustomTo])

  if (showDailySummary) {
    return (
      <DailySummary
        memberFilter={activeMember}
        onBack={() => setShowDailySummary(false)}
        period={activePeriod}
        periodData={activePeriodData}
      />
    )
  }

  return (
    <PageLayout maxWidth={1100}>

      {/* Unpriced holdings warning */}
      {unpricedHoldings > 0 && (
        <div style={{ backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)', borderRadius: 8, padding: '8px 16px', marginBottom: 16, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {unpricedHoldings} holding{unpricedHoldings > 1 ? 's' : ''} valued at cost — refresh prices for live values
        </div>
      )}

      {/* ── HERO — no box, pure typography ───────────────── */}
      <div style={{ marginBottom: 28 }}>
        {/* Eyebrow */}
        <p style={{
          fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px',
        }}>
          {activeMember === 'All' ? 'Family net worth' : `${activeMember.split(' ')[0]}'s net worth`}
        </p>

        {/* Big number */}
        <p style={{
          fontSize: 36, fontWeight: 700, color: viewMetrics.netWorth >= 0 ? 'var(--color-text-primary)' : '#D85A30',
          letterSpacing: '-0.8px', lineHeight: 1, margin: '0 0 16px',
          fontFamily: 'var(--font-inter), sans-serif',
        }}>
          {formatINR(viewMetrics.netWorth)}
        </p>

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Total assets</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.3px', margin: 0 }}>
              {formatINR(viewMetrics.totalAssets)}
            </p>
          </div>

          <div style={{ width: '0.5px', height: 36, background: 'var(--color-border-secondary)', flexShrink: 0 }} />

          <div>
            <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Liabilities</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: viewMetrics.liabilities > 0 ? '#D85A30' : 'var(--color-text-primary)', letterSpacing: '-0.3px', margin: 0 }}>
              {formatINR(viewMetrics.liabilities)}
            </p>
          </div>

          <div style={{ width: '0.5px', height: 36, background: 'var(--color-border-secondary)', flexShrink: 0 }} />

          {/* Period comparison block */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Five period pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {periodConfig.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePeriod(p.id)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, border: '0.5px solid',
                    borderColor: activePeriod === p.id ? 'var(--color-border-secondary)' : 'var(--color-border-tertiary)',
                    background: activePeriod === p.id ? 'var(--color-background-secondary)' : 'transparent',
                    cursor: 'pointer', fontSize: 11,
                    fontWeight: activePeriod === p.id ? 500 : 400,
                    color: activePeriod === p.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    fontFamily: 'inherit',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date picker — only when Custom is active */}
            {activePeriod === 'custom' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                padding: '8px 12px',
                background: 'var(--color-background-secondary)',
                borderRadius: 8,
                border: '0.5px solid var(--color-border-tertiary)',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>From</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || new Date().toISOString().split('T')[0]}
                  onChange={e => setCustomFrom(e.target.value)}
                  style={{
                    fontSize: 12, padding: '3px 8px', borderRadius: 6,
                    border: '0.5px solid var(--color-border-tertiary)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)', fontFamily: 'inherit', cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>to</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setCustomTo(e.target.value)}
                  style={{
                    fontSize: 12, padding: '3px 8px', borderRadius: 6,
                    border: '0.5px solid var(--color-border-tertiary)',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)', fontFamily: 'inherit', cursor: 'pointer',
                  }}
                />
                <button
                  onClick={() => { if (customFrom && customTo) { setAppliedCustomFrom(customFrom); setAppliedCustomTo(customTo) } }}
                  disabled={!customFrom || !customTo}
                  style={{
                    padding: '4px 12px', borderRadius: 20,
                    background: 'var(--color-text-primary)', color: 'var(--color-background-primary)',
                    border: 'none', fontSize: 11, fontWeight: 500,
                    cursor: customFrom && customTo ? 'pointer' : 'not-allowed',
                    opacity: customFrom && customTo ? 1 : 0.5,
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  Apply
                </button>
              </div>
            )}

            {/* Change value */}
            {activePeriodData ? (
              <>
                <button
                  onClick={() => setShowDailySummary(true)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    textAlign: 'left', display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4,
                  }}
                >
                  <span style={{
                    fontSize: 18, fontWeight: 500, letterSpacing: '-0.3px',
                    color: activePeriodData.change >= 0 ? '#2D6A4F' : '#D85A30',
                    textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
                  }}>
                    {activePeriodData.change >= 0 ? '+' : ''}{formatINR(activePeriodData.change)}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                    background: activePeriodData.change >= 0 ? '#EAF3DE' : '#FCEBEB',
                    color: activePeriodData.change >= 0 ? '#3B6D11' : '#A32D2D',
                  }}>
                    {activePeriodData.changePct >= 0 ? '+' : ''}{activePeriodData.changePct.toFixed(2)}%
                  </span>
                </button>
                <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
                  vs{' '}{formatINR(activePeriodData.fromNW)}{' on '}
                  {new Date(activePeriodData.fromDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </>
            ) : (
              activePeriod !== 'custom' && (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  Not enough snapshots yet
                </p>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── METRIC CARDS — white, separated ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          {
            label: 'INVESTMENTS',
            value: formatINR(viewMetrics.investments),
            sub: invGain !== 0
              ? `${invGain >= 0 ? '+' : ''}${fmtAxisINR(invGain)} gain`
              : `${invCount} holding${invCount === 1 ? '' : 's'}`,
            valueColor: 'var(--color-text-primary)',
            subColor: invGain >= 0 ? '#2D6A4F' : '#D85A30',
          },
          {
            label: 'REAL ESTATE',
            value: formatINR(viewMetrics.realEstate),
            sub: `${reCount} propert${reCount === 1 ? 'y' : 'ies'}`,
            valueColor: 'var(--color-text-primary)',
            subColor: 'var(--color-text-secondary)',
          },
          {
            label: 'GOLD',
            value: formatINR(viewMetrics.gold),
            sub: totalGoldGrams > 0 ? `${totalGoldGrams.toFixed(0)}g total` : `${goldCount} item${goldCount === 1 ? '' : 's'}`,
            valueColor: '#C9A84C',
            subColor: 'var(--color-text-secondary)',
          },
          {
            label: 'CASH & FDS',
            value: formatINR(viewMetrics.cash),
            sub: fdCount > 0 ? `${fdCount} FD active` : 'Savings only',
            valueColor: 'var(--color-text-primary)',
            subColor: 'var(--color-text-secondary)',
          },
        ].map(card => (
          <div key={card.label} className="metric-card-white" style={{
            background: '#FFFFFF',
            borderRadius: 10,
            border: '0.5px solid var(--color-border-tertiary)',
            padding: '16px 18px',
          }}>
            <p style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              {card.label}
            </p>
            <p style={{ fontSize: 18, fontWeight: 600, color: card.valueColor, letterSpacing: '-0.3px', margin: card.sub ? '0 0 3px' : 0 }}>
              {card.value}
            </p>
            {card.sub && (
              <p style={{ fontSize: 11, color: card.subColor, margin: 0 }}>{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Inline period breakdown — member + category */}
      {activePeriodData && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              {activePeriod === 'custom'
                ? 'Custom period · Change by member'
                : `${periodConfig.find(p => p.id === activePeriod)?.label} · Change by member`}
            </p>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              {new Date(activePeriodData.fromDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              {' → '}
              {new Date(activePeriodData.toDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </div>

          {/* Member cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            {[
              { name: 'Aseem Saxena',     initials: 'AS', bg: '#E6F1FB', color: '#185FA5' },
              { name: 'Poonam Saxena',    initials: 'PS', bg: '#FAEEDA', color: '#854F0B' },
              { name: 'Devashish Saxena', initials: 'DS', bg: '#EAF3DE', color: '#3B6D11' },
              { name: 'Shivansh Saxena',  initials: 'SS', bg: '#FBEAF0', color: '#993556' },
            ].map(m => {
              const mData = activePeriodData.byMember?.[m.name]
              const change = mData?.change || 0
              const pct    = mData?.changePct || 0
              return (
                <div key={m.name} style={{ background: '#FFFFFF', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, marginBottom: 8 }}>
                    {m.initials}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 2px' }}>{m.name.split(' ')[0]}</p>
                  <p style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.3px', color: change === 0 ? 'var(--color-text-secondary)' : change > 0 ? '#2D6A4F' : '#D85A30', margin: '0 0 1px' }}>
                    {change === 0 ? '—' : (change > 0 ? '+' : '') + formatINR(change)}
                  </p>
                  {change !== 0 && (
                    <p style={{ fontSize: 11, color: change > 0 ? '#2D6A4F' : '#D85A30', margin: 0 }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Category cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { key: 'investments', label: 'Investments' },
              { key: 'gold',        label: 'Gold' },
              { key: 'realEstate',  label: 'Real estate' },
              { key: 'cash',        label: 'Cash & FDs' },
            ].map(cat => {
              const cData  = activePeriodData.byCategory?.[cat.key]
              const change = cData?.change || 0
              const pct    = cData?.changePct || 0
              return (
                <div key={cat.key} style={{ background: '#FFFFFF', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{cat.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.2px', color: change === 0 ? 'var(--color-text-secondary)' : change > 0 ? '#2D6A4F' : '#D85A30', margin: '0 0 2px' }}>
                    {change === 0 ? '—' : (change > 0 ? '+' : '') + formatINR(change)}
                  </p>
                  <p style={{ fontSize: 11, color: change === 0 ? 'var(--color-text-secondary)' : change > 0 ? '#2D6A4F' : '#D85A30', margin: 0 }}>
                    {change === 0 ? 'No change' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Shared loan note */}
      {activeMember !== 'All' && sharedLoans > 0 && (
        <div style={{ backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Shared family liabilities totalling{' '}
          <strong>{formatINR(sharedLoans)}</strong> are excluded from {firstName(activeMember)}&apos;s personal view.
          Switch to <em>All Members</em> to see the full picture.
        </div>
      )}

      {/* ── BOTTOM ROW ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 28 }}>

        {/* LEFT — chart + member breakdown table */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Net worth history chart */}
          <div style={{ ...card, padding: '20px 24px' }}>
            <p style={{ ...label, marginBottom: 12, fontSize: '0.72rem' }}>NET WORTH HISTORY</p>
            {snapshots.length >= 2 ? (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={snapshots.slice(-90)} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="netWorth"
                    stroke="var(--color-accent)" strokeWidth={1.5}
                    fill="url(#nwGrad)" dot={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(v) => [formatINR(v), 'Net Worth']}
                    labelFormatter={(l) => new Date(l).toLocaleDateString('en-IN')}
                    contentStyle={{
                      background: 'var(--color-background-primary)',
                      border: '0.5px solid var(--color-border-tertiary)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                  Net worth history builds up as you save data over time.
                </p>
              </div>
            )}
          </div>

          {/* Member breakdown table (All view only) */}
          {activeMember === 'All' && (
            <div style={{ ...card, padding: '0 0 4px', overflow: 'hidden' }}>
              <p style={{ ...label, padding: '16px 20px 0', fontSize: '0.72rem' }}>MEMBER BREAKDOWN</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      {['Member', 'Investments', 'Real Estate', 'Gold', 'Cash & FDs', 'Liabilities', 'Net Worth'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Member' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.map((row, ri) => (
                      <tr key={row.member} style={{ borderBottom: ri < memberRows.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={row.member} size={24} />
                            <span style={{ fontWeight: 500 }}>{firstName(row.member)}</span>
                          </div>
                        </td>
                        {[row.inv, row.re, row.gld, row.csh].map((v, i) => (
                          <td key={i} style={{ padding: '12px 16px', textAlign: 'right', color: v === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                            {v === 0 ? '—' : formatINR(v)}
                          </td>
                        ))}
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: row.liab > 0 ? '#D85A30' : 'var(--text-muted)' }}>
                          {row.liab > 0 ? formatINR(row.liab) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: row.net >= 0 ? 'var(--text-primary)' : 'var(--loss)' }}>
                          {formatINR(row.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sharedLiabilities > 0 && (
                <div style={{
                  padding: '10px 16px', marginTop: 0, fontSize: 12,
                  color: 'var(--text-secondary)',
                  borderTop: '0.5px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>Shared family liabilities (e.g. home loan) — excluded from individual net worth above</span>
                  <span style={{ color: '#D85A30', fontWeight: 500, marginLeft: 16, flexShrink: 0 }}>
                    {formatINR(sharedLiabilities)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — allocation bars + member list */}
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Asset allocation */}
          {allocSegments.length > 0 && (
            <div style={{ ...card, padding: '18px 20px' }}>
              <p style={{ ...label, marginBottom: 14, fontSize: '0.72rem' }}>ALLOCATION</p>
              <AllocationBar segments={allocSegments} />
            </div>
          )}

          {/* Member net worth list */}
          {activeMember === 'All' && (
            <div style={{ ...card, padding: '18px 20px' }}>
              <p style={{ ...label, marginBottom: 10, fontSize: '0.72rem' }}>BY MEMBER</p>
              {memberRows.map((row, i) => (
                <div key={row.member} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < memberRows.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Avatar name={row.member} size={22} />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                      {firstName(row.member)}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: row.net >= 0 ? 'var(--text-primary)' : 'var(--loss)' }}>
                    {fmtAxisINR(row.net)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Cash & Other Assets ──────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Cash &amp; Other Assets</h3>
          <button onClick={() => setShowAddCash(v => !v)} style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }}>
            {showAddCash ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {filteredCash.length > 0 ? (
          <div style={{ ...card, padding: '0 20px' }}>
            {filteredCash.map(item => (
              <EditableRow key={item.id} item={item} onSave={updateCash} onDelete={() => deleteCash(item.id)} />
            ))}
          </div>
        ) : !showAddCash && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            No cash assets recorded. Add savings accounts, FDs, or other assets here.
          </p>
        )}
        {showAddCash && <AddForm onAdd={addCash} onCancel={() => setShowAddCash(false)} activeMember={activeMember} />}
      </div>

      {/* ── Other Liabilities ────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Other Liabilities</h3>
          <button onClick={() => setShowAddLiability(v => !v)} style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }}>
            {showAddLiability ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {filteredLiab.length > 0 ? (
          <div style={{ ...card, padding: '0 20px' }}>
            {filteredLiab.map(item => (
              <EditableRow key={item.id} item={item} onSave={updateLiab} onDelete={() => deleteLiab(item.id)} valueLabel="Outstanding" isLiability />
            ))}
          </div>
        ) : !showAddLiability && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            No other liabilities. Loans are tracked in the Loans tab.
          </p>
        )}
        {showAddLiability && <AddForm onAdd={addLiab} onCancel={() => setShowAddLiability(false)} isLiability activeMember={activeMember} />}
      </div>

    </PageLayout>
  )
}
