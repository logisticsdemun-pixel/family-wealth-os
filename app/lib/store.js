'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { load, save, KEYS, flushAll } from './storage'
import { saveToMemory } from './crypto'
import { getCollection, setCollection, COLLECTIONS } from './supabaseStore'
import { getSupabase } from './supabase'
import {
  SEED_INVESTMENTS, SEED_FIXED_INCOME, SEED_GOLD, DEFAULT_GOLD_PRICES,
  SEED_LOANS, SEED_INSURANCE, SEED_CASH_ASSETS, SEED_LIABILITIES, SEED_REAL_ESTATE,
} from './seedData'

// ── KEYS constant → Supabase collection name ────────────────────────────────
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
  [KEYS.GOALS]:        'goals',
}

// Reverse map: collection name → KEYS constant (for mirroring to _memoryStore)
const COLLECTION_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_COLLECTION).map(([k, v]) => [v, k])
)

const ORDERED_COLLECTIONS = [
  'investments', 'fixedIncome', 'gold', 'goldPrices',
  'loans', 'realEstate', 'insurance', 'cashAssets',
  'liabilities', 'snapshots', 'priceCache', 'goals',
]

// Fallback values when Supabase has no row for a collection yet
const DEFAULTS = {
  investments: SEED_INVESTMENTS,
  fixedIncome: SEED_FIXED_INCOME,
  gold: SEED_GOLD,
  goldPrices: DEFAULT_GOLD_PRICES,
  loans: SEED_LOANS,
  realEstate: SEED_REAL_ESTATE,
  insurance: SEED_INSURANCE,
  cashAssets: SEED_CASH_ASSETS,
  liabilities: SEED_LIABILITIES,
  snapshots: [],
  priceCache: {},
  goals: [],
}

// Post-load transforms that match the old readAll() behaviour
function applyTransforms(name, raw) {
  if (!Array.isArray(raw)) return raw
  if (name === 'investments') {
    return raw.map(h => (h.isMF && !h.investmentMode)
      ? { ...h, investmentMode: 'lumpsum' }
      : h
    )
  }
  if (name === 'cashAssets')  return raw.filter(a => a.member)
  if (name === 'liabilities') return raw.filter(l => l.member)
  return raw
}

// Mirror a value into _memoryStore so that takeSnapshotFromStorage() and
// exportAllData() (both read from _memoryStore via load()) stay correct
// after we switch Supabase as the primary store.
function mirrorToMemory(key, value) {
  try { saveToMemory(key, value) } catch {}
}

// Block the fwos:datachanged listener from re-triggering when set() itself
// writes via save() — same pattern as before.
let _storeWriting = false

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { user, isLoaded } = useUser()
  const [data, setData] = useState(null)
  const [dirty, setDirty] = useState(false)
  const loadedRef = useRef(false)

  // ── Load all collections from Supabase in parallel ──────────
  const loadFromSupabase = useCallback(async () => {
    const results = await Promise.all(
      ORDERED_COLLECTIONS.map(name => getCollection(name))
    )

    let invNeedsSave = false
    const dataMap = {}

    ORDERED_COLLECTIONS.forEach((name, i) => {
      const raw = results[i] ?? DEFAULTS[name]
      const defaultIsArray = Array.isArray(DEFAULTS[name])
      // If Supabase returned something of the wrong type, fall back to default
      const coerced = (defaultIsArray && !Array.isArray(raw)) ? DEFAULTS[name] : raw
      const value = Array.isArray(coerced) ? applyTransforms(name, coerced) : coerced
      dataMap[name] = value

      // Mirror into _memoryStore for snapshot / export functions
      const key = COLLECTION_TO_KEY[name]
      if (key) mirrorToMemory(key, value)

      // Detect MF investments that needed the lumpsum migration
      if (name === 'investments' && Array.isArray(results[i])) {
        invNeedsSave = results[i].some(h => h.isMF && !h.investmentMode)
      }
    })

    setData(dataMap)

    // Persist the lumpsum-fixed list back to Supabase (once)
    if (invNeedsSave) setCollection('investments', dataMap.investments)
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return
    if (loadedRef.current) return
    loadedRef.current = true
    loadFromSupabase()
  }, [isLoaded, user, loadFromSupabase])

  // ── Handle backup restore / applyImport ─────────────────────
  // applyImport() in storage.js writes to _memoryStore then fires
  // fwos:datachanged. We catch that, read back from _memoryStore,
  // update state, and also write to Supabase so other devices see it.
  useEffect(() => {
    function handleExternalChange() {
      if (_storeWriting) return
      const newData = {}
      ORDERED_COLLECTIONS.forEach(name => {
        const key = COLLECTION_TO_KEY[name]
        if (!key) return
        const raw = load(key, DEFAULTS[name]) ?? DEFAULTS[name]
        const value = Array.isArray(raw) ? applyTransforms(name, raw) : raw
        newData[name] = value
        setCollection(name, value) // propagate import to Supabase
      })
      setData(newData)
    }

    window.addEventListener('fwos:datachanged', handleExternalChange)
    return () => window.removeEventListener('fwos:datachanged', handleExternalChange)
  }, [])

  // ── Real-time sync — update this session when another device writes ──
  useEffect(() => {
    if (!data) return // wait until initial load completes

    let subscription
    try {
      subscription = getSupabase()
        .channel('family-data-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'family_data',
          filter: `family_id=eq.saxena-family`,
        }, async (payload) => {
          const collection = payload.new?.collection || payload.old?.collection
          if (!collection || !COLLECTIONS.includes(collection)) return
          const fresh = await getCollection(collection)
          if (fresh === null) return
          const value = Array.isArray(fresh) ? applyTransforms(collection, fresh) : fresh
          setData(prev => prev ? { ...prev, [collection]: value } : prev)
          const key = COLLECTION_TO_KEY[collection]
          if (key) mirrorToMemory(key, value)
        })
        .subscribe()
    } catch {}

    return () => {
      if (subscription) {
        try { getSupabase().removeChannel(subscription) } catch {}
      }
    }
  }, [!!data]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── set(key, value) — identical signature to the old store ───
  // Dual-write: _memoryStore (for legacy functions) + Supabase (primary)
  const set = useCallback((key, value) => {
    const collection = KEY_TO_COLLECTION[key]
    if (!collection) return

    _storeWriting = true
    save(key, value) // → _memoryStore + async encrypt to localStorage + fires event
    _storeWriting = false

    setData(prev => prev ? { ...prev, [collection]: value } : prev)
    setDirty(true)

    setCollection(collection, value) // primary: Supabase
  }, [])

  // ── flush() — awaits pending localStorage writes (legacy compat) ─
  const flush = useCallback(async () => {
    await flushAll()
    setDirty(false)
  }, [])

  // ── reloadAll() — used after backup restore to refresh state ─
  const reloadAll = useCallback(() => {
    loadedRef.current = false
    loadFromSupabase()
  }, [loadFromSupabase])

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

// ── Selector hooks — same as before ────────────────────────────
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
export function useGoals()        { return useStore().data?.goals        ?? [] }
