'use client'
import { formatINR } from '../lib/format'
import PageLayout from './PageLayout'

const MEMBER_AVATARS = {
  'Aseem Saxena':     { initials: 'AS', bg: '#E6F1FB', color: '#185FA5' },
  'Poonam Saxena':    { initials: 'PS', bg: '#FAEEDA', color: '#854F0B' },
  'Devashish Saxena': { initials: 'DS', bg: '#EAF3DE', color: '#3B6D11' },
  'Shivansh Saxena':  { initials: 'SS', bg: '#FBEAF0', color: '#993556' },
}

const CATEGORIES = [
  { key: 'investments', label: 'Investments' },
  { key: 'gold',        label: 'Gold' },
  { key: 'realEstate',  label: 'Real estate' },
  { key: 'cash',        label: 'Cash & FDs' },
  { key: 'liabilities', label: 'Liabilities' },
]

export default function MemberDetail({ memberName, periodData, periodLabel, onBack }) {
  const av      = MEMBER_AVATARS[memberName] || { initials: '?', bg: '#eee', color: '#333' }
  const mData   = periodData?.byMember?.[memberName]
  const current = mData?.current ?? 0

  return (
    <PageLayout maxWidth={600}>

      {/* Back to period summary */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8,
            padding: '6px 12px', cursor: 'pointer', fontSize: 13,
            color: 'var(--color-text-secondary)', fontFamily: 'inherit',
          }}
        >
          ← {periodLabel}
        </button>
      </div>

      {/* Member avatar + name + current net worth */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: av.bg, color: av.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 600, flexShrink: 0,
        }}>
          {av.initials}
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {memberName}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Net worth: {formatINR(current)}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {mData ? (
        <div style={{ background: '#FFFFFF', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, overflow: 'hidden' }}>
          {CATEGORIES.map((cat, i) => {
            const cData   = mData.byCategory?.[cat.key]
            const change  = cData?.change    ?? 0
            const pct     = cData?.changePct ?? 0
            const isPos   = change > 0
            const isNeg   = change < 0
            const isLiab  = cat.key === 'liabilities'
            const valColor = change === 0
              ? 'var(--color-text-secondary)'
              : isLiab
                ? (isPos ? '#D85A30' : '#2D6A4F')
                : (isPos ? '#2D6A4F' : '#D85A30')
            return (
              <div
                key={cat.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: i < CATEGORIES.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                }}
              >
                <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{cat.label}</span>
                <div style={{ textAlign: 'right' }}>
                  {change === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No change</span>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 1px', fontSize: 14, fontWeight: 500, letterSpacing: '-0.2px', color: valColor }}>
                        {isPos ? '+' : ''}{formatINR(change)}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: valColor }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                      </p>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No breakdown available for this period.</p>
      )}

    </PageLayout>
  )
}
