'use client'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { load, applyImport, KEYS } from '../lib/storage'
import { MEMBERS, formatINR, firstName } from '../lib/format'
import { takeSnapshotFromStorage } from '../lib/snapshot'
import { SEED_INVESTMENTS } from '../lib/seedData'

function parseNum(val) {
  if (val == null || val === '') return null
  const n = parseFloat(String(val).replace(/[,₹\s%]/g, ''))
  return isNaN(n) ? null : n
}

function parseZerodhaXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const headerIdx = data.findIndex(row =>
          row.some(cell => String(cell).toLowerCase().includes('instrument'))
        )
        if (headerIdx === -1) throw new Error('Column "Instrument" not found. Please use the Holdings export from Zerodha Kite.')

        const headers = data[headerIdx].map(h => String(h).toLowerCase().trim())
        const col = name => headers.findIndex(h => h.includes(name))

        const iInstrument = col('instrument')
        const iQty = col('qty')
        const iAvgCost = col('avg cost')
        const iLTP = col('ltp')

        if (iQty === -1) throw new Error('Column "Qty" not found. Is this a Zerodha Holdings export?')
        if (iAvgCost === -1) throw new Error('Column "Avg cost" not found. Is this a Zerodha Holdings export?')

        const rows = []
        for (let i = headerIdx + 1; i < data.length; i++) {
          const cols = data[i]
          const instrument = String(cols[iInstrument] ?? '').trim()
          if (!instrument || instrument.toLowerCase() === 'total' || /^-+$/.test(instrument)) continue

          const qty = parseNum(cols[iQty])
          const avgCost = parseNum(cols[iAvgCost])
          if (!qty || !avgCost || qty <= 0 || avgCost <= 0) continue

          const rawLTP = iLTP !== -1 ? parseNum(cols[iLTP]) : null
          rows.push({ instrument: instrument.toUpperCase(), qty, avgCost, ltp: rawLTP && rawLTP > 0 ? rawLTP : null })
        }

        if (rows.length === 0) throw new Error('No valid holdings found in the file')
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

function tickerMatch(inv, base) {
  if (!inv.ticker) return false
  const t = inv.ticker.toUpperCase()
  return t === `${base}.NS` || t === `${base}.BO` || t === base
}

function normaliseTicker(t) {
  if (!t) return ''
  return t.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '').trim()
}

function buildDiff(rows, member) {
  const existing = load(KEYS.INVESTMENTS, SEED_INVESTMENTS)

  // Build set of tickers present in the uploaded file
  const fileTickerSet = new Set(
    rows.map(r => normaliseTicker(r.instrument)).filter(Boolean)
  )

  // All stocks for this member (MFs have no ticker, cannot exit via holdings file)
  const memberStocks = existing.filter(h => !h.isMF && h.member === member)

  // Stocks in app NOT found in the file → potential exits
  const exited = memberStocks.filter(h => {
    const t = normaliseTicker(h.ticker || '')
    return t && !fileTickerSet.has(t)
  })

  const toAdd = []
  const toUpdate = []
  for (const row of rows) {
    const match = existing.find(inv => !inv.isMF && inv.member === member && tickerMatch(inv, row.instrument))
    if (match) toUpdate.push({ existing: match, row })
    else toAdd.push(row)
  }

  return { toAdd, toUpdate, exited }
}

export default function ZerodhaImportWizard({ onClose }) {
  const [step, setStep] = useState('select')
  const [member, setMember] = useState(MEMBERS[0])
  const [parsed, setParsed] = useState(null)
  const [exitConfirmed, setExitConfirmed] = useState({})
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  // Reset exit checkboxes whenever a new file is parsed (default all pre-ticked)
  useEffect(() => {
    if (!parsed?.exited) return
    setExitConfirmed(
      Object.fromEntries(parsed.exited.map(h => [h.id ?? h.ticker, true]))
    )
  }, [parsed])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    e.target.value = ''
    try {
      const rows = await parseZerodhaXLSX(file)
      const diff = buildDiff(rows, member)
      setParsed({ rows, ...diff })
      setStep('review')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport() {
    setImporting(true)
    try {
      takeSnapshotFromStorage()
      const existing = load(KEYS.INVESTMENTS, SEED_INVESTMENTS)
      const cache = { ...load(KEYS.PRICE_CACHE, {}) }
      const updated = [...existing]
      const now = Date.now()

      for (const row of parsed.rows) {
        const idx = updated.findIndex(inv => !inv.isMF && inv.member === member && tickerMatch(inv, row.instrument))

        if (idx !== -1) {
          const prev = updated[idx]
          updated[idx] = {
            ...prev,
            units: row.qty,
            buyPrice: row.avgCost,
            currentPrice: row.ltp != null ? row.ltp : prev.currentPrice,
            flags: row.ltp != null ? (prev.flags || []).filter(f => f !== 'manual') : (prev.flags || []),
          }
          if (row.ltp != null) cache[`stock:${prev.ticker}`] = { fetchedAt: now, status: 'ok' }
        } else {
          const ticker = `${row.instrument}.NS`
          updated.push({
            id: crypto.randomUUID(),
            name: row.instrument,
            ticker,
            member,
            type: 'Stock',
            isMF: false,
            mfCode: null,
            units: row.qty,
            buyPrice: row.avgCost,
            currentPrice: row.ltp,
            buyDate: '',
            flags: [],
          })
          if (row.ltp != null) cache[`stock:${ticker}`] = { fetchedAt: now, status: 'ok' }
        }
      }

      // ── Handle exited positions ──────────────────────────────
      const exitedConfirmedIds = new Set(
        (parsed.exited || [])
          .filter(h => exitConfirmed[h.id ?? h.ticker] !== false)
          .map(h => h.id)
      )

      // Remove confirmed exits
      let finalUpdated = updated.filter(inv => !exitedConfirmedIds.has(inv.id))

      // Add note to kept positions (unchecked = user chose to keep)
      for (const h of (parsed.exited || [])) {
        if (exitConfirmed[h.id ?? h.ticker] === false) {
          const idx = finalUpdated.findIndex(inv => inv.id === h.id)
          if (idx !== -1) {
            const noteText = `Not in Zerodha statement ${new Date().toLocaleDateString('en-IN')} — kept manually`
            finalUpdated[idx] = {
              ...finalUpdated[idx],
              notes: [finalUpdated[idx].notes, noteText].filter(Boolean).join(' | '),
            }
          }
        }
      }

      await applyImport({ [KEYS.INVESTMENTS]: finalUpdated, [KEYS.PRICE_CACHE]: cache })
      window.location.reload()
    } catch (err) {
      setError(err.message || 'Import failed. Please try again.')
      setImporting(false)
    }
  }

  const labelStyle = {
    fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em',
    color: 'var(--text-muted)', display: 'block', marginBottom: 4,
  }
  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={importing ? undefined : onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 560,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px', maxHeight: '90vh', overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
              {step === 'select' ? 'Import from Zerodha' : 'Review Import'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {step === 'select'
                ? 'Upload your Zerodha Holdings export (.xlsx)'
                : `${parsed.rows.length} holding${parsed.rows.length !== 1 ? 's' : ''} — ${parsed.toAdd.length} new, ${parsed.toUpdate.length} updated${parsed.exited?.length ? `, ${parsed.exited.length} may have exited` : ''} for ${firstName(member)}`
              }
            </p>
          </div>
          {!importing && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
          )}
        </div>

        {/* ── Select step ──────────────────────────────────────── */}
        {step === 'select' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <span style={labelStyle}>Assign all holdings to member</span>
              <select value={member} onChange={e => setMember(e.target.value)} style={inp}>
                {MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div
              style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '32px', textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📈</div>
              <p style={{ margin: '0 0 4px', fontWeight: 500, color: 'var(--text-primary)' }}>Click to select the Holdings file (.xlsx)</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Zerodha Kite → Portfolio → Holdings → Download
              </p>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {error && (
              <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--loss)', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ backgroundColor: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>What gets imported:</strong>{' '}
              Holdings matched by ticker are updated (qty + avg cost + LTP). New tickers are added with a{' '}
              <code style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>.NS</code> suffix — edit manually in Investments if the stock is on BSE.
            </div>
          </>
        )}

        {/* ── Review step ──────────────────────────────────────── */}
        {step === 'review' && parsed && (
          <>
            {/* ── EXITED SECTION ── */}
            {parsed.exited && parsed.exited.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  padding: '12px 16px',
                  background: '#FAEEDA',
                  borderLeft: '3px solid #EF9F27',
                  borderRadius: '0 8px 8px 0',
                  marginBottom: 10,
                }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#633806', margin: '0 0 4px' }}>
                    {parsed.exited.length} position{parsed.exited.length > 1 ? 's' : ''} not found in this statement
                  </p>
                  <p style={{ fontSize: 12, color: '#854F0B', margin: 0, lineHeight: 1.5 }}>
                    These stocks are in your portfolio but missing from this Zerodha file.
                    Tick = remove from portfolio. Untick = keep (e.g. held in another account).
                  </p>
                </div>

                {parsed.exited.map(h => {
                  const key = h.id ?? h.ticker
                  const isChecked = exitConfirmed[key] !== false
                  const currentVal = h.currentPrice && h.units ? h.units * h.currentPrice : null
                  const gain = currentVal && h.buyPrice && h.units ? currentVal - h.units * h.buyPrice : null
                  const gainPct = gain != null && h.buyPrice && h.units
                    ? (gain / (h.units * h.buyPrice)) * 100 : null

                  return (
                    <div
                      key={key}
                      onClick={() => setExitConfirmed(prev => ({ ...prev, [key]: !prev[key] }))}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '12px 14px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                        border: `0.5px solid ${isChecked ? '#F09595' : 'var(--border)'}`,
                        background: isChecked ? '#FFF5F5' : 'var(--bg)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => { e.stopPropagation(); setExitConfirmed(prev => ({ ...prev, [key]: e.target.checked })) }}
                        style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{h.name}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                              {h.ticker} · {h.units} units · Invested {formatINR((h.units || 0) * (h.buyPrice || 0))}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {currentVal != null && (
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                                {formatINR(currentVal)}
                              </p>
                            )}
                            {gainPct != null && (
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: gainPct >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                                {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                              </p>
                            )}
                            {currentVal == null && (
                              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>No price recorded</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6, flexShrink: 0, alignSelf: 'center',
                        background: isChecked ? '#FCEBEB' : 'var(--surface-2)',
                        color: isChecked ? '#A32D2D' : 'var(--text-muted)',
                        border: `0.5px solid ${isChecked ? '#F09595' : 'var(--border)'}`,
                      }}>
                        {isChecked ? 'Will be removed' : 'Will be kept'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      {['Instrument', 'Qty', 'Avg Cost', 'LTP', 'Action'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i >= 1 && i <= 3 ? 'right' : i === 4 ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'var(--surface-2)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, i) => {
                      const isNew = !parsed.toUpdate.some(u => u.row === row)
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.instrument}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.qty}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(row.avgCost)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {row.ltp != null ? formatINR(row.ltp) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                              backgroundColor: isNew ? 'var(--gain-faint)' : 'var(--amber-faint)',
                              color: isNew ? 'var(--gain)' : 'var(--amber)',
                            }}>
                              {isNew ? 'New' : 'Update'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {error && (
              <div style={{ backgroundColor: 'var(--loss-faint)', border: '1px solid var(--loss)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82rem', color: 'var(--loss)', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ backgroundColor: 'var(--accent-faint)', border: '1px solid var(--accent)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              A net worth snapshot will be taken before the import.
            </div>

            {/* Live summary line */}
            {(() => {
              const removeCount = (parsed.exited || []).filter(h => exitConfirmed[h.id ?? h.ticker] !== false).length
              const addCount = parsed.toAdd.length
              const updateCount = parsed.toUpdate.length
              const unchangedCount = parsed.rows.length - addCount - updateCount
              return (
                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {addCount > 0 && <span>Adding {addCount} · </span>}
                  {updateCount > 0 && <span>Updating {updateCount} · </span>}
                  {removeCount > 0 && <span style={{ color: 'var(--loss)' }}>Removing {removeCount} · </span>}
                  {unchangedCount > 0 && <span>No change to {unchangedCount}</span>}
                  {addCount === 0 && updateCount === 0 && removeCount === 0 && unchangedCount === 0 && <span>Nothing to change</span>}
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleImport}
                disabled={importing}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: importing ? 'var(--text-muted)' : '#534AB7', color: '#fff', fontSize: 13, fontWeight: 500, cursor: importing ? 'not-allowed' : 'pointer' }}
              >
                {importing ? 'Importing…' : 'Confirm import'}
              </button>
              <button
                onClick={() => { setStep('select'); setParsed(null); setError('') }}
                disabled={importing}
                style={{ padding: '11px 20px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: 13, cursor: importing ? 'not-allowed' : 'pointer' }}
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
