'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { ThemeProvider } from '../lib/theme'
import { AppProvider } from '../lib/store'
import { autoUnlock, isSessionUnlocked } from '../lib/auth'

export default function AuthShell({ children }) {
  const { isSignedIn, isLoaded } = useAuth()
  const [cryptoReady, setCryptoReady] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    async function init() {
      if (isSessionUnlocked()) { setCryptoReady(true); return }
      await autoUnlock()
      setCryptoReady(true)
    }
    init()
  }, [isLoaded, isSignedIn])

  // Clerk loaded, user not signed in — render children directly so
  // sign-in/sign-up pages can display. Middleware guards all other routes.
  if (isLoaded && !isSignedIn) {
    return <>{children}</>
  }

  if (!isLoaded || !cryptoReady) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading…</div>
      </div>
    )
  }

  return (
    <ThemeProvider>
      <AppProvider>
        {children}
      </AppProvider>
    </ThemeProvider>
  )
}
