export const MEMBERS = ['Aseem Saxena', 'Poonam Saxena', 'Devashish Saxena', 'Shivansh Saxena']

export const MEMBER_COLORS = {
  'Aseem Saxena': '#6366f1',
  'Poonam Saxena': '#ec4899',
  'Devashish Saxena': '#f59e0b',
  'Shivansh Saxena': '#10b981',
}

export const MEMBER_FAINT = {
  'Aseem Saxena': '#eef2ff',
  'Poonam Saxena': '#fdf2f8',
  'Devashish Saxena': '#fffbeb',
  'Shivansh Saxena': '#ecfdf5',
}

export function memberColor(name) {
  return MEMBER_COLORS[name] || '#6366f1'
}

export function memberFaint(name) {
  return MEMBER_FAINT[name] || '#eef2ff'
}

export function memberInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(n => n[0]).join('')
}

export function firstName(name) {
  if (!name) return '?'
  return name.split(' ')[0]
}

export function formatINR(amount) {
  if (amount == null || isNaN(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatINRDecimal(amount, decimals = 2) {
  if (amount == null || isNaN(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatPct(pct, decimals = 2) {
  if (pct == null || isNaN(pct)) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)}%`
}

export function gainColor(value) {
  if (value == null) return 'var(--text-secondary)'
  return value >= 0 ? 'var(--gain)' : 'var(--loss)'
}

// Compute months elapsed since a start date string 'YYYY-MM-DD'
export function monthsElapsed(startDateStr) {
  if (!startDateStr) return 0
  const start = new Date(startDateStr)
  const now = new Date()
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
}

// Loan outstanding after k monthly payments
export function computeOutstanding(loan) {
  if (loan.outstandingOverride !== null && loan.outstandingOverride !== undefined) {
    return loan.outstandingOverride
  }
  if (!loan.principal || loan.rate == null || !loan.startDate || !loan.emi) return null
  const r = loan.rate / 100 / 12
  const k = monthsElapsed(loan.startDate)
  if (k === 0) return loan.principal
  if (r === 0) return Math.max(0, loan.principal - loan.emi * k) // zero-interest loan
  const compound = Math.pow(1 + r, k)
  const outstanding = loan.principal * compound - loan.emi * (compound - 1) / r
  return Math.max(0, Math.round(outstanding))
}

export function loanMonthsRemaining(loan) {
  const outstanding = computeOutstanding(loan)
  if (outstanding == null || !loan.emi) return null
  if (outstanding <= 0) return 0
  const r = (loan.rate || 0) / 100 / 12
  if (r === 0) return Math.ceil(outstanding / loan.emi)
  const numerator = loan.emi - outstanding * r
  if (numerator <= 0) return null
  return Math.ceil(Math.log(loan.emi / numerator) / Math.log(1 + r))
}

export function totalInterestPaid(loan) {
  const k = monthsElapsed(loan.startDate)
  if (!k || !loan.emi || !loan.principal) return 0
  const outstanding = computeOutstanding(loan)
  if (outstanding === null) return 0
  const principalRepaid = loan.principal - outstanding
  return Math.max(0, loan.emi * k - principalRepaid)
}

// CAGR: Compound Annual Growth Rate
export function calculateCAGR(invested, current, years) {
  if (!invested || !current || !years || years <= 0 || invested <= 0) return null
  return (Math.pow(current / invested, 1 / years) - 1) * 100
}

// Years between a past date string and today
export function yearsElapsed(dateStr) {
  if (!dateStr) return null
  const start = new Date(dateStr)
  const now = new Date()
  const years = (now - start) / (1000 * 60 * 60 * 24 * 365.25)
  return years > 0 ? years : null
}

// XIRR via Newton-Raphson
// cashFlows: [{amount: number, date: string 'YYYY-MM-DD'}]
// Negative amounts = outflows (investments), positive = inflows (returns)
export function xirr(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null
  const d0 = new Date(cashFlows[0].date)

  function npv(rate) {
    return cashFlows.reduce((sum, cf) => {
      const days = (new Date(cf.date) - d0) / (1000 * 60 * 60 * 24)
      return sum + cf.amount / Math.pow(1 + rate, days / 365)
    }, 0)
  }

  function dnpv(rate) {
    return cashFlows.reduce((sum, cf) => {
      const days = (new Date(cf.date) - d0) / (1000 * 60 * 60 * 24)
      const t = days / 365
      return sum - t * cf.amount / Math.pow(1 + rate, t + 1)
    }, 0)
  }

  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const n = npv(rate)
    if (Math.abs(n) < 1e-6) break
    const d = dnpv(rate)
    if (Math.abs(d) < 1e-12) break
    const next = rate - n / d
    if (!isFinite(next) || Math.abs(next) > 100) return null
    rate = next
  }
  return isFinite(rate) ? rate * 100 : null
}
