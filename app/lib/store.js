'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { load, save, KEYS, flushAll } from './storage'
import {
  SEED_INVESTMENTS, SEED_FIXED_INCOME, SEED_GOLD, DEFAULT_GOLD_PRICES,
  SEED_LOANS, SEED_INSURANCE, SEED_CASH_ASSETS, SEED_LIABILITIES, SEED_REAL_ESTATE,
} from './seedData'

// ── KEYS → collection name ──────────────────────────────────
const KEY_TO_COLLECTION = {
  [KEYS.INVESTMENTS]:  'investments',
  [KEYS.FIXED_INCOME]: 'fixedIncome',
  [KEYS.GOLD]:         'gold',
  [KEYS.GOLD_PRICES]:  'goldPrices',
  [KEYS.LOANS]:        'loans',
  [KEYS.REAL_ESTATE]:  'realEstate',
  [KEYS.INSURANCE]:    'insurance',
  [KEYS.CASH_ASSETS]:  'cashAssets',
  [KEYS.LIABILITIES]:  'liabilities',
  [KEYS.SNAPSHOTS]:    'snapshots',
  [KEYS.PRICE_CACHE]:  'priceCache',
}

// Prevents handleExternalChange from re-loading when the store
// itself triggered the fwos:datachanged event via save()
let _storeWriting = false

// Read all collections from _memoryStore (already decrypted on login)
function readAll() {
  // Run one-time migration: ensure all MF investments have investmentMode
  const rawInv = load(KEYS.INVESTMENTS, SEED_INVESTMENTS) ?? []
  let invDirty = false
  const investments = rawInv.map(h => {
    if (h.isMF && !h.investmentMode) { invDirty = true; return { ...h, investmentMode: 'lumpsum' } }
    return h
  })
  if (invDirty) save(KEYS.INVESTMENTS, investments)

  return {
    investments,
    fixedIncome:  load(KEYS.FIXED_INCOME, SEED_FIXED_INCOME)  ?? [],
    gold:         load(KEYS.GOLD, SEED_GOLD)                   ?? [],
    goldPrices:   load(KEYS.GOLD_PRICES, DEFAULT_GOLD_PRICES) ?? DEFAULT_GOLD_PRICES,
    loans:        load(KEYS.LOANS, SEED_LOANS)                 ?? [],
    realEstate:   load(KEYS.REAL_ESTATE, SEED_REAL_ESTATE)    ?? [],
    insurance:    load(KEYS.INSURANCE, SEED_INSURANCE)         ?? [],
    cashAssets:   (load(KEYS.CASH_ASSETS, SEED_CASH_ASSETS)   ?? []).filter(a => a.member),
    liabilities:  (load(KEYS.LIABILITIES, SEED_LIABILITIES)   ?? []).filter(l => l.member),
    snapshots:    load(KEYS.SNAPSHOTS, [])                     ?? [],
    priceCache:   load(KEYS.PRICE_CACHE, {})                   ?? {},
  }
}

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [data, setData] = useState(null) // null until first load
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setData(readAll())

    // Reload when an external write dispatches the event (e.g. applyImport,
    // backup restore, or any path that bypasses store.set)
    function handleExternalChange() {
      if (!_storeWriting) setData(readAll())
    }
    window.addEventListener('fwos:datachanged', handleExternalChange)
    return () => window.removeEventListener('fwos:datachanged', handleExternalChange)
  }, [])

  // Replace an entire collection by its KEYS constant.
  // Saves to _memoryStore (via storage.save) and updates React state in one shot.
  const set = useCallback((key, value) => {
    _storeWriting = true
    save(key, value) // → _memoryStore + async encrypt + dispatches fwos:datachanged
    _storeWriting = false
    const name = KEY_TO_COLLECTION[key]
    if (name) setData(prev => prev ? { ...prev, [name]: value } : prev)
    setDirty(true)
  }, [])

  // Await pending encryption + mark clean. Call before tab close or manual snapshot.
  const flush = useCallback(async () => {
    await flushAll()
    setDirty(false)
  }, [])

  // Force a full reload from _memoryStore (after applyImport / backup restore)
  const reloadAll = useCallback(() => setData(readAll()), [])

  return (
    <AppContext.Provider value={{ data, set, reloadAll, dirty, flush }}>
      {children}
    </AppContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useStore must be inside AppProvider')
  return ctx
}

// ── Selector hooks — safe empty default while data === null ──
export function useInvestments()  { return useStore().data?.investments  ?? [] }
export function useFixedIncome()  { return useStore().data?.fixedIncome  ?? [] }
export function useGold()         { return useStore().data?.gold         ?? [] }
export function useGoldPrices()   { return useStore().data?.goldPrices   ?? DEFAULT_GOLD_PRICES }
export function useLoans()        { return useStore().data?.loans        ?? [] }
export function useRealEstate()   { return useStore().data?.realEstate   ?? [] }
export function useInsurance()    { return useStore().data?.insurance    ?? [] }
export function useCashAssets()   { return useStore().data?.cashAssets   ?? [] }
export function useLiabilities()  { return useStore().data?.liabilities  ?? [] }
export function useSnapshots()    { return useStore().data?.snapshots    ?? [] }
export function usePriceCache()   { return useStore().data?.priceCache   ?? {} }
