// NSE trading holidays 2025–2026
const NSE_HOLIDAYS = new Set([
  // 2025
  '2025-01-26', // Republic Day
  '2025-02-26', // Mahashivratri
  '2025-03-14', // Holi
  '2025-04-14', // Dr. B.R. Ambedkar Jayanti
  '2025-04-18', // Good Friday
  '2025-05-01', // Maharashtra Day
  '2025-08-15', // Independence Day
  '2025-08-27', // Ganesh Chaturthi
  '2025-10-02', // Gandhi Jayanti
  '2025-10-20', // Diwali (Laxmi Puja)
  '2025-11-05', // Guru Nanak Jayanti
  '2025-12-25', // Christmas
  // 2026
  '2026-01-26', // Republic Day
  '2026-03-05', // Maha Shivratri
  '2026-03-24', // Holi
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. B.R. Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-08-17', // Independence Day observed (Aug 15 is Saturday)
  '2026-10-02', // Gandhi Jayanti
  '2026-11-09', // Diwali (approx)
  '2026-11-24', // Guru Nanak Jayanti (approx)
  '2026-12-25', // Christmas
])

export function isBusinessDay(date) {
  const d = date.getDay()
  if (d === 0 || d === 6) return false
  const iso = date.toISOString().slice(0, 10)
  return !NSE_HOLIDAYS.has(iso)
}

export function getNextBusinessDay(date) {
  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1)
  return d
}

// Returns the actual calendar date for a given instalmentDay in the given month/year,
// capped at 28 to avoid end-of-month issues, then adjusted for business days.
export function getInstalmentDate(instalmentDay, month, year) {
  const day = Math.min(instalmentDay, 28)
  return new Date(year, month, day)
}

// T+1 business day after the instalment date (when units are allotted)
export function getAllotmentDate(instalmentDate) {
  return getNextBusinessDay(instalmentDate)
}
