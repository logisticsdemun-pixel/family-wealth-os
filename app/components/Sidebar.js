'use client'
import { useMemo, useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useStore } from '../lib/store'
import { computeAllMetrics, formatShort } from '../lib/metrics'

// ── Nav groups ────────────────────────────────────────────────────────────

const OVERVIEW = [
  { id: 'command',    label: 'Command Centre', icon: 'ti-layout-dashboard' },
  { id: 'holdings',   label: 'Holdings',       icon: 'ti-table' },
  { id: 'dashboard',  label: 'Net Worth',      icon: 'ti-chart-donut',       key: 'netWorth' },
]

const MANAGE = [
  { id: 'investments', label: 'Investments', icon: 'ti-briefcase',       key: 'investments' },
  { id: 'realestate',  label: 'Real Estate', icon: 'ti-building-estate', key: 'realEstate' },
  { id: 'gold',        label: 'Gold',        icon: 'ti-coins',           key: 'gold' },
  { id: 'loans',       label: 'Loans',       icon: 'ti-credit-card',     key: 'liabilities', isDebt: true },
  { id: 'insurance',   label: 'Insurance',   icon: 'ti-shield' },
]

const INTELLIGENCE = [
  { id: 'goals', label: 'Goals', icon: 'ti-target' },
  { id: 'artha', label: 'ARTHA', icon: 'ti-robot' },
]

// ── Sub-components ────────────────────────────────────────────────────────

function GroupLabel({ label }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: 'var(--color-sidebar-muted)',
      padding: '10px 10px 4px',
    }}>
      {label}
    </div>
  )
}

function NavItem({ item, active, metrics, onNavigate }) {
  const isActive = active === item.id

  return (
    <div
      onClick={() => onNavigate(item.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        marginBottom: 1,
        background: isActive ? 'var(--color-sidebar-active)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <i
          className={`ti ${item.icon}`}
          style={{
            fontSize: 15,
            flexShrink: 0,
            color: isActive ? 'var(--color-sidebar-text)' : 'var(--color-sidebar-muted)',
          }}
          aria-hidden="true"
        />
        <span style={{
          fontSize: 13,
          fontWeight: isActive ? 500 : 400,
          color: isActive ? 'var(--color-sidebar-text)' : 'var(--color-sidebar-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {item.label}
        </span>
      </div>

      {item.key && metrics && (
        <span style={{
          fontSize: 11,
          flexShrink: 0,
          marginLeft: 4,
          color: item.isDebt && (metrics.liabilities || 0) > 0
            ? 'var(--color-negative)'
            : 'var(--color-sidebar-muted)',
        }}>
          {formatShort(metrics[item.key])}
        </span>
      )}
    </div>
  )
}

function Divider() {
  return (
    <div style={{
      height: '0.5px',
      background: 'var(--color-border-tertiary)',
      margin: '6px 2px',
    }} />
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function Sidebar({ activePage, onNavigate }) {
  const { user } = useUser()
  const isAdmin = user?.publicMetadata?.role === 'admin'
  const { data } = useStore()
  const [memberCount, setMemberCount] = useState(4)

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/users/list')
      .then(r => r.json())
      .then(d => { if (d.users) setMemberCount(d.users.length) })
      .catch(() => {})
  }, [isAdmin])

  const metrics = useMemo(() => computeAllMetrics(data), [data])

  const itemProps = { active: activePage, metrics, onNavigate }

  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      borderRight: '0.5px solid var(--color-border-secondary)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--color-sidebar-bg)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '16px 18px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-sidebar-text)',
          letterSpacing: '-0.3px',
        }}>
          Grey Diary
        </span>
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 10px' }}>
        <GroupLabel label="Overview" />
        {OVERVIEW.map(item => <NavItem key={item.id} item={item} {...itemProps} />)}

        <Divider />

        <GroupLabel label="Manage" />
        {MANAGE.map(item => <NavItem key={item.id} item={item} {...itemProps} />)}

        <Divider />

        <GroupLabel label="Intelligence" />
        {INTELLIGENCE.map(item => <NavItem key={item.id} item={item} {...itemProps} />)}
      </div>

      {/* Family block — admin navigates to user management */}
      <div style={{
        padding: '8px',
        borderTop: '0.5px solid var(--color-border-secondary)',
        flexShrink: 0,
      }}>
        <div
          onClick={() => isAdmin && onNavigate('users')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 6,
            cursor: isAdmin ? 'pointer' : 'default',
            background: activePage === 'users' ? 'var(--color-sidebar-active)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--color-accent-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-accent)',
              flexShrink: 0,
            }}>SS</div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-sidebar-text)', margin: 0, whiteSpace: 'nowrap' }}>
                Saxena Family
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-sidebar-muted)', margin: 0 }}>
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {isAdmin && (
            <i
              className="ti ti-settings"
              style={{ fontSize: 14, color: 'var(--color-sidebar-muted)', flexShrink: 0 }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </div>
  )
}
