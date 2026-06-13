'use client'
import { useState, useEffect, useMemo } from 'react'
import { load, save, KEYS, flushAll } from './lib/storage'
import { formatINR, firstName, MEMBERS, computeOutstanding } from './lib/format'
import { SEED_REAL_ESTATE, SEED_LOANS } from './lib/seedData'

const PROPERTY_TYPES = ['Residential', 'Commercial', 'Land', 'Other']

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
  boxSizing: 'border-box',
}
const label = {
  fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em',
  color: 'var(--text-muted)', margin: '0 0 4px', display: 'block',
}
const btnPrimary = { padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }
const btnGhost = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }
const card = { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }

function SectionHead({ title }) {
  return (
    <p style={{
      fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.1em', color: 'var(--text-muted)',
      margin: '20px 0 12px', paddingBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>{title}</p>
  )
}

// ── Property Form Modal ────────────────────────────────────
function PropertyForm({ initial, loans, activeMember = 'All', onSave, onCancel }) {
  const defaultMember = activeMember !== 'All' ? activeMember : MEMBERS[0]
  const [form, setForm] = useState(() => initial ? {
    ...initial,
    currentValue: initial.currentValue ?? '',
    purchasePrice: initial.purchasePrice ?? '',
    ownershipPct: initial.ownershipPct ?? 100,
    monthlyRent: initial.monthlyRent ?? '',
    notes: initial.notes ?? '',
  } : {
    name: '', address: '', type: PROPERTY_TYPES[0],
    currentValue: '', purchasePrice: '', purchaseDate: '',
    member: defaultMember, ownershipPct: 100,
    monthlyRent: '', notes: '',
  })

  const [coOwners, setCoOwners] = useState(initial?.coOwners || [])

  const [linkedLoanIds, setLinkedLoanIds] = useState(() => {
    if (!initial?.id) return new Set()
    return new Set(
      loans
        .filter(l => String(l.linkedPropertyId) === String(initial.id))
        .map(l => l.id)
    )
  })

  function handleSubmit(e) {
    e.preventDefault()
    const property = {
      ...form,
      id: form.id ?? crypto.randomUUID(),
      currentValue: parseFloat(form.currentValue) || 0,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      ownershipPct: parseFloat(form.ownershipPct) || 100,
      monthlyRent: parseFloat(form.monthlyRent) || 0,
      coOwners: coOwners.filter(c => c.member && c.pct > 0),
    }
    onSave(property, Array.from(linkedLoanIds))
  }

  function toggleLoan(loanId) {
    setLinkedLoanIds(prev => {
      const next = new Set(prev)
      if (next.has(loanId)) next.delete(loanId)
      else next.add(loanId)
      return next
    })
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 560,
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px 28px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {initial?.id ? 'Edit Property' : 'Add Property'}
          </h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── 1. Property Details ── */}
          <SectionHead title="Property Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Property Name *</span>
              <input required style={inp} placeholder="e.g. Sector 21 Flat" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <span style={label}>Type</span>
              <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>City / Area</span>
              <input style={inp} placeholder="e.g. Noida, Sector 21" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>

          {/* ── 2. Valuation ── */}
          <SectionHead title="Valuation" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <span style={label}>Current Value (₹) *</span>
              <input required type="number" min="0" style={inp} placeholder="0" value={form.currentValue} onChange={e => setForm({ ...form, currentValue: e.target.value })} />
            </div>
            <div>
              <span style={label}>Purchase Price (₹)</span>
              <input type="number" min="0" style={inp} placeholder="0" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} />
            </div>
            <div>
              <span style={label}>Purchase Date</span>
              <input type="date" style={inp} value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div>
              <span style={label}>Monthly Rent (₹)</span>
              <input type="number" min="0" style={inp} placeholder="0 if not rented" value={form.monthlyRent} onChange={e => setForm({ ...form, monthlyRent: e.target.value })} />
            </div>
          </div>

          {/* ── 3. Ownership ── */}
          <SectionHead title="Ownership" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(activeMember === 'All' || !!initial?.id) && (
              <div>
                <span style={label}>Primary Owner</span>
                <select style={inp} value={form.member} onChange={e => {
                  const newMember = e.target.value
                  setForm({ ...form, member: newMember })
                  setCoOwners(prev => prev.filter(c => c.member !== newMember))
                }}>
                  {MEMBERS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div>
              <span style={label}>Ownership % (primary)</span>
              <input type="number" min="1" max="100" style={inp} placeholder="100" value={form.ownershipPct} onChange={e => setForm({ ...form, ownershipPct: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Co-owners (family members)</span>
              {coOwners.map((co, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <select
                    style={{ ...inp, marginBottom: 0, flex: 2 }}
                    value={co.member}
                    onChange={e => {
                      const updated = [...coOwners]
                      updated[i] = { ...co, member: e.target.value }
                      setCoOwners(updated)
                    }}
                  >
                    {MEMBERS
                      .filter(m => m !== form.member && !coOwners.some((c, j) => j !== i && c.member === m))
                      .map(m => <option key={m}>{m}</option>)
                    }
                  </select>
                  <input
                    type="number" min="0" max="99"
                    style={{ ...inp, marginBottom: 0, flex: 1 }}
                    placeholder="% share"
                    value={co.pct}
                    onChange={e => {
                      const updated = [...coOwners]
                      updated[i] = { ...co, pct: parseFloat(e.target.value) || 0 }
                      setCoOwners(updated)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setCoOwners(coOwners.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px', flexShrink: 0 }}
                  >✕</button>
                </div>
              ))}
              {MEMBERS.filter(m => m !== form.member && !coOwners.some(c => c.member === m)).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const available = MEMBERS.filter(m => m !== form.member && !coOwners.some(c => c.member === m))
                    setCoOwners([...coOwners, { member: available[0], pct: 0 }])
                  }}
                  style={{ ...btnGhost, fontSize: '0.8rem', padding: '5px 12px', color: 'var(--accent)', borderColor: 'var(--accent)', marginBottom: 4 }}
                >+ Add Co-owner</button>
              )}
            </div>
          </div>

          {/* ── 4. Linked Loans ── */}
          <SectionHead title="Linked Loans" />
          {loans.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              No loans recorded yet. Add loans in the Loans tab first.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {loans.map(loan => {
                const outstanding = computeOutstanding(loan)
                const checked = linkedLoanIds.has(loan.id)
                return (
                  <label key={loan.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: checked ? 'var(--accent-faint)' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLoan(loan.id)}
                      style={{ flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{loan.lender}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                        {loan.type} · {firstName(loan.member)}
                      </span>
                    </div>
                    {outstanding != null && (
                      <span style={{ fontSize: '0.82rem', color: 'var(--loss)', fontWeight: 600, flexShrink: 0 }}>
                        {formatINR(outstanding)}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          {/* ── 5. Notes ── */}
          <SectionHead title="Notes" />
          <textarea
            style={{ ...inp, height: 72, resize: 'vertical', fontFamily: 'inherit', marginBottom: 20 }}
            placeholder="Registration details, co-owners, builder name…"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={btnPrimary}>
              {initial?.id ? 'Save Changes' : 'Add Property'}
            </button>
            <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  )
}

// ── Property Card ──────────────────────────────────────────
function PropertyCard({ property, linkedLoans, onEdit, onDelete }) {
  const gain = property.purchasePrice > 0 ? property.currentValue - property.purchasePrice : null
  const gainPct = property.purchasePrice > 0
    ? ((property.currentValue - property.purchasePrice) / property.purchasePrice) * 100
    : null
  const totalLinkedOutstanding = linkedLoans.reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)
  const netEquity = property.currentValue - totalLinkedOutstanding

  return (
    <div style={{ ...card, padding: 24, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{property.name}</h3>
            <span style={{
              fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12,
              backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)',
            }}>
              {property.type}
            </span>
            {(property.ownershipPct ?? 100) < 100 && (
              <span style={{
                fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12,
                backgroundColor: 'var(--accent-faint)', color: 'var(--accent)', fontWeight: 500,
              }}>
                {property.ownershipPct}% owned
              </span>
            )}
            {(property.coOwners || []).map(co => (
              <span key={co.member} style={{
                fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12,
                backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
              }}>
                {firstName(co.member)} {co.pct}%
              </span>
            ))}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {firstName(property.member)}
            {property.address ? ` · ${property.address}` : ''}
            {property.purchaseDate ? ` · since ${property.purchaseDate.slice(0, 4)}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem' }}>Edit</button>
          <button onClick={onDelete} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', color: 'var(--loss)', borderColor: 'var(--loss)' }}>Remove</button>
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16, marginBottom: linkedLoans.length > 0 || property.monthlyRent > 0 || property.notes ? 20 : 0 }}>
        <div>
          <p style={label}>Current Value</p>
          <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            {formatINR(property.currentValue)}
          </p>
        </div>
        {property.purchasePrice > 0 && (
          <div>
            <p style={label}>Purchase Price</p>
            <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              {formatINR(property.purchasePrice)}
            </p>
          </div>
        )}
        {gain !== null && (
          <div>
            <p style={label}>Appreciation</p>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: gain >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
              {formatINR(gain)}
              {gainPct != null && (
                <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>
                  ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                </span>
              )}
            </p>
          </div>
        )}
        {linkedLoans.length > 0 && (
          <>
            <div>
              <p style={label}>Loan Outstanding</p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: 'var(--loss)' }}>
                {formatINR(totalLinkedOutstanding)}
              </p>
            </div>
            <div>
              <p style={label}>Net Equity</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: netEquity >= 0 ? 'var(--accent)' : 'var(--loss)' }}>
                {formatINR(netEquity)}
              </p>
            </div>
          </>
        )}
        {property.monthlyRent > 0 && (
          <div>
            <p style={label}>Monthly Rent</p>
            <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', color: 'var(--gain)' }}>
              {formatINR(property.monthlyRent)}
            </p>
          </div>
        )}
      </div>

      {/* Linked loan pills */}
      {linkedLoans.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: property.notes ? 10 : 0 }}>
          {linkedLoans.map(loan => (
            <span key={loan.id} style={{
              fontSize: '0.75rem', padding: '3px 10px', borderRadius: 12,
              backgroundColor: 'var(--surface-2)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}>
              🏦 {loan.lender} — {loan.type}
            </span>
          ))}
        </div>
      )}

      {property.notes && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {property.notes}
        </p>
      )}
    </div>
  )
}

// ── Main Real Estate component ─────────────────────────────
export default function RealEstate({ activeMember }) {
  const [properties, setProperties] = useState([])
  const [loans, setLoans] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editProperty, setEditProperty] = useState(null)

  useEffect(() => {
    setProperties(load(KEYS.REAL_ESTATE, SEED_REAL_ESTATE))
    setLoans(load(KEYS.LOANS, SEED_LOANS))
  }, [])

  function saveProperties(updated) {
    setProperties(updated)
    save(KEYS.REAL_ESTATE, updated)
  }

  function saveLoans(updated) {
    setLoans(updated)
    save(KEYS.LOANS, updated)
  }

  function handleSave(property, linkedLoanIds) {
    const linkedSet = new Set(linkedLoanIds.map(String))
    const isNew = !properties.find(p => p.id === property.id)
    saveProperties(isNew ? [...properties, property] : properties.map(p => p.id === property.id ? property : p))

    // Sync linkedPropertyId on loans: link newly checked, unlink newly unchecked
    const updatedLoans = loans.map(loan => {
      const shouldLink = linkedSet.has(String(loan.id))
      const currentlyLinked = String(loan.linkedPropertyId) === String(property.id)
      if (shouldLink && !currentlyLinked) return { ...loan, linkedPropertyId: property.id }
      if (!shouldLink && currentlyLinked) return { ...loan, linkedPropertyId: null }
      return loan
    })
    saveLoans(updatedLoans)

    setShowForm(false)
    setEditProperty(null)
  }

  function handleDelete(id) {
    // Unlink any loans tied to this property before deleting
    const updatedLoans = loans.map(l =>
      String(l.linkedPropertyId) === String(id) ? { ...l, linkedPropertyId: null } : l
    )
    saveLoans(updatedLoans)
    saveProperties(properties.filter(p => p.id !== id))
  }

  const filtered = activeMember === 'All'
    ? properties
    : properties.filter(p =>
        p.member === activeMember ||
        (p.coOwners || []).some(c => c.member === activeMember)
      )

  const totalValue = activeMember === 'All'
    ? filtered.reduce((s, p) => s + (p.currentValue || 0), 0)
    : filtered.reduce((s, p) => {
        if (p.member === activeMember) return s + (p.currentValue || 0) * ((p.ownershipPct ?? 100) / 100)
        const co = (p.coOwners || []).find(c => c.member === activeMember)
        return co ? s + (p.currentValue || 0) * (co.pct / 100) : s
      }, 0)
  const totalRent = filtered.reduce((s, p) => s + (p.monthlyRent || 0), 0)

  // property id → linked loans
  const loansByPropertyId = useMemo(() => {
    const map = {}
    for (const loan of loans) {
      if (loan.linkedPropertyId != null) {
        const key = String(loan.linkedPropertyId)
        if (!map[key]) map[key] = []
        map[key].push(loan)
      }
    }
    return map
  }, [loans])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Real Estate</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => flushAll()}
            style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.85rem' }}
          >
            Save
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setEditProperty(null) }}
            style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.85rem', color: 'var(--accent)' }}
          >
            {showForm ? 'Cancel' : '+ Add Property'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            { label: activeMember === 'All' ? 'TOTAL PORTFOLIO VALUE' : 'ATTRIBUTABLE VALUE', value: formatINR(totalValue), color: 'var(--accent)' },
            { label: 'MONTHLY RENTAL INCOME', value: totalRent > 0 ? formatINR(totalRent) : '—', color: 'var(--gain)' },
          ].map(c => (
            <div key={c.label} style={{ ...card, padding: '16px 20px' }}>
              <p style={label}>{c.label}</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Property cards */}
      {filtered.length === 0 && !showForm ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          No properties recorded. Click &ldquo;+ Add Property&rdquo; to begin.
        </p>
      ) : (
        filtered.map(property => (
          <PropertyCard
            key={property.id}
            property={property}
            linkedLoans={loansByPropertyId[String(property.id)] || []}
            onEdit={() => { setEditProperty(property); setShowForm(false) }}
            onDelete={() => handleDelete(property.id)}
          />
        ))
      )}

      {/* Add/Edit modal */}
      {(showForm || editProperty) && (
        <PropertyForm
          initial={editProperty}
          loans={loans}
          activeMember={activeMember}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditProperty(null) }}
        />
      )}
    </div>
  )
}
