'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import PageLayout from './PageLayout'

const ROLE_COLORS = {
  admin:  { bg: '#EAF3DE', color: '#3B6D11' },
  member: { bg: '#EEEDFE', color: '#534AB7' },
  viewer: { bg: '#F4F5F6', color: '#4A5260' },
  none:   { bg: '#FAEEDA', color: '#854F0B' },
}

export default function UserManagement({ onBack }) {
  const { user } = useUser()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isFirstTime, setIsFirstTime] = useState(false)

  const role = user?.publicMetadata?.role
  const isAdmin = role === 'admin'

  useEffect(() => {
    if (isAdmin) {
      fetchUsers()
    } else {
      setIsFirstTime(!role)
      setLoading(false)
    }
  }, [isAdmin, role])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users/list')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.users || [])
    } catch (e) {
      setError('Could not load users')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetupAdmin() {
    try {
      const res = await fetch('/api/setup', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        window.location.reload()
      } else {
        setError(data.error)
      }
    } catch {
      setError('Setup failed')
    }
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await fetch('/api/users/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })
      const data = await res.json()
      if (data.success) {
        fetchUsers()
      } else {
        setError(data.error)
      }
    } catch {
      setError('Role change failed')
    }
  }

  return (
    <PageLayout>
      <button onClick={onBack} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 12, color: 'var(--color-text-secondary)',
        padding: '0 0 20px',
      }}>
        <span style={{ fontSize: 16 }}>←</span>
        Back
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)',
            letterSpacing: '-0.4px', margin: '0 0 4px',
          }}>
            User Management
          </h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
            Manage who has access to Grey Diary
          </p>
        </div>
      </div>

      {/* First time setup */}
      {isFirstTime && (
        <div style={{
          background: '#FAEEDA', border: '0.5px solid #F0C090',
          borderRadius: 10, padding: '20px 24px', marginBottom: 20,
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#854F0B', margin: '0 0 8px' }}>
            First time setup
          </p>
          <p style={{ fontSize: 13, color: '#854F0B', margin: '0 0 16px', lineHeight: 1.5 }}>
            No admin has been set up yet. Click below to make yourself the admin of Grey Diary.
          </p>
          <button
            onClick={handleSetupAdmin}
            style={{
              padding: '8px 20px', borderRadius: 8, background: '#854F0B',
              color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Make me Admin
          </button>
        </div>
      )}

      {error && (
        <div style={{
          background: '#FCEBEB', border: '0.5px solid #F09595',
          borderRadius: 8, padding: '10px 14px',
          fontSize: 12, color: '#A32D2D', marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {loading && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Loading users…</p>
      )}

      {/* User list — admin only */}
      {isAdmin && !loading && (
        <div style={{
          background: '#FFFFFF', borderRadius: 10,
          border: '0.5px solid var(--color-border-tertiary)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 20px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {users.length} user{users.length !== 1 ? 's' : ''}
            </span>
            <a
              href="https://dashboard.clerk.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'var(--color-accent)', textDecoration: 'none' }}
            >
              Invite users in Clerk →
            </a>
          </div>

          {users.map((u, i) => {
            const userRole = u.publicMetadata?.role || 'none'
            const roleStyle = ROLE_COLORS[userRole] || ROLE_COLORS.none
            const isSelf = u.id === user?.id

            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', padding: '14px 20px',
                borderBottom: i < users.length - 1
                  ? '0.5px solid var(--color-border-tertiary)' : 'none',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--color-background-secondary)',
                  overflow: 'hidden', flexShrink: 0, marginRight: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)',
                }}>
                  {u.imageUrl
                    ? <img src={u.imageUrl} alt={u.firstName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (u.firstName?.[0] || '?')}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 2px' }}>
                    {u.firstName} {u.lastName}
                    {isSelf && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 400, marginLeft: 6 }}>
                        (you)
                      </span>
                    )}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
                    {u.emailAddresses?.[0]?.emailAddress || 'No email'}
                  </p>
                </div>

                {/* Role badge + selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 500,
                    background: roleStyle.bg, color: roleStyle.color,
                  }}>
                    {userRole === 'none' ? 'No role' : userRole}
                  </span>

                  {!isSelf && (
                    <select
                      value={userRole === 'none' ? '' : userRole}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                      style={{
                        fontSize: 12, padding: '4px 8px', borderRadius: 6,
                        border: '0.5px solid var(--color-border-tertiary)',
                        background: 'var(--color-background-secondary)',
                        color: 'var(--color-text-primary)', cursor: 'pointer',
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Non-admin, non-first-time view */}
      {!isAdmin && !isFirstTime && !loading && (
        <div style={{
          background: '#FFFFFF', borderRadius: 10,
          border: '0.5px solid var(--color-border-tertiary)',
          padding: '24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 6px' }}>
            Your account
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            {user?.firstName} {user?.lastName}
          </p>
          <span style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 12, fontWeight: 500,
            background: ROLE_COLORS[role]?.bg || '#F4F5F6',
            color: ROLE_COLORS[role]?.color || '#4A5260',
          }}>
            {role || 'No role assigned'}
          </span>
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '12px 0 0' }}>
            Contact the admin to change your access level
          </p>
        </div>
      )}
    </PageLayout>
  )
}
