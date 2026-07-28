'use client'

export default function Drawer({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.38)', zIndex: 400 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
        background: 'var(--color-background-primary)',
        borderLeft: '0.5px solid var(--color-border-secondary)',
        zIndex: 401, display: 'flex', flexDirection: 'column',
        boxShadow: '-6px 0 28px rgba(0,0,0,0.16)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '0.5px solid var(--color-border-secondary)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.2px' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {children}
        </div>
      </div>
    </>
  )
}
