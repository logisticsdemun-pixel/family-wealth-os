'use client'
import { useTheme } from '../lib/theme'
import { THEMES } from '../lib/themes'

export default function AppearancePanel({ onClose }) {
  const { themeId, dark, setTheme, toggleDark } = useTheme()

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      <div style={{
        position: 'absolute', top: 38, right: 0,
        backgroundColor: 'var(--color-background-secondary)',
        border: '1px solid var(--color-border-tertiary)',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        padding: 16, width: 292, zIndex: 100,
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Appearance</p>

        {/* Theme previews */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {Object.entries(THEMES).map(([id, theme]) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              style={{
                display: 'flex', flexDirection: 'column',
                padding: 0, borderRadius: 10, overflow: 'hidden',
                border: themeId === id
                  ? `2px solid ${theme.vars['--color-accent']}`
                  : '1.5px solid var(--color-border-tertiary)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                background: 'none',
              }}
            >
              {/* Mini app preview */}
              <div style={{ display: 'flex', height: 72 }}>
                {/* Sidebar */}
                <div style={{
                  width: 62,
                  background: theme.vars['--color-sidebar-bg'],
                  borderRight: `0.5px solid ${theme.vars['--color-border-secondary']}`,
                  padding: '10px 8px',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 8, fontWeight: 600, color: theme.vars['--color-sidebar-text'], marginBottom: 8 }}>GD</div>
                  {['Net Worth', 'Gold', 'Invest'].map((item, i) => (
                    <div key={item} style={{
                      fontSize: 7.5, padding: '3px 5px', borderRadius: 4, marginBottom: 2,
                      background: i === 0 ? theme.vars['--color-sidebar-active'] : 'transparent',
                      color: i === 0 ? theme.vars['--color-sidebar-text'] : theme.vars['--color-sidebar-muted'],
                    }}>{item}</div>
                  ))}
                </div>
                {/* Content */}
                <div style={{ flex: 1, background: theme.vars['--color-background-primary'], padding: '10px 12px' }}>
                  <div style={{ fontSize: 8, color: theme.vars['--color-text-secondary'], marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Worth</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.vars['--color-text-primary'], marginBottom: 7 }}>₹82.8L</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
                    {[
                      { label: 'Gold', color: theme.vars['--color-accent'] },
                      { label: 'Inv',  color: theme.vars['--color-text-primary'] },
                      { label: 'Gain', color: '#2D6A4F' },
                    ].map(c => (
                      <div key={c.label} style={{
                        background: theme.vars['--color-background-secondary'],
                        borderRadius: 4, padding: '4px 5px',
                        border: `0.5px solid ${theme.vars['--color-border-tertiary']}`,
                      }}>
                        <div style={{ fontSize: 6.5, color: theme.vars['--color-text-secondary'], marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: c.color }}>₹37L</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Label bar */}
              <div style={{
                padding: '5px 10px',
                background: theme.vars['--color-background-secondary'],
                borderTop: `0.5px solid ${theme.vars['--color-border-tertiary']}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, fontWeight: themeId === id ? 600 : 400, color: theme.vars['--color-text-primary'] }}>
                  {theme.name}
                </span>
                {themeId === id && (
                  <i className="ti ti-check" style={{ fontSize: 13, color: theme.vars['--color-accent'] }} aria-hidden="true" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Dark mode toggle */}
        <div style={{ height: '0.5px', backgroundColor: 'var(--color-border-tertiary)', marginBottom: 10 }} />
        <button
          onClick={toggleDark}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--color-border-tertiary)',
            backgroundColor: 'transparent', cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i
              className={`ti ${dark ? 'ti-moon' : 'ti-sun'}`}
              style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}
              aria-hidden="true"
            />
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
              {dark ? 'Dark mode' : 'Light mode'}
            </span>
          </span>
          <span style={{
            width: 32, height: 18, borderRadius: 9, position: 'relative', display: 'inline-block',
            backgroundColor: dark ? 'var(--color-accent)' : 'var(--color-border-secondary)',
            flexShrink: 0, transition: 'background-color 0.2s',
          }}>
            <span style={{
              position: 'absolute', top: 3, left: dark ? 15 : 3,
              width: 12, height: 12, borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.15s',
            }} />
          </span>
        </button>
      </div>
    </>
  )
}
