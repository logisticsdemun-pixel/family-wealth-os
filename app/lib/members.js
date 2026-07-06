// Member entity — canonical source for member identity.
// Existing records keep their legacy string `member` field; all new code
// resolves through resolveMember() instead of string-matching directly.

export const DEFAULT_MEMBERS = [
  {
    id: 'aseem',
    name: 'Aseem Saxena',
    role: 'member',
    color: '#6BA3D4',
    colorBg: '#1D3352',
    initials: 'AS',
    annualIncome: null,
    dependants: null,
    isEarner: true,
  },
  {
    id: 'poonam',
    name: 'Poonam Saxena',
    role: 'member',
    color: '#D4A85A',
    colorBg: '#3A2E1D',
    initials: 'PS',
    annualIncome: null,
    dependants: null,
    isEarner: false,
  },
  {
    id: 'devashish',
    name: 'Devashish Saxena',
    role: 'admin',
    color: '#5CAF7F',
    colorBg: '#1D3A2E',
    initials: 'DS',
    annualIncome: null,
    dependants: null,
    isEarner: true,
  },
  {
    id: 'shivansh',
    name: 'Shivansh Saxena',
    role: 'member',
    color: '#D45A8A',
    colorBg: '#3A1D2E',
    initials: 'SS',
    annualIncome: null,
    dependants: null,
    isEarner: false,
  },
]

/**
 * Returns the members array from the store, falling back to DEFAULT_MEMBERS.
 */
export function getMembers(data) {
  const stored = data?.members
  if (Array.isArray(stored) && stored.length > 0) return stored
  return DEFAULT_MEMBERS
}

/**
 * Resolves a legacy record's member string to a member object.
 * Matches by id, full name, or first name (case-insensitive).
 * Returns null when no match found.
 */
export function resolveMember(record, data) {
  const members = getMembers(data)
  const raw = String(
    record?.member ?? record?.memberId ?? record?.owner ?? ''
  ).trim().toLowerCase()
  if (!raw) return null

  return (
    members.find(m => m.id === raw) ??
    members.find(m => m.name.toLowerCase() === raw) ??
    members.find(m => m.name.split(' ')[0].toLowerCase() === raw.split(' ')[0]) ??
    null
  )
}

/**
 * Returns the display color for a member, looked up by id or name.
 * Falls back to a neutral grey.
 */
export function memberColor(idOrName, data) {
  const members = getMembers(data)
  const key = String(idOrName ?? '').toLowerCase()
  const m =
    members.find(m => m.id === key) ??
    members.find(m => m.name.toLowerCase() === key) ??
    members.find(m => m.name.split(' ')[0].toLowerCase() === key.split(' ')[0])
  return m?.color ?? '#8A9099'
}

/**
 * Returns the initials for a member, looked up by id or name.
 */
export function memberInitials(idOrName, data) {
  const members = getMembers(data)
  const key = String(idOrName ?? '').toLowerCase()
  const m =
    members.find(m => m.id === key) ??
    members.find(m => m.name.toLowerCase() === key) ??
    members.find(m => m.name.split(' ')[0].toLowerCase() === key.split(' ')[0])
  if (m) return m.initials
  // Fallback: derive from string
  const parts = String(idOrName ?? '').trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : String(idOrName ?? '').slice(0, 2).toUpperCase()
}
