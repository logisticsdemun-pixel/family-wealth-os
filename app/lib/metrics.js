import { computeOutstanding } from './format'

export function computeAllMetrics(data) {
  if (!data) return {
    netWorth: 0, investments: 0, realEstate: 0,
    gold: 0, cash: 0, liabilities: 0, totalAssets: 0,
  }

  const goldPrices = data.goldPrices ?? { 24: 15496, 22: 14205, 18: 9386 }

  const investments = (data.investments || [])
    .reduce((s, h) => s + (h.units || 0) * (h.currentPrice || h.buyPrice || 0), 0)

  const fds = (data.fixedIncome || [])
    .reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)

  const gold = (data.gold || [])
    .reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || 0), 0)

  // Full property value for family ("All members") view
  const realEstate = (data.realEstate || [])
    .reduce((s, p) => s + (p.currentValue || 0), 0)

  const cashAccounts = (data.cashAssets || [])
    .reduce((s, a) => s + (a.value || 0), 0)

  const loanLiab = (data.loans || [])
    .reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)

  const manualLiab = (data.liabilities || [])
    .reduce((s, l) => s + (l.value || 0), 0)

  const liabilities = loanLiab + manualLiab
  const totalAssets = investments + fds + gold + realEstate + cashAccounts
  const netWorth = totalAssets - liabilities

  return { netWorth, investments, gold, realEstate, cash: cashAccounts + fds, liabilities, totalAssets }
}

export function computeMemberMetrics(data, memberName) {
  if (!data || !memberName || memberName === 'All') {
    return computeAllMetrics(data)
  }

  const goldPrices = data.goldPrices ?? { 24: 15496, 22: 14205, 18: 9386 }

  function matchMember(item) {
    const m = String(item.member || item.memberId || item.owner || '').toLowerCase()
    const search = memberName.toLowerCase()
    const fn = search.split(' ')[0]
    return m === search || m.includes(fn) || search.includes(m.split(' ')[0])
  }

  const investments = (data.investments || [])
    .filter(matchMember)
    .reduce((s, h) => s + (h.units || 0) * (h.currentPrice || h.buyPrice || 0), 0)

  const fds = (data.fixedIncome || [])
    .filter(matchMember)
    .reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)

  const gold = (data.gold || [])
    .filter(matchMember)
    .reduce((s, g) => s + (g.grams || 0) * (goldPrices[g.carat] || 0), 0)

  const realEstate = (data.realEstate || [])
    .reduce((s, p) => {
      if (matchMember(p)) return s + (p.currentValue || 0) * ((p.ownershipPct ?? 100) / 100)
      const co = (p.coOwners || []).find(c => matchMember({ member: c.member }))
      return co ? s + (p.currentValue || 0) * ((co.pct || 0) / 100) : s
    }, 0)

  const cashAccounts = (data.cashAssets || [])
    .filter(matchMember)
    .reduce((s, a) => s + (a.value || 0), 0)

  const personalLoans = (data.loans || [])
    .filter(l => !l.isShared && matchMember(l))
    .reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)

  const personalManualLiab = (data.liabilities || [])
    .filter(l => !l.isShared && !l.shared && matchMember(l))
    .reduce((s, l) => s + (l.value || 0), 0)

  const liabilities = personalLoans + personalManualLiab
  const totalAssets = investments + fds + gold + realEstate + cashAccounts
  const netWorth = totalAssets - liabilities

  return { netWorth, investments, gold, realEstate, cash: cashAccounts + fds, liabilities, totalAssets }
}

// e.g. 8200000 → ₹82.0L  920000 → ₹9.2L  15000 → ₹15K
export function formatShort(n) {
  if (!n && n !== 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(1)}L`
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(0)}K`
  return `${sign}₹${Math.round(abs)}`
}
