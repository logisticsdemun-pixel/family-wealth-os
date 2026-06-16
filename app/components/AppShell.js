'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useStore } from '../lib/store'
import { getAllMemoryData } from '../lib/crypto'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MemberFilter from './MemberFilter'
import MigrationHelper from './MigrationHelper'
import Dashboard from '../dashboard'
import Investments from '../investments'
import Gold from '../gold'
import Loans from '../loans'
import Insurance from '../insurance'
import RealEstate from '../realestate'
import Artha from '../artha'
import Goals from '../goals'
import UserManagement from './UserManagement'

export default function AppShell() {
  const { user, isLoaded, isSignedIn } = useUser()
  const { data } = useStore()
  const [activePage, setActivePage] = useState('dashboard')
  const [activeMember, setActiveMember] = useState('All')
  const [showMigration, setShowMigration] = useState(false)

  // Show migration helper once when Supabase is empty but _memoryStore has data
  useEffect(() => {
    if (!data) return
    const supabaseEmpty =
      (data.investments || []).length === 0 &&
      (data.gold || []).length === 0 &&
      (data.realEstate || []).length === 0 &&
      (data.loans || []).length === 0

    if (!supabaseEmpty) return // already have cloud data — no migration needed

    const memoryData = getAllMemoryData()
    const hasLocalData = Object.values(memoryData).some(v =>
      Array.isArray(v) && v.length > 0
    )

    if (hasLocalData) setShowMigration(true)
  }, [data])

  if (!isLoaded) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background-primary, #E8EAED)',
      }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #4A5260)' }}>Loading…</p>
      </div>
    )
  }

  if (!isSignedIn) return null

  const role = user?.publicMetadata?.role || 'member'
  const isAdmin = role === 'admin'
  const isReadOnly = role === 'viewer'

  const pageProps = { activeMember, isReadOnly }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--color-background-primary)',
      fontFamily: 'var(--font-sans)',
    }}>
      {showMigration && (
        <MigrationHelper onDone={() => setShowMigration(false)} />
      )}

      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <TopBar activeMember={activeMember} />
        <MemberFilter selected={activeMember} onChange={setActiveMember} />
        {isReadOnly && (
          <div style={{
            backgroundColor: '#FBF5E0',
            borderBottom: '0.5px solid #E0D0A0',
            padding: '6px 24px',
            fontSize: 12,
            color: '#854F0B',
            flexShrink: 0,
          }}>
            View only — contact the admin to make changes
          </div>
        )}

        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--color-background-primary)',
        }}>
          <div key={activePage} className="page-content">
            {activePage === 'dashboard'   && <Dashboard   {...pageProps} />}
            {activePage === 'investments' && <Investments {...pageProps} />}
            {activePage === 'gold'        && <Gold        {...pageProps} />}
            {activePage === 'realestate'  && <RealEstate  {...pageProps} />}
            {activePage === 'loans'       && <Loans       {...pageProps} />}
            {activePage === 'insurance'   && <Insurance   {...pageProps} />}
            {activePage === 'artha'       && <Artha       {...pageProps} />}
            {activePage === 'goals'       && <Goals       {...pageProps} />}
            {activePage === 'users'       && isAdmin && (
              <UserManagement onBack={() => setActivePage('dashboard')} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
