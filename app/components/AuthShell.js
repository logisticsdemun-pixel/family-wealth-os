'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { ThemeProvider } from '../lib/theme'
import PasswordGate from '../password-gate'
import { unlock, isSessionUnlocked, lock, restoreSession } from '../lib/auth'
import { AppProvider } from '../lib/store'

const LockCtx = createContext(() => {})
export const useLock = () => useContext(LockCtx)

export default function AuthShell({ children }) {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [checking, setChecking]     = useState(true)

  useEffect(() => {
    async function init() {
      // Fast path: module-level flag already set (same JS context / fast refresh)
      if (isSessionUnlocked()) {
        setIsUnlocked(true)
        setChecking(false)
        return
      }
      // Slow path: try to restore AES key from sessionStorage (survives page reloads)
      try {
        const ok = await restoreSession()
        if (ok) setIsUnlocked(true)
      } catch {}
      setChecking(false)
    }
    init()
    // No beforeunload → lock() here. Locking is explicit only (lock button).
    // sessionStorage is cleared automatically by the browser on tab close,
    // so the AES key never outlives the tab that created it.
  }, [])

  async function handleUnlock(password, mode) {
    const ok = await unlock(password, mode)
    if (ok) setIsUnlocked(true)
    return ok
  }

  function handleLock() {
    lock()
    setIsUnlocked(false)
  }

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</div>
      </div>
    )
  }

  if (!isUnlocked) return <PasswordGate onUnlock={handleUnlock} />

  return (
    <LockCtx.Provider value={handleLock}>
      <ThemeProvider>
        <AppProvider>
          {children}
        </AppProvider>
      </ThemeProvider>
    </LockCtx.Provider>
  )
}
