'use client'
import { useRef, useState } from 'react'
import { useUser, UserButton } from '@clerk/nextjs'
import { useStore } from '../lib/store'
import { exportAllData, applyImport, load, KEYS } from '../lib/storage'
import AppearancePanel from './AppearancePanel'
import { takeSnapshotFromStorage } from '../lib/snapshot'
import ExcelImportWizard from './ExcelImport'
import ZerodhaImportWizard from './ZerodhaImport'

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none', marginBottom: 10,
}

const menuBtnStyle = {
  display: 'block', width: '100%', padding: '8px 12px', borderRadius: 6,
  border: 'none', backgroundColor: 'transparent', color: 'var(--text-primary)',
  fontSize: '0.875rem', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
}

const BACKUP_SCHEMA = [
  { key: KEYS.INVESTMENTS,  label: 'Investments' },
  { key: KEYS.FIXED_INCOME, label: 'Fixed Income' },
  { key: KEYS.GOLD,         label: 'Gold' },
  { key: KEYS.LOANS,        label: 'Loans' },
  { key: KEYS.REAL_ESTATE,  label: 'Real Estate' },
  { key: KEYS.INSURANCE,    label: 'Insurance' },
  { key: KEYS.CASH_ASSETS,  label: 'Cash & Assets' },
  { key: KEYS.LIABILITIES,  label: 'Liabilities' },
  { key: KEYS.SNAPSHOTS,    label: 'History' },
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
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: changed ? 700 : 400, color: changed ? (impCount > currCount ? 'var(--gain)' : 'var(--loss)') : 'var(--text-muted)' }}>
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
          <button onClick={handleRestore} disabled={restoring} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', backgroundColor: restoring ? 'var(--text-muted)' : 'var(--accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 500, cursor: restoring ? 'not-allowed' : 'pointer' }}>
            {restoring ? 'Restoring…' : 'Restore Now'}
          </button>
          <button onClick={onClose} disabled={restoring} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: restoring ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function TopBar({ activeMember }) {
  const { user } = useUser()
  const { dirty, flush, migrateToSupabase, dataSource } = useStore()

  const [saved, setSaved] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showExcelImport, setShowExcelImport] = useState(false)
  const [showZerodhaImport, setShowZerodhaImport] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importData, setImportData] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migrateResults, setMigrateResults] = useState(null)
  const [syncToast, setSyncToast] = useState(null)
  const fileRef = useRef(null)

  const greetingName = user?.firstName
    || (activeMember !== 'All' ? activeMember.split(' ')[0] : 'there')

  async function handleSave() {
    setSaved(true)
    await flush()
    takeSnapshotFromStorage()
    setTimeout(() => setSaved(false), 3000)
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        const err = validateBackup(data)
        if (err) { setImportError(err); return }
        setImportData(data); setImportError(null)
      } catch {
        setImportError('Could not parse file. Please select a valid .json backup.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleMigrate() {
    setMigrating(true)
    setMigrateResults(null)
    const results = await migrateToSupabase()
    setMigrating(false)
    setMigrateResults(results)
    const succeeded = Object.values(results || {}).filter(v => String(v).startsWith('✓')).length
    const failed = Object.values(results || {}).filter(v => String(v).startsWith('✗')).length
    setSyncToast({ succeeded, failed })
    setShowMenu(false)
    setTimeout(() => setSyncToast(null), 5000)
  }

  const iconBtn = {
    width: 32, height: 32, borderRadius: 7,
    border: 'none', background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52,
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        flexShrink: 0,
        background: 'var(--color-background-primary)',
      }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.2px' }}>
          {getGreeting()}, {greetingName} 👋
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Save & update — visible when dirty */}
          {dirty && !saved && (
            <button onClick={handleSave} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 20,
              border: '0.5px solid var(--color-accent-subtle)', background: 'transparent',
              fontSize: 11, fontWeight: 500, color: 'var(--color-accent)', cursor: 'pointer',
              marginRight: 8,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF9F27', display: 'inline-block', flexShrink: 0 }} />
              Save & update
            </button>
          )}
          {saved && (
            <span style={{ fontSize: 11, color: '#1D9E75', fontWeight: 500, marginRight: 8 }}>
              ✓ Dashboard updated
            </span>
          )}

          {/* Appearance */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAppearance(v => !v)} title="Appearance" style={iconBtn}>
              <i className="ti ti-palette" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
            {showAppearance && <AppearancePanel onClose={() => setShowAppearance(false)} />}
          </div>

          {/* Export backup */}
          <button onClick={exportAllData} title="Export backup" style={iconBtn}>
            <i className="ti ti-download" style={{ fontSize: 16 }} aria-hidden="true" />
          </button>

          {/* Restore backup (JSON file) */}
          <button onClick={() => fileRef.current?.click()} title="Restore backup" style={iconBtn}>
            <i className="ti ti-upload" style={{ fontSize: 16 }} aria-hidden="true" />
          </button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />

          {/* Settings menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMenu(v => !v)}
              title="Import holdings"
              style={iconBtn}
            >
              <i className="ti ti-dots-vertical" style={{ fontSize: 16 }} aria-hidden="true" />
            </button>

            {showMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowMenu(false)} />
                <div style={{
                  position: 'absolute', top: 38, right: 0,
                  backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  padding: 8, minWidth: 220, zIndex: 100,
                }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Import Holdings</p>
                  <button onClick={() => { setShowExcelImport(true); setShowMenu(false) }} style={menuBtnStyle}>📊 Import from Excel</button>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>Wizard for .xlsx files</p>
                  <button onClick={() => { setShowZerodhaImport(true); setShowMenu(false) }} style={menuBtnStyle}>📈 Import from Zerodha</button>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>Zerodha Kite holdings .xlsx</p>

                  <hr style={{ margin: '6px 8px', border: 'none', borderTop: '1px solid var(--border)' }} />
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 8px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cloud Sync</p>
                  <button
                    onClick={handleMigrate}
                    disabled={migrating}
                    style={{
                      ...menuBtnStyle,
                      display: 'flex', alignItems: 'center', gap: 8,
                      backgroundColor: migrating ? '#7B73C8' : '#534AB7',
                      color: '#fff', borderRadius: 6,
                      cursor: migrating ? 'not-allowed' : 'pointer',
                      opacity: migrating ? 0.8 : 1,
                    }}
                  >
                    <i className={`ti ${migrating ? 'ti-loader-2' : 'ti-cloud-upload'}`} style={{ fontSize: 15 }} />
                    {migrating ? 'Syncing…' : 'Sync to Cloud'}
                  </button>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '-4px 8px 8px 12px' }}>Push all local data to Supabase</p>
                </div>
              </>
            )}
          </div>

          {/* Clerk UserButton — Google profile photo, sign out */}
          <div style={{ marginLeft: 4 }}>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: { width: 30, height: 30 },
                },
              }}
            />
          </div>
        </div>
      </div>

      {importError && (
        <div style={{ backgroundColor: 'var(--loss-faint)', borderBottom: '1px solid var(--border)', padding: '8px 24px', fontSize: '0.8rem', color: 'var(--loss)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} style={{ background: 'none', border: 'none', color: 'var(--loss)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {importData && <BackupRestoreDialog data={importData} onClose={() => setImportData(null)} />}
      {showExcelImport   && <ExcelImportWizard onClose={() => setShowExcelImport(false)} />}
      {showZerodhaImport && <ZerodhaImportWizard onClose={() => setShowZerodhaImport(false)} />}

      {syncToast && (
        <div style={{
          position: 'fixed', top: 64, right: 24, zIndex: 9999,
          background: syncToast.failed > 0 ? '#CC3333' : '#1D9E75',
          color: '#fff', borderRadius: 10, padding: '12px 18px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {syncToast.failed > 0
            ? `⚠ ${syncToast.succeeded} synced, ${syncToast.failed} failed — check console`
            : `✓ ${syncToast.succeeded} collections synced to cloud`
          }
        </div>
      )}
    </>
  )
}
