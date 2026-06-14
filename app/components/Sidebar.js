'use client'
import { useInvestments, useFixedIncome, useGold, useGoldPrices,
         useLoans, useRealEstate, useCashAssets, useLiabilities } from '../lib/store'
import { computeOutstanding } from '../lib/format'

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Net Worth',   icon: 'ti-chart-donut',    key: 'netWorth' },
  { id: 'investments', label: 'Investments', icon: 'ti-briefcase',       key: 'investments' },
  { id: 'realestate',  label: 'Real Estate', icon: 'ti-building-estate', key: 'realEstate' },
  { id: 'gold',        label: 'Gold',        icon: 'ti-currency-dollar', key: 'gold' },
  { id: 'loans',       label: 'Loans',       icon: 'ti-credit-card',     key: 'liabilities', isDebt: true },
  { id: 'insurance',   label: 'Insurance',   icon: 'ti-shield' },
]

const BOTTOM_ITEMS = [
  { id: 'goals',       label: 'Goals',       icon: 'ti-target' },
  { id: 'artha',       label: 'ARTHA',       icon: 'ti-robot' },
  { id: 'beneficiary', label: 'Beneficiary', icon: 'ti-users' },
]

function formatShort(n) {
  if (!n && n !== 0) return ''
  const abs = Math.abs(n)
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`
  if (abs >= 100000)   return `₹${(n / 100000).toFixed(1)}L`
  if (abs >= 1000)     return `₹${(n / 1000).toFixed(0)}K`
  return `₹${Math.round(n)}`
}

export default function Sidebar({ activePage, onNavigate }) {
  const investments = useInvestments()
  const fixedIncome = useFixedIncome()
  const gold        = useGold()
  const goldPrices  = useGoldPrices()
  const loans       = useLoans()
  const realEstate  = useRealEstate()
  const cashAssets  = useCashAssets()
  const liabilities = useLiabilities()

  const invTotal  = investments.reduce((s, h) => s + (h.units || 0) * (h.currentPrice || h.buyPrice || 0), 0)
                  + fixedIncome.reduce((s, fd) => s + (fd.principal || fd.currentValue || fd.amount || 0), 0)
  const goldTotal = gold.reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || 0), 0)
  const reTotal   = realEstate.reduce((s, p) => s + (p.currentValue || 0) * ((p.ownershipPct || 100) / 100), 0)
  const cashTotal = cashAssets.reduce((s, a) => s + (a.balance || 0), 0)
  const debtTotal = loans.reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)
                  + liabilities.reduce((s, l) => s + (l.amount || 0), 0)

  const totals = {
    investments: invTotal,
    realEstate:  reTotal,
    gold:        goldTotal,
    liabilities: debtTotal,
    netWorth:    invTotal + goldTotal + reTotal + cashTotal - debtTotal,
  }

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
        gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          width: 22, height: 22,
          background: '#534AB7',
          borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <i className="ti ti-chart-pie" style={{ fontSize: 12, color: '#fff' }} aria-hidden="true" />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
          Family Wealth OS
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
                color: item.isDebt && debtTotal > 0 ? '#D85A30' : 'var(--color-text-secondary)',
              }}>
                {formatShort(totals[item.key])}
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
            background: '#EEEDFE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 500, color: '#534AB7', flexShrink: 0,
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
