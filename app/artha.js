'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { load, KEYS } from './lib/storage'
import { formatINR, computeOutstanding, firstName } from './lib/format'
import { SEED_INVESTMENTS, SEED_GOLD, DEFAULT_GOLD_PRICES, SEED_LOANS, SEED_FIXED_INCOME, SEED_CASH_ASSETS } from './lib/seedData'
import { STATIC_MARKET_KNOWLEDGE } from './lib/marketContext'
import PageScaffold from './components/PageScaffold'

const DEFAULT_MONTHLY_EXPENSES = 180000
const EMERGENCY_MONTHS = 6
const EXPENSES_KEY = 'fwos-artha-monthly-expenses'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24))
}

// ── Insight card ───────────────────────────────────────────
function InsightCard({ severity, title, body, extra, onDismiss }) {
  const colors = {
    alert:   { border: 'var(--color-negative)', bg: 'var(--color-negative-bg)', dot: 'var(--color-negative)', badge: 'var(--color-negative-bg)', badgeText: 'var(--color-negative)' },
    warning: { border: 'var(--color-warning)',  bg: 'var(--color-warning-bg)',  dot: 'var(--color-warning)',  badge: 'var(--color-warning-bg)',  badgeText: 'var(--color-warning)' },
    info:    { border: 'var(--color-info)',     bg: 'var(--color-info-bg)',     dot: 'var(--color-info)',     badge: 'var(--color-info-bg)',     badgeText: 'var(--color-info)' },
    good:    { border: 'var(--color-positive)', bg: 'var(--color-positive-bg)', dot: 'var(--color-positive)', badge: 'var(--color-positive-bg)', badgeText: 'var(--color-positive)' },
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
        {onDismiss && (
          <button
            onClick={onDismiss}
            title="Dismiss for this session"
            style={{ background: 'none', border: 'none', color: c.dot, cursor: 'pointer', fontSize: '0.85rem', padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: 0.6 }}
          >
            ✕
          </button>
        )}
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
function generateInsights({ investments, gold, goldPrices, loans, fixedIncome, cashAssets, insurance, monthlyExpenses }) {
  const MONTHLY_EXPENSES = monthlyExpenses || DEFAULT_MONTHLY_EXPENSES
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
      body: `Liquid assets (cash + FDs + short-term funds) total ${formatINR(liquidFunds)}, covering only ${(liquidFunds / MONTHLY_EXPENSES).toFixed(1)} months at ${formatINR(MONTHLY_EXPENSES)}/mo. Target: ${EMERGENCY_MONTHS} months (${formatINR(emergencyTarget)}). Shortfall: ${formatINR(shortfall)}.`,
    })
  } else {
    insights.push({
      section: 'Financial Safety',
      severity: 'good',
      title: 'Emergency Fund Adequate',
      body: `Liquid assets (${formatINR(liquidFunds)}) cover ${(liquidFunds / MONTHLY_EXPENSES).toFixed(1)} months at ${formatINR(MONTHLY_EXPENSES)}/mo — target of ${EMERGENCY_MONTHS} months met.`,
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

// ── Compute a structured snapshot for the advisor LLM ─────
function computeMetricsForAdvisor(data, monthlyExpenses) {
  if (!data) return {}
  const {
    investments = [], gold = [], goldPrices = {}, loans = [],
    fixedIncome = [], cashAssets = [], insurance = [],
  } = data

  const equityVal    = investments.filter(i => i.type !== 'Short Term Fund').reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
  const shortTermVal = investments.filter(i => i.type === 'Short Term Fund').reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
  const goldVal      = gold.reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || goldPrices[String(g.carat)] || 0), 0)
  const fdVal        = fixedIncome.reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
  const cashVal      = cashAssets.reduce((s, a) => s + (a.value || 0), 0)
  const totalAssets  = equityVal + shortTermVal + goldVal + fdVal + cashVal

  const loanDetails = loans.map(l => ({
    name:        l.name || l.type,
    type:        l.type,
    rate:        l.rate,
    emi:         l.emi,
    outstanding: Math.round(computeOutstanding(l) || 0),
  }))
  const totalLiabilities = loanDetails.reduce((s, l) => s + l.outstanding, 0)
  const totalEMI         = loanDetails.reduce((s, l) => s + (l.emi || 0), 0)
  const liquidFunds      = cashVal + fdVal + shortTermVal
  const emergencyMonths  = monthlyExpenses > 0 ? parseFloat((liquidFunds / monthlyExpenses).toFixed(1)) : null

  const p = (v) => totalAssets > 0 ? parseFloat((v / totalAssets * 100).toFixed(1)) : 0

  const allHoldings = investments.map(i => ({
    name:    i.name,
    member:  i.member,
    type:    i.type,
    value:   Math.round(i.units * (i.currentPrice ?? i.buyPrice)),
    gainPct: i.currentPrice != null && i.buyPrice > 0
               ? parseFloat(((i.currentPrice - i.buyPrice) / i.buyPrice * 100).toFixed(1))
               : null,
  })).sort((a, b) => b.value - a.value)

  return {
    totalAssets:     Math.round(totalAssets),
    totalLiabilities,
    netWorth:        Math.round(totalAssets - totalLiabilities),
    allocation: {
      equity:         { value: Math.round(equityVal),    pct: p(equityVal) },
      shortTermFunds: { value: Math.round(shortTermVal), pct: p(shortTermVal) },
      gold:           { value: Math.round(goldVal),      pct: p(goldVal) },
      fixedDeposits:  { value: Math.round(fdVal),        pct: p(fdVal) },
      cash:           { value: Math.round(cashVal),      pct: p(cashVal) },
    },
    goldPrice24kPerGram: goldPrices[24] || goldPrices['24'] || null,
    emergencyFund: {
      liquidTotal:    Math.round(liquidFunds),
      months:         emergencyMonths,
      monthlyExpenses,
      targetMonths:   6,
      adequate:       emergencyMonths != null && emergencyMonths >= 6,
    },
    loans:     loanDetails,
    totalEMI:  Math.round(totalEMI),
    topHoldings: allHoldings.slice(0, 8),
    insurance: insurance.map(pol => ({
      name:        pol.name,
      type:        pol.type,
      member:      pol.member,
      coverAmount: pol.coverAmount,
      premium:     pol.premium,
      renewalDate: pol.renewalDate,
    })),
    goldHoldings: gold.map(g => ({
      name:   g.name,
      grams:  g.grams,
      carat:  g.carat,
      member: g.member,
      value:  Math.round((g.grams || 0) * (goldPrices[g.carat] || 0)),
    })),
    fixedDeposits: fixedIncome.map(f => ({
      name:          f.name,
      principal:     f.principal,
      maturityValue: f.maturityValue,
      rate:          f.rate,
      maturityDate:  f.maturityDate,
      member:        f.member,
    })),
  }
}

// ── Market Pulse panel ─────────────────────────────────────
function MarketPulse({ goldPrice24k }) {
  const [open, setOpen] = useState(true)
  const mk = STATIC_MARKET_KNOWLEDGE

  const metricCards = [
    { label: 'Repo Rate',  value: `${mk.macroIndia.repoRate}%`,                                      sub: `CPI ${mk.macroIndia.cpi}%` },
    { label: 'Nifty 50',  value: `~${mk.equity.nifty50Level.toLocaleString('en-IN')}`,               sub: `PE ${mk.equity.niftyPE}×` },
    { label: '10Y G-Sec', value: `${mk.macroIndia.tenYearGSec}%`,                                    sub: 'yield' },
    { label: 'Gold 24K',  value: goldPrice24k ? `₹${Math.round(goldPrice24k / 1000)}K/g` : '—',     sub: 'live price' },
  ]

  const pillColors = {
    overweight:  { bg: 'var(--color-positive-bg)', text: 'var(--color-positive)', border: 'var(--color-positive)' },
    neutral:     { bg: 'var(--color-info-bg)',     text: 'var(--color-info)',     border: 'var(--color-info)' },
    underweight: { bg: 'var(--color-warning-bg)',  text: 'var(--color-warning)',  border: 'var(--color-warning)' },
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
            Market Pulse
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>{mk.asOf}</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '14px 18px', backgroundColor: 'var(--surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {metricCards.map(card => (
              <div key={card.label} style={{
                backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px', textAlign: 'center',
              }}>
                <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.value}</p>
                <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{card.label}</p>
                <p style={{ margin: '1px 0 0', fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.7 }}>{card.sub}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(mk.equity.sectorOutlook).map(([stance, sectors]) => {
              const c = pillColors[stance]
              return (
                <div key={stance} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.63rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: c.text, minWidth: 80 }}>
                    {stance}
                  </span>
                  {sectors.map(s => (
                    <span key={s} style={{
                      fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20,
                      backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}`, fontWeight: 500,
                    }}>
                      {s}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Artha Chat ─────────────────────────────────────────────
function ArthaChat({ data, monthlyExpenses }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const familySnapshot = computeMetricsForAdvisor(data, monthlyExpenses)
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages, familySnapshot }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Something went wrong. Please try again.')
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: json.reply }])
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginTop: 28, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
          Ask Artha
        </span>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>AI advisor · powered by your live data</span>
      </div>

      {/* Message history */}
      {messages.length > 0 && (
        <div style={{
          maxHeight: 420, overflowY: 'auto', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: 'var(--bg)',
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                backgroundColor: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                fontSize: '0.865rem', lineHeight: 1.55, whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 14px', borderRadius: '12px 12px 12px 4px',
                backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: '0.865rem',
              }}>
                Artha is thinking…
              </div>
            </div>
          )}
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              backgroundColor: 'var(--color-negative-bg)', border: '1px solid var(--color-negative)',
              color: 'var(--color-negative)', fontSize: '0.8rem',
            }}>
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex', gap: 8, padding: '12px 14px',
          borderTop: messages.length > 0 ? '1px solid var(--border)' : 'none',
          backgroundColor: 'var(--surface)',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={messages.length === 0
            ? 'Ask about your portfolio, allocation, loans, gold…'
            : 'Follow-up question…'}
          disabled={loading}
          style={{
            flex: 1, padding: '9px 13px', borderRadius: 8,
            border: '1px solid var(--border)', backgroundColor: 'var(--bg)',
            color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff',
            fontSize: '0.875rem', fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          Ask
        </button>
      </form>
    </div>
  )
}

// ── Main ARTHA component ───────────────────────────────────
export default function Artha() {
  const [data, setData] = useState(null)
  const [monthlyExpenses, setMonthlyExpenses] = useState(DEFAULT_MONTHLY_EXPENSES)
  const [editingExpenses, setEditingExpenses] = useState(false)
  const [expensesDraft, setExpensesDraft] = useState('')
  const [dismissedTitles, setDismissedTitles] = useState(new Set())

  function dismissInsight(title) {
    setDismissedTitles(prev => new Set([...prev, title]))
  }

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(EXPENSES_KEY) : null
    if (saved) setMonthlyExpenses(parseFloat(saved) || DEFAULT_MONTHLY_EXPENSES)
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

  function saveExpenses(val) {
    const n = parseFloat(val) || DEFAULT_MONTHLY_EXPENSES
    setMonthlyExpenses(n)
    localStorage.setItem(EXPENSES_KEY, String(n))
    setEditingExpenses(false)
  }

  const insights = useMemo(() => data ? generateInsights({ ...data, monthlyExpenses }) : [], [data, monthlyExpenses])
  const visibleInsights = insights.filter(i => !dismissedTitles.has(i.title))

  const sections = [...new Set(visibleInsights.map(i => i.section))]

  const severity_order = { alert: 0, warning: 1, info: 2, good: 3 }
  const counts = {
    alert: insights.filter(i => i.severity === 'alert').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    good: insights.filter(i => i.severity === 'good').length,
  }

  const emergencyMonths = useMemo(() => {
    if (!data || monthlyExpenses <= 0) return null
    const cashVal = (data.cashAssets || []).reduce((s, a) => s + (a.value || 0), 0)
    const fdVal = (data.fixedIncome || []).reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
    const shortTermVal = (data.investments || [])
      .filter(i => i.type === 'Short Term Fund')
      .reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
    return (cashVal + fdVal + shortTermVal) / monthlyExpenses
  }, [data, monthlyExpenses])

  const goldPrice24k = data?.goldPrices?.[24] ?? data?.goldPrices?.['24'] ?? null

  return (
    <PageScaffold
      title="ARTHA Advisor"
      context="Rule-based insights generated from your actual data. Updated on every visit."
      actions={
        editingExpenses ? (
          <>
            <input
              type="number"
              value={expensesDraft}
              onChange={e => setExpensesDraft(e.target.value)}
              autoFocus
              style={{ width: 120, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
            />
            <button onClick={() => saveExpenses(expensesDraft)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditingExpenses(false)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <button
            onClick={() => { setExpensesDraft(String(monthlyExpenses)); setEditingExpenses(true) }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Monthly expenses: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(monthlyExpenses)} ✎
          </button>
        )
      }
    >

      {/* ── Scorecard ─────────────────────────────────────── */}
      {data && (
        <div style={{
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 24px', marginBottom: 20,
          display: 'flex', gap: 0, flexWrap: 'wrap',
        }}>
          {[
            { label: 'Action Needed', value: counts.alert, color: 'var(--color-negative)' },
            { label: 'Watch Out', value: counts.warning, color: 'var(--color-warning)' },
            { label: 'On Track', value: counts.good, color: 'var(--color-positive)' },
          ].map((s, i) => (
            <div key={s.label} style={{ textAlign: 'center', flex: 1, minWidth: 80, borderRight: i < 2 ? '1px solid var(--border)' : undefined, padding: '4px 16px' }}>
              <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
          {emergencyMonths !== null && (
            <div style={{ textAlign: 'center', flex: 1, minWidth: 80, borderLeft: '1px solid var(--border)', padding: '4px 16px' }}>
              <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: emergencyMonths >= EMERGENCY_MONTHS ? 'var(--color-positive)' : 'var(--color-negative)', lineHeight: 1 }}>
                {emergencyMonths.toFixed(1)}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Emergency Months</p>
            </div>
          )}
        </div>
      )}

      {/* ── Market Pulse ──────────────────────────────────── */}
      <MarketPulse goldPrice24k={goldPrice24k} />

      {/* ── Insights ──────────────────────────────────────── */}
      {!data ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : visibleInsights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          All insights reviewed for this session.
        </div>
      ) : (
        sections.map(section => (
          <div key={section}>
            <Section title={section} />
            {visibleInsights
              .filter(i => i.section === section)
              .sort((a, b) => (severity_order[a.severity] ?? 9) - (severity_order[b.severity] ?? 9))
              .map((insight, idx) => (
                <InsightCard
                  key={idx}
                  severity={insight.severity}
                  title={insight.title}
                  body={insight.body}
                  extra={insight.extra}
                  onDismiss={() => dismissInsight(insight.title)}
                />
              ))
            }
          </div>
        ))
      )}

      {/* ── AI Chat ───────────────────────────────────────── */}
      {data && <ArthaChat data={data} monthlyExpenses={monthlyExpenses} />}

      {/* ── Disclaimer ────────────────────────────────────── */}
      <div style={{
        marginTop: 32, padding: '14px 18px',
        backgroundColor: 'var(--surface-2)', borderRadius: 10,
        fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Disclaimer:</strong> ARTHA insights are for educational and informational purposes only. They are generated by simple rules applied to your stored data and do not constitute financial advice. Consult a SEBI-registered financial advisor before making investment decisions. Past performance does not guarantee future results.
      </div>
    </PageScaffold>
  )
}
