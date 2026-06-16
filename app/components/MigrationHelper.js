'use client'
import { useState } from 'react'
import { getAllMemoryData } from '../lib/crypto'

// Maps _memoryStore keys → Supabase collection names
const KEY_TO_COLLECTION = {
  'fwos-investments':  'investments',
  'fwos-fixed-income': 'fixedIncome',
  'fwos-gold':         'gold',
  'fwos-gold-prices':  'goldPrices',
  'fwos-loans':        'loans',
  'fwos-real-estate':  'realEstate',
  'fwos-insurance':    'insurance',
  'fwos-cash-assets':  'cashAssets',
  'fwos-liabilities':  'liabilities',
  'fwos-snapshots':    'snapshots',
  'fwos-price-cache':  'priceCache',
  'fwos-goals':        'goals',
}

export default function MigrationHelper({ onDone }) {
  const [status, setStatus] = useState('idle') // idle | migrating | done | empty | error
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  async function handleMigrate() {
    setStatus('migrating')
    setError(null)

    // Read decrypted data from _memoryStore (populated by autoUnlock on sign-in)
    const memoryData = getAllMemoryData()

    // Map to collection names, skipping unknown keys and empty values
    const localData = {}
    let foundAny = false
    for (const [key, value] of Object.entries(memoryData)) {
      const collection = KEY_TO_COLLECTION[key]
      if (!collection) continue
      localData[collection] = value
      if (Array.isArray(value) ? value.length > 0
        : value && typeof value === 'object' && Object.keys(value).length > 0) {
        foundAny = true
      }
    }

    if (!foundAny) {
      setStatus('empty')
      return
    }

    try {
      const res = await fetch('/api/migrate-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localData }),
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.results)
        setStatus('done')
      } else {
        setError(data.error || 'Migration failed')
        setStatus('error')
      }
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  const overlay = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9999,
  }
  const card = {
    background: 'var(--color-background-primary)',
    borderRadius: 16, padding: '32px',
    width: 'calc(100% - 48px)', maxWidth: 480,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  }

  if (status === 'idle') return (
    <div style={overlay}>
      <div style={card}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          Move your data to the cloud
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          Your financial data is currently stored only on this device.
          Migrate it to Supabase so all family members can access it
          from any device.
        </p>
        <p style={{
          fontSize: 12, color: 'var(--color-text-secondary)',
          margin: '0 0 20px', padding: '10px 14px',
          background: 'var(--color-background-secondary)',
          borderRadius: 8, lineHeight: 1.5,
        }}>
          Your local data is not deleted — this copies it to Supabase.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleMigrate} style={{
            flex: 1, padding: '10px', borderRadius: 8,
            background: 'var(--color-accent)', color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>
            Migrate to cloud
          </button>
          <button onClick={onDone} style={{
            padding: '10px 16px', borderRadius: 8,
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border-tertiary)',
            fontSize: 13, cursor: 'pointer',
          }}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )

  if (status === 'migrating') return (
    <div style={overlay}>
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>
          Migrating to Supabase…
        </p>
      </div>
    </div>
  )

  if (status === 'empty') return (
    <div style={overlay}>
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
          No local data found
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 20px' }}>
          Starting fresh with Supabase.
        </p>
        <button onClick={onDone} style={{
          padding: '8px 24px', borderRadius: 8,
          background: 'var(--color-accent)', color: '#fff',
          border: 'none', fontSize: 13, cursor: 'pointer',
        }}>
          Continue
        </button>
      </div>
    </div>
  )

  if (status === 'done') {
    const migrated = Object.entries(results || {}).filter(([, v]) => !v.startsWith('skipped'))

    return (
      <div style={overlay}>
        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2D6A4F', margin: '0 0 8px' }}>
            Migration complete
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
            Your data is now in Supabase and accessible from any device.
          </p>
          {migrated.length > 0 && (
            <div style={{
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 8, overflow: 'hidden', marginBottom: 16,
            }}>
              {migrated.map(([col, result]) => (
                <div key={col} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 12, padding: '7px 12px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>{col}</span>
                  <span style={{ color: result.startsWith('error') ? '#D85A30' : '#2D6A4F' }}>{result}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => { onDone(); window.location.reload() }} style={{
            width: '100%', padding: '10px', borderRadius: 8,
            background: 'var(--color-accent)', color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>
            Open Grey Diary
          </button>
        </div>
      </div>
    )
  }

  if (status === 'error') return (
    <div style={overlay}>
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#D85A30', margin: '0 0 8px' }}>
          Migration failed
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleMigrate} style={{
            flex: 1, padding: '8px', borderRadius: 8,
            background: 'var(--color-accent)', color: '#fff',
            border: 'none', fontSize: 13, cursor: 'pointer',
          }}>
            Try again
          </button>
          <button onClick={onDone} style={{
            flex: 1, padding: '8px', borderRadius: 8,
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-secondary)',
            border: '0.5px solid var(--color-border-tertiary)',
            fontSize: 13, cursor: 'pointer',
          }}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
