'use client'
import { load, save, KEYS } from './storage'
import { computeOutstanding } from './format'

const MAX_SNAPSHOTS = 365
// Skip updating today's entry if net worth moved less than ₹1,000 (avoids noisy
// writes from partial price refreshes that haven't fetched all holdings yet)
const SNAPSHOT_MIN_DELTA = 1000

export function takeSnapshot(netWorth) {
  if (typeof window === 'undefined' || netWorth == null || isNaN(netWorth) || netWorth === 0) return
  const snapshots = load(KEYS.SNAPSHOTS, []) || []
  const today = new Date().toISOString().slice(0, 10)
  const rounded = Math.round(netWorth)
  const idx = snapshots.findIndex(s => s.date === today)

  if (idx >= 0 && Math.abs(rounded - snapshots[idx].netWorth) < SNAPSHOT_MIN_DELTA) return

  const entry = { date: today, netWorth: rounded }
  const updated = idx >= 0
    ? snapshots.map((s, i) => i === idx ? entry : s)
    : [...snapshots, entry]
  save(KEYS.SNAPSHOTS, updated.sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SNAPSHOTS))
}

export function takeSnapshotFromStorage(goldPriceDefaults) {
  if (typeof window === 'undefined') return
  const investments = load(KEYS.INVESTMENTS, []) || []
  const gold = load(KEYS.GOLD, []) || []
  const goldPrices = load(KEYS.GOLD_PRICES, goldPriceDefaults || {}) || {}
  const fixedIncome = load(KEYS.FIXED_INCOME, []) || []
  const cashAssets = (load(KEYS.CASH_ASSETS, []) || []).filter(a => a.member)
  const liabilities = (load(KEYS.LIABILITIES, []) || []).filter(l => l.member)
  const loans = load(KEYS.LOANS, []) || []

  const realEstate = load(KEYS.REAL_ESTATE, []) || []

  const invVal = investments.reduce((s, i) => s + i.units * (i.currentPrice ?? i.buyPrice), 0)
  const goldVal = gold.reduce((s, g) => s + g.grams * (goldPrices[g.carat] ?? 0), 0)
  const fdVal = fixedIncome.reduce((s, f) => s + (f.maturityValue || f.principal || 0), 0)
  const cashVal = cashAssets.reduce((s, a) => s + (a.value || 0), 0)
  const loanLiab = loans.reduce((s, l) => s + (computeOutstanding(l) ?? 0), 0)
  const manualLiab = liabilities.reduce((s, l) => s + (l.value || 0), 0)
  const reVal = realEstate.reduce((s, p) => {
    const primaryPct = p.ownershipPct ?? 100
    const coOwnerPct = (p.coOwners || []).reduce((cs, co) => cs + (co.pct || 0), 0)
    return s + (p.currentValue || 0) * ((primaryPct + coOwnerPct) / 100)
  }, 0)

  takeSnapshot(invVal + goldVal + fdVal + cashVal + reVal - loanLiab - manualLiab)
}

export function getSnapshots() {
  return load(KEYS.SNAPSHOTS, []) || []
}
