'use client'
import { useState, useEffect, useCallback } from 'react'
import { load, save, KEYS } from './lib/storage'
import { formatINR, formatPct, gainColor, firstName, MEMBERS } from './lib/format'
import { SEED_INVESTMENTS, SEED_FIXED_INCOME } from './lib/seedData'

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

// ── Price fetching ─────────────────────────────────────────
async function fetchStockPrice(ticker) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
  try {
    const res = await fetch(yahooUrl)
    if (!res.ok) throw new Error()
    const data = await res.json()
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice
    if (price) return price
    throw new Error()
  } catch {
    try {
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`
      const res2 = await fetch(proxy)
      const wrapper = await res2.json()
      const data = JSON.parse(wrapper.contents)
      return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
    } catch {
      return null
    }
  }
}

async function fetchMFPrice(mfCode) {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${mfCode}/latest`)
    const data = await res.json()
    const nav = parseFloat(data.data?.[0]?.nav)
    return isNaN(nav) ? null : nav
  } catch {
    return null
  }
}

// ── Summary cards ──────────────────────────────────────────
function SummaryCards({ items }) {
  const invested = items.reduce((s, i) => s + i.units * i.buyPrice, 0)
  const current = items.reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
  const gain = current - invested
  const gainPct = invested > 0 ? (gain / invested) * 100 : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
      {[
        { label: 'INVESTED', value: formatINR(invested), color: 'var(--text-primary)' },
        { label: 'CURRENT VALUE', value: formatINR(current), color: 'var(--accent)' },
        { label: 'GAIN / LOSS', value: `${formatINR(gain)}  ${formatPct(gainPct)}`, color: gainColor(gain) },
      ].map(c => (
        <div key={c.label} style={{ ...card, padding: '16px 20px' }}>
          <p style={label}>{c.label}</p>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: c.color }}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Investment table row ───────────────────────────────────
function InvRow({ inv, loading, onUpdate, onDelete }) {
  const [editMode, setEditMode] = useState(false)
  const [units, setUnits] = useState(String(inv.units))
  const [buyPrice, setBuyPrice] = useState(String(inv.buyPrice))

  const invested = inv.units * inv.buyPrice
  const current = inv.currentPrice != null ? inv.units * inv.currentPrice : null
  const gain = current != null ? current - invested : null
  const gainPct = gain != null && invested > 0 ? (gain / invested) * 100 : null

  function saveEdit() {
    onUpdate({ ...inv, units: parseFloat(units) || inv.units, buyPrice: parseFloat(buyPrice) || inv.buyPrice })
    setEditMode(false)
  }

  const td = (content, align = 'left', style = {}) => (
    <td style={{ padding: '12px 14px', textAlign: align, verticalAlign: 'middle', ...style }}>
      {content}
    </td>
  )

  const identifier = inv.isMF ? `MF ${inv.mfCode}` : inv.ticker

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      {td(
        <div>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500 }}>{inv.name}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{identifier}</p>
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
          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{formatINR(current)}</span>
        ) : loading ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>…</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ),
        'right'
      )}
      {td(
        gain != null ? (
          <span style={{ color: gainColor(gain), fontWeight: 500 }}>
            {formatINR(gain)}
            <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>{formatPct(gainPct)}</span>
          </span>
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

// ── Add investment form ────────────────────────────────────
function AddInvForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({
    member: MEMBERS[0], type: 'Stock', name: '', ticker: '', mfCode: '',
    units: '', buyPrice: '',
  })

  const isMF = form.type === 'Mutual Fund' || form.type === 'Short Term Fund' || form.type === 'ETF'

  function handleSubmit(e) {
    e.preventDefault()
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
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 20, marginTop: 16 }}>
      <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>ADD INVESTMENT</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <span style={label}>Member</span>
          <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
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
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="submit" style={btnPrimary}>Add Investment</button>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      </div>
    </form>
  )
}

// ── Fixed Income section ───────────────────────────────────
function AddFDForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ member: MEMBERS[0], name: '', principal: '', rate: '', maturityValue: '', maturityDate: '' })

  function handleSubmit(e) {
    e.preventDefault()
    onAdd({ ...form, id: crypto.randomUUID(), flags: [], principal: parseFloat(form.principal), rate: parseFloat(form.rate), maturityValue: parseFloat(form.maturityValue) || null })
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...card, padding: 20, marginTop: 16 }}>
      <p style={{ ...label, marginBottom: 14, fontSize: '0.75rem' }}>ADD FIXED INCOME</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <span style={label}>Member</span>
          <select style={inp} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
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
export default function Investments({ activeMember }) {
  const [investments, setInvestments] = useState([])
  const [fixedIncome, setFixedIncome] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(() => load(KEYS.PRICE_UPDATED, null))
  const [subTab, setSubTab] = useState('all')
  const [showAddInv, setShowAddInv] = useState(false)
  const [showAddFD, setShowAddFD] = useState(false)

  useEffect(() => {
    setInvestments(load(KEYS.INVESTMENTS, SEED_INVESTMENTS))
    setFixedIncome(load(KEYS.FIXED_INCOME, SEED_FIXED_INCOME))
  }, [])

  function saveInv(updated) { setInvestments(updated); save(KEYS.INVESTMENTS, updated) }
  function saveFD(updated) { setFixedIncome(updated); save(KEYS.FIXED_INCOME, updated) }

  const refreshPrices = useCallback(async () => {
    setLoading(true)
    const current = load(KEYS.INVESTMENTS, SEED_INVESTMENTS)
    const updated = await Promise.all(
      current.map(async inv => {
        const price = inv.isMF
          ? await fetchMFPrice(inv.mfCode)
          : await fetchStockPrice(inv.ticker)
        return { ...inv, currentPrice: price ?? inv.currentPrice }
      })
    )
    saveInv(updated)
    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    setLastUpdated(ts)
    save(KEYS.PRICE_UPDATED, ts)
    setLoading(false)
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
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Investments</h2>
          {lastUpdated && (
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Prices updated at {lastUpdated}
            </p>
          )}
        </div>
        <button
          onClick={refreshPrices}
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
      </div>

      {/* ── Unpriced assets banner ────────────────────────── */}
      {unpricedCount > 0 && subTab !== 'fi' && (
        <div style={{
          backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 20,
          fontSize: '0.82rem', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠</span>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{unpricedCount} holding{unpricedCount > 1 ? 's' : ''}</strong>{' '}
            without a live price — values use buy price as a fallback. Click <strong>Refresh Prices</strong> to fetch current prices.
          </span>
        </div>
      )}

      {/* ── Summary cards (non-FI only) ───────────────────── */}
      {subTab !== 'fi' && <SummaryCards items={displayed} />}

      {/* ── Sub-tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              color: subTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: subTab === t.id ? 600 : 400,
              fontSize: '0.875rem',
              cursor: 'pointer',
              borderBottom: `2px solid ${subTab === t.id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Investment table ───────────────────────────────── */}
      {subTab !== 'fi' && (
        <>
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 700 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Member', 'Units', 'Buy Price', 'Invested', 'Current', 'Gain / Loss', ''].map((h, i) => (
                      <th key={h || i} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
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
                      loading={loading}
                      onUpdate={updated => saveInv(investments.map(i => i.id === updated.id ? updated : i))}
                      onDelete={() => saveInv(investments.filter(i => i.id !== inv.id))}
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
                      <th key={h || i} style={{ padding: '10px 14px', textAlign: i >= 2 ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
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
            />
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── FD table row ───────────────────────────────────────────
function FDRow({ fd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...fd })

  function saveEdit() {
    onUpdate({ ...form, principal: parseFloat(form.principal), rate: parseFloat(form.rate), maturityValue: parseFloat(form.maturityValue) || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
        <td colSpan={7} style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div><span style={label}>Name</span><input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><span style={label}>Principal (₹)</span><input type="number" style={inp} value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} /></div>
            <div><span style={label}>Rate (%)</span><input type="number" step="0.01" style={inp} value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} /></div>
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
      <td style={{ padding: '12px 14px', fontWeight: 500 }}>{fd.name}</td>
      <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{firstName(fd.member)}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right' }}>{formatINR(fd.principal)}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--gain)' }}>{fd.rate}%</td>
      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>{fd.maturityValue ? formatINR(fd.maturityValue) : '—'}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{fd.maturityDate || '—'}</td>
      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
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