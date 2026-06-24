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

const PERIOD_MEMBERS = ['Aseem Saxena', 'Poonam Saxena', 'Devashish Saxena', 'Shivansh Saxena']
const PERIOD_CATS    = ['investments', 'gold', 'realEstate', 'cash', 'liabilities']

export function getValidSnapshots(snapshots) {
  if (!snapshots || snapshots.length < 2) return snapshots || []
  const sorted = [...snapshots]
    .filter(s => s.date && (s.netWorth || 0) > 0)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  if (sorted.length === 0) return []
  const latestNW = sorted[0].netWorth
  return sorted.filter(s => Math.abs((s.netWorth - latestNW) / latestNW) * 100 < 50)
}

export function findSnapshotBefore(snapshots, targetDate) {
  const target = new Date(targetDate)
  target.setHours(23, 59, 59, 999)
  const before = snapshots.filter(s => new Date(s.date) <= target)
  if (before.length === 0) return null
  return before.reduce((closest, s) =>
    new Date(s.date) > new Date(closest.date) ? s : closest
  )
}

export function computePeriodChange(fromSnap, toSnap) {
  if (!fromSnap || !toSnap) return null
  if (fromSnap.date === toSnap.date) return null
  const fromNW = fromSnap.netWorth || 0
  const toNW   = toSnap.netWorth   || 0
  const change    = toNW - fromNW
  const changePct = fromNW > 0 ? (change / fromNW) * 100 : 0
  const byMember = {}
  for (const m of PERIOD_MEMBERS) {
    const now    = toSnap.byMember?.[m]?.netWorth   || 0
    const before = fromSnap.byMember?.[m]?.netWorth || 0
    const mChange = now - before
    const mPct    = before > 0 ? (mChange / before) * 100 : 0
    const byCategory = {}
    for (const cat of PERIOD_CATS) {
      const cNow    = toSnap.byMember?.[m]?.[cat]   || 0
      const cBefore = fromSnap.byMember?.[m]?.[cat] || 0
      byCategory[cat] = {
        change:    cNow - cBefore,
        changePct: cBefore > 0 ? ((cNow - cBefore) / cBefore) * 100 : 0,
        current:   cNow,
      }
    }
    byMember[m] = { change: mChange, changePct: mPct, current: now, byCategory }
  }
  const byCategory = {}
  for (const cat of PERIOD_CATS) {
    const now    = toSnap.byCategory?.[cat]   || 0
    const before = fromSnap.byCategory?.[cat] || 0
    byCategory[cat] = {
      change:    now - before,
      changePct: before > 0 ? ((now - before) / before) * 100 : 0,
    }
  }
  return { change, changePct, fromDate: fromSnap.date, toDate: toSnap.date, fromNW, toNW, byMember, byCategory }
}

export function getPeriodChange(snapshots, period, customFrom, customTo) {
  const valid = getValidSnapshots(snapshots)
  if (valid.length < 2) return null
  const latest = valid[0]
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  let compareDate
  switch (period) {
    case 'today': { const d = new Date(today); d.setDate(d.getDate() - 1); compareDate = d; break }
    case 'week':  { const d = new Date(today); d.setDate(d.getDate() - 7); compareDate = d; break }
    case 'month': compareDate = new Date(today.getFullYear(), today.getMonth(), 1); break
    case 'year':  compareDate = new Date(today.getFullYear(), 0, 1); break
    case 'custom': {
      if (!customFrom) return null
      const fromSnap = findSnapshotBefore(valid, customFrom)
      const toTarget = customTo || today.toISOString().split('T')[0]
      const toSnap   = findSnapshotBefore(valid, toTarget) || latest
      return computePeriodChange(fromSnap, toSnap)
    }
    default: return null
  }
  const compareSnap = findSnapshotBefore(valid, compareDate)
  return computePeriodChange(compareSnap, latest)
}
