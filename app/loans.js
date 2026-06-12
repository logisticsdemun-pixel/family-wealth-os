'use client'
import { useState, useEffect } from 'react'
import { load, save, KEYS } from './lib/storage'
import { formatINR, firstName, MEMBERS, computeOutstanding, loanMonthsRemaining, totalInterestPaid, monthsElapsed } from './lib/format'
import { SEED_LOANS } from './lib/seedData'

const LOAN_TYPES = ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Business Loan', 'Other']

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
const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }

function filterByMember(arr, member) {
  return member === 'All' ? arr : arr.filter(x => x.member === member || x.isShared)
}

// ── Loan form ──────────────────────────────────────────────
function LoanForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? {
    lender: '', type: LOAN_TYPES[0], member: MEMBERS[0], isShared: false,
    principal: '', rate: '', months: '', emi: '', startDate: '', outstandingOverride: '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      id: form.id ?? crypto.randomUUID(),
      principal: parseFloat(form.principal) || null,
      rate: parseFloat(form.rate) || null,
      months: parseInt(form.months) || null,
      emi: parseFloat(form.emi) || null,
      outstandingOverride: form.outstandingOverride !== '' ? parseFloat(form.outstandingOverride) : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 24, marginBottom: 20 }}>
      <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>{initial?.id ? 'EDIT' : 'ADD'} LOAN</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={label}>Lender</span>
          <input required style={inp} placeholder="e.g. HDFC Bank" value={form.lender} onChange={e => setForm({ ...form, lender: e.target.value })} />
        </div>
        <div>
          <span style={label}>Loan Type</span>
          <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {LOAN_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>Member</span>
          <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <span style={label}>EMI (₹/month)</span>
          <input type="number" style={inp} placeholder="0" value={form.emi} onChange={e => setForm({ ...form, emi: e.target.value })} />
        </div>
        <div>
          <span style={label}>Original Principal (₹)</span>
          <input type="number" style={inp} placeholder="0" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} />
        </div>
        <div>
          <span style={label}>Interest Rate (% p.a.)</span>
          <input type="number" step="0.01" style={inp} placeholder="0.00" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} />
        </div>
        <div>
          <span style={label}>Tenure (months)</span>
          <input type="number" style={inp} placeholder="240" value={form.months} onChange={e => setForm({ ...form, months: e.target.value })} />
        </div>
        <div>
          <span style={label}>Start Date</span>
          <input type="date" style={inp} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={label}>Outstanding Override (₹) — leave blank to auto-compute</span>
          <input type="number" style={inp} placeholder="Leave blank to auto-calculate" value={form.outstandingOverride ?? ''} onChange={e => setForm({ ...form, outstandingOverride: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <input type="checkbox" id={`shared-${form.id ?? 'new'}`} checked={!!form.isShared} onChange={e => setForm({ ...form, isShared: e.target.checked })} />
          <label htmlFor={`shared-${form.id ?? 'new'}`} style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Shared family liability (not counted in individual member net worth)
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="submit" style={btnPrimary}>{initial?.id ? 'Save Changes' : 'Add Loan'}</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Progress bar ───────────────────────────────────────────
function ProgressBar({ pct, color = 'var(--accent)' }) {
  return (
    <div style={{ height: 6, backgroundColor: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ── Loan card ──────────────────────────────────────────────
function LoanCard({ loan, onEdit, onDelete }) {
  const outstanding = computeOutstanding(loan)
  const monthsRemaining = loanMonthsRemaining(loan)
  const interestPaid = totalInterestPaid(loan)
  const elapsed = loan.startDate ? monthsElapsed(loan.startDate) : null
  const principalRepaid = loan.principal && outstanding != null ? loan.principal - outstanding : null
  const paidPct = loan.principal && principalRepaid != null ? (principalRepaid / loan.principal) * 100 : null

  const hasDetails = loan.principal && loan.rate && loan.startDate

  return (
    <div style={{ ...card, padding: 24, marginBottom: 16 }}>
      {/* ── Card header ────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{loan.lender}</h3>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
              {loan.type}
            </span>
            {loan.isShared && (
              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--amber-faint)', color: 'var(--amber)', fontWeight: 500 }}>
                Shared
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {firstName(loan.member)}{loan.isShared ? ' (family)' : ''}
            {loan.startDate ? ` · started ${loan.startDate}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onEdit} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem' }}>Edit</button>
          <button onClick={onDelete} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', color: 'var(--loss)', borderColor: 'var(--loss)' }}>Remove</button>
        </div>
      </div>

      {/* ── Key stats grid ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Monthly EMI', value: loan.emi ? formatINR(loan.emi) : '—', color: 'var(--text-primary)' },
          { label: 'Rate', value: loan.rate ? `${loan.rate}% p.a.` : '—', color: 'var(--text-primary)' },
          { label: 'Outstanding', value: outstanding != null ? formatINR(outstanding) : 'Set details', color: 'var(--loss)', bold: true },
          { label: 'Total Interest Paid', value: interestPaid ? formatINR(interestPaid) : '—', color: 'var(--text-secondary)' },
          { label: 'Months Elapsed', value: elapsed != null ? `${elapsed} mo` : '—', color: 'var(--text-secondary)' },
          { label: 'Months Remaining', value: monthsRemaining != null ? `${monthsRemaining} mo` : '—', color: 'var(--text-secondary)' },
        ].map(s => (
          <div key={s.label}>
            <p style={label}>{s.label}</p>
            <p style={{ margin: 0, fontWeight: s.bold ? 700 : 500, fontSize: s.bold ? '1.1rem' : '0.95rem', color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Progress bar ───────────── */}
      {hasDetails && paidPct != null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Principal repaid: {formatINR(principalRepaid)} ({paidPct.toFixed(1)}%)</span>
            <span>Remaining: {formatINR(outstanding)}</span>
          </div>
          <ProgressBar pct={paidPct} color="var(--gain)" />
        </div>
      )}

      {/* ── No-details note ────────── */}
      {!hasDetails && (
        <div style={{ backgroundColor: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Fill in principal, rate, start date, and tenure (or set an outstanding override) to see amortization details.
        </div>
      )}
    </div>
  )
}

// ── Main Loans component ───────────────────────────────────
export default function Loans({ activeMember }) {
  const [loans, setLoans] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editLoan, setEditLoan] = useState(null)

  useEffect(() => {
    setLoans(load(KEYS.LOANS, SEED_LOANS))
  }, [])

  function saveLoans(updated) { setLoans(updated); save(KEYS.LOANS, updated) }

  function handleSave(loan) {
    if (loan.id && loans.find(l => l.id === loan.id)) {
      saveLoans(loans.map(l => l.id === loan.id ? loan : l))
    } else {
      saveLoans([...loans, { ...loan, id: Date.now() }])
    }
    setEditLoan(null)
    setShowAdd(false)
  }

  const filtered = filterByMember(loans, activeMember)
  const totalOutstanding = filtered.reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)
  const totalEMI = filtered.reduce((s, l) => s + (l.emi || 0), 0)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Loans</h2>
        <button
          onClick={() => { setShowAdd(v => !v); setEditLoan(null) }}
          style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.85rem', color: 'var(--accent)' }}
        >
          {showAdd ? 'Cancel' : '+ Add Loan'}
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'TOTAL OUTSTANDING', value: formatINR(totalOutstanding), color: 'var(--loss)' },
          { label: 'MONTHLY EMI OUTGO', value: formatINR(totalEMI), color: 'var(--text-primary)' },
        ].map(c => (
          <div key={c.label} style={{ ...card, padding: '16px 20px' }}>
            <p style={label}>{c.label}</p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Add / Edit form ───────────────────────────────── */}
      {showAdd && !editLoan && (
        <LoanForm onSave={handleSave} onCancel={() => setShowAdd(false)} />
      )}
      {editLoan && (
        <LoanForm initial={editLoan} onSave={handleSave} onCancel={() => setEditLoan(null)} />
      )}

      {/* ── Loan cards ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No loans recorded.</p>
      ) : (
        filtered.map(loan => (
          <LoanCard
            key={loan.id}
            loan={loan}
            onEdit={() => { setEditLoan(loan); setShowAdd(false) }}
            onDelete={() => saveLoans(loans.filter(l => l.id !== loan.id))}
          />
        ))
      )}
    </div>
  )
}
