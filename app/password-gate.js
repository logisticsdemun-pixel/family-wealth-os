'use client'
import { useState } from 'react'

export default function PasswordGate({ children }) {
  const [entered, setEntered] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const CORRECT_PASSWORD = 'Mp09wg1100'

  function handleSubmit(e) {
    e.preventDefault()
    if (password === CORRECT_PASSWORD) {
      setEntered(true)
    } else {
      setError(true)
      setPassword('')
    }
  }

  if (entered) return children

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        backgroundColor: '#1e293b',
        padding: '40px',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center'
      }}>
        <h1 style={{ color: 'white', fontSize: '1.5rem', marginBottom: '8px' }}>
          Family Wealth OS
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px', fontSize: '0.9rem' }}>
          Enter your password to continue
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(false)
            }}
            placeholder="Password"
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              border: error ? '1px solid #ef4444' : '1px solid #334155',
              backgroundColor: '#0f172a',
              color: 'white',
              fontSize: '1rem',
              marginBottom: '12px',
              boxSizing: 'border-box'
            }}
          />
          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '12px' }}>
              Incorrect password. Try again.
            </p>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: '#6366f1',
              color: 'white',
              fontSize: '1rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}