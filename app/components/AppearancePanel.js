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
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        padding: 16, width: 236, zIndex: 100,
      }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>Appearance</p>

        {/* Theme swatches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {Object.entries(THEMES).map(([id, theme]) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 8,
                border: themeId === id
                  ? `1.5px solid ${theme.vars['--color-accent']}`
                  : '1px solid var(--color-border-tertiary)',
                backgroundColor: theme.vars['--color-background-primary'],
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: `linear-gradient(135deg, ${theme.vars['--color-background-secondary']} 50%, ${theme.vars['--color-accent']} 50%)`,
                border: '1px solid rgba(0,0,0,0.08)',
              }} />
              <span style={{
                fontSize: 13, fontWeight: themeId === id ? 600 : 400,
                color: theme.vars['--color-text-primary'],
                flex: 1,
              }}>
                {theme.name}
              </span>
              {themeId === id && (
                <i className="ti ti-check" style={{ fontSize: 14, color: theme.vars['--color-accent'], flexShrink: 0 }} aria-hidden="true" />
              )}
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
            flexShrink: 0,
            transition: 'background-color 0.2s',
          }}>
            <span style={{
              position: 'absolute', top: 3, left: dark ? 15 : 3,
              width: 12, height: 12, borderRadius: '50%',
              backgroundColor: '#fff',
              transition: 'left 0.15s',
            }} />
          </span>
        </button>
      </div>
    </>
  )
}
