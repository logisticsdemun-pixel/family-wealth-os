'use client'
import { useState, useEffect } from 'react'
import { load, save, KEYS } from './lib/storage'
import { formatINR, gainColor, firstName, MEMBERS } from './lib/format'
import { SEED_GOLD, DEFAULT_GOLD_PRICES } from './lib/seedData'

const CARATS = [24, 22, 18]

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

function filterByMember(arr, member) {
  return member === 'All' ? arr : arr.filter(x => x.member === member)
}

function buyValue(item) { return item.grams * (item.buyPricePerGram || 0) }
function currentValue(item, prices) { return item.grams * (prices[item.carat] || 0) }
function gain(item, prices) { return currentValue(item, prices) - buyValue(item) }

// ── Price settings panel ───────────────────────────────────
function PriceSettings({ prices, onChange }) {
  const [local, setLocal] = useState({ ...prices })
  const [open, setOpen] = useState(false)

  function save() { onChange(local); setOpen(false) }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ⚙ Gold Price Settings
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          24K {formatINR(prices[24])}/g · 22K {formatINR(prices[22])}/g · 18K {formatINR(prices[18])}/g
        </span>
      </button>

      {open && (
        <div style={{ ...card, padding: 20, marginTop: 10 }}>
          <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>GOLD PRICE PER GRAM (CURRENT MARKET)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {CARATS.map(c => (
              <div key={c}>
                <span style={label}>{c}K (₹/gram)</span>
                <input
                  type="number"
                  style={inp}
                  value={local[c]}
                  onChange={e => setLocal({ ...local, [c]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={save} style={btnPrimary}>Apply</button>
            <button onClick={() => setOpen(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add / Edit gold item form ──────────────────────────────
function GoldForm({ initial, category, onSave, onCancel, activeMember = 'All' }) {
  const [form, setForm] = useState(initial ?? {
    member: activeMember !== 'All' ? activeMember : MEMBERS[0], category, name: '', grams: '', carat: 24, buyPricePerGram: '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      id: form.id ?? crypto.randomUUID(),
      grams: parseFloat(form.grams),
      carat: parseInt(form.carat),
      buyPricePerGram: parseFloat(form.buyPricePerGram) || 0,
      flags: form.flags ?? [],
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 20, marginTop: 12 }}>
      <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>{initial ? 'EDIT' : 'ADD'} {category.toUpperCase()} GOLD</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(activeMember === 'All' || !!initial?.id) && (
          <div>
            <span style={label}>Member</span>
            <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
              {MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div>
          <span style={label}>Name / Description</span>
          <input required style={inp} placeholder="Coin / Bangle / Ring…" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span style={label}>Weight (grams)</span>
          <input required type="number" step="any" style={inp} placeholder="0" value={form.grams} onChange={e => setForm({ ...form, grams: e.target.value })} />
        </div>
        <div>
          <span style={label}>Carat</span>
          <select style={inp} value={form.carat} onChange={e => setForm({ ...form, carat: e.target.value })}>
            {CARATS.map(c => <option key={c} value={c}>{c}K</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={label}>Buy Price / gram (₹) — 0 if received as gift</span>
          <input type="number" step="any" style={inp} placeholder="0" value={form.buyPricePerGram} onChange={e => setForm({ ...form, buyPricePerGram: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" style={btnPrimary}>{initial ? 'Save' : 'Add'}</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Gold table ─────────────────────────────────────────────
function GoldTable({ items, prices, onEdit, onDelete, isJewellery = false }) {
  const totalBuy = items.reduce((s, g) => s + buyValue(g), 0)
  const totalCurrent = items.reduce((s, g) => s + currentValue(g, prices), 0)
  const totalGain = totalCurrent - totalBuy

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '24px 0' }}>
        No {isJewellery ? 'jewellery' : 'investment gold'} recorded. Click &ldquo;+ Add&rdquo; to begin.
      </p>
    )
  }

  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 600 }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['Item', 'Member', 'Grams', 'Carat', 'Buy Value', 'Current Value', isJewellery ? 'Mark-up' : 'Gain / Loss', ''].map((h, i) => (
                <th key={h || i} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(g => {
              const bv = buyValue(g)
              const cv = currentValue(g, prices)
              const gl = gain(g, prices)
              return (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{g.name}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{firstName(g.member)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>{g.grams}g</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--gold-color)', fontWeight: 500 }}>{g.carat}K</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>{bv > 0 ? formatINR(bv) : <span style={{ color: 'var(--text-muted)' }}>Gift</span>}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--gold-color)' }}>{formatINR(cv)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: gainColor(gl) }}>
                    {bv > 0 ? (
                      <>
                        {formatINR(gl)}
                        <span style={{ fontSize: '0.72rem', marginLeft: 4 }}>
                          ({bv > 0 ? ((gl / bv) * 100).toFixed(1) : '—'}%)
                        </span>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <button onClick={() => onEdit(g)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', marginRight: 8 }}>Edit</button>
                    <button onClick={() => onDelete(g.id)} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
                  </td>
                </tr>
              )
            })}
            {/* Totals row */}
            <tr style={{ backgroundColor: 'var(--surface-2)', fontWeight: 600, borderTop: '2px solid var(--border)' }}>
              <td colSpan={4} style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>TOTAL</td>
              <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatINR(totalBuy)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--gold-color)' }}>{formatINR(totalCurrent)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', color: gainColor(totalGain) }}>{formatINR(totalGain)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Gold component ────────────────────────────────────
export default function Gold({ activeMember }) {
  const [gold, setGold] = useState([])
  const [goldPrices, setGoldPrices] = useState(DEFAULT_GOLD_PRICES)
  const [subTab, setSubTab] = useState('investment')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)

  useEffect(() => {
    setGold(load(KEYS.GOLD, SEED_GOLD))
    setGoldPrices(load(KEYS.GOLD_PRICES, DEFAULT_GOLD_PRICES))
  }, [])

  function saveGold(updated) { setGold(updated); save(KEYS.GOLD, updated) }

  function updatePrices(prices) {
    setGoldPrices(prices)
    save(KEYS.GOLD_PRICES, prices)
  }

  function handleSave(item) {
    if (item.id && gold.find(g => g.id === item.id)) {
      saveGold(gold.map(g => g.id === item.id ? item : g))
    } else {
      saveGold([...gold, { ...item, id: Date.now() }])
    }
    setEditItem(null)
    setShowAdd(false)
  }

  const category = subTab === 'investment' ? 'Investment' : 'Jewellery'
  const filtered = filterByMember(gold, activeMember).filter(g => g.category === category)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Gold</h2>
      </div>

      {/* ── Price settings ────────────────────────────────── */}
      <PriceSettings prices={goldPrices} onChange={updatePrices} />

      {/* ── Sub-tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[{ id: 'investment', label: 'Investment Gold' }, { id: 'jewellery', label: 'Jewellery' }].map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setShowAdd(false); setEditItem(null) }}
            style={{
              padding: '8px 16px', border: 'none', backgroundColor: 'transparent',
              color: subTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: subTab === t.id ? 600 : 400, fontSize: '0.875rem', cursor: 'pointer',
              borderBottom: `2px solid ${subTab === t.id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Jewellery note ────────────────────────────────── */}
      {subTab === 'jewellery' && (
        <div style={{
          backgroundColor: 'var(--gold-faint)', border: '1px solid var(--gold-color)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: '0.82rem', color: 'var(--text-secondary)',
        }}>
          Jewellery is tracked for <strong>record-keeping and insurance purposes</strong>. Current values use market gold price and may not reflect actual resale value. Gains are not counted toward investment returns.
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────── */}
      {editItem ? (
        <GoldForm
          initial={editItem}
          category={category}
          onSave={handleSave}
          onCancel={() => setEditItem(null)}
          activeMember={activeMember}
        />
      ) : (
        <GoldTable
          items={filtered}
          prices={goldPrices}
          onEdit={item => setEditItem(item)}
          onDelete={id => saveGold(gold.filter(g => g.id !== id))}
          isJewellery={subTab === 'jewellery'}
        />
      )}

      {/* ── Add button / form ─────────────────────────────── */}
      {!editItem && (
        <>
          <button
            onClick={() => setShowAdd(v => !v)}
            style={{ width: '100%', padding: 14, borderRadius: 10, border: '2px dashed var(--border)', backgroundColor: 'transparent', color: 'var(--gold-color)', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {showAdd ? 'Cancel' : `+ Add ${category} Gold`}
          </button>
          {showAdd && (
            <GoldForm
              category={category}
              onSave={handleSave}
              onCancel={() => setShowAdd(false)}
              activeMember={activeMember}
            />
          )}
        </>
      )}
    </div>
  )
}
