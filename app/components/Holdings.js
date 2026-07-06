'use client'
// Placeholder — full implementation in Phase 7

export default function Holdings({ activeMember, isReadOnly }) {
  return (
    <div style={{
      padding: '48px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      color: 'var(--color-text-secondary)',
    }}>
      <i className="ti ti-table" style={{ fontSize: 40, color: 'var(--color-text-muted)' }} aria-hidden="true" />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
        Holdings Ledger
      </p>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
        Coming in Phase 7
      </p>
    </div>
  )
}
