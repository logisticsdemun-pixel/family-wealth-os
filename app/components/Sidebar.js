'use client'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { computeAllMetrics, formatShort } from '../lib/metrics'

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Net Worth',   icon: 'ti-chart-donut',    key: 'netWorth' },
  { id: 'investments', label: 'Investments', icon: 'ti-briefcase',       key: 'investments' },
  { id: 'realestate',  label: 'Real Estate', icon: 'ti-building-estate', key: 'realEstate' },
  { id: 'gold',        label: 'Gold',        icon: 'ti-coins',           key: 'gold' },
  { id: 'loans',       label: 'Loans',       icon: 'ti-credit-card',     key: 'liabilities', isDebt: true },
  { id: 'insurance',   label: 'Insurance',   icon: 'ti-shield' },
]

const BOTTOM_ITEMS = [
  { id: 'goals',       label: 'Goals',       icon: 'ti-target' },
  { id: 'artha',       label: 'ARTHA',       icon: 'ti-robot' },
  { id: 'beneficiary', label: 'Beneficiary', icon: 'ti-users' },
]

export default function Sidebar({ activePage, onNavigate }) {
  const { data } = useStore()
  const metrics = useMemo(() => computeAllMetrics(data), [data])

  const itemStyle = (id) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 'var(--border-radius-md)',
    cursor: 'pointer',
    marginBottom: 2,
    background: activePage === id ? 'var(--color-background-secondary)' : 'transparent',
  })

  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      borderRight: '0.5px solid var(--color-border-tertiary)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--color-background-primary)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '16px 18px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
          Grey Diary
        </span>
      </div>

      {/* Main nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {NAV_ITEMS.map(item => (
          <div key={item.id} style={itemStyle(item.id)} onClick={() => onNavigate(item.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <i
                className={`ti ${item.icon}`}
                style={{
                  fontSize: 15,
                  color: activePage === item.id
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                }}
                aria-hidden="true"
              />
              <span style={{
                fontSize: 13,
                fontWeight: activePage === item.id ? 500 : 400,
                color: activePage === item.id
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
              }}>
                {item.label}
              </span>
            </div>
            {item.key && (
              <span style={{
                fontSize: 11,
                color: item.isDebt && metrics.liabilities > 0 ? '#D85A30' : 'var(--color-text-secondary)',
              }}>
                {formatShort(metrics[item.key])}
              </span>
            )}
          </div>
        ))}

        <div style={{ height: '0.5px', background: 'var(--color-border-tertiary)', margin: '8px 2px' }} />

        {BOTTOM_ITEMS.map(item => (
          <div key={item.id} style={itemStyle(item.id)} onClick={() => onNavigate(item.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <i
                className={`ti ${item.icon}`}
                style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}
                aria-hidden="true"
              />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {item.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Family selector */}
      <div style={{
        padding: '10px 8px',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          borderRadius: 'var(--border-radius-md)',
          cursor: 'default',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--color-accent-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 500, color: 'var(--color-accent)', flexShrink: 0,
          }}>SS</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>Saxena Family</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>4 members</div>
          </div>
        </div>
      </div>
    </div>
  )
}
