'use client'
import { useState, useEffect } from 'react'
import { load, save, KEYS } from './lib/storage'
import { formatINR, firstName, MEMBERS } from './lib/format'
import { SEED_INSURANCE } from './lib/seedData'

const POLICY_TYPES = ['Term Life', 'Health', 'Vehicle', 'Endowment', 'ULIP', 'Critical Illness', 'Other']

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}
const labelStyle = {
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)', margin: '0 0 4px', display: 'block',
}
const btnPrimary = { padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }
const btnGhost = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }
const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }

function filterByMember(arr, member) {
  return member === 'All' ? arr : arr.filter(x => x.member === member)
}

function daysUntilRenewal(dateStr) {
  if (!dateStr) return null
  const renewal = new Date(dateStr)
  const today = new Date()
  return Math.ceil((renewal - today) / (1000 * 60 * 60 * 24))
}

// ── Policy form ────────────────────────────────────────────
function PolicyForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? {
    name: '', type: POLICY_TYPES[0], member: MEMBERS[0], insurer: '',
    cover: '', premium: '', renewalDate: '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      id: form.id ?? Date.now(),
      cover: parseFloat(form.cover) || 0,
      premium: parseFloat(form.premium) || 0,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 24, marginBottom: 20 }}>
      <p style={{ ...labelStyle, marginBottom: 14, fontSize: '0.75rem' }}>{initial?.id ? 'EDIT' : 'ADD'} INSURANCE POLICY</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <span style={labelStyle}>Policy Name</span>
          <input required style={inp} placeholder="e.g. LIC Term Plan" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span style={labelStyle}>Type</span>
          <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {POLICY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <span style={labelStyle}>Member</span>
          <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <span style={labelStyle}>Insurer</span>
          <input style={inp} placeholder="e.g. LIC, HDFC Ergo…" value={form.insurer} onChange={e => setForm({ ...form, insurer: e.target.value })} />
        </div>
        <div>
          <span style={labelStyle}>Cover Amount (₹)</span>
          <input type="number" style={inp} placeholder="0" value={form.cover} onChange={e => setForm({ ...form, cover: e.target.value })} />
        </div>
        <div>
          <span style={labelStyle}>Annual Premium (₹)</span>
          <input type="number" style={inp} placeholder="0" value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={labelStyle}>Renewal Date</span>
          <input type="date" style={inp} value={form.renewalDate} onChange={e => setForm({ ...form, renewalDate: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" style={btnPrimary}>{initial?.id ? 'Save Changes' : 'Add Policy'}</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Policy row ─────────────────────────────────────────────
function PolicyRow({ policy, onEdit, onDelete }) {
  const days = daysUntilRenewal(policy.renewalDate)
  const renewalSoon = days !== null && days >= 0 && days <= 30
  const renewalPast = days !== null && days < 0

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{policy.name}</span>
          {renewalSoon && (
            <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 10, backgroundColor: 'var(--amber-faint)', color: 'var(--amber)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Due in {days}d
            </span>
          )}
          {renewalPast && (
            <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 10, backgroundColor: 'var(--loss-faint)', color: 'var(--loss)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Overdue
            </span>
          )}
        </div>
        {policy.insurer && <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{policy.insurer}</p>}
      </td>
      <td style={{ padding: '12px 14px' }}>
        <span style={{
          fontSize: '0.72rem', padding: '3px 8px', borderRadius: 10, fontWeight: 500,
          backgroundColor: typeColor(policy.type).bg, color: typeColor(policy.type).text,
        }}>
          {policy.type}
        </span>
      </td>
      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{firstName(policy.member)}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>{policy.cover ? formatINR(policy.cover) : '—'}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{policy.premium ? formatINR(policy.premium) : '—'}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: '0.82rem', color: renewalSoon || renewalPast ? 'var(--amber)' : 'var(--text-secondary)' }}>
        {policy.renewalDate || '—'}
      </td>
      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
        <button onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', marginRight: 8 }}>Edit</button>
        <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
      </td>
    </tr>
  )
}

function typeColor(type) {
  const map = {
    'Term Life': { bg: 'var(--accent-faint)', text: 'var(--accent-text)' },
    'Health': { bg: 'var(--gain-faint)', text: 'var(--gain)' },
    'Vehicle': { bg: 'var(--gold-faint)', text: 'var(--gold-color)' },
  }
  return map[type] ?? { bg: 'var(--surface-2)', text: 'var(--text-secondary)' }
}

// ── Main Insurance component ───────────────────────────────
export default function Insurance({ activeMember }) {
  const [policies, setPolicies] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editPolicy, setEditPolicy] = useState(null)

  useEffect(() => {
    setPolicies(load(KEYS.INSURANCE, SEED_INSURANCE))
  }, [])

  function savePolicies(updated) { setPolicies(updated); save(KEYS.INSURANCE, updated) }

  function handleSave(policy) {
    if (policy.id && policies.find(p => p.id === policy.id)) {
      savePolicies(policies.map(p => p.id === policy.id ? policy : p))
    } else {
      savePolicies([...policies, { ...policy, id: Date.now() }])
    }
    setEditPolicy(null)
    setShowAdd(false)
  }

  const filtered = filterByMember(policies, activeMember)

  const lifeCover = filtered.filter(p => p.type === 'Term Life' || p.type === 'Endowment' || p.type === 'ULIP').reduce((s, p) => s + (p.cover || 0), 0)
  const healthCover = filtered.filter(p => p.type === 'Health' || p.type === 'Critical Illness').reduce((s, p) => s + (p.cover || 0), 0)
  const annualPremium = filtered.reduce((s, p) => s + (p.premium || 0), 0)
  const renewalsSoon = filtered.filter(p => { const d = daysUntilRenewal(p.renewalDate); return d !== null && d >= 0 && d <= 30 }).length

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Insurance</h2>
        <button
          onClick={() => { setShowAdd(v => !v); setEditPolicy(null) }}
          style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.85rem', color: 'var(--accent)' }}
        >
          {showAdd ? 'Cancel' : '+ Add Policy'}
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'LIFE COVER', value: formatINR(lifeCover), color: 'var(--accent)' },
          { label: 'HEALTH COVER', value: formatINR(healthCover), color: 'var(--gain)' },
          { label: 'ANNUAL PREMIUM', value: formatINR(annualPremium), color: 'var(--text-primary)' },
          ...(renewalsSoon > 0 ? [{ label: 'RENEWALS DUE SOON', value: `${renewalsSoon} polic${renewalsSoon > 1 ? 'ies' : 'y'}`, color: 'var(--amber)' }] : []),
        ].map(c => (
          <div key={c.label} style={{ ...card, padding: '16px 20px' }}>
            <p style={labelStyle}>{c.label}</p>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Form ──────────────────────────────────────────── */}
      {showAdd && !editPolicy && <PolicyForm onSave={handleSave} onCancel={() => setShowAdd(false)} />}
      {editPolicy && <PolicyForm initial={editPolicy} onSave={handleSave} onCancel={() => setEditPolicy(null)} />}

      {/* ── Table ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 12px' }}>🛡</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>No policies recorded. Add your Term Life, Health, and Vehicle insurance policies.</p>
        </div>
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 650 }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Policy', 'Type', 'Member', 'Cover', 'Premium/yr', 'Renewal', ''].map((h, i) => (
                    <th key={h || i} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(policy => (
                  <PolicyRow
                    key={policy.id}
                    policy={policy}
                    onEdit={() => { setEditPolicy(policy); setShowAdd(false) }}
                    onDelete={() => savePolicies(policies.filter(p => p.id !== policy.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
