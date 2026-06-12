'use client'
import { useState, useEffect } from 'react'
import { ThemeProvider, useTheme } from './lib/theme'
import PasswordGate from './password-gate'
import Nav from './components/Nav'
import MemberFilter from './components/MemberFilter'
import Dashboard from './dashboard'
import Investments from './investments'
import Gold from './gold'
import Loans from './loans'
import Insurance from './insurance'
import Artha from './artha'
import { setupPassword, unlockStorage, lockStorage } from './lib/crypto'

function App() {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [activeMember, setActiveMember] = useState('All')
  const [mountedTabs, setMountedTabs] = useState(() => new Set(['dashboard']))
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    window.addEventListener('beforeunload', lockStorage)
    return () => window.removeEventListener('beforeunload', lockStorage)
  }, [])

  async function handleUnlock(password, mode) {
    try {
      if (mode === 'setup') {
        await setupPassword(password)
      } else {
        await unlockStorage(password)
      }
      setIsUnlocked(true)
      return true
    } catch {
      return false
    }
  }

  function handleLock() {
    lockStorage()
    setIsUnlocked(false)
  }

  if (!isUnlocked) {
    return <PasswordGate onUnlock={handleUnlock} />
  }

  const tabProps = { activeMember }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      <Nav
        activeTab={activeTab}
        onTabChange={tab => { setMountedTabs(prev => new Set([...prev, tab])); setActiveTab(tab) }}
        theme={theme}
        onThemeToggle={toggleTheme}
        onLock={handleLock}
      />
      <MemberFilter activeMember={activeMember} onMemberChange={setActiveMember} />

      {/* Tab panels — mounted on first visit, then kept mounted to preserve state */}
      {mountedTabs.has('dashboard') && (
        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard {...tabProps} />
        </div>
      )}
      {mountedTabs.has('investments') && (
        <div style={{ display: activeTab === 'investments' ? 'block' : 'none' }}>
          <Investments {...tabProps} />
        </div>
      )}
      {mountedTabs.has('gold') && (
        <div style={{ display: activeTab === 'gold' ? 'block' : 'none' }}>
          <Gold {...tabProps} />
        </div>
      )}
      {mountedTabs.has('loans') && (
        <div style={{ display: activeTab === 'loans' ? 'block' : 'none' }}>
          <Loans {...tabProps} />
        </div>
      )}
      {mountedTabs.has('insurance') && (
        <div style={{ display: activeTab === 'insurance' ? 'block' : 'none' }}>
          <Insurance {...tabProps} />
        </div>
      )}
      {mountedTabs.has('artha') && (
        <div style={{ display: activeTab === 'artha' ? 'block' : 'none' }}>
          <Artha {...tabProps} />
        </div>
      )}
    </div>
  )
}

export default function Home() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  )
}
