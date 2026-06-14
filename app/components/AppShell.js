'use client'
import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import MemberFilter from './MemberFilter'
import Dashboard from '../dashboard'
import Investments from '../investments'
import Gold from '../gold'
import Loans from '../loans'
import Insurance from '../insurance'
import RealEstate from '../realestate'
import Artha from '../artha'

export default function AppShell() {
  const [activePage, setActivePage] = useState('dashboard')
  const [activeMember, setActiveMember] = useState('All')

  const pageProps = { activeMember }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--color-background-primary)',
      fontFamily: 'var(--font-sans)',
    }}>
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

        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--color-background-primary)',
        }}>
          {activePage === 'dashboard'   && <Dashboard   {...pageProps} />}
          {activePage === 'investments' && <Investments {...pageProps} />}
          {activePage === 'gold'        && <Gold        {...pageProps} />}
          {activePage === 'realestate'  && <RealEstate  {...pageProps} />}
          {activePage === 'loans'       && <Loans       {...pageProps} />}
          {activePage === 'insurance'   && <Insurance   {...pageProps} />}
          {activePage === 'artha'       && <Artha       {...pageProps} />}
        </div>
      </div>
    </div>
  )
}
