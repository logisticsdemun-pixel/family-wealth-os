'use client'
import { useState } from 'react'
import { useTheme } from './lib/theme'
import { useLock } from './components/AuthShell'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MemberFilter from './components/MemberFilter'
import Dashboard from './dashboard'
import Investments from './investments'
import Gold from './gold'
import Loans from './loans'
import Insurance from './insurance'
import RealEstate from './realestate'
import Artha from './artha'
import SaveBar from './components/SaveBar'

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [activeMember, setActiveMember] = useState('All')
  const [mountedTabs, setMountedTabs] = useState(() => new Set(['dashboard']))
  const { theme, toggleTheme } = useTheme()
  const handleLock = useLock()

  const tabProps = { activeMember }

  function handleTabChange(tab) {
    setMountedTabs(prev => new Set([...prev, tab]))
    setActiveTab(tab)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg)' }}>
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Main content — offset by sidebar width */}
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar theme={theme} onThemeToggle={toggleTheme} onLock={handleLock} />
        <MemberFilter activeMember={activeMember} onMemberChange={setActiveMember} />

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
        {mountedTabs.has('realestate') && (
          <div style={{ display: activeTab === 'realestate' ? 'block' : 'none' }}>
            <RealEstate {...tabProps} />
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

      <SaveBar />
    </div>
  )
}
