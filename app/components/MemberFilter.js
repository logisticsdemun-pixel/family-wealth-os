'use client'
import { memberColor } from '../lib/format'

const ALL_MEMBERS = ['Aseem Saxena', 'Poonam Saxena', 'Devashish Saxena', 'Shivansh Saxena']

export default function MemberFilter({ activeMember, onMemberChange }) {
  return (
    <div style={{
      backgroundColor: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '10px 24px',
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      {/* All Members pill */}
      <button
        onClick={() => onMemberChange('All')}
        style={{
          padding: '5px 14px',
          borderRadius: 20,
          border: '1.5px solid',
          borderColor: activeMember === 'All' ? 'var(--accent)' : 'var(--border)',
          backgroundColor: activeMember === 'All' ? 'var(--accent-faint)' : 'transparent',
          color: activeMember === 'All' ? 'var(--accent-text)' : 'var(--text-secondary)',
          fontSize: '0.82rem',
          fontWeight: activeMember === 'All' ? 600 : 400,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        All Members
      </button>

      {ALL_MEMBERS.map(member => {
        const isActive = activeMember === member
        const color = memberColor(member)
        const firstName = member.split(' ')[0]
        return (
          <button
            key={member}
            onClick={() => onMemberChange(member)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              border: '1.5px solid',
              borderColor: isActive ? color : 'var(--border)',
              backgroundColor: isActive ? `${color}18` : 'transparent',
              color: isActive ? color : 'var(--text-secondary)',
              fontSize: '0.82rem',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {/* Avatar dot */}
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: color,
              display: 'inline-block',
              flexShrink: 0,
            }} />
            {firstName}
          </button>
        )
      })}
    </div>
  )
}
