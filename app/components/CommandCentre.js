'use client'
// Placeholder — full implementation in Phase 6

export default function CommandCentre({ activeMember, isReadOnly }) {
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
      <i className="ti ti-layout-dashboard" style={{ fontSize: 40, color: 'var(--color-text-muted)' }} aria-hidden="true" />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
        Command Centre
      </p>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
        Coming in Phase 6
      </p>
    </div>
  )
}
