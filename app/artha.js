'use client'
import { useState, useEffect, useMemo } from 'react'
import { load, KEYS } from './lib/storage'
import { formatINR, computeOutstanding, firstName } from './lib/format'
import { SEED_INVESTMENTS, SEED_GOLD, DEFAULT_GOLD_PRICES, SEED_LOANS, SEED_FIXED_INCOME, SEED_CASH_ASSETS } from './lib/seedData'
import { STATIC_MARKET_KNOWLEDGE, READING_LIST } from './lib/marketContext'
import { THRESHOLDS as T, INSIGHT_BODIES as IB } from './lib/wealthKnowledge'
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
function InsightCard({ severity, title, body, extra, source, onDismiss }) {
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
          {source && (
            <div style={{
              marginTop: 8, fontSize: 10, color: 'var(--text-muted)',
              fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 6,
            }}>
              Framework: {source}
            </div>
          )}
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
  const shortTermVal  = investments.filter(i => i.type === 'Short Term Fund').reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
  const goldInvVal    = gold.filter(g => g.category === 'Investment').reduce((s, g) => s + g.grams * (goldPrices[g.carat] || 0), 0)
  const fdVal         = fixedIncome.reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
  const cashVal       = cashAssets.reduce((s, a) => s + (a.value || 0), 0)
  const totalPortfolio = investmentVal + shortTermVal + goldInvVal + fdVal + cashVal

  if (totalPortfolio > 0) {
    const equityPct      = (investmentVal / totalPortfolio) * 100
    const debtPct        = ((fdVal + shortTermVal + cashVal) / totalPortfolio) * 100
    const goldPct        = (goldInvVal / totalPortfolio) * 100
    const suggestedEquity = 60

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
  const liquidFunds     = cashVal + fdVal + shortTermVal
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
      const prepayAmount = 500000
      const r = homeLoan.rate / 100 / 12
      const compound = Math.pow(1 + r, homeLoan.months || 240)
      const originalEMI = homeLoan.emi || (homeLoan.principal * r * compound / (compound - 1))
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

  // ══════════════════════════════════════════════════════
  // BOOK FRAMEWORK RULES — 12 additive rules
  // Adapted to this app's actual data schema.
  // Fields used: i.type, i.name, i.units, i.currentPrice, i.buyPrice, i.investmentMode, i.sip
  // No assetClass, instrumentType, or expenseRatio in schema → rules that need them won't fire.
  // ══════════════════════════════════════════════════════

  // Pre-computed values shared across framework rules
  const totalGoldVal    = gold.reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || goldPrices[String(g.carat)] || 0), 0)
  const totalAllAssets  = investmentVal + shortTermVal + totalGoldVal + fdVal + cashVal
  const liabilityTotal  = loans.reduce((s, l) => s + (computeOutstanding(l) || 0), 0)
  const liquidityMonths = MONTHLY_EXPENSES > 0 ? liquidFunds / MONTHLY_EXPENSES : Infinity

  // Index funds identified by name (no instrumentType field in this schema)
  const indexFundValue = investments
    .filter(i => i.type !== 'Short Term Fund' && (
      (i.name || '').toLowerCase().includes('index') ||
      (i.name || '').toLowerCase().includes('nifty') ||
      (i.name || '').toLowerCase().includes('sensex') ||
      (i.name || '').toLowerCase().includes('bse 500')
    ))
    .reduce((s, i) => s + (i.units || 0) * (i.currentPrice ?? i.buyPrice ?? 0), 0)

  const indexPctOfEquity = totalEquityValue > 0 ? (indexFundValue / totalEquityValue) * 100 : 0
  const equityPctOfAll   = totalAllAssets > 0 ? (totalEquityValue / totalAllAssets) * 100 : 0
  const goldPctOfAll     = totalAllAssets > 0 ? (totalGoldVal / totalAllAssets) * 100 : 0

  // Income not stored in Advisor page — income-based rules (3, 11) won't fire
  const monthlyIncome = 0

  // Monthly SIP normalised to monthly frequency
  const monthlySIP = investments
    .filter(i => i.investmentMode === 'sip' && i.sip?.status === 'Active')
    .reduce((s, i) => {
      const amount = i.sip?.monthlyAmount || i.sip?.amount || 0
      const freq   = (i.sip?.frequency || 'monthly').toLowerCase()
      if (freq === 'weekly')      return s + amount * 4
      if (freq === 'fortnightly') return s + amount * 2
      if (freq === 'quarterly')   return s + amount / 3
      if (freq === 'daily')       return s + amount * 30
      return s + amount
    }, 0)

  // ── RULE 1 — Halan: Emergency fund critical (<3 months) ──────────────
  if (isFinite(liquidityMonths) && liquidityMonths < T.halan.emergencyFundMonthsAmber) {
    const shortfall = formatINR(
      (T.halan.emergencyFundMonthsAmber - liquidityMonths) * MONTHLY_EXPENSES
    )
    insights.push({
      section: 'Financial Safety',
      severity: 'alert',
      title: 'Emergency fund critically low — invest nothing until fixed',
      body: IB.emergencyFundCritical(liquidityMonths, shortfall),
      source: "Monika Halan — Let's Talk Money",
    })
  }

  // ── RULE 2 — Halan: Emergency fund amber (3–6 months) ────────────────
  else if (isFinite(liquidityMonths) && liquidityMonths < T.halan.emergencyFundMonthsMinimum) {
    const shortfall = formatINR(
      (T.halan.emergencyFundMonthsMinimum - liquidityMonths) * MONTHLY_EXPENSES
    )
    insights.push({
      section: 'Financial Safety',
      severity: 'warning',
      title: `Emergency fund at ${liquidityMonths.toFixed(1)} months — top up before investing more`,
      body: IB.emergencyFundAmber(liquidityMonths, shortfall),
      source: "Monika Halan — Let's Talk Money",
    })
  }

  // ── RULE 3 — Halan: SIP below 20% of income ──────────────────────────
  // monthlyIncome = 0 (not stored in Advisor data), so this never fires.
  if (monthlyIncome > 0 && monthlySIP > 0) {
    const sipPct = (monthlySIP / monthlyIncome) * 100
    if (sipPct < T.halan.sipMinimumPctOfIncome) {
      const gapAmount = formatINR(
        (T.halan.sipMinimumPctOfIncome / 100 * monthlyIncome) - monthlySIP
      )
      insights.push({
        section: 'Financial Safety',
        severity: 'info',
        title: `SIP at ${sipPct.toFixed(1)}% of income — growth box underfunded`,
        body: IB.sipBelowTarget(sipPct, T.halan.sipMinimumPctOfIncome, gapAmount),
        source: "Monika Halan — Let's Talk Money",
      })
    }
  }

  // ── RULE 4 — Graham: Equity below defensive floor (25%) ──────────────
  if (totalAllAssets > 500000 && equityPctOfAll < T.graham.defensiveMinEquityPct) {
    insights.push({
      section: 'Asset Allocation',
      severity: 'info',
      title: `Equity at ${equityPctOfAll.toFixed(1)}% — below Graham's 25% defensive floor`,
      body: IB.equityTooLow(equityPctOfAll),
      source: 'Benjamin Graham — The Intelligent Investor',
    })
  }

  // ── RULE 5 — Graham: Equity above defensive ceiling (75%) ────────────
  if (totalAllAssets > 500000 && equityPctOfAll > T.graham.defensiveMaxEquityPct) {
    insights.push({
      section: 'Asset Allocation',
      severity: 'warning',
      title: `Equity at ${equityPctOfAll.toFixed(1)}% — above Graham's 75% ceiling`,
      body: IB.equityTooHigh(equityPctOfAll),
      source: 'Benjamin Graham — The Intelligent Investor',
    })
  }

  // ── RULE 6 — Housel: Liability-to-asset ratio (>40%) ─────────────────
  if (totalAllAssets > 0) {
    const liabilityRatio = liabilityTotal / totalAllAssets
    if (liabilityRatio > T.housel.maxLiabilityToAssetRatio) {
      insights.push({
        section: 'Financial Safety',
        severity: 'warning',
        title: `Liabilities at ${(liabilityRatio * 100).toFixed(1)}% of assets — tail risk elevated`,
        body: IB.highLiabilityRatio(liabilityRatio),
        source: 'Morgan Housel — The Psychology of Money',
      })
    }
  }

  // ── RULE 7 — Bogle: Low index fund allocation (<60% of equity) ───────
  if (totalEquityValue > 200000 && indexPctOfEquity < T.bogle.indexFundCoreAllocationPct) {
    insights.push({
      section: 'Portfolio Efficiency',
      severity: 'info',
      title: `Only ${indexPctOfEquity.toFixed(1)}% of equity in index funds`,
      body: IB.lowIndexAllocation(indexPctOfEquity),
      source: 'John C. Bogle — The Little Book of Common Sense Investing',
    })
  }

  // ── RULE 8 — Bogle: High expense ratio funds (>1%) ───────────────────
  // expenseRatio field not in this app's investment schema — won't fire.
  const highErFunds = investments.filter(i => (i.expenseRatio || 0) > T.bogle.maxExpenseRatio)
  highErFunds.slice(0, 2).forEach(fund => {
    insights.push({
      section: 'Portfolio Efficiency',
      severity: 'info',
      title: `${fund.name} — expense ratio above 1%`,
      body: IB.highExpenseRatio(fund.name, fund.expenseRatio),
      source: 'John C. Bogle — The Little Book of Common Sense Investing',
    })
  })

  // ── RULE 9 — India benchmark: Gold under-hedged (<5%) ─────────────────
  if (totalAllAssets > 0 && goldPctOfAll < T.india.goldMinPctOfAssets) {
    insights.push({
      section: 'Asset Allocation',
      severity: 'info',
      title: `Gold at ${goldPctOfAll.toFixed(1)}% — below 5% hedge minimum`,
      body: IB.goldUnderHedged(goldPctOfAll),
      source: 'Indian portfolio management benchmark',
    })
  }

  // ── RULE 10 — Halan: Goal horizon mismatch ────────────────────────────
  // Goals not loaded in Advisor page data — this rule fires via Command Centre.
  ;([]).forEach(goal => {
    if (!goal.targetDate) return
    const yearsLeft = (new Date(goal.targetDate) - new Date()) / (365.25 * 24 * 60 * 60 * 1000)
    if (yearsLeft < 0) return
    let recommended
    if (yearsLeft < 1)      recommended = T.halan.goalInstruments.under1Year
    else if (yearsLeft < 3) recommended = T.halan.goalInstruments.oneToThreeYears
    else if (yearsLeft < 7) recommended = T.halan.goalInstruments.threeToSevenYears
    else                    recommended = T.halan.goalInstruments.sevenPlus
    const hasLinkedEquity = (goal.linkedInvestmentIds || []).some(id => {
      const holding = investments.find(h => h.id === id)
      return holding && holding.type === 'Stock'
    })
    if (yearsLeft < 3 && hasLinkedEquity) {
      insights.push({
        section: 'Goals',
        severity: 'warning',
        title: `"${goal.name}" — equity linked to a ${yearsLeft.toFixed(1)}-year goal`,
        body: IB.goalHorizonMismatch(goal.name, yearsLeft, 'equity', recommended),
        source: "Monika Halan — Let's Talk Money",
      })
    }
  })

  // ── RULE 11 — Halan: Term insurance per earning member ────────────────
  // memberIncomes not stored in Advisor data — earningMembers = [], won't fire.
  const earningMembers = []
  earningMembers.forEach(memberName => {
    const hasTerm = (insurance || []).some(ins =>
      (ins.member === memberName) &&
      (ins.type === 'Term Life' || (ins.type || '').toLowerCase().includes('term'))
    )
    if (!hasTerm) {
      insights.push({
        section: 'Insurance',
        severity: 'warning',
        title: `${memberName} — no term life insurance on record`,
        body: IB.noTermInsurance(memberName),
        source: "Monika Halan — Let's Talk Money",
      })
    }
  })

  // ── RULE 12 — Lynch: Single stock concentration (>20% of equity) ─────
  if (totalEquityValue > 0) {
    allStocks.forEach(stock => {
      const stockValue  = (stock.units || 0) * (stock.currentPrice ?? stock.buyPrice ?? 0)
      const pctOfEquity = (stockValue / totalEquityValue) * 100
      if (pctOfEquity > T.lynch.maxSingleStockPctOfEquity) {
        insights.push({
          section: 'Portfolio Risk',
          severity: 'warning',
          title: `${stock.name} is ${pctOfEquity.toFixed(1)}% of equity — concentration risk`,
          body: IB.singleStockConcentration(stock.name, pctOfEquity),
          source: 'Peter Lynch — One Up On Wall Street',
        })
      }
    })
  }

  return insights
}

// ── Market Pulse panel ─────────────────────────────────────
function MarketPulse({ goldPrice24k }) {
  const [open, setOpen] = useState(true)
  const mk = STATIC_MARKET_KNOWLEDGE

  const metricCards = [
    { label: 'Repo Rate',  value: `${mk.macroIndia.repoRate}%`,                                  sub: `CPI ${mk.macroIndia.cpi}%` },
    { label: 'Nifty 50',  value: `~${mk.equity.nifty50Level.toLocaleString('en-IN')}`,           sub: `PE ${mk.equity.niftyPE}×` },
    { label: '10Y G-Sec', value: `${mk.macroIndia.tenYearGSec}%`,                                sub: 'yield' },
    { label: 'Gold 24K',  value: goldPrice24k ? `₹${Math.round(goldPrice24k / 1000)}K/g` : '—', sub: 'live price' },
  ]

  const pillColors = {
    overweight:  { bg: 'var(--color-positive-bg)', text: 'var(--color-positive)', border: 'var(--color-positive)' },
    neutral:     { bg: 'var(--color-info-bg)',     text: 'var(--color-info)',     border: 'var(--color-info)' },
    underweight: { bg: 'var(--color-warning-bg)',  text: 'var(--color-warning)',  border: 'var(--color-warning)' },
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
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

// ── Reading list panel ─────────────────────────────────────
function ReadingListPanel() {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 10,
      }}>
        Frameworks behind these insights
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {READING_LIST.map(book => (
          <div key={book.title} style={{
            padding: '10px 12px', backgroundColor: 'var(--surface)',
            borderRadius: 8, border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {book.title}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    — {book.author}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
                  {book.why}
                </div>
              </div>
              <a
                href={book.buy}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.72rem', color: 'var(--accent)',
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Find →
              </a>
            </div>
          </div>
        ))}
      </div>
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
      gold:        load(KEYS.GOLD,        SEED_GOLD),
      goldPrices:  load(KEYS.GOLD_PRICES, DEFAULT_GOLD_PRICES),
      loans:       load(KEYS.LOANS,       SEED_LOANS),
      fixedIncome: load(KEYS.FIXED_INCOME, SEED_FIXED_INCOME),
      cashAssets:  load(KEYS.CASH_ASSETS,  SEED_CASH_ASSETS),
      insurance:   load(KEYS.INSURANCE,    []),
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
    alert:   insights.filter(i => i.severity === 'alert').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    good:    insights.filter(i => i.severity === 'good').length,
  }

  const emergencyMonths = useMemo(() => {
    if (!data || monthlyExpenses <= 0) return null
    const cashVal    = (data.cashAssets  || []).reduce((s, a) => s + (a.value || 0), 0)
    const fdVal      = (data.fixedIncome || []).reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
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
            { label: 'Action Needed', value: counts.alert,   color: 'var(--color-negative)' },
            { label: 'Watch Out',     value: counts.warning, color: 'var(--color-warning)' },
            { label: 'On Track',      value: counts.good,    color: 'var(--color-positive)' },
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

      {/* ── Reading List ──────────────────────────────────── */}
      <ReadingListPanel />

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
                  source={insight.source}
                  onDismiss={() => dismissInsight(insight.title)}
                />
              ))
            }
          </div>
        ))
      )}

      {/* ── About these insights ──────────────────────────── */}
      <div style={{
        marginTop: 24, padding: '14px 16px',
        backgroundColor: 'var(--surface)', borderRadius: 8,
        border: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
        }}>
          About these insights
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Insights are generated automatically from your live financial data using frameworks from
          Monika Halan, Benjamin Graham, Morgan Housel, and current Indian market conditions.
          They refresh every time you open this page.
        </div>
      </div>

      {/* ── Disclaimer ────────────────────────────────────── */}
      <div style={{
        marginTop: 16, padding: '14px 18px',
        backgroundColor: 'var(--surface-2)', borderRadius: 10,
        fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Disclaimer:</strong> ARTHA insights are for educational and informational purposes only. They are generated by simple rules applied to your stored data and do not constitute financial advice. Consult a SEBI-registered financial advisor before making investment decisions. Past performance does not guarantee future results.
      </div>
    </PageScaffold>
  )
}
