'use client'
import { formatINR } from '../lib/format'
import PageLayout from './PageLayout'
import { WaterfallChart } from './charts'

const MEMBER_AVATARS = {
  'Aseem Saxena':     { initials: 'AS', bg: '#E6F1FB', color: '#185FA5' },
  'Poonam Saxena':    { initials: 'PS', bg: '#FAEEDA', color: '#854F0B' },
  'Devashish Saxena': { initials: 'DS', bg: '#EAF3DE', color: '#3B6D11' },
  'Shivansh Saxena':  { initials: 'SS', bg: '#FBEAF0', color: '#993556' },
}

const MEMBER_BAR_COLORS = ['var(--color-accent)', 'var(--color-warning)', 'var(--color-positive)', 'var(--color-info)']

const MEMBERS = ['Aseem Saxena', 'Poonam Saxena', 'Devashish Saxena', 'Shivansh Saxena']

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PeriodSummary({ periodData, periodLabel, onBack, onSelectMember }) {
  const change    = periodData?.change    ?? 0
  const changePct = periodData?.changePct ?? 0
  const isPos     = change >= 0

  return (
    <PageLayout maxWidth={700}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8,
            padding: '6px 12px', cursor: 'pointer', fontSize: 13,
            color: 'var(--color-text-secondary)', fontFamily: 'inherit',
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {periodLabel}
        </h2>
      </div>

      {periodData ? (
        <>
          {/* Hero */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
              Net worth change
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.6px', color: isPos ? '#2D6A4F' : '#D85A30' }}>
                {isPos ? '+' : ''}{formatINR(change)}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                background: isPos ? '#EAF3DE' : '#FCEBEB',
                color: isPos ? '#3B6D11' : '#A32D2D',
              }}>
                {isPos ? '+' : ''}{changePct.toFixed(2)}%
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
              {formatINR(periodData.fromNW)} on {fmtDate(periodData.fromDate)}
              {' → '}
              {formatINR(periodData.toNW)} on {fmtDate(periodData.toDate)}
            </p>
          </div>

          {/* Waterfall: member contributions */}
          {periodData.byMember && MEMBERS.some(n => periodData.byMember?.[n]?.change != null) && (
            <div style={{ marginBottom: 20 }}>
              <WaterfallChart
                items={MEMBERS.map((name, i) => ({
                  label: name.split(' ')[0],
                  value: periodData.byMember?.[name]?.change ?? 0,
                  color: MEMBER_BAR_COLORS[i % MEMBER_BAR_COLORS.length],
                }))}
                total={periodData.change}
                onBarClick={(bar) => {
                  const name = MEMBERS.find(n => n.split(' ')[0] === bar.label)
                  if (name) onSelectMember(name)
                }}
              />
            </div>
          )}

          {/* Member cards */}
          <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            By member
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MEMBERS.map(name => {
              const av      = MEMBER_AVATARS[name]
              const mData   = periodData.byMember?.[name]
              const mChange = mData?.change    ?? 0
              const mPct    = mData?.changePct ?? 0
              const mPos    = mChange >= 0
              return (
                <button
                  key={name}
                  onClick={() => onSelectMember(name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#FFFFFF', border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 10, padding: '14px 18px', cursor: 'pointer',
                    textAlign: 'left', width: '100%', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: av.bg, color: av.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                    }}>
                      {av.initials}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {name.split(' ')[0]}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: mChange === 0 ? 'var(--color-text-secondary)' : mPos ? '#2D6A4F' : '#D85A30' }}>
                      {mChange === 0 ? '—' : (mPos ? '+' : '') + formatINR(mChange)}
                    </p>
                    {mChange !== 0 && (
                      <p style={{ margin: 0, fontSize: 11, color: mPos ? '#2D6A4F' : '#D85A30' }}>
                        {mPct >= 0 ? '+' : ''}{mPct.toFixed(2)}%
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>No data available for this period.</p>
      )}

    </PageLayout>
  )
}
