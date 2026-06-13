'use client'
import { useRef, useState } from 'react'
import { exportAllData, applyImport, load, KEYS } from '../lib/storage'
import { changePassword } from '../lib/crypto'
import ExcelImportWizard from './ExcelImport'
import ZerodhaImportWizard from './ZerodhaImport'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'investments', label: 'Investments' },
  { id: 'gold', label: 'Gold' },
  { id: 'loans', label: 'Loans' },
  { id: 'realestate', label: 'Real Estate' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'artha', label: 'ARTHA' },
]

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}

const BACKUP_SCHEMA = [
  { key: KEYS.INVESTMENTS, label: 'Investments' },
  { key: KEYS.FIXED_INCOME, label: 'Fixed Income' },
  { key: KEYS.GOLD, label: 'Gold' },
  { key: KEYS.LOANS, label: 'Loans' },
  { key: KEYS.REAL_ESTATE, label: 'Real Estate' },
  { key: KEYS.INSURANCE, label: 'Insurance' },
  { key: KEYS.CASH_ASSETS, label: 'Cash & Assets' },
  { key: KEYS.LIABILITIES, label: 'Liabilities' },
  { key: KEYS.SNAPSHOTS, label: 'History' },
]

function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'Invalid backup file — expected a JSON object.'
  }
  const found = BACKUP_SCHEMA.filter(s => s.key in data)
  if (found.length < 2) {
    return 'This does not appear to be a Grey Diary backup. No recognised data sections found.'
  }
  for (const { key, label } of found) {
    const v = data[key]
    if (v !== null && v !== undefined && !Array.isArray(v) && typeof v !== 'object') {
      return `Invalid data for "${label}": unexpected format.`
    }
  }
  return null
}

function buildDiff(backup) {
  return BACKUP_SCHEMA.map(({ key, label }) => {
    if (!(key in backup) || !Array.isArray(backup[key])) return null
    const curr = load(key, [])
    const currCount = Array.isArray(curr) ? curr.length : 0
    const impCount = backup[key].length
    return { label, currCount, impCount, changed: currCount !== impCount }
  }).filter(Boolean)
}

function BackupRestoreDialog({ data, onClose }) {
  const [restoring, setRestoring] = useState(false)
  const diff = buildDiff(data)

  async function handleRestore() {
    setRestoring(true)
    await applyImport(data)
    window.location.reload()
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200 }}
        onClick={restoring ? undefined : onClose}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 201, width: 'calc(100% - 48px)', maxWidth: 460,
        backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '28px',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 600 }}>Restore from Backup</h3>
        <p style={{ margin: '0 0 18px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Review what will change. The page will reload after restore.
        </p>

        {diff.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Section', 'Current', '', 'Backup'].map((h, i) => (
                    <th key={i} style={{ padding: '7px 12px', textAlign: i === 0 ? 'left' : i === 2 ? 'center' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.72rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diff.map(({ label, currCount, impCount, changed }) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{label}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{currCount}</td>
                    <td style={{ padding: '9px 4px', textAlign: 'center', fontSize: '0.85rem', color: changed ? 'var(--amber)' : 'var(--border)' }}>→</td>
                    <td style={{
                      padding: '9px 12px', textAlign: 'right',
                      fontWeight: changed ? 700 : 400,
                      color: changed
                        ? impCount > currCount ? 'var(--gain)' : 'var(--loss)'
                        : 'var(--text-muted)',
                    }}>
                      {impCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ backgroundColor: 'var(--amber-faint)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', marginBottom: 20, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          ⚠ <strong style={{ color: 'var(--text-primary)' }}>Warning:</strong> This overwrites all current data and cannot be undone.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleRestore}
            disabled={restoring}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: restoring ? 'var(--text-muted)' : 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: restoring ? 'not-allowed' : 'pointer' }}
          >
            {restoring ? 'Restoring…' : 'Restore Now'}
          </button>
          <button
            onClick={onClose}
            disabled={restoring}
            style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: restoring ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
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
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200 }}
        onClick={onClose}
      />
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
  const [showExcelImport, setShowExcelImport] = useState(false)
  const [showZerodhaImport, setShowZerodhaImport] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importData, setImportData] = useState(null)
  const fileRef = useRef(null)

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        const err = validateBackup(data)
        if (err) { setImportError(err); return }
        setImportData(data)
        setImportError(null)
      } catch {
        setImportError('Could not parse file. Please select a valid .json backup.')
      }
    }
    reader.readAsText(file)
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
            <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>G</div>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Grey Diary</span>
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
                    padding: 8, minWidth: 220, zIndex: 100,
                  }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Backup & Restore</p>

                    <button
                      onClick={() => { exportAllData(); setShowMenu(false) }}
                      style={{ ...menuBtnStyle, color: 'var(--accent)', fontWeight: 500 }}
                    >
                      ↓ Export Backup
                    </button>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>
                      Download encrypted data as JSON
                    </p>

                    <button
                      onClick={() => { fileRef.current?.click(); setShowMenu(false) }}
                      style={menuBtnStyle}
                    >
                      ↑ Restore from Backup
                    </button>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>
                      Import a previously exported file
                    </p>
                    <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />

                    <button
                      onClick={() => { setShowExcelImport(true); setShowMenu(false) }}
                      style={menuBtnStyle}
                    >
                      📊 Import from Excel
                    </button>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>
                      Wizard for .xlsx files (with diff preview)
                    </p>

                    <button
                      onClick={() => { setShowZerodhaImport(true); setShowMenu(false) }}
                      style={menuBtnStyle}
                    >
                      📈 Import from Zerodha
                    </button>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>
                      Zerodha Kite holdings .xlsx (with diff preview)
                    </p>

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
      {importData && <BackupRestoreDialog data={importData} onClose={() => setImportData(null)} />}
      {showExcelImport && <ExcelImportWizard onClose={() => setShowExcelImport(false)} />}
      {showZerodhaImport && <ZerodhaImportWizard onClose={() => setShowZerodhaImport(false)} />}
    </>
  )
}

const menuBtnStyle = {
  display: 'block', width: '100%', padding: '8px 12px', borderRadius: 6,
  border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)',
  fontSize: '0.875rem', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
}
