'use client'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { applyImport, KEYS } from '../lib/storage'
import { useStore } from '../lib/store'
import { MEMBERS, formatINR, firstName } from '../lib/format'
import { takeSnapshotFromStorage } from '../lib/snapshot'
import { SEED_INVESTMENTS } from '../lib/seedData'

function parseZerodhaHoldings(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' })

        const sheet = wb.Sheets['Combined']
        if (!sheet) throw new Error(
          'Combined sheet not found. Please upload the Zerodha Holdings Statement (not a P&L or tax report).'
        )

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

        // Header row: first row whose first non-null cell is exactly 'Symbol'
        let headerRowIndex = -1
        for (let i = 0; i < rows.length; i++) {
          const firstNonNull = rows[i].find(c => c !== null && c !== undefined)
          if (firstNonNull === 'Symbol') { headerRowIndex = i; break }
        }
        if (headerRowIndex === -1) throw new Error(
          'Could not find data in this file. Please use the Holdings Statement from Zerodha Console.'
        )

        const headers = rows[headerRowIndex]
        const colIdx = {}
        headers.forEach((h, i) => {
          if (h === 'Symbol')                 colIdx.symbol = i
          if (h === 'ISIN')                   colIdx.isin = i
          if (h === 'Sector')                 colIdx.sector = i
          if (h === 'Instrument Type')        colIdx.instrumentType = i
          if (h === 'Quantity Available')     colIdx.qty = i
          if (h === 'Average Price')          colIdx.avgPrice = i
          if (h === 'Previous Closing Price') colIdx.closingPrice = i
        })

        const holdings = []
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row[colIdx.symbol] == null) continue

          const symbol    = String(row[colIdx.symbol]).trim()
          const isin      = String(row[colIdx.isin] ?? '').trim()
          const sector    = String(row[colIdx.sector] ?? '').trim()
          const instrType = String(row[colIdx.instrumentType] ?? '').trim()
          const qty       = parseFloat(row[colIdx.qty]) || 0
          const avgPrice  = parseFloat(row[colIdx.avgPrice]) || 0
          const lastPrice = parseFloat(row[colIdx.closingPrice]) || 0

          if (!symbol || qty <= 0) continue

          const isStock = sector !== '-' && sector !== ''
          const isMF    = instrType !== '-' && instrType !== ''

          holdings.push({ symbol, isin, isStock, isMF, units: qty, buyPrice: avgPrice, currentPrice: lastPrice })
        }

        if (holdings.length === 0) throw new Error('No valid holdings found in this file')
        resolve(holdings)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

function norm(t) {
  if (!t) return ''
  return String(t).toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/\.BO$/, '')
    .replace(/\.BSE$/, '')
    .trim()
}

function buildDiff(fileHoldings, allInvestments, memberName) {
  const fileSymbolSet = new Set(fileHoldings.map(h => norm(h.symbol)).filter(Boolean))
  const fileISINSet   = new Set(fileHoldings.map(h => (h.isin || '').toUpperCase()).filter(Boolean))

  const memberInvestments = allInvestments.filter(h => {
    const storedMember = String(h.member || '').toLowerCase()
    const searchName   = memberName.toLowerCase()
    return storedMember === searchName || storedMember.includes(searchName.split(' ')[0])
  })

  console.log('[EXITED DEBUG] Member:', memberName)
  console.log('[EXITED DEBUG] All investments count:', allInvestments.length)
  console.log('[EXITED DEBUG] Member investments:', memberInvestments.map(h => ({
    name: h.name, ticker: h.ticker, normTicker: norm(h.ticker || ''), isin: h.isin, member: h.member,
  })))
  console.log('[EXITED DEBUG] File symbols:', [...fileSymbolSet])
  console.log('[EXITED DEBUG] File ISINs:', [...fileISINSet])

  // EXITED: in app but not found in file by ticker or ISIN
  const exited = memberInvestments.filter(h => {
    const appTicker = norm(h.ticker || '')
    const appISIN   = (h.isin || '').toUpperCase()
    if (appISIN && fileISINSet.has(appISIN)) return false
    if (appTicker && fileSymbolSet.has(appTicker)) return false
    return !!(appTicker || appISIN)
  })

  console.log('[EXITED DEBUG] Exited:', exited.map(h => h.name || h.ticker))

  const appByTicker = new Map(
    memberInvestments.filter(h => h.ticker).map(h => [norm(h.ticker), h])
  )
  const appByISIN = new Map(
    memberInvestments.filter(h => h.isin).map(h => [(h.isin || '').toUpperCase(), h])
  )

  const adds      = []
  const updates   = []
  const unchanged = []

  for (const fh of fileHoldings) {
    const fSymbol  = norm(fh.symbol)
    const fISIN    = (fh.isin || '').toUpperCase()
    const existing = (fISIN && appByISIN.get(fISIN)) || (fSymbol && appByTicker.get(fSymbol))

    if (!existing) { adds.push(fh); continue }

    const unitsChanged = Math.abs((existing.units || 0) - fh.units) > 0.001
    const priceChanged = Math.abs((existing.buyPrice || 0) - fh.buyPrice) > 0.01

    if (unitsChanged || priceChanged) {
      updates.push({ existing, incoming: fh, changes: {
        units:    unitsChanged ? { from: existing.units, to: fh.units } : null,
        buyPrice: priceChanged ? { from: existing.buyPrice, to: fh.buyPrice } : null,
      }})
    } else {
      unchanged.push(fh)
    }
  }

  return { adds, updates, unchanged, exited }
}

export default function ZerodhaImportWizard({ onClose }) {
  console.log('ZerodhaImport v2 loaded')
  const { data } = useStore()
  const allInvestments = data?.investments ?? SEED_INVESTMENTS

  const [step, setStep]                   = useState('select')
  const [member, setMember]               = useState(MEMBERS[0])
  const [parsed, setParsed]               = useState(null)
  const [exitConfirmed, setExitConfirmed] = useState({})
  const [error, setError]                 = useState('')
  const [importing, setImporting]         = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!parsed?.exited) return
    setExitConfirmed(Object.fromEntries(parsed.exited.map(h => [h.id ?? h.ticker, true])))
  }, [parsed])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    e.target.value = ''
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Please select a file under 10MB.')
      return
    }
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError('Invalid file type. Please select a .xlsx or .xls file.')
      return
    }
    try {
      const rows = await parseZerodhaHoldings(file)
      const diff = buildDiff(rows, allInvestments, member)
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
      const cache   = { ...(data?.priceCache ?? {}) }
      const updated = [...allInvestments]
      const now     = Date.now()

      for (const { existing, incoming } of parsed.updates) {
        const idx = updated.findIndex(inv => inv.id === existing.id)
        if (idx === -1) continue
        const prev     = updated[idx]
        const hasPrice = incoming.currentPrice > 0
        updated[idx] = {
          ...prev,
          units:        incoming.units,
          buyPrice:     incoming.buyPrice,
          currentPrice: hasPrice ? incoming.currentPrice : prev.currentPrice,
          flags:        hasPrice ? (prev.flags || []).filter(f => f !== 'manual') : (prev.flags || []),
        }
        if (hasPrice && prev.ticker) cache[`stock:${prev.ticker}`] = { fetchedAt: now, status: 'ok' }
      }

      for (const fh of parsed.adds) {
        const ticker   = fh.isStock ? `${fh.symbol}.NS` : null
        const hasPrice = fh.currentPrice > 0
        updated.push({
          id:           crypto.randomUUID(),
          name:         fh.symbol,
          ticker,
          mfCode:       null,
          member,
          type:         fh.isMF ? 'Mutual Fund' : 'Stock',
          isMF:         fh.isMF,
          units:        fh.units,
          buyPrice:     fh.buyPrice,
          currentPrice: hasPrice ? fh.currentPrice : null,
          buyDate:      '',
          flags:        fh.isMF ? ['VERIFY_AMFI'] : [],
        })
        if (ticker && hasPrice) cache[`stock:${ticker}`] = { fetchedAt: now, status: 'ok' }
      }

      const exitedConfirmedIds = new Set(
        (parsed.exited || [])
          .filter(h => exitConfirmed[h.id ?? h.ticker] !== false)
          .map(h => h.id)
      )
      let finalUpdated = updated.filter(inv => !exitedConfirmedIds.has(inv.id))

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
      onClose()
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

  const updateIncomingSet = parsed ? new Set(parsed.updates.map(u => u.incoming)) : new Set()
  const unchangedSet      = parsed ? new Set(parsed.unchanged) : new Set()

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
                ? 'Upload your Zerodha Holdings Statement (.xlsx)'
                : `${parsed.rows.length} holding${parsed.rows.length !== 1 ? 's' : ''} — ${parsed.adds.length} new, ${parsed.updates.length} updated${parsed.exited?.length ? `, ${parsed.exited.length} may have exited` : ''} for ${firstName(member)}`
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
              <p style={{ margin: '0 0 4px', fontWeight: 500, color: 'var(--text-primary)' }}>Click to select the Holdings Statement (.xlsx)</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Zerodha Console → Reports → Holdings → Download
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
              Holdings matched by ticker or ISIN are updated (qty + avg price). New holdings are added.
              Stocks missing from the file are flagged as potential exits.
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
                  const key        = h.id ?? h.ticker
                  const isChecked  = exitConfirmed[key] !== false
                  const currentVal = h.currentPrice && h.units ? h.units * h.currentPrice : null
                  const gain       = currentVal && h.buyPrice && h.units ? currentVal - h.units * h.buyPrice : null
                  const gainPct    = gain != null && h.buyPrice && h.units
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
                      {['Symbol', 'Qty', 'Avg Price', 'Mkt Price', 'Action'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i >= 1 && i <= 3 ? 'right' : i === 4 ? 'center' : 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: 'var(--surface-2)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, i) => {
                      const isUpdate    = updateIncomingSet.has(row)
                      const isUnchanged = unchangedSet.has(row)
                      const action      = isUpdate ? 'Update' : isUnchanged ? 'Unchanged' : 'New'
                      const badgeStyle  = isUpdate
                        ? { backgroundColor: 'var(--amber-faint)', color: 'var(--amber)' }
                        : isUnchanged
                        ? { backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }
                        : { backgroundColor: 'var(--gain-faint)', color: 'var(--gain)' }
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.symbol}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.units}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(row.buyPrice)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {row.currentPrice > 0 ? formatINR(row.currentPrice) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, ...badgeStyle }}>
                              {action}
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
              const removeCount    = (parsed.exited || []).filter(h => exitConfirmed[h.id ?? h.ticker] !== false).length
              const addCount       = parsed.adds.length
              const updateCount    = parsed.updates.length
              const unchangedCount = parsed.unchanged.length
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
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: importing ? 'var(--text-muted)' : 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: importing ? 'not-allowed' : 'pointer' }}
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
