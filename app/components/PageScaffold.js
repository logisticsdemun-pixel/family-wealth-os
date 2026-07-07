'use client'

export default function PageScaffold({
  title,
  context,     // descriptive string under the title
  subtitle,    // backward-compat alias for context
  backTo,      // { label: string, onClick: fn }
  actions,
  filterRight, // element shown right-aligned below the title bar
  stats,       // [{ label, value, sub?, valueColor?, onClick? }]
  children,
  maxWidth,
}) {
  const contextText = context ?? subtitle

  return (
    <div style={{
      maxWidth: maxWidth || 1100,
      margin: '0 auto',
      padding: '24px 28px',
      width: '100%',
      boxSizing: 'border-box',
    }}>

      {/* Back button */}
      {backTo && (
        <button
          onClick={backTo.onClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-secondary)', fontSize: 12,
            padding: '0 0 14px', fontFamily: 'var(--font-sans)',
            letterSpacing: 0,
          }}
        >
          ← {backTo.label}
        </button>
      )}

      {/* Title bar */}
      {(title || actions) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: (filterRight || stats) ? 16 : 20,
          flexWrap: 'wrap', gap: 10,
        }}>
          <div>
            <h2 style={{
              margin: contextText ? '0 0 3px' : 0,
              fontSize: '1.5rem', fontWeight: 700,
              color: 'var(--color-text-primary)', letterSpacing: '-0.3px',
            }}>
              {title}
            </h2>
            {contextText != null && (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {contextText}
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

      {/* filterRight strip */}
      {filterRight && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          {filterRight}
        </div>
      )}

      {/* Stat cards */}
      {stats && stats.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, 1fr)`,
          gap: 12,
          marginBottom: 20,
        }}>
          {stats.map((s, i) => (
            <div
              key={i}
              onClick={s.onClick}
              style={{
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-primary)',
                borderRadius: 10,
                padding: '16px 18px',
                cursor: s.onClick ? 'pointer' : 'default',
                transition: s.onClick ? 'opacity 0.15s' : undefined,
              }}
            >
              <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {s.label}
              </p>
              <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', color: s.valueColor || 'var(--color-text-primary)' }}>
                {s.value}
              </p>
              {s.sub && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {s.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {children}
    </div>
  )
}
