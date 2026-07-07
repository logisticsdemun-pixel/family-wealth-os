// Pure wealth metric functions — no DOM or store dependencies.
// Safe to import from server routes and client components alike.

// ── Fund classification ────────────────────────────────────────────────────

const DEBT_KEYWORDS = [
  'savings', 'duration', 'bond', 'liquid', 'overnight', 'gilt',
  'money market', 'short term', 'ultra short', 'low duration',
  'medium duration', 'credit risk', 'banking and psu',
]

// Heuristic: match against known debt-fund keywords; everything else is equity.
export function classifyFund(name) {
  const lower = (name || '').toLowerCase()
  for (const kw of DEBT_KEYWORDS) {
    if (lower.includes(kw)) return 'debt'
  }
  return 'equity'
}

// ── Liquidity ──────────────────────────────────────────────────────────────

/**
 * Computes liquid wealth available within 0–30 days.
 * Cash accounts count in full.
 * FDs count when maturityDate ≤ 30 days away; absent maturityDate counts with approx:true.
 */
export function computeLiquidity(cashAssets, fixedIncome) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const breakdown = []
  let total = 0

  for (const a of (cashAssets || [])) {
    const v = a.value || 0
    if (v <= 0) continue
    breakdown.push({ name: a.name, type: 'cash', value: v })
    total += v
  }

  for (const fd of (fixedIncome || [])) {
    const v = fd.maturityValue || fd.principal || 0
    if (v <= 0) continue
    if (!fd.maturityDate) {
      breakdown.push({ name: fd.name, type: 'fd', value: v, approx: true })
      total += v
    } else {
      const mat = new Date(fd.maturityDate)
      if (mat <= cutoff) {
        breakdown.push({ name: fd.name, type: 'fd', value: v, maturesByDate: fd.maturityDate })
        total += v
      }
    }
  }

  return { total, breakdown }
}

// ── Monthly obligation ─────────────────────────────────────────────────────

/**
 * Note: there is no separate sipPlans collection. Pass data.investments;
 * this function filters internally for records with investmentMode === 'sip'.
 * premiums = annual premium / 12.
 */
export function computeMonthlyObligation(loans, investments, insurance) {
  const emis = (loans || []).reduce((s, l) => s + (l.emi || 0), 0)

  const activeSIPs = (investments || []).filter(
    i => i.investmentMode === 'sip' && i.sip?.status === 'Active'
  )
  const sips = activeSIPs.reduce((s, i) => {
    const amount = i.sip?.monthlyAmount || i.sip?.amount || 0
    const freq   = (i.sip?.frequency || 'monthly').toLowerCase()
    switch (freq) {
      case 'weekly':      return s + amount * 4
      case 'fortnightly': return s + amount * 2
      case 'quarterly':   return s + amount / 3
      case 'daily':       return s + amount * 30
      default:            return s + amount
    }
  }, 0)

  const premiums = (insurance || []).reduce((s, p) => s + (p.premium || 0) / 12, 0)

  return { total: emis + sips + premiums, emis, sips, premiums }
}

// ── Runway ─────────────────────────────────────────────────────────────────

/** Returns months of liquid runway to 1 decimal place. */
export function computeRunway(liquidity, obligation) {
  const monthly = obligation?.total ?? 0
  if (monthly <= 0) return Infinity
  return parseFloat((liquidity.total / monthly).toFixed(1))
}

// ── Concentration ──────────────────────────────────────────────────────────

/**
 * Returns asset categories sorted descending by value with percentage.
 * Excludes the liabilities key.
 */
export function computeConcentration(byCategory, totalAssets) {
  if (!byCategory || totalAssets <= 0) return []
  return Object.entries(byCategory)
    .filter(([cat]) => cat !== 'liabilities')
    .map(([category, value]) => ({
      category,
      value,
      pct: (value / totalAssets) * 100,
    }))
    .sort((a, b) => b.value - a.value)
}

// ── Debt ratio ─────────────────────────────────────────────────────────────

/** Returns liabilities as a % of net worth (1 decimal place). */
export function computeDebtRatio(liabilities, netWorth) {
  if (!netWorth || netWorth <= 0) return 0
  return parseFloat(((liabilities / netWorth) * 100).toFixed(1))
}

// ── Today's change ─────────────────────────────────────────────────────────

/**
 * Returns today's P&L in ₹ for one holding using the latest snapshot's
 * priceCache as the prior price.  Returns null when no prior price exists
 * (caller should render "—").
 */
export function computeTodayChange(holding, latestSnapshot) {
  if (!holding || !latestSnapshot?.priceCache) return null
  const key = holding.isMF ? holding.mfCode : holding.ticker
  if (!key) return null
  const prevPrice = latestSnapshot.priceCache[key]
  if (prevPrice == null) return null
  const currPrice = holding.currentPrice
  if (currPrice == null) return null
  return (currPrice - prevPrice) * (holding.units || 0)
}

// ── Insights ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { risk: 0, warning: 1, opportunity: 2, info: 3 }

function ordinal(n) {
  const v = n % 100
  const s = ['th', 'st', 'nd', 'rd']
  return s[(v - 20) % 10] || s[v] || s[0]
}

function fmtINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

/**
 * Generates up to 6 ranked insights for the Command Centre attention queue.
 * metrics must include: { liquidity, obligation, runway, concentration }.
 * Insights are deterministic — no randomness, same data = same output.
 */
export function generateInsights(data, metrics) {
  const insights = []
  const investments = data?.investments || []
  const insurance   = data?.insurance   || []
  const { liquidity, obligation, runway, concentration } = metrics

  // 1. Runway < 6 months → warning
  if (runway != null && runway !== Infinity && runway < 6) {
    const gap = Math.round((6 - runway) * (obligation?.total ?? 0))
    insights.push({
      severity:    'warning',
      title:       'Low emergency fund',
      body:        `${runway.toFixed(1)} months of runway. Add ${fmtINR(gap)} to reach 6 months.`,
      actionLabel: 'Review Cash Flow',
      targetPage:  'loans',
    })
  }

  // 2. Any asset category > 60% → risk
  const overConcentrated = (concentration || []).find(c => c.pct > 60)
  if (overConcentrated) {
    insights.push({
      severity:    'risk',
      title:       `High ${overConcentrated.category} concentration`,
      body:        `${overConcentrated.category} is ${overConcentrated.pct.toFixed(1)}% of total assets — exceeds the 60% threshold.`,
      actionLabel: 'View Holdings',
      targetPage:  { page: 'holdings', view: 'investments' },
    })
  }

  // 3. Gold > 15% of assets → opportunity
  const goldEntry = (concentration || []).find(c => c.category === 'gold')
  if (goldEntry && goldEntry.pct > 15) {
    insights.push({
      severity:    'opportunity',
      title:       'Gold above 15% of assets',
      body:        `Gold is ${goldEntry.pct.toFixed(1)}% of assets (${fmtINR(goldEntry.value)}). Consider rebalancing toward equity.`,
      actionLabel: 'View Gold',
      targetPage:  { page: 'holdings', view: 'gold' },
    })
  }

  // 4. SIP instalment within 3 days → info (first match only)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const activeSIPs = investments.filter(
    i => i.investmentMode === 'sip' && i.sip?.status === 'Active' && i.sip?.instalmentDate
  )
  for (const inv of activeSIPs) {
    const day = parseInt(inv.sip.instalmentDate)
    if (isNaN(day)) continue
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), day)
    const diff = Math.round((thisMonth - today) / (24 * 60 * 60 * 1000))
    if (diff >= 0 && diff <= 3) {
      const amount = inv.sip.monthlyAmount || inv.sip.amount || 0
      insights.push({
        severity:    'info',
        title:       `SIP due ${diff === 0 ? 'today' : `in ${diff} day${diff === 1 ? '' : 's'}`}`,
        body:        `${inv.name}: ${fmtINR(amount)} on the ${day}${ordinal(day)}.`,
        actionLabel: 'View Investments',
        targetPage:  { page: 'holdings', view: 'investments' },
      })
      break
    }
  }

  // 5. Insurance renewal within 30 days → warning (first match only)
  const cutoff30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  for (const policy of insurance) {
    if (!policy.renewalDate) continue
    const renewal = new Date(policy.renewalDate)
    if (renewal >= today && renewal <= cutoff30) {
      const daysLeft = Math.round((renewal - today) / (24 * 60 * 60 * 1000))
      insights.push({
        severity:    'warning',
        title:       'Insurance renewal due soon',
        body:        `${policy.name} renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Premium: ${fmtINR(policy.premium || 0)}/yr.`,
        actionLabel: 'View Insurance',
        targetPage:  'insurance',
      })
      break
    }
  }

  // 6. Holdings with unknown cost basis → info
  const unknownCost = investments.filter(
    i => i.investmentMode !== 'sip' && (i.buyPrice == null || i.buyPrice === 0) && (i.units || 0) > 0
  )
  if (unknownCost.length > 0) {
    insights.push({
      severity:    'info',
      title:       'Cost basis missing',
      body:        `${unknownCost.length} holding${unknownCost.length === 1 ? '' : 's'} (e.g. ${unknownCost[0].name}) have no purchase price — total gain can't be computed.`,
      actionLabel: 'Update Holdings',
      targetPage:  { page: 'holdings', view: 'investments' },
    })
  }

  return insights
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 6)
}
