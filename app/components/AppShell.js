'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useStore } from '../lib/store'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MemberFilter from './MemberFilter'
import MigrationHelper from './MigrationHelper'
import CommandCentre from './CommandCentre'
import Holdings from './Holdings'
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
  const { data, dataSource, migrateToSupabase, hasSupabaseData } = useStore()
  const [activePage, setActivePage] = useState('command')
  const [activeMember, setActiveMember] = useState('All')
  const [showMigration, setShowMigration] = useState(false)
  const [floatMigrating, setFloatMigrating] = useState(false)
  const [floatDone, setFloatDone] = useState(false)

  // Show migration helper once when data was loaded from localStorage (Supabase empty)
  // and the in-memory data actually has content worth migrating
  useEffect(() => {
    if (dataSource !== 'localStorage' || !data) return
    const hasData =
      (data.investments || []).length > 0 ||
      (data.gold || []).length > 0 ||
      (data.realEstate || []).length > 0 ||
      (data.loans || []).length > 0 ||
      (data.fixedIncome || []).length > 0
    if (hasData) setShowMigration(true)
  }, [dataSource, data])

  // Run SIP allotment check once on mount for admin users
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const role = user?.publicMetadata?.role || 'member'
    if (role !== 'admin') return
    fetch('/api/cron/sip-allotment', { method: 'POST' })
      .then(r => r.json())
      .then(result => {
        if (result.processed > 0) {
          console.log(`[SIP] Auto-allotted ${result.processed} SIP(s) for ${result.date}`)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

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

      {/* Floating migrate button — visible on all pages when Supabase has no data */}
      {!hasSupabaseData && !floatDone && (
        <div
          onClick={async () => {
            if (floatMigrating) return
            setFloatMigrating(true)
            const results = await migrateToSupabase()
            setFloatMigrating(false)
            const succeeded = Object.values(results || {}).filter(v => String(v).startsWith('✓')).length
            alert(`Migration complete! ${succeeded} collections uploaded to cloud. The page will reload.`)
            setFloatDone(true)
            window.location.reload()
          }}
          style={{
            position: 'fixed', bottom: 80, right: 24, zIndex: 9999,
            background: floatMigrating ? '#7B73C8' : '#534AB7',
            color: '#fff', borderRadius: 12,
            padding: '12px 20px',
            boxShadow: '0 4px 20px rgba(83,74,183,0.4)',
            cursor: floatMigrating ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 8,
            userSelect: 'none',
          }}
        >
          <i className={`ti ${floatMigrating ? 'ti-loader-2' : 'ti-cloud-upload'}`} style={{ fontSize: 16 }} />
          {floatMigrating ? 'Migrating…' : '☁ Migrate data to cloud'}
        </div>
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
            {activePage === 'command'     && <CommandCentre {...pageProps} />}
            {activePage === 'holdings'    && <Holdings      {...pageProps} />}
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
