'use client'

const MEMBERS = [
  { id: 'All',              label: 'All' },
  { id: 'Aseem Saxena',     label: 'Aseem' },
  { id: 'Poonam Saxena',    label: 'Poonam' },
  { id: 'Devashish Saxena', label: 'Devashish' },
  { id: 'Shivansh Saxena',  label: 'Shivansh' },
]

export default function MemberFilter({ selected, onChange }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 24px',
      borderBottom: '0.5px solid var(--color-border-tertiary)',
      flexShrink: 0,
      background: 'var(--color-background-primary)',
    }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 4 }}>View</span>
      {MEMBERS.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          style={{
            padding: '4px 12px',
            borderRadius: 20,
            border: '0.5px solid',
            borderColor: selected === m.id ? '#534AB7' : 'var(--color-border-tertiary)',
            background: selected === m.id ? '#534AB7' : 'transparent',
            color: selected === m.id ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
