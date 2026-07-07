'use client'

export default function PageScaffold({ title, subtitle, actions, children, maxWidth }) {
  return (
    <div style={{
      maxWidth: maxWidth || 1100,
      margin: '0 auto',
      padding: '24px 28px',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {(title || actions) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 10,
        }}>
          <div>
            <h2 style={{
              margin: subtitle ? '0 0 4px' : 0,
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.3px',
            }}>
              {title}
            </h2>
            {subtitle != null && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
