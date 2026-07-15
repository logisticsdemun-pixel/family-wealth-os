const GOLD_PRICE_DEFAULTS = { 24: 15496, 22: 14205, 18: 9386 }

export function linkedCurrentValue(goal, investments, gold, goldPrices, cashAccounts) {
  const prices = goldPrices || GOLD_PRICE_DEFAULTS
  const invValue = (investments || [])
    .filter(h => (goal.linkedInvestmentIds || []).includes(String(h.id)))
    .reduce((s, h) => s + (h.units || 0) * (h.currentPrice || h.buyPrice || 0), 0)
  const goldValue = (gold || [])
    .filter(g => (goal.linkedGoldIds || []).includes(String(g.id)))
    .reduce((s, g) => {
      const grams = g.grams || 0
      const price = prices[g.carat] || prices[24] || 0
      return s + grams * price
    }, 0)
  const cashValue = (cashAccounts || [])
    .filter(a => (goal.linkedCashIds || []).includes(String(a.id)))
    .reduce((s, a) => s + (a.value || 0), 0)
  return invValue + goldValue + cashValue
}

export function inflatedTarget(goal) {
  if (!goal) return 0
  if (goal.goalMode === 'portfolio_target' || !goal.inflationPct || goal.inflationPct === 0) {
    return goal.targetAmount || 0
  }
  const years = Math.max(0,
    (new Date(goal.targetDate) - new Date()) / (365.25 * 24 * 60 * 60 * 1000)
  )
  return (goal.targetAmount || 0) * Math.pow(1 + goal.inflationPct / 100, years)
}

export function monthlySIPNeeded(goal, currentValue, targetCorpus) {
  if (goal.goalMode === 'portfolio_target' || !goal.expectedReturnPct || goal.expectedReturnPct === 0) {
    return null
  }
  const monthsLeft = Math.max(1,
    Math.round((new Date(goal.targetDate) - new Date()) / (30.44 * 24 * 60 * 60 * 1000))
  )
  const r = goal.expectedReturnPct / 100 / 12
  const fvCurrent = currentValue * Math.pow(1 + r, monthsLeft)
  const gap = targetCorpus - fvCurrent
  if (gap <= 0) return 0
  return Math.max(0, Math.round(gap * r / (Math.pow(1 + r, monthsLeft) - 1)))
}
