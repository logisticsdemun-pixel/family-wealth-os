'use client'
import { useState } from 'react'
import { takeSnapshotFromStorage } from '../lib/snapshot'
import { useStore } from '../lib/store'

export default function SaveBar() {
  const { dirty, flush } = useStore()
  const [status, setStatus] = useState('idle') // 'idle' | 'saving' | 'saved'

  if (!dirty && status === 'idle') return null

  async function handleSave() {
    setStatus('saving')
    await flush()
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 2000)
  }

  async function handleSaveToHistory() {
    setStatus('saving')
    await flush()
    takeSnapshotFromStorage()
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 2000)
  }

  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : 'Save'

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 300,
      display: 'flex', alignItems: 'center', gap: 10,
      backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '10px 16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    }}>
      {dirty && status === 'idle' && (
        <span className="pulse-dot" title="Unsaved changes" />
      )}
      {status === 'saved' && (
        <span style={{ color: 'var(--gain)', fontSize: '0.85rem', fontWeight: 600 }}>✓ Saved</span>
      )}
      {status !== 'saved' && (
        <>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={status !== 'idle'}
            style={{
              padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
              backgroundColor: 'transparent', color: 'var(--text-secondary)',
              fontSize: '0.82rem', cursor: status !== 'idle' ? 'not-allowed' : 'pointer',
            }}
          >
            {label}
          </button>
          <button
            onClick={handleSaveToHistory}
            disabled={status !== 'idle'}
            style={{
              padding: '5px 12px', borderRadius: 8, border: 'none',
              backgroundColor: 'var(--accent)', color: '#fff',
              fontSize: '0.82rem', fontWeight: 500,
              cursor: status !== 'idle' ? 'not-allowed' : 'pointer',
              opacity: status !== 'idle' ? 0.6 : 1,
            }}
          >
            Save to History
          </button>
        </>
      )}
    </div>
  )
}
