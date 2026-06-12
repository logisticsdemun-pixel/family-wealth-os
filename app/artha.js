'use client'
import { useState, useEffect, useMemo } from 'react'
import { load, KEYS } from './lib/storage'
import { formatINR, computeOutstanding, firstName } from './lib/format'
import { SEED_INVESTMENTS, SEED_GOLD, DEFAULT_GOLD_PRICES, SEED_LOANS, SEED_FIXED_INCOME, SEED_CASH_ASSETS } from './lib/seedData'

const MONTHLY_EXPENSES = 180000 // ₹1,80,000/month assumed
const EMERGENCY_MONTHS = 6

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24))
}

// ── Insight card ───────────────────────────────────────────
function InsightCard({ severity, title, body, extra }) {
  const colors = {
    alert: { border: 'var(--loss)', bg: 'var(--loss-faint)', dot: 'var(--loss)', badge: '#fecaca', badgeText: '#7f1d1d' },
    warning: { border: 'var(--amber)', bg: 'var(--amber-faint)', dot: 'var(--amber)', badge: '#fde68a', badgeText: '#78350f' },
    info: { border: 'var(--accent)', bg: 'var(--accent-faint)', dot: 'var(--accent)', badge: '#c7d2fe', badgeText: '#312e81' },
    good: { border: 'var(--gain)', bg: 'var(--gain-faint)', dot: 'var(--gain)', badge: '#bbf7d0', badgeText: '#14532d' },
  }
  const c = colors[severity] ?? colors.info

  return (
    <div style={{
      backgroundColor: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: '18px 20px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.dot, marginTop: 6, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h4>
            <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 10, fontWeight: 600, backgroundColor: c.badge, color: c.badgeText, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {severity}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{body}</p>
          {extra && <div style={{ marginTop: 10 }}>{extra}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Section divider ────────────────────────────────────────
function Section({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 14px' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>{title}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
    </div>
  )
}

// ── Generate insights ──────────────────────────────────────
function generateInsights({ investments, gold, goldPrices, loans, fixedIncome, cashAssets, insurance }) {
  const insights = []

  // ─── 1. Equity values ─────────────────────────────────
  const allStocks = investments.filter(i => i.type === 'Stock')
  const allEquity = investments.filter(i => i.type !== 'Short Term Fund')
  const totalEquityValue = allEquity.reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)

  // Concentration risk: any single stock > 10%
  const stockConcentration = allStocks.map(i => ({
    name: i.name,
    value: i.units * (i.currentPrice ?? i.buyPrice),
    pct: totalEquityValue > 0 ? (i.units * (i.currentPrice ?? i.buyPrice) / totalEquityValue) * 100 : 0,
    member: i.member,
  })).filter(s => s.pct > 10)

  if (stockConcentration.length > 0) {
    stockConcentration.forEach(s => {
      insights.push({
        section: 'Portfolio Risk',
        severity: s.pct > 25 ? 'alert' : 'warning',
        title: `Concentration Risk: ${s.name}`,
        body: `${firstName(s.member)}'s holding in ${s.name} is ${s.pct.toFixed(1)}% of the family equity portfolio (${formatINR(s.value)}). Consider rebalancing if it exceeds 10%.`,
      })
    })
  } else if (allStocks.length > 0) {
    insights.push({
      section: 'Portfolio Risk',
      severity: 'good',
      title: 'No Single-Stock Concentration Risk',
      body: 'No individual stock exceeds 10% of the equity portfolio. Good diversification.',
    })
  }

  // ─── 2. Loss-making holdings ───────────────────────────
  const losers = investments
    .filter(i => i.currentPrice != null)
    .map(i => ({
      name: i.name,
      member: i.member,
      invested: i.units * i.buyPrice,
      current: i.units * i.currentPrice,
      gain: i.units * (i.currentPrice - i.buyPrice),
      pct: ((i.currentPrice - i.buyPrice) / i.buyPrice) * 100,
    }))
    .filter(i => i.gain < 0)
    .sort((a, b) => a.pct - b.pct)

  if (losers.length > 0) {
    insights.push({
      section: 'Portfolio Risk',
      severity: 'warning',
      title: `${losers.length} Holding${losers.length > 1 ? 's' : ''} in Loss`,
      body: `${losers.map(l => `${l.name} (${firstName(l.member)}: ${l.pct.toFixed(1)}%)`).join(', ')}. Review if fundamentals have changed.`,
    })
  }

  // ─── 3. Asset allocation ───────────────────────────────
  const investmentVal = totalEquityValue
  const shortTermVal = investments.filter(i => i.type === 'Short Term Fund').reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
  const goldInvVal = gold.filter(g => g.category === 'Investment').reduce((s, g) => s + g.grams * (goldPrices[g.carat] || 0), 0)
  const fdVal = fixedIncome.reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
  const cashVal = cashAssets.reduce((s, a) => s + (a.value || 0), 0)
  const totalPortfolio = investmentVal + shortTermVal + goldInvVal + fdVal + cashVal

  if (totalPortfolio > 0) {
    const equityPct = ((investmentVal) / totalPortfolio) * 100
    const debtPct = ((fdVal + shortTermVal + cashVal) / totalPortfolio) * 100
    const goldPct = (goldInvVal / totalPortfolio) * 100
    const suggestedEquity = 60 // simplified benchmark

    if (equityPct > suggestedEquity + 15) {
      insights.push({
        section: 'Asset Allocation',
        severity: 'warning',
        title: 'High Equity Concentration',
        body: `Equity is ${equityPct.toFixed(0)}% of portfolio vs a 60% benchmark. High equity allocation increases volatility. Consider increasing debt or gold allocation as the family ages.`,
      })
    } else if (equityPct < suggestedEquity - 20) {
      insights.push({
        section: 'Asset Allocation',
        severity: 'info',
        title: 'Low Equity Allocation',
        body: `Equity is only ${equityPct.toFixed(0)}% of portfolio. Long-term wealth creation benefits from higher equity exposure for younger members.`,
      })
    } else {
      insights.push({
        section: 'Asset Allocation',
        severity: 'good',
        title: 'Balanced Asset Allocation',
        body: `Equity: ${equityPct.toFixed(0)}%, Debt: ${debtPct.toFixed(0)}%, Gold: ${goldPct.toFixed(0)}%. Allocation is within a reasonable range.`,
      })
    }

    if (goldPct > 20) {
      insights.push({
        section: 'Asset Allocation',
        severity: 'info',
        title: 'High Gold Allocation',
        body: `Investment gold is ${goldPct.toFixed(0)}% of portfolio (${formatINR(goldInvVal)}). Financial planners typically recommend 5–15% in gold as a hedge.`,
      })
    }
  }

  // ─── 4. Emergency fund ────────────────────────────────
  const emergencyTarget = MONTHLY_EXPENSES * EMERGENCY_MONTHS
  const liquidFunds = cashVal + fdVal + shortTermVal
  if (liquidFunds < emergencyTarget) {
    const shortfall = emergencyTarget - liquidFunds
    insights.push({
      section: 'Financial Safety',
      severity: 'alert',
      title: 'Emergency Fund Insufficient',
      body: `Liquid assets (cash + FDs + short-term funds) total ${formatINR(liquidFunds)}, but ${EMERGENCY_MONTHS} months of expenses (₹1.8L/mo) = ${formatINR(emergencyTarget)}. Shortfall: ${formatINR(shortfall)}. Build this before investing further.`,
    })
  } else {
    insights.push({
      section: 'Financial Safety',
      severity: 'good',
      title: 'Emergency Fund Adequate',
      body: `Liquid assets (${formatINR(liquidFunds)}) cover ${(liquidFunds / MONTHLY_EXPENSES).toFixed(1)} months of expenses. Target of ${EMERGENCY_MONTHS} months met.`,
    })
  }

  // ─── 5. Home loan prepayment math ─────────────────────
  const homeLoan = loans.find(l => l.type === 'Home Loan' && l.principal && l.rate)
  if (homeLoan) {
    const outstanding = computeOutstanding(homeLoan)
    if (outstanding && outstanding > 0) {
      const prepayAmount = 500000 // ₹5 lakhs
      const r = homeLoan.rate / 100 / 12
      const compound = Math.pow(1 + r, homeLoan.months || 240)
      const originalEMI = homeLoan.emi || (homeLoan.principal * r * compound / (compound - 1))
      // Months saved with prepayment
      const newOutstanding = outstanding - prepayAmount
      const monthsAfterPrepay = newOutstanding > 0
        ? Math.ceil(Math.log(originalEMI / (originalEMI - newOutstanding * r)) / Math.log(1 + r))
        : 0
      const monthsRemaining = outstanding > 0
        ? Math.ceil(Math.log(originalEMI / (originalEMI - outstanding * r)) / Math.log(1 + r))
        : 0
      const monthsSaved = Math.max(0, monthsRemaining - monthsAfterPrepay)
      const interestSaved = monthsSaved * originalEMI - prepayAmount

      insights.push({
        section: 'Loan Optimisation',
        severity: 'info',
        title: 'Home Loan Prepayment Opportunity',
        body: `Current outstanding: ${formatINR(outstanding)} at ${homeLoan.rate}% p.a. A one-time prepayment of ${formatINR(prepayAmount)} could save ~${monthsSaved} months and approximately ${formatINR(Math.max(0, interestSaved))} in total interest.`,
      })
    }
  }

  // ─── 6. Insurance renewal alerts ──────────────────────
  const renewalsSoon = (insurance || []).filter(p => {
    const d = daysUntil(p.renewalDate)
    return d !== null && d >= 0 && d <= 30
  })
  if (renewalsSoon.length > 0) {
    insights.push({
      section: 'Insurance',
      severity: 'warning',
      title: `${renewalsSoon.length} Renewal${renewalsSoon.length > 1 ? 's' : ''} Due Within 30 Days`,
      body: renewalsSoon.map(p => `${p.name} (${firstName(p.member)}) on ${p.renewalDate}`).join(' · '),
    })
  }

  // No life insurance?
  const hasLifeCover = (insurance || []).some(p => p.type === 'Term Life' || p.type === 'Endowment' || p.type === 'ULIP')
  if (!hasLifeCover) {
    insights.push({
      section: 'Insurance',
      severity: 'alert',
      title: 'No Term Life Insurance Recorded',
      body: 'Ensure term life insurance is in place for earning members. Cover should typically be 10–15× annual income. Add policies in the Insurance tab.',
    })
  }

  const hasHealthCover = (insurance || []).some(p => p.type === 'Health' || p.type === 'Critical Illness')
  if (!hasHealthCover) {
    insights.push({
      section: 'Insurance',
      severity: 'warning',
      title: 'No Health Insurance Recorded',
      body: 'Family health insurance is critical for financial protection against medical emergencies. Add your health policies in the Insurance tab.',
    })
  }

  return insights
}

// ── Main ARTHA component ───────────────────────────────────
export default function Artha() {
  const [data, setData] = useState(null)

  useEffect(() => {
    setData({
      investments: load(KEYS.INVESTMENTS, SEED_INVESTMENTS),
      gold: load(KEYS.GOLD, SEED_GOLD),
      goldPrices: load(KEYS.GOLD_PRICES, DEFAULT_GOLD_PRICES),
      loans: load(KEYS.LOANS, SEED_LOANS),
      fixedIncome: load(KEYS.FIXED_INCOME, SEED_FIXED_INCOME),
      cashAssets: load(KEYS.CASH_ASSETS, SEED_CASH_ASSETS),
      insurance: load(KEYS.INSURANCE, []),
    })
  }, [])

  const insights = useMemo(() => data ? generateInsights(data) : [], [data])

  const sections = [...new Set(insights.map(i => i.section))]

  const severity_order = { alert: 0, warning: 1, info: 2, good: 3 }
  const counts = {
    alert: insights.filter(i => i.severity === 'alert').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    good: insights.filter(i => i.severity === 'good').length,
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 24px' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 700 }}>ARTHA Advisor</h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Rule-based insights generated from your actual data. Updated on every visit.
        </p>
      </div>

      {/* ── Scorecard ─────────────────────────────────────── */}
      {data && (
        <div style={{
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 24,
          display: 'flex', gap: 24, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Action Needed', value: counts.alert, color: 'var(--loss)' },
            { label: 'Watch Out', value: counts.warning, color: 'var(--amber)' },
            { label: 'On Track', value: counts.good, color: 'var(--gain)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', minWidth: 80 }}>
              <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Insights ──────────────────────────────────────── */}
      {!data ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        sections.map(section => (
          <div key={section}>
            <Section title={section} />
            {insights
              .filter(i => i.section === section)
              .sort((a, b) => (severity_order[a.severity] ?? 9) - (severity_order[b.severity] ?? 9))
              .map((insight, idx) => (
                <InsightCard
                  key={idx}
                  severity={insight.severity}
                  title={insight.title}
                  body={insight.body}
                  extra={insight.extra}
                />
              ))
            }
          </div>
        ))
      )}

      {/* ── Disclaimer ────────────────────────────────────── */}
      <div style={{
        marginTop: 32, padding: '14px 18px',
        backgroundColor: 'var(--surface-2)', borderRadius: 10,
        fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Disclaimer:</strong> ARTHA insights are for educational and informational purposes only. They are generated by simple rules applied to your stored data and do not constitute financial advice. Consult a SEBI-registered financial advisor before making investment decisions. Past performance does not guarantee future results.
      </div>
    </div>
  )
}
