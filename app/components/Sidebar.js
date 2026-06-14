'use client'

const TABS = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'investments', label: 'Investments' },
  { id: 'gold',        label: 'Gold' },
  { id: 'loans',       label: 'Loans' },
  { id: 'realestate',  label: 'Real Estate' },
  { id: 'insurance',   label: 'Insurance' },
  { id: 'artha',       label: 'ARTHA' },
]

export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0, width: 220,
      backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{
        padding: '18px 20px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          backgroundColor: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 700,
        }}>G</div>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Grey Diary</span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'block', width: '100%',
              padding: '9px 14px', marginBottom: 2,
              borderRadius: 8, border: 'none', textAlign: 'left',
              backgroundColor: activeTab === tab.id ? 'var(--accent-faint)' : 'transparent',
              color: activeTab === tab.id ? 'var(--accent-text)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: '0.875rem', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
