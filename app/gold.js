'use client'
import { useState } from 'react'
import { KEYS } from './lib/storage'
import { formatINR, gainColor, firstName, MEMBERS } from './lib/format'
import { DEFAULT_GOLD_PRICES } from './lib/seedData'
import { useStore } from './lib/store'

const CARATS = [24, 22, 18]

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}
const lbl = {
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

// ── Add / Edit gold item form ──────────────────────────────
function GoldForm({ initial, category, onSave, onCancel, activeMember = 'All' }) {
  const [form, setForm] = useState(initial ?? {
    member: activeMember !== 'All' ? activeMember : MEMBERS[0],
    category: category || 'Investment',
    name: '', grams: '', carat: 24, buyPricePerGram: '',
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
      <p style={{ ...lbl, marginBottom: 14, fontSize: '0.75rem' }}>{initial ? 'EDIT' : 'ADD'} {(category || form.category).toUpperCase()} GOLD</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(activeMember === 'All' || !!initial?.id) && (
          <div>
            <span style={lbl}>Member</span>
            <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
              {MEMBERS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        {!category && !initial && (
          <div>
            <span style={lbl}>Category</span>
            <select style={inp} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="Investment">Investment Gold</option>
              <option value="Jewellery">Jewellery</option>
            </select>
          </div>
        )}
        <div>
          <span style={lbl}>Name / Description</span>
          <input required style={inp} placeholder="Coin / Bangle / Ring…" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <span style={lbl}>Weight (grams)</span>
          <input required type="number" step="any" style={inp} placeholder="0" value={form.grams} onChange={e => setForm({ ...form, grams: e.target.value })} />
        </div>
        <div>
          <span style={lbl}>Carat</span>
          <select style={inp} value={form.carat} onChange={e => setForm({ ...form, carat: e.target.value })}>
            {CARATS.map(c => <option key={c} value={c}>{c}K</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={lbl}>Buy Price / gram (₹) — 0 if received as gift</span>
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
function GoldTable({ items, prices, onEdit, onDelete, goldTab }) {
  const totalBuy = items.reduce((s, g) => s + buyValue(g), 0)
  const totalCurrent = items.reduce((s, g) => s + currentValue(g, prices), 0)
  const totalGain = totalCurrent - totalBuy
  const totalGrams = items.reduce((s, g) => s + (g.grams || 0), 0)

  const emptyLabel = goldTab === 'jewellery' ? 'jewellery' : goldTab === 'investment' ? 'investment gold' : 'gold'

  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '24px 0' }}>
        No {emptyLabel} recorded. Click &ldquo;+ Add&rdquo; to begin.
      </p>
    )
  }

  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 600 }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['Item', 'Member', 'Grams', 'Carat', 'Buy Value', 'Current Value', goldTab === 'jewellery' ? 'Mark-up' : 'Gain / Loss', ''].map((h, i) => (
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
                          ({((gl / bv) * 100).toFixed(1)}%)
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
            <tr style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
              <td style={{ padding: '10px 14px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>Total</td>
              <td />
              <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 500 }}>{totalGrams.toFixed(3)}g</td>
              <td />
              <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 500 }}>{formatINR(totalBuy)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 500, color: '#534AB7' }}>{formatINR(totalCurrent)}</td>
              <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.8rem', fontWeight: 500, color: totalGain >= 0 ? '#1D9E75' : '#D85A30' }}>
                {totalGain >= 0 ? '+' : ''}{formatINR(totalGain)}
              </td>
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
  const { data, set, flush } = useStore()
  const gold = data?.gold ?? []
  const goldPrices = data?.goldPrices ?? DEFAULT_GOLD_PRICES

  const [goldTab, setGoldTab] = useState('all')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [showPrices, setShowPrices] = useState(false)
  const [localPrices, setLocalPrices] = useState(null)

  function saveGold(updated) { set(KEYS.GOLD, updated) }
  function updatePrices(prices) { set(KEYS.GOLD_PRICES, prices) }
  function openPrices() { setLocalPrices({ ...goldPrices }); setShowPrices(true) }
  function savePrices() { if (localPrices) updatePrices(localPrices); setShowPrices(false); setLocalPrices(null) }

  function handleSave(item) {
    if (item.id && gold.find(g => g.id === item.id)) {
      saveGold(gold.map(g => g.id === item.id ? item : g))
    } else {
      saveGold([...gold, { ...item, id: Date.now() }])
    }
    setEditItem(null)
    setShowAdd(false)
  }

  const memberFiltered = filterByMember(gold, activeMember)
  const category = goldTab === 'investment' ? 'Investment' : goldTab === 'jewellery' ? 'Jewellery' : null
  const filteredItems = category
    ? memberFiltered.filter(g => g.category === category)
    : memberFiltered

  const totalBuyValue = filteredItems.reduce((s, g) => s + buyValue(g), 0)
  const totalCurrentValue = filteredItems.reduce((s, g) => s + currentValue(g, goldPrices), 0)
  const totalGain = totalCurrentValue - totalBuyValue
  const totalGainPct = totalBuyValue > 0 ? (totalGain / totalBuyValue) * 100 : 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: showPrices ? 12 : 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Gold</h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Track investment and jewellery gold
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={showPrices ? () => setShowPrices(false) : openPrices}
            style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Today's Gold Price
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              {formatINR(goldPrices[24])}/g
            </span>
          </button>
          <button
            onClick={async () => {
              setSaveStatus('saving')
              await flush()
              setSaveStatus('saved')
              setTimeout(() => setSaveStatus('idle'), 2000)
            }}
            disabled={saveStatus !== 'idle'}
            style={{ ...btnGhost, fontSize: '0.82rem', color: saveStatus === 'saved' ? 'var(--gain)' : 'var(--text-secondary)', minWidth: 72 }}
          >
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Compact price panel ───────────────────────────── */}
      {showPrices && (
        <div style={{ ...card, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {CARATS.map(c => (
              <div key={c}>
                <span style={lbl}>{c}K (₹/gram)</span>
                <input
                  type="number"
                  style={inp}
                  value={(localPrices ?? goldPrices)[c]}
                  onChange={e => setLocalPrices({ ...(localPrices ?? goldPrices), [c]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={savePrices} style={btnPrimary}>Done</button>
            <button onClick={() => setShowPrices(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            cardLabel: 'GOLD PURCHASE PRICE',
            value: formatINR(totalBuyValue),
            sub: `${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''}`,
            color: 'var(--text-primary)',
            subColor: 'var(--text-muted)',
          },
          {
            cardLabel: 'CURRENT VALUE',
            value: formatINR(totalCurrentValue),
            sub: 'At current gold prices',
            color: '#534AB7',
            subColor: '#534AB7',
          },
          {
            cardLabel: 'GAIN / LOSS',
            value: (totalGain >= 0 ? '+' : '') + formatINR(totalGain),
            sub: (totalGainPct >= 0 ? '+' : '') + totalGainPct.toFixed(2) + '% overall',
            color: totalGain >= 0 ? '#1D9E75' : '#D85A30',
            subColor: totalGain >= 0 ? '#1D9E75' : '#D85A30',
          },
        ].map(({ cardLabel, value, sub, color, subColor }) => (
          <div key={cardLabel} style={{ backgroundColor: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', border: '0.5px solid var(--color-border-tertiary)', padding: '20px 24px' }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', margin: '0 0 8px', display: 'block' }}>{cardLabel}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color, margin: '0 0 3px' }}>{value}</p>
            <p style={{ fontSize: 13, color: subColor, margin: 0 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'investment', label: 'Investment Gold' },
          { id: 'jewellery', label: 'Jewellery' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setGoldTab(tab.id); setShowAdd(false); setEditItem(null) }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: '0.85rem',
              backgroundColor: goldTab === tab.id ? '#334155' : 'var(--surface-2)',
              color: goldTab === tab.id ? 'white' : 'var(--text-secondary)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Jewellery note ────────────────────────────────── */}
      {goldTab === 'jewellery' && (
        <p style={{
          fontSize: 12, color: 'var(--text-secondary)',
          margin: '-12px 0 16px', padding: '8px 12px',
          background: 'var(--surface-2)', borderRadius: 8,
          borderLeft: '3px solid #BA7517',
        }}>
          Jewellery values are estimated by gold weight only.
          Craftsmanship, diamonds, and gemstone values are not included.
          These are tracked for record and insurance purposes.
        </p>
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
          items={filteredItems}
          prices={goldPrices}
          onEdit={item => setEditItem(item)}
          onDelete={id => saveGold(gold.filter(g => g.id !== id))}
          goldTab={goldTab}
        />
      )}

      {/* ── Add button / form ─────────────────────────────── */}
      {!editItem && (
        <>
          <button
            onClick={() => setShowAdd(v => !v)}
            style={{ width: '100%', padding: 14, borderRadius: 10, border: '2px dashed var(--border)', backgroundColor: 'transparent', color: 'var(--gold-color)', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            {showAdd ? 'Cancel' : `+ Add ${category ? category + ' ' : ''}Gold`}
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
