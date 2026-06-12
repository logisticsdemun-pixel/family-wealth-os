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
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        lockStorage()
        setIsUnlocked(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', lockStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', lockStorage)
    }
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
        onTabChange={setActiveTab}
        theme={theme}
        onThemeToggle={toggleTheme}
        onLock={handleLock}
      />
      <MemberFilter activeMember={activeMember} onMemberChange={setActiveMember} />

      {/* Tab panels — kept mounted so state survives tab switching */}
      <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
        <Dashboard {...tabProps} />
      </div>
      <div style={{ display: activeTab === 'investments' ? 'block' : 'none' }}>
        <Investments {...tabProps} />
      </div>
      <div style={{ display: activeTab === 'gold' ? 'block' : 'none' }}>
        <Gold {...tabProps} />
      </div>
      <div style={{ display: activeTab === 'loans' ? 'block' : 'none' }}>
        <Loans {...tabProps} />
      </div>
      <div style={{ display: activeTab === 'insurance' ? 'block' : 'none' }}>
        <Insurance {...tabProps} />
      </div>
      <div style={{ display: activeTab === 'artha' ? 'block' : 'none' }}>
        <Artha {...tabProps} />
      </div>
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
