'use client'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import PageLayout from './PageLayout'

export default function DailySummary({ memberFilter, onBack }) {
  const { data } = useStore()

  const snapshots = useMemo(() =>
    (data?.snapshots || []).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    ), [data?.snapshots])

  const latest = snapshots[snapshots.length - 1]
  const previous = snapshots[snapshots.length - 2]

  const allInvestments = data?.investments || []

  const currentNW = latest?.netWorth || 0
  const previousNW = previous?.netWorth || 0
  const netChange = currentNW - previousNW
  const netChangePct = previousNW > 0 ? (netChange / previousNW) * 100 : 0

  const currentByClass = latest?.byClass || {}
  const previousByClass = previous?.byClass || {}

  const categoryChanges = [
    { label: 'Investments', current: currentByClass.investments || 0, previous: previousByClass.investments || 0 },
    { label: 'Gold',        current: currentByClass.gold || 0,        previous: previousByClass.gold || 0 },
    { label: 'Real Estate', current: currentByClass.realEstate || 0,  previous: previousByClass.realEstate || 0 },
    { label: 'Cash & FDs',  current: currentByClass.cash || 0,        previous: previousByClass.cash || 0 },
  ].map(cat => ({
    ...cat,
    change: cat.current - cat.previous,
    changePct: cat.previous > 0
      ? ((cat.current - cat.previous) / cat.previous) * 100
      : 0,
  }))

  const holdingMovers = useMemo(() => {
    const filtered = allInvestments.filter(h => {
      if (memberFilter === 'All') return true
      const m = String(h.member || h.memberId || '').toLowerCase()
      return m.includes(memberFilter.toLowerCase().split(' ')[0])
    })
    return filtered
      .map(h => {
        const currentVal = (h.units || 0) * (h.currentPrice || h.buyPrice || 0)
        const costBasis = (h.units || 0) * (h.buyPrice || 0)
        const gain = currentVal - costBasis
        const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0
        return {
          name: h.name,
          ticker: h.ticker,
          member: (h.member || h.memberId || '').split(' ')[0],
          units: h.units,
          currentVal,
          costBasis,
          gain,
          gainPct,
          hasPrice: !!h.currentPrice,
        }
      })
      .filter(h => h.hasPrice && Math.abs(h.gain) > 0)
      .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain))
  }, [allInvestments, memberFilter])

  const topMovers = holdingMovers.slice(0, 5)
  const unchangedCount = allInvestments.filter(h =>
    !h.currentPrice || h.currentPrice === h.buyPrice
  ).length

  function formatINR(n) {
    if (!n && n !== 0) return '—'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(n)
  }

  function formatDate(iso) {
    if (!iso) return 'Unknown'
    return new Date(iso).toLocaleString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  function formatTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
    })
  }

  const hasData = latest && previous

  return (
    <PageLayout>

      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          padding: '0 0 20px',
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
            Click &ldquo;Save &amp; update&rdquo; at least twice to start tracking daily changes.
          </p>
          <button
            onClick={onBack}
            style={{
              padding: '8px 20px', borderRadius: 8, background: 'var(--color-accent)',
              color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer',
            }}
          >
            Back to dashboard
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <h1 style={{
                fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)',
                letterSpacing: '-0.4px', margin: 0,
              }}>
                Daily Summary
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
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
              {formatDate(latest.date)} · Compared to previous snapshot
            </p>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
              <span style={{
                fontSize: 32, fontWeight: 700, letterSpacing: '-0.6px',
                color: netChange >= 0 ? '#2D6A4F' : '#D85A30',
              }}>
                {netChange >= 0 ? '+' : ''}{formatINR(netChange)}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                background: netChange >= 0 ? '#EAF3DE' : '#FCEBEB',
                color: netChange >= 0 ? '#3B6D11' : '#A32D2D',
              }}>
                {netChange >= 0 ? '+' : ''}{netChangePct.toFixed(2)}%
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
              Net worth moved from{' '}
              <strong>{formatINR(previousNW)}</strong>
              {' → '}
              <strong>{formatINR(currentNW)}</strong>
            </p>
          </div>

          <div style={{ height: '0.5px', background: 'var(--color-border-secondary)', margin: '0 0 20px' }} />

          {/* Category breakdown */}
          <p style={{
            fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px',
          }}>
            Change by category
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
            {categoryChanges.map(cat => {
              const noChange = cat.change === 0
              return (
                <div key={cat.label} style={{
                  background: '#FFFFFF', borderRadius: 10, padding: '14px 16px',
                  border: '0.5px solid var(--color-border-tertiary)',
                }}>
                  <p style={{
                    fontSize: 10, color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px',
                  }}>
                    {cat.label}
                  </p>
                  <p style={{
                    fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px', margin: '0 0 2px',
                    color: noChange ? 'var(--color-text-secondary)' : cat.change > 0 ? '#2D6A4F' : '#D85A30',
                  }}>
                    {noChange ? '—' : (cat.change > 0 ? '+' : '') + formatINR(cat.change)}
                  </p>
                  <p style={{
                    fontSize: 11, margin: 0,
                    color: noChange ? 'var(--color-text-secondary)' : cat.change > 0 ? '#2D6A4F' : '#D85A30',
                  }}>
                    {noChange
                      ? cat.current === 0 ? 'Not recorded' : 'No change'
                      : (cat.changePct > 0 ? '+' : '') + cat.changePct.toFixed(2) + '%'
                    }
                  </p>
                </div>
              )
            })}
          </div>

          {/* Top movers */}
          {topMovers.length > 0 && (
            <>
              <p style={{
                fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px',
              }}>
                Top movers
              </p>
              <div style={{
                background: '#FFFFFF', borderRadius: 10,
                border: '0.5px solid var(--color-border-tertiary)',
                overflow: 'hidden', marginBottom: 16,
              }}>
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '0.5px solid var(--color-border-tertiary)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    Holdings by gain/loss
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>vs cost basis</span>
                </div>
                {topMovers.map((h, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: i < topMovers.length - 1
                      ? '0.5px solid var(--color-border-tertiary)' : 'none',
                  }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', margin: '0 0 2px' }}>
                        {h.name}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0 }}>
                        {h.member} · {h.units} units{h.ticker ? ` · ${h.ticker}` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{
                        fontSize: 13, fontWeight: 600, margin: '0 0 3px',
                        color: h.gain >= 0 ? '#2D6A4F' : '#D85A30',
                      }}>
                        {h.gain >= 0 ? '+' : ''}{formatINR(h.gain)}
                      </p>
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 10,
                        background: h.gain >= 0 ? '#EAF3DE' : '#FCEBEB',
                        color: h.gain >= 0 ? '#3B6D11' : '#A32D2D',
                      }}>
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
            <div style={{
              background: '#FFFFFF', borderRadius: 10,
              border: '0.5px solid var(--color-border-tertiary)',
              padding: '14px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16,
            }}>
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
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 11, color: 'var(--color-text-secondary)',
            padding: '10px 14px', background: 'var(--color-background-secondary)',
            borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)', lineHeight: 1.5,
          }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ</span>
            <span>
              Comparing snapshot saved on{' '}
              <strong>{formatDate(previous.date)}</strong>{' '}at{' '}
              <strong>{formatTime(previous.date)}</strong>{' '}vs{' '}
              <strong>{formatDate(latest.date)}</strong>{' '}at{' '}
              <strong>{formatTime(latest.date)}</strong>.{' '}
              Changes reflect price refreshes between these two saves.
            </span>
          </div>
        </>
      )}
    </PageLayout>
  )
}
