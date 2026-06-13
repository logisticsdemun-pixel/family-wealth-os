'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { ThemeProvider } from '../lib/theme'
import PasswordGate from '../password-gate'
import { unlock, isSessionUnlocked, lock } from '../lib/auth'
import { AppProvider } from '../lib/store'

const LockCtx = createContext(() => {})
export const useLock = () => useContext(LockCtx)

export default function AuthShell({ children }) {
  const [isUnlocked, setIsUnlocked] = useState(() => isSessionUnlocked())

  useEffect(() => {
    window.addEventListener('beforeunload', lock)
    return () => window.removeEventListener('beforeunload', lock)
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
