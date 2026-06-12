'use client'
import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { load, save, KEYS } from './lib/storage'
import { formatINR, memberColor, memberInitials, firstName, MEMBERS, computeOutstanding } from './lib/format'
import { SEED_INVESTMENTS, SEED_GOLD, DEFAULT_GOLD_PRICES, SEED_LOANS, SEED_FIXED_INCOME, SEED_CASH_ASSETS, SEED_LIABILITIES } from './lib/seedData'
import { takeSnapshot, getSnapshots } from './lib/snapshot'

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

// ── Chart helpers ──────────────────────────────────────────
function fmtAxisINR(v) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`
  return `₹${v}`
}

function fmtXDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(m) - 1]} ${parseInt(day)}`
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ margin: '0 0 4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: 0, fontWeight: 600, color: 'var(--accent)' }}>{formatINR(payload[0].value)}</p>
    </div>
  )
}

// ── Allocation bar ─────────────────────────────────────────
function AllocationBar({ segments }) {
  const total = segments.reduce((s, sg) => s + sg.value, 0)
  if (!total) return null
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 12 }}>
        {segments.map((sg, i) => sg.value > 0 && (
          <div key={i} style={{ flex: sg.value, backgroundColor: sg.color, minWidth: 2 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
        {segments.map((sg, i) => sg.value > 0 && (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: sg.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {sg.label} <strong style={{ color: 'var(--text-primary)' }}>{((sg.value / total) * 100).toFixed(1)}%</strong>
            </span>
          </div>
        ))}
      </div>
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
function AddForm({ onAdd, onCancel, isLiability = false }) {
  const [form, setForm] = useState({
    name: '', type: isLiability ? LIABILITY_TYPES[0] : ASSET_TYPES[0],
    member: MEMBERS[0], value: '', isShared: false,
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
        <div>
          <span style={label}>Member</span>
          <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
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
  const [investments, setInvestments] = useState([])
  const [gold, setGold] = useState([])
  const [goldPrices, setGoldPrices] = useState(DEFAULT_GOLD_PRICES)
  const [loans, setLoans] = useState([])
  const [fixedIncome, setFixedIncome] = useState([])
  const [cashAssets, setCashAssets] = useState([])
  const [liabilities, setLiabilities] = useState([])
  const [showAddCash, setShowAddCash] = useState(false)
  const [showAddLiability, setShowAddLiability] = useState(false)
  const [snapshots, setSnapshots] = useState([])

  useEffect(() => {
    const inv = load(KEYS.INVESTMENTS, SEED_INVESTMENTS)
    const gld = load(KEYS.GOLD, SEED_GOLD)
    const gp = load(KEYS.GOLD_PRICES, DEFAULT_GOLD_PRICES)
    const lns = load(KEYS.LOANS, SEED_LOANS)
    const fi = load(KEYS.FIXED_INCOME, SEED_FIXED_INCOME)
    // Filter out legacy items that lack a member field (old app version format)
    const ca = (load(KEYS.CASH_ASSETS, SEED_CASH_ASSETS) || []).filter(a => a.member)
    const liab = (load(KEYS.LIABILITIES, SEED_LIABILITIES) || []).filter(l => l.member)

    setInvestments(inv)
    setGold(gld)
    setGoldPrices(gp)
    setLoans(lns)
    setFixedIncome(fi)
    setCashAssets(ca)
    setLiabilities(liab)

    const invV = (inv || []).reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
    const gldV = (gld || []).reduce((s, g) => s + g.grams * ((gp || {})[g.carat] ?? 0), 0)
    const fdV = (fi || []).reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
    const caV = ca.reduce((s, a) => s + (a.value || 0), 0)
    const loanV = (lns || []).reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)
    const liabV = liab.reduce((s, l) => s + (l.value || 0), 0)
    const nw = invV + gldV + fdV + caV - loanV - liabV
    takeSnapshot(nw)
    setSnapshots(getSnapshots())
  }, [])

  // ── Memoised metrics ─────────────────────────────────────
  const {
    unpricedHoldings, invVal, goldVal, jewVal, cashVal, fdVal,
    loanLiab, manualLiab, totalAssets, totalLiab, netWorth, sharedLoans,
  } = useMemo(() => {
    const invVal = investmentValue(investments, activeMember)
    const goldVal = goldValue(gold, goldPrices, activeMember)
    const jewVal = jewelleryValue(gold, goldPrices, activeMember)
    const cashVal = cashValue(cashAssets, activeMember)
    const fdVal = fdValue(fixedIncome, activeMember)
    const loanLiab = loanLiabilities(loans, activeMember)
    const manualLiab = manualLiabilityValue(liabilities, activeMember)
    const totalAssets = invVal + goldVal + jewVal + cashVal + fdVal
    const totalLiab = loanLiab + manualLiab
    return {
      unpricedHoldings: filterByMember(investments, activeMember).filter(i => i.currentPrice == null).length,
      invVal, goldVal, jewVal, cashVal, fdVal,
      loanLiab, manualLiab, totalAssets, totalLiab,
      netWorth: totalAssets - totalLiab,
      sharedLoans: activeMember !== 'All' ? sharedLoanTotal(loans) : 0,
    }
  }, [investments, gold, goldPrices, cashAssets, fixedIncome, loans, liabilities, activeMember])

  // ── Member breakdown (shown when All) ────────────────────
  const memberRows = useMemo(() => MEMBERS.map(m => {
    const inv = investmentValue(investments, m)
    const gld = goldValue(gold, goldPrices, m) + jewelleryValue(gold, goldPrices, m)
    const csh = cashValue(cashAssets, m) + fdValue(fixedIncome, m)
    const liab = manualLiabilityValue(liabilities, m) + loanLiabilities(loans, m)
    return { member: m, inv, gld, csh, liab, net: inv + gld + csh - liab }
  }), [investments, gold, goldPrices, cashAssets, fixedIncome, loans, liabilities])

  // ── Allocation segments ──────────────────────────────────
  const allocSegments = useMemo(() => [
    { label: 'Equity', value: invVal, color: 'var(--accent)' },
    { label: 'Gold', value: goldVal + jewVal, color: 'var(--gold-color)' },
    { label: 'Cash & FD', value: cashVal + fdVal, color: 'var(--gain)' },
  ].filter(s => s.value > 0), [invVal, goldVal, jewVal, cashVal, fdVal])

  // ── CRUD helpers ─────────────────────────────────────────
  function saveCash(updated) { setCashAssets(updated); save(KEYS.CASH_ASSETS, updated) }
  function saveLiab(updated) { setLiabilities(updated); save(KEYS.LIABILITIES, updated) }

  function addCash(item) { saveCash([...cashAssets, item]); setShowAddCash(false) }
  function updateCash(item) { saveCash(cashAssets.map(a => a.id === item.id ? item : a)) }
  function deleteCash(id) { saveCash(cashAssets.filter(a => a.id !== id)) }

  function addLiab(item) { saveLiab([...liabilities, item]); setShowAddLiability(false) }
  function updateLiab(item) { saveLiab(liabilities.map(l => l.id === item.id ? item : l)) }
  function deleteLiab(id) { saveLiab(liabilities.filter(l => l.id !== id)) }

  const filteredCash = filterByMember(cashAssets, activeMember)
  const filteredLiab = filterByMember(liabilities, activeMember)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── Hero net worth ───────────────────────────────── */}
      <div style={{ ...card, padding: '36px 32px', marginBottom: 24, textAlign: 'center' }}>
        <p style={{ ...label, marginBottom: 8, fontSize: '0.75rem' }}>
          {activeMember === 'All' ? 'FAMILY NET WORTH' : `${activeMember.split(' ')[0].toUpperCase()} NET WORTH`}
        </p>
        <div style={{ fontSize: '2.8rem', fontWeight: 700, color: netWorth >= 0 ? 'var(--text-primary)' : 'var(--loss)', letterSpacing: '-1.5px', lineHeight: 1.1 }}>
          {formatINR(netWorth)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 16 }}>
          <div>
            <p style={{ ...label, textAlign: 'center' }}>Assets</p>
            <p style={{ margin: 0, color: 'var(--gain)', fontWeight: 600 }}>{formatINR(totalAssets)}</p>
          </div>
          <div style={{ width: 1, backgroundColor: 'var(--border)' }} />
          <div>
            <p style={{ ...label, textAlign: 'center' }}>Liabilities</p>
            <p style={{ margin: 0, color: 'var(--loss)', fontWeight: 600 }}>{formatINR(totalLiab)}</p>
          </div>
        </div>
        {unpricedHoldings > 0 && (
          <p style={{ margin: '12px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {unpricedHoldings} holding{unpricedHoldings > 1 ? 's' : ''} valued at cost basis — refresh prices for live values
          </p>
        )}
      </div>

      {/* ── Net worth history chart ──────────────────────── */}
      {snapshots.length >= 2 && (
        <div style={{ ...card, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ ...label, marginBottom: 16, fontSize: '0.72rem' }}>NET WORTH HISTORY</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={snapshots.slice(-90)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtXDate}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmtAxisINR}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--accent)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Single-member shared loan note ──────────────── */}
      {activeMember !== 'All' && sharedLoans > 0 && (
        <div style={{
          backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: '0.82rem', color: 'var(--text-secondary)',
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Shared family liabilities (home loan etc.) totalling{' '}
          <strong>{formatINR(sharedLoans)}</strong> are not included in {firstName(activeMember)}&apos;s personal net worth.
          View the full picture under <em>All Members</em>.
        </div>
      )}

      {/* ── 4 Metric cards ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Investments', value: invVal, color: 'var(--accent)' },
          { label: 'Gold', value: goldVal + jewVal, color: 'var(--gold-color)' },
          { label: 'Cash & FDs', value: cashVal + fdVal, color: 'var(--gain)' },
          { label: 'Liabilities', value: totalLiab, color: 'var(--loss)' },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: '20px 24px' }}>
            <p style={label}>{m.label}</p>
            <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: m.color, letterSpacing: '-0.5px' }}>
              {formatINR(m.value)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Member breakdown (All only) ──────────────────── */}
      {activeMember === 'All' && (
        <div style={{ ...card, padding: '0 0 4px', marginBottom: 24, overflow: 'hidden' }}>
          <p style={{ ...label, padding: '18px 20px 0', fontSize: '0.72rem' }}>MEMBER BREAKDOWN</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Member', 'Investments', 'Gold', 'Cash & FDs', 'Liabilities', 'Net Worth'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Member' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memberRows.map(row => (
                  <tr key={row.member} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={row.member} size={26} />
                        <span style={{ fontWeight: 500 }}>{firstName(row.member)}</span>
                      </div>
                    </td>
                    {[row.inv, row.gld, row.csh, row.liab].map((v, i) => (
                      <td key={i} style={{ padding: '12px 16px', textAlign: 'right', color: i === 3 ? 'var(--loss)' : 'var(--text-primary)' }}>
                        {formatINR(v)}
                      </td>
                    ))}
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: row.net >= 0 ? 'var(--text-primary)' : 'var(--loss)' }}>
                      {formatINR(row.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Asset allocation ─────────────────────────────── */}
      {allocSegments.length > 0 && (
        <div style={{ ...card, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ ...label, marginBottom: 14, fontSize: '0.72rem' }}>ASSET ALLOCATION</p>
          <AllocationBar segments={allocSegments} />
        </div>
      )}

      {/* ── Cash & Other Assets ──────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Cash &amp; Other Assets</h3>
          <button
            onClick={() => setShowAddCash(v => !v)}
            style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }}
          >
            {showAddCash ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {filteredCash.length > 0 ? (
          <div style={{ ...card, padding: '0 20px' }}>
            {filteredCash.map(item => (
              <EditableRow
                key={item.id}
                item={item}
                onSave={updateCash}
                onDelete={() => deleteCash(item.id)}
              />
            ))}
          </div>
        ) : !showAddCash && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            No cash assets recorded. Add savings accounts, FDs, or other assets here.
          </p>
        )}
        {showAddCash && <AddForm onAdd={addCash} onCancel={() => setShowAddCash(false)} />}
      </div>

      {/* ── Liabilities ──────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Other Liabilities</h3>
          <button
            onClick={() => setShowAddLiability(v => !v)}
            style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }}
          >
            {showAddLiability ? 'Cancel' : '+ Add'}
          </button>
        </div>
        {filteredLiab.length > 0 ? (
          <div style={{ ...card, padding: '0 20px' }}>
            {filteredLiab.map(item => (
              <EditableRow
                key={item.id}
                item={item}
                onSave={updateLiab}
                onDelete={() => deleteLiab(item.id)}
                valueLabel="Outstanding"
                isLiability
              />
            ))}
          </div>
        ) : !showAddLiability && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            No other liabilities. Loans are tracked in the Loans tab.
          </p>
        )}
        {showAddLiability && <AddForm onAdd={addLiab} onCancel={() => setShowAddLiability(false)} isLiability />}
      </div>

    </div>
  )
}
