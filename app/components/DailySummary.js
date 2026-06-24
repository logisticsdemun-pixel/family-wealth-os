'use client'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import PageLayout from './PageLayout'

function formatINR(n) {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso) {
  if (!iso) return 'Unknown'
  return new Date(iso + 'T00:00:00').toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function getPeriodTitle(period) {
  switch (period) {
    case 'today': return "Today's Summary"
    case 'week':  return 'This Week'
    case 'month': return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    case 'year':  return String(new Date().getFullYear())
    default:      return 'Summary'
  }
}

const CAT_LABELS = {
  investments: 'Investments',
  gold: 'Gold',
  realEstate: 'Real Estate',
  cash: 'Cash & FDs',
}

export default function DailySummary({ memberFilter, onBack, period = 'today', periodData = null }) {
  const { data } = useStore()

  const snapshots = useMemo(() =>
    (data?.snapshots || []).sort((a, b) => new Date(a.date) - new Date(b.date)),
    [data?.snapshots]
  )

  const latest   = snapshots[snapshots.length - 1]
  const previous = snapshots[snapshots.length - 2]

  const allInvestments = data?.investments || []

  // Use periodData when provided; fall back to last-two-snapshots
  const displayChange    = periodData ? periodData.change    : (latest?.netWorth || 0) - (previous?.netWorth || 0)
  const displayChangePct = periodData ? periodData.changePct : (previous?.netWorth > 0 ? (displayChange / previous.netWorth) * 100 : 0)
  const displayFromNW    = periodData ? periodData.fromNW    : (previous?.netWorth || 0)
  const displayToNW      = periodData ? periodData.toNW      : (latest?.netWorth || 0)
  const displayFromDate  = periodData ? periodData.fromDate  : previous?.date

  const hasData = periodData !== null || (latest && previous)

  // Category breakdown — use periodData.byCategory if available, else snapshot byClass
  const categoryRows = useMemo(() => {
    if (periodData?.byCategory) {
      return Object.entries(periodData.byCategory).map(([cat, d]) => ({
        label: CAT_LABELS[cat] || cat,
        change: d.change,
        changePct: d.changePct,
        current: (latest?.byCategory?.[cat] || 0),
        previous: (previous?.byCategory?.[cat] || 0),
      }))
    }
    // Fallback: byClass (legacy — may be empty)
    const curByClass  = latest?.byClass  || {}
    const prevByClass = previous?.byClass || {}
    return [
      { label: 'Investments', cat: 'investments' },
      { label: 'Gold',        cat: 'gold' },
      { label: 'Real Estate', cat: 'realEstate' },
      { label: 'Cash & FDs',  cat: 'cash' },
    ].map(({ label, cat }) => {
      const cur  = curByClass[cat]  || 0
      const prev = prevByClass[cat] || 0
      return { label, change: cur - prev, changePct: prev > 0 ? ((cur - prev) / prev) * 100 : 0, current: cur, previous: prev }
    })
  }, [periodData, latest, previous])

  // Top movers (always vs cost basis — not period-specific)
  const topMovers = useMemo(() => {
    const filtered = allInvestments.filter(h => {
      if (memberFilter === 'All') return true
      return String(h.member || h.memberId || '').toLowerCase()
        .includes(memberFilter.toLowerCase().split(' ')[0])
    })
    return filtered
      .map(h => {
        const currentVal = (h.units || 0) * (h.currentPrice || h.buyPrice || 0)
        const costBasis  = (h.units || 0) * (h.buyPrice || 0)
        const gain = currentVal - costBasis
        const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0
        return {
          name: h.name,
          ticker: h.ticker,
          member: (h.member || h.memberId || '').split(' ')[0],
          units: h.units,
          currentVal, costBasis, gain, gainPct,
          hasPrice: !!h.currentPrice,
        }
      })
      .filter(h => h.hasPrice && Math.abs(h.gain) > 0)
      .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
      .slice(0, 5)
  }, [allInvestments, memberFilter])

  const unchangedCount = allInvestments.filter(h => !h.currentPrice || h.currentPrice === h.buyPrice).length

  return (
    <PageLayout>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--color-text-secondary)', padding: '0 0 20px',
        }}
      >
        <span style={{ fontSize: 16 }}>←</span>
        Back to dashboard
      </button>

      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--color-text-secondary)' }}>
          <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 8px' }}>
            No comparison data yet
          </p>
          <p style={{ fontSize: 13, margin: '0 0 20px' }}>
            Prices need to be refreshed on at least two separate days to start tracking changes.
          </p>
          <button onClick={onBack} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--color-accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>
            Back to dashboard
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.4px', margin: 0 }}>
                {getPeriodTitle(period)}
              </h1>
              <span style={{
                fontSize: 11, color: 'var(--color-text-secondary)',
                background: 'var(--color-background-secondary)',
                border: '0.5px solid var(--color-border-tertiary)',
                padding: '4px 12px', borderRadius: 20,
              }}>
                {memberFilter === 'All' ? 'All members' : memberFilter}
              </span>
            </div>
            {displayFromDate && (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
                Since {formatDate(displayFromDate)}
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.6px', color: displayChange >= 0 ? '#2D6A4F' : '#D85A30' }}>
                {displayChange >= 0 ? '+' : ''}{formatINR(displayChange)}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                background: displayChange >= 0 ? '#EAF3DE' : '#FCEBEB',
                color: displayChange >= 0 ? '#3B6D11' : '#A32D2D',
              }}>
                {displayChange >= 0 ? '+' : ''}{displayChangePct.toFixed(2)}%
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
              Net worth moved from{' '}
              <strong>{formatINR(displayFromNW)}</strong>
              {' → '}
              <strong>{formatINR(displayToNW)}</strong>
            </p>
          </div>

          <div style={{ height: '0.5px', background: 'var(--color-border-secondary)', margin: '0 0 20px' }} />

          {/* Member breakdown — only when periodData.byMember is available */}
          {periodData?.byMember && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Change by member
              </p>
              <div style={{ background: '#FFFFFF', borderRadius: 10, border: '0.5px solid var(--color-border-tertiary)', overflow: 'hidden' }}>
                {Object.entries(periodData.byMember).map(([member, d], i, arr) => (
                  <div key={member} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: i < arr.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'var(--color-background-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)',
                      }}>
                        {member.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
                          {member.split(' ')[0]}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                          Now {formatINR(d.current)}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: d.change >= 0 ? '#2D6A4F' : '#D85A30', margin: '0 0 2px' }}>
                        {d.change >= 0 ? '+' : ''}{formatINR(d.change)}
                      </p>
                      <p style={{ fontSize: 11, color: d.change >= 0 ? '#2D6A4F' : '#D85A30', margin: 0 }}>
                        {d.changePct >= 0 ? '+' : ''}{d.changePct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Change by category
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {categoryRows.map(cat => (
              <div key={cat.label} style={{ background: '#FFFFFF', borderRadius: 10, padding: '14px 16px', border: '0.5px solid var(--color-border-tertiary)' }}>
                <p style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                  {cat.label}
                </p>
                <p style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px', margin: '0 0 2px', color: cat.change === 0 ? 'var(--color-text-secondary)' : cat.change > 0 ? '#2D6A4F' : '#D85A30' }}>
                  {cat.change === 0 ? '—' : (cat.change > 0 ? '+' : '') + formatINR(cat.change)}
                </p>
                <p style={{ fontSize: 11, margin: 0, color: cat.change === 0 ? 'var(--color-text-secondary)' : cat.change > 0 ? '#2D6A4F' : '#D85A30' }}>
                  {cat.change === 0 ? (cat.current === 0 ? 'Not recorded' : 'No change') : (cat.changePct > 0 ? '+' : '') + cat.changePct.toFixed(2) + '%'}
                </p>
              </div>
            ))}
          </div>

          {/* Top movers */}
          {topMovers.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Top movers
              </p>
              <div style={{ background: '#FFFFFF', borderRadius: 10, border: '0.5px solid var(--color-border-tertiary)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Holdings by gain/loss</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>vs cost basis</span>
                </div>
                {topMovers.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < topMovers.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 2px' }}>{h.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
                        {h.member} · {h.units} units{h.ticker ? ` · ${h.ticker}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 3px', color: h.gain >= 0 ? '#2D6A4F' : '#D85A30' }}>
                        {h.gain >= 0 ? '+' : ''}{formatINR(h.gain)}
                      </p>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 10, background: h.gain >= 0 ? '#EAF3DE' : '#FCEBEB', color: h.gain >= 0 ? '#3B6D11' : '#A32D2D' }}>
                        {h.gain >= 0 ? '+' : ''}{h.gainPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Unchanged */}
          {unchangedCount > 0 && (
            <div style={{ background: '#FFFFFF', borderRadius: 10, border: '0.5px solid var(--color-border-tertiary)', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 2px' }}>
                  {unchangedCount} holding{unchangedCount !== 1 ? 's' : ''} unchanged
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
                  Real estate, gold, and unpriced holdings not included above
                </p>
              </div>
            </div>
          )}

          {/* Snapshot info */}
          {displayFromDate && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--color-text-secondary)', padding: '10px 14px', background: 'var(--color-background-secondary)', borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)', lineHeight: 1.5 }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ</span>
              <span>
                Comparing snapshot from{' '}
                <strong>{formatDate(displayFromDate)}</strong>{' '}to the latest.{' '}
                Changes in investments reflect price refreshes between these snapshots.
              </span>
            </div>
          )}
        </>
      )}
    </PageLayout>
  )
}
