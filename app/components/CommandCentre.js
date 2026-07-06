'use client'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { computeAllMetrics, computeMemberMetrics, formatShort } from '../lib/metrics'
import { getMembers } from '../lib/members'
import {
  computeLiquidity,
  computeMonthlyObligation,
  computeRunway,
  computeConcentration,
  generateInsights,
} from '../lib/wealthMetrics'
import { formatINR, firstName } from '../lib/format'

// ── Severity palette ────────────────────────────────────────────────────────

const SEV = {
  risk:        { color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   icon: 'ti-alert-triangle-filled' },
  warning:     { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  icon: 'ti-alert-circle' },
  opportunity: { color: '#10B981', bg: 'rgba(16,185,129,0.10)',  icon: 'ti-trending-up' },
  info:        { color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',  icon: 'ti-info-circle' },
}

const GOAL_ICONS = {
  retirement: 'ti-beach',
  education:  'ti-school',
  house:      'ti-home',
  marriage:   'ti-heart',
  vehicle:    'ti-car',
  travel:     'ti-plane',
  custom:     'ti-target',
}

// ── Small helpers ───────────────────────────────────────────────────────────

function sectionLabel(text) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--color-text-muted)',
      marginBottom: 10,
    }}>
      {text}
    </div>
  )
}

function card(children, style = {}) {
  return (
    <div style={{
      background: 'var(--color-background-secondary)',
      border: '0.5px solid var(--color-border-primary)',
      borderRadius: 10,
      padding: '16px 18px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Hero cards (Row 1) ──────────────────────────────────────────────────────

function HeroCard({ label, value, sub, subColor, icon }) {
  return card(
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <i className={`ti ${icon}`} style={{ fontSize: 15, color: 'var(--color-text-muted)' }} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.5px', marginBottom: 4 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: subColor || 'var(--color-text-secondary)' }}>
          {sub}
        </div>
      )}
    </>
  )
}

// ── Insight chip (Row 2) ────────────────────────────────────────────────────

function InsightChip({ insight, onNavigate }) {
  const s = SEV[insight.severity] || SEV.info
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      background: s.bg,
      border: `0.5px solid ${s.color}33`,
      borderRadius: 8,
      padding: '12px 14px',
    }}>
      <i className={`ti ${s.icon}`} style={{ fontSize: 16, color: s.color, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
          {insight.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
          {insight.body}
        </div>
      </div>
      {insight.targetPage && onNavigate && (
        <button
          onClick={() => onNavigate(insight.targetPage)}
          style={{
            flexShrink: 0,
            padding: '5px 10px',
            borderRadius: 6,
            border: `0.5px solid ${s.color}66`,
            background: 'transparent',
            color: s.color,
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {insight.actionLabel} →
        </button>
      )}
    </div>
  )
}

// ── Member bar (Row 3 left) ─────────────────────────────────────────────────

function MemberBar({ member, netWorth, maxNetWorth, total }) {
  const pct   = maxNetWorth > 0 ? (netWorth / maxNetWorth) * 100 : 0
  const share = total > 0 ? Math.round((netWorth / total) * 100) : 0

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: member.colorBg || '#1D3352',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: member.color, flexShrink: 0,
          }}>
            {member.initials}
          </div>
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {firstName(member.name)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {formatShort(netWorth)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 28, textAlign: 'right' }}>
            {share}%
          </span>
        </div>
      </div>
      <div style={{
        height: 4,
        borderRadius: 2,
        background: 'var(--color-border-primary)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 2,
          background: member.color,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── Goal row (Row 3 right) ──────────────────────────────────────────────────

function GoalRow({ goal }) {
  const pct     = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount || 0) / goal.targetAmount * 100)) : 0
  const icon    = GOAL_ICONS[goal.type] || 'ti-target'
  const years   = goal.targetDate
    ? Math.max(0, Math.round((new Date(goal.targetDate) - Date.now()) / (365.25 * 24 * 60 * 60 * 1000)))
    : null

  const barColor = pct >= 80 ? '#10B981' : pct >= 40 ? '#4F8EF7' : '#F59E0B'

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <i className={`ti ${icon}`} style={{ fontSize: 13, color: 'var(--color-text-muted)' }} aria-hidden="true" />
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {goal.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {formatShort(goal.currentAmount || 0)} / {formatShort(goal.targetAmount)}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: barColor,
            minWidth: 32, textAlign: 'right',
          }}>
            {pct}%
          </span>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border-primary)', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: 2,
          background: barColor,
          transition: 'width 0.4s ease',
        }} />
      </div>
      {years !== null && (
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 3 }}>
          {years === 0 ? 'Due this year' : `${years} yr${years === 1 ? '' : 's'} to go`}
          {goal.targetDate ? ` · ${goal.targetDate.slice(0, 7)}` : ''}
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CommandCentre({ activeMember, isReadOnly, onNavigate }) {
  const { data } = useStore()

  // ── Derived metrics ───────────────────────────────────────────────────────

  const metrics = useMemo(() => computeAllMetrics(data), [data])

  const liquidity = useMemo(
    () => computeLiquidity(data?.cashAssets, data?.fixedIncome),
    [data]
  )

  const obligation = useMemo(
    () => computeMonthlyObligation(data?.loans, data?.investments, data?.insurance),
    [data]
  )

  const runway = useMemo(() => computeRunway(liquidity, obligation), [liquidity, obligation])

  const byCategory = useMemo(() => ({
    investments: metrics.investments,
    gold:        metrics.gold,
    realEstate:  metrics.realEstate,
    cash:        metrics.cash,
    liabilities: metrics.liabilities,
  }), [metrics])

  const concentration = useMemo(
    () => computeConcentration(byCategory, metrics.totalAssets),
    [byCategory, metrics.totalAssets]
  )

  const insights = useMemo(
    () => generateInsights(data, { liquidity, obligation, runway, concentration }),
    [data, liquidity, obligation, runway, concentration]
  )

  // ── Snapshot trend ────────────────────────────────────────────────────────

  const snapshots = data?.snapshots ?? []
  const prevSnap  = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
  const todayDelta = prevSnap != null ? metrics.netWorth - prevSnap.netWorth : null

  // ── Per-member wealth ─────────────────────────────────────────────────────

  const members = getMembers(data)
  const latestSnap = snapshots[snapshots.length - 1]

  const memberWealth = useMemo(() => {
    return members.map(m => {
      const fromSnap = latestSnap?.byMember?.[m.name]
      const nw = fromSnap?.netWorth ?? computeMemberMetrics(data, m.name).netWorth
      return { ...m, netWorth: nw }
    })
  }, [members, data, latestSnap])

  const maxMemberNW = Math.max(...memberWealth.map(m => m.netWorth), 1)
  const totalNW = memberWealth.reduce((s, m) => s + m.netWorth, 0) || 1

  // ── Goals ─────────────────────────────────────────────────────────────────

  const goals = (data?.goals ?? []).filter(g => !g.completed && (g.targetAmount || 0) > 0)

  // ── Obligation sub-line ───────────────────────────────────────────────────

  const oblParts = []
  if (obligation.emis > 0)     oblParts.push(`EMI ${formatShort(obligation.emis)}`)
  if (obligation.sips > 0)     oblParts.push(`SIP ${formatShort(obligation.sips)}`)
  if (obligation.premiums > 0) oblParts.push(`Premiums ${formatShort(obligation.premiums)}`)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      padding: '24px',
      maxWidth: 1000,
      margin: '0 auto',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.3px',
        }}>
          Command Centre
        </h1>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Row 1 — Hero cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        <HeroCard
          label="Total Wealth"
          icon="ti-chart-donut"
          value={formatShort(metrics.netWorth)}
          sub={
            todayDelta != null
              ? `${todayDelta >= 0 ? '+' : ''}${formatShort(todayDelta)} vs previous snapshot`
              : 'No prior snapshot yet'
          }
          subColor={
            todayDelta == null ? undefined
            : todayDelta >= 0  ? '#10B981' : '#EF4444'
          }
        />
        <HeroCard
          label="Liquidity"
          icon="ti-droplet"
          value={formatShort(liquidity.total)}
          sub={
            obligation.total > 0
              ? `${runway === Infinity ? '∞' : runway.toFixed(1)} month${runway === 1 ? '' : 's'} of runway`
              : 'No monthly obligations'
          }
          subColor={
            runway !== Infinity && runway < 3 ? '#EF4444'
            : runway !== Infinity && runway < 6 ? '#F59E0B'
            : '#10B981'
          }
        />
        <HeroCard
          label="Monthly Obligation"
          icon="ti-calendar-due"
          value={obligation.total > 0 ? formatShort(obligation.total) + '/mo' : '—'}
          sub={oblParts.length > 0 ? oblParts.join(' · ') : 'No active obligations'}
        />
      </div>

      {/* Row 2 — Attention queue */}
      {insights.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {sectionLabel('Attention')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.map((ins, i) => (
              <InsightChip key={i} insight={ins} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {/* Row 3 — Member bars + Goals */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: goals.length > 0 ? '1fr 1fr' : '1fr',
        gap: 16,
      }}>
        {/* Members */}
        {card(
          <>
            {sectionLabel('Family Wealth')}
            {memberWealth.map(m => (
              <MemberBar
                key={m.id}
                member={m}
                netWorth={m.netWorth}
                maxNetWorth={maxMemberNW}
                total={totalNW}
              />
            ))}
            <div style={{
              paddingTop: 10,
              marginTop: 4,
              borderTop: '0.5px solid var(--color-border-tertiary)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {formatShort(metrics.netWorth)}
              </span>
            </div>
          </>
        )}

        {/* Goals */}
        {goals.length > 0 && card(
          <>
            {sectionLabel('Goals')}
            {goals.map((g, i) => <GoalRow key={g.id || i} goal={g} />)}
          </>
        )}
      </div>

      {/* Debt ratio stat — only when in debt */}
      {metrics.liabilities > 0 && (
        <div style={{
          marginTop: 16,
          display: 'flex',
          gap: 12,
        }}>
          {card(
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                Debt · {formatINR(metrics.liabilities)} outstanding
              </span>
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: (metrics.liabilities / (metrics.netWorth || 1)) > 0.3 ? '#EF4444' : '#F59E0B',
              }}>
                {metrics.netWorth > 0 ? `${((metrics.liabilities / metrics.netWorth) * 100).toFixed(1)}% D/NW` : '—'}
              </span>
            </div>,
            { padding: '10px 18px', flex: 1 }
          )}
        </div>
      )}
    </div>
  )
}
