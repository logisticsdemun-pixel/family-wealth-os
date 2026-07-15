import { loadFromMemory, saveToMemory, getAllMemoryData, flushAll } from './crypto'
export { flushAll } from './crypto'

export const KEYS = {
  THEME: 'fwos-theme',
  INVESTMENTS: 'fwos-investments',
  FIXED_INCOME: 'fwos-fixed-income',
  GOLD: 'fwos-gold',
  GOLD_PRICES: 'fwos-gold-prices',
  LOANS: 'fwos-loans',
  INSURANCE: 'fwos-insurance',
  CASH_ASSETS: 'fwos-cash-assets',
  LIABILITIES: 'fwos-liabilities',
  PRICE_CACHE: 'fwos-price-cache',
  PRICE_UPDATED: 'fwos-price-updated',
  SNAPSHOTS: 'fwos-snapshots',
  REAL_ESTATE: 'fwos-real-estate',
  GOALS: 'fwos-goals',
  GOLD_PRICE_UPDATED: 'fwos-gold-price-updated',
  MEMBERS: 'fwos-members',
}

// Only theme is stored as plaintext; everything else goes through the encrypted memory store
const PLAINTEXT = new Set(['fwos-theme', KEYS.GOLD_PRICE_UPDATED])

export function load(key, fallback = null) {
  if (typeof window === 'undefined') return fallback
  if (PLAINTEXT.has(key)) {
    try {
      const v = localStorage.getItem(key)
      return v !== null ? JSON.parse(v) : fallback
    } catch { return fallback }
  }
  return loadFromMemory(key, fallback)
}

export function save(key, value) {
  if (typeof window === 'undefined') return
  if (PLAINTEXT.has(key)) {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    return
  }
  saveToMemory(key, value)
  flushAll() // fire-and-forget: ensure every write reaches localStorage
  window.dispatchEvent(new CustomEvent('fwos:datachanged', { detail: { key } }))
}

export function exportAllData() {
  const data = getAllMemoryData()
  const theme = localStorage.getItem('fwos-theme')
  if (theme) { try { data['fwos-theme'] = JSON.parse(theme) } catch {} }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fwos-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Applies pre-parsed backup data to memory store, awaiting encryption before caller reloads
export async function applyImport(data) {
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'fwos-theme') {
      try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    } else {
      saveToMemory(key, value)
    }
  })
  await flushAll()
  window.dispatchEvent(new CustomEvent('fwos:datachanged', { detail: { key: 'import' } }))
}

export function importAllData(file, onSuccess, onError) {
  const reader = new FileReader()
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result)
      await applyImport(data)
      onSuccess?.()
      window.location.reload()
    } catch {
      onError?.('Invalid backup file. Please use a file exported from this app.')
    }
  }
  reader.readAsText(file)
}
