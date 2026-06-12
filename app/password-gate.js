'use client'
import { useState, useEffect } from 'react'
import { hasAuth } from './lib/crypto'

export default function PasswordGate({ onUnlock }) {
  const [mode, setMode] = useState(null) // null while checking auth, then 'setup' or 'unlock'
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    setMode(hasAuth() ? 'unlock' : 'setup')
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'setup') {
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
      if (password !== confirmPw) { setError('Passwords do not match.'); return }
    }
    setLoading(true)
    setError('')
    const ok = await onUnlock(password, mode)
    setLoading(false)
    if (!ok) {
      setError(mode === 'unlock' ? 'Incorrect password. Please try again.' : 'Setup failed. Please try again.')
      setShaking(true)
      setTimeout(() => setShaking(false), 400)
      setPassword('')
      setConfirmPw('')
    }
  }

  if (mode === null) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</div>
      </div>
    )
  }

  const inputStyle = {
    width: '100%', padding: '11px 16px', borderRadius: 8,
    border: `1px solid ${error ? 'var(--loss)' : 'var(--border)'}`,
    backgroundColor: 'var(--bg)', color: 'var(--text-primary)',
    fontSize: '1rem', outline: 'none', transition: 'border-color 0.15s',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '48px 40px', width: '100%', maxWidth: 380, textAlign: 'center',
        animation: shaking ? 'shake 0.4s ease' : undefined,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-1px',
        }}>W</div>

        <h1 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: 600, margin: '0 0 6px' }}>
          Family Wealth OS
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 32px' }}>
          {mode === 'setup' ? 'Create a password to secure your data' : 'Enter your password to continue'}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder={mode === 'setup' ? 'Create password' : 'Password'}
            autoFocus
            disabled={loading}
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          {mode === 'setup' && (
            <input
              type="password"
              value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setError('') }}
              placeholder="Confirm password"
              disabled={loading}
              style={{ ...inputStyle, marginBottom: 10 }}
            />
          )}
          {error && (
            <p style={{ color: 'var(--loss)', fontSize: '0.8rem', margin: '0 0 10px', textAlign: 'left' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 11, borderRadius: 8,
              backgroundColor: loading ? 'var(--text-muted)' : 'var(--accent)',
              color: '#fff', fontSize: '0.95rem', fontWeight: 500, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'opacity 0.15s',
              marginTop: 6,
            }}
          >
            {loading
              ? (mode === 'setup' ? 'Setting up…' : 'Unlocking…')
              : (mode === 'setup' ? 'Set Password & Continue' : 'Unlock')}
          </button>
        </form>

        {mode === 'setup' && (
          <p style={{ marginTop: 16, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Your data is encrypted with AES-256-GCM. The password is stored as a PBKDF2 hash and cannot be recovered if lost.
          </p>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
