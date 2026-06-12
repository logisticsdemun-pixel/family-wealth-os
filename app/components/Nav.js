'use client'
import { useRef, useState } from 'react'
import { exportAllData, importAllData } from '../lib/storage'
import { changePassword } from '../lib/crypto'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'investments', label: 'Investments' },
  { id: 'gold', label: 'Gold' },
  { id: 'loans', label: 'Loans' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'artha', label: 'ARTHA' },
]

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}

function ChangePasswordDialog({ onClose }) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPw.length < 6) { setError('New password must be at least 6 characters.'); return }
    if (newPw !== confirmPw) { setError('New passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      await changePassword(oldPw, newPw)
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err.message === 'WRONG_PASSWORD' ? 'Current password is incorrect.' : 'Failed to change password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const labelStyle = { fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', margin: '0 0 4px', display: 'block' }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200 }}
        onClick={onClose}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: '100%', maxWidth: 360,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '32px 28px',
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 600 }}>Change Password</h3>

        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--gain)', fontWeight: 500 }}>
            Password changed successfully.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div>
              <span style={labelStyle}>Current Password</span>
              <input type="password" value={oldPw} onChange={e => { setOldPw(e.target.value); setError('') }} autoFocus disabled={loading} style={inp} />
            </div>
            <div>
              <span style={labelStyle}>New Password</span>
              <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setError('') }} disabled={loading} style={inp} />
            </div>
            <div>
              <span style={labelStyle}>Confirm New Password</span>
              <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError('') }} disabled={loading} style={inp} />
            </div>
            {error && <p style={{ color: 'var(--loss)', fontSize: '0.8rem', margin: '-4px 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="submit"
                disabled={loading}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: loading ? 'var(--text-muted)' : 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Saving…' : 'Change Password'}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}

export default function Nav({ activeTab, onTabChange, theme, onThemeToggle, onLock }) {
  const [showMenu, setShowMenu] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)
  const [importError, setImportError] = useState(null)
  const fileRef = useRef(null)

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    importAllData(file, null, msg => setImportError(msg))
    e.target.value = ''
  }

  const iconBtn = {
    width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
  }

  return (
    <>
      <nav style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 24px', height: 56, gap: 8 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>W</div>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Family Wealth OS</span>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, overflowX: 'auto', flex: 1, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap',
                  backgroundColor: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Theme toggle */}
            <button onClick={onThemeToggle} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} style={iconBtn}>
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {/* Lock button */}
            <button onClick={onLock} title="Lock app" style={iconBtn}>
              🔒
            </button>

            {/* Backup/Settings menu */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowMenu(v => !v)} title="Settings" style={iconBtn}>⋯</button>

              {showMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowMenu(false)} />
                  <div style={{
                    position: 'absolute', top: 44, right: 0,
                    backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    padding: 8, minWidth: 190, zIndex: 100,
                  }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data</p>
                    <button onClick={() => { exportAllData(); setShowMenu(false) }} style={menuBtnStyle}>↓ Export Backup</button>
                    <button onClick={() => { fileRef.current?.click(); setShowMenu(false) }} style={menuBtnStyle}>↑ Import Backup</button>
                    <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />

                    <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '6px 0' }} />

                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account</p>
                    <button onClick={() => { setShowChangePw(true); setShowMenu(false) }} style={menuBtnStyle}>🔑 Change Password</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {importError && (
          <div style={{ backgroundColor: 'var(--loss-faint)', borderTop: '1px solid var(--border)', padding: '8px 24px', fontSize: '0.8rem', color: 'var(--loss)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{importError}</span>
            <button onClick={() => setImportError(null)} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer' }}>✕</button>
          </div>
        )}
      </nav>

      {showChangePw && <ChangePasswordDialog onClose={() => setShowChangePw(false)} />}
    </>
  )
}

const menuBtnStyle = {
  display: 'block', width: '100%', padding: '8px 12px', borderRadius: 6,
  border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)',
  fontSize: '0.875rem', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
}
