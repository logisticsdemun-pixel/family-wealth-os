'use client'
import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { computeAllMetrics, formatShort } from '../lib/metrics'
import { computeLiquidity, computeMonthlyObligation, computeRunway, computeDebtRatio } from '../lib/wealthMetrics'
import { formatINR, firstName } from '../lib/format'
import PageScaffold from './PageScaffold'

// ── Shared primitives ───────────────────────────────────────────────────────

function Row({ label, sub, value, valueColor, indent }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: indent ? '10px 20px' : '12px 0',
      borderBottom: '0.5px solid var(--color-border-tertiary)',
    }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-primary)', fontWeight: indent ? 400 : 500 }}>{label}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>{sub}</p>}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color: valueColor || 'var(--color-text-primary)', flexShrink: 0, marginLeft: 12 }}>
        {value}
      </span>
    </div>
  )
}

function SectionHead({ label }) {
  return (
    <p style={{
      margin: '20px 0 0', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--color-text-muted)',
    }}>
      {label}
    </p>
  )
}

function EmptyState({ text }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '24px 0' }}>{text}</p>
  )
}

// ── Net Worth sub-page ──────────────────────────────────────────────────────

export function NetWorthPage({ onNavigate }) {
  const { data } = useStore()
  const m = useMemo(() => computeAllMetrics(data), [data])

  const categories = [
    { label: 'Investments',  value: m.investments, color: 'var(--color-accent)' },
    { label: 'Gold',         value: m.gold,         color: 'var(--color-gold)' },
    { label: 'Real Estate',  value: m.realEstate,   color: 'var(--color-positive)' },
    { label: 'Fixed Income & Cash', value: m.cash,  color: 'var(--color-text-primary)' },
  ].filter(c => c.value > 0)

  return (
    <PageScaffold
      title="Net Worth"
      context="Total assets minus all liabilities"
      backTo={{ label: 'Command Centre', onClick: () => onNavigate('command') }}
      stats={[
        { label: 'Total Assets',     value: formatShort(m.totalAssets),  valueColor: 'var(--color-positive)' },
        { label: 'Total Liabilities',value: formatShort(m.liabilities),  valueColor: m.liabilities > 0 ? 'var(--color-negative)' : 'var(--color-text-muted)' },
        { label: 'Net Worth',        value: formatShort(m.netWorth),     valueColor: 'var(--color-accent)' },
      ]}
    >
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-primary)', borderRadius: 10, padding: '4px 18px 12px' }}>
        <SectionHead label="Asset Breakdown" />
        {categories.length === 0
          ? <EmptyState text="No assets recorded yet." />
          : categories.map(c => (
            <Row
              key={c.label}
              label={c.label}
              value={formatShort(c.value)}
              valueColor={c.color}
              sub={m.totalAssets > 0 ? `${((c.value / m.totalAssets) * 100).toFixed(1)}% of total assets` : undefined}
            />
          ))
        }
        {m.liabilities > 0 && (
          <>
            <SectionHead label="Liabilities" />
            <Row
              label="Outstanding Liabilities"
              value={formatShort(m.liabilities)}
              valueColor="var(--color-negative)"
            />
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0 4px', fontWeight: 700 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Net Worth</span>
          <span style={{ fontSize: 16, color: 'var(--color-accent)' }}>{formatShort(m.netWorth)}</span>
        </div>
      </div>
    </PageScaffold>
  )
}

// ── Liquidity sub-page ──────────────────────────────────────────────────────

export function LiquidityPage({ onNavigate }) {
  const { data } = useStore()

  const liquidity = useMemo(() => computeLiquidity(data?.cashAssets, data?.fixedIncome), [data])
  const obligation = useMemo(() => computeMonthlyObligation(data?.loans, data?.investments, data?.insurance), [data])
  const runway = useMemo(() => computeRunway(liquidity, obligation), [liquidity, obligation])

  const runwayColor = runway !== Infinity && runway < 3 ? 'var(--color-negative)'
    : runway !== Infinity && runway < 6 ? 'var(--color-warning)'
    : 'var(--color-positive)'

  const cashItems   = liquidity.breakdown.filter(b => b.type === 'cash')
  const fdItems     = liquidity.breakdown.filter(b => b.type === 'fd')

  return (
    <PageScaffold
      title="Liquidity"
      context="Cash and near-cash assets available within 30 days"
      backTo={{ label: 'Command Centre', onClick: () => onNavigate('command') }}
      stats={[
        { label: 'Liquid Total',      value: formatShort(liquidity.total), valueColor: 'var(--color-positive)' },
        { label: 'Runway',            value: runway === Infinity ? '∞' : `${runway.toFixed(1)} mo`, valueColor: runwayColor,
          sub: `vs ${formatShort(obligation.total)}/mo obligations` },
        { label: 'Monthly Obligation',value: formatShort(obligation.total) },
      ]}
    >
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-primary)', borderRadius: 10, padding: '4px 18px 12px' }}>
        {cashItems.length > 0 && (
          <>
            <SectionHead label="Cash & Accounts" />
            {cashItems.map((b, i) => (
              <Row key={i} label={b.name} value={formatShort(b.value)} />
            ))}
          </>
        )}
        {fdItems.length > 0 && (
          <>
            <SectionHead label="Fixed Deposits (≤ 30 days or undated)" />
            {fdItems.map((b, i) => (
              <Row
                key={i}
                label={b.name}
                sub={b.approx ? 'No maturity date — included as approximate' : b.maturesByDate ? `Matures ${b.maturesByDate}` : undefined}
                value={formatShort(b.value)}
              />
            ))}
          </>
        )}
        {liquidity.breakdown.length === 0 && (
          <EmptyState text="No liquid assets found. Add cash accounts or fixed deposits." />
        )}
      </div>
    </PageScaffold>
  )
}

// ── Obligations sub-page ────────────────────────────────────────────────────

export function ObligationsPage({ onNavigate }) {
  const { data } = useStore()

  const obligation = useMemo(() => computeMonthlyObligation(data?.loans, data?.investments, data?.insurance), [data])

  const loans     = data?.loans     ?? []
  const insurance = data?.insurance ?? []
  const activeSIPs = (data?.investments ?? []).filter(i => i.investmentMode === 'sip' && i.sip?.status === 'Active')

  return (
    <PageScaffold
      title="Monthly Obligations"
      context="Recurring financial commitments — EMIs, SIPs, and premiums"
      backTo={{ label: 'Command Centre', onClick: () => onNavigate('command') }}
      stats={[
        { label: 'Total / Month', value: formatShort(obligation.total) + '/mo' },
        { label: 'EMI Payments',  value: formatShort(obligation.emis),   sub: `${loans.filter(l => l.emi).length} loan${loans.filter(l => l.emi).length !== 1 ? 's' : ''}` },
        { label: 'SIPs + Premiums', value: formatShort(obligation.sips + obligation.premiums), sub: `${activeSIPs.length} SIP · premiums /12` },
      ]}
    >
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-primary)', borderRadius: 10, padding: '4px 18px 12px' }}>
        {loans.filter(l => l.emi > 0).length > 0 && (
          <>
            <SectionHead label="Loan EMIs" />
            {loans.filter(l => l.emi > 0).map(l => (
              <Row
                key={l.id}
                label={l.lender}
                sub={`${l.type} · ${firstName(l.member)}${l.isShared ? ' (shared)' : ''}`}
                value={formatShort(l.emi) + '/mo'}
              />
            ))}
          </>
        )}
        {activeSIPs.length > 0 && (
          <>
            <SectionHead label="Active SIPs" />
            {activeSIPs.map(inv => {
              const amount = inv.sip?.monthlyAmount || inv.sip?.amount || 0
              return (
                <Row
                  key={inv.id}
                  label={inv.name}
                  sub={`${firstName(inv.member)} · ${inv.sip?.frequency || 'Monthly'}`}
                  value={formatShort(amount) + '/mo'}
                />
              )
            })}
          </>
        )}
        {insurance.filter(p => p.premium > 0).length > 0 && (
          <>
            <SectionHead label="Insurance Premiums (÷ 12)" />
            {insurance.filter(p => p.premium > 0).map(p => (
              <Row
                key={p.id}
                label={p.name}
                sub={`${p.type} · ${firstName(p.member)}`}
                value={formatShort(p.premium / 12) + '/mo'}
              />
            ))}
          </>
        )}
        {obligation.total === 0 && (
          <EmptyState text="No active obligations found." />
        )}
      </div>
    </PageScaffold>
  )
}

// ── Liabilities sub-page ────────────────────────────────────────────────────

export function LiabilitiesPage({ onNavigate }) {
  const { data } = useStore()

  const liabilities = data?.liabilities ?? []
  const m = useMemo(() => computeAllMetrics(data), [data])
  const debtRatio = computeDebtRatio(m.liabilities, m.netWorth)

  return (
    <PageScaffold
      title="Liabilities"
      context="Outstanding debts not captured in the Loans module"
      backTo={{ label: 'Command Centre', onClick: () => onNavigate('command') }}
      stats={[
        { label: 'Outstanding',  value: formatShort(m.liabilities), valueColor: m.liabilities > 0 ? 'var(--color-negative)' : 'var(--color-text-muted)' },
        { label: 'Debt / NW',    value: m.netWorth > 0 ? `${debtRatio}%` : '—', valueColor: debtRatio > 30 ? 'var(--color-negative)' : 'var(--color-warning)' },
        { label: 'Net Worth',    value: formatShort(m.netWorth), valueColor: 'var(--color-accent)' },
      ]}
    >
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-primary)', borderRadius: 10, padding: '4px 18px 12px' }}>
        {liabilities.length === 0 ? (
          <EmptyState text="No liabilities recorded. Data is managed externally." />
        ) : (
          <>
            <SectionHead label="Recorded Liabilities" />
            {liabilities.map((l, i) => (
              <Row
                key={l.id || i}
                label={l.name || (l.isShared || l.shared ? 'Shared liability' : `${firstName(l.member)} liability`)}
                sub={`${firstName(l.member)}${l.isShared || l.shared ? ' · Shared' : ''}`}
                value={formatINR(l.value || 0)}
                valueColor="var(--color-negative)"
              />
            ))}
          </>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>
        Note: To add or edit liabilities, contact the admin — no edit interface is available yet.
      </p>
    </PageScaffold>
  )
}
