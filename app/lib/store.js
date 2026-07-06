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
import { DEFAULT_MEMBERS } from './members'

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
  [KEYS.MEMBERS]:      'members',
}

const COLLECTION_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_COLLECTION).map(([k, v]) => [v, k])
)

const ORDERED_COLLECTIONS = [
  'investments', 'fixedIncome', 'gold', 'goldPrices',
  'loans', 'realEstate', 'insurance', 'cashAssets',
  'liabilities', 'snapshots', 'priceCache', 'goals', 'members',
]

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
  members: DEFAULT_MEMBERS,
}

function applyTransforms(name, raw) {
  if (!Array.isArray(raw)) return raw
  if (name === 'investments') {
    return raw.map(h => (h.isMF && !h.investmentMode)
      ? { ...h, investmentMode: 'lumpsum' } : h)
  }
  if (name === 'cashAssets')  return raw.filter(a => a.member)
  if (name === 'liabilities') return raw.filter(l => l.member)
  return raw
}

// Mirror into _memoryStore so takeSnapshotFromStorage / exportAllData stay correct
function mirrorToMemory(key, value) {
  try { saveToMemory(key, value) } catch {}
}

// Read all collections from _memoryStore (already decrypted by autoUnlock)
// Used as fallback when Supabase has no data yet
function readFromLocalStorage() {
  const rawInv = load(KEYS.INVESTMENTS, DEFAULTS.investments) ?? []
  let invDirty = false
  const investments = rawInv.map(h => {
    if (h.isMF && !h.investmentMode) { invDirty = true; return { ...h, investmentMode: 'lumpsum' } }
    return h
  })
  if (invDirty) save(KEYS.INVESTMENTS, investments)

  return {
    investments,
    fixedIncome:  load(KEYS.FIXED_INCOME, DEFAULTS.fixedIncome)  ?? DEFAULTS.fixedIncome,
    gold:         load(KEYS.GOLD,          DEFAULTS.gold)          ?? DEFAULTS.gold,
    goldPrices:   load(KEYS.GOLD_PRICES,   DEFAULTS.goldPrices)   ?? DEFAULTS.goldPrices,
    loans:        load(KEYS.LOANS,         DEFAULTS.loans)         ?? DEFAULTS.loans,
    realEstate:   load(KEYS.REAL_ESTATE,   DEFAULTS.realEstate)   ?? DEFAULTS.realEstate,
    insurance:    load(KEYS.INSURANCE,     DEFAULTS.insurance)     ?? DEFAULTS.insurance,
    cashAssets:  (load(KEYS.CASH_ASSETS,   DEFAULTS.cashAssets)   ?? DEFAULTS.cashAssets).filter(a => a.member),
    liabilities: (load(KEYS.LIABILITIES,   DEFAULTS.liabilities)  ?? DEFAULTS.liabilities).filter(l => l.member),
    snapshots:    load(KEYS.SNAPSHOTS,     DEFAULTS.snapshots)     ?? DEFAULTS.snapshots,
    priceCache:   load(KEYS.PRICE_CACHE,   DEFAULTS.priceCache)   ?? DEFAULTS.priceCache,
    goals:        load(KEYS.GOALS,         DEFAULTS.goals)         ?? DEFAULTS.goals,
    members:      load(KEYS.MEMBERS,       DEFAULTS.members)       ?? DEFAULTS.members,
  }
}

let _storeWriting = false

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { user, isLoaded } = useUser()
  const [data, setData] = useState(null)
  const [dirty, setDirty] = useState(false)
  // 'supabase' | 'localStorage' | null
  // Exposed so AppShell knows whether to show the migration helper
  const [dataSource, setDataSource] = useState(null)
  const [hasSupabaseData, setHasSupabaseData] = useState(false)
  const loadedRef = useRef(false)

  const loadAll = useCallback(async () => {
    // 1. Fetch all collections from Supabase in parallel
    const results = await Promise.all(
      ORDERED_COLLECTIONS.map(name => getCollection(name))
    )

    // 2. Determine if Supabase has any real data
    const hasSupabaseData = results.some((r, i) => {
      const isArr = Array.isArray(DEFAULTS[ORDERED_COLLECTIONS[i]])
      return isArr ? (Array.isArray(r) && r.length > 0) : r !== null
    })

    if (hasSupabaseData) {
      // ── Path A: use Supabase data ────────────────────────────
      let invNeedsSave = false
      const dataMap = {}

      ORDERED_COLLECTIONS.forEach((name, i) => {
        const raw = results[i] ?? DEFAULTS[name]
        const defaultIsArray = Array.isArray(DEFAULTS[name])
        const coerced = (defaultIsArray && !Array.isArray(raw)) ? DEFAULTS[name] : raw
        const value = Array.isArray(coerced) ? applyTransforms(name, coerced) : coerced
        dataMap[name] = value
        const key = COLLECTION_TO_KEY[name]
        if (key) mirrorToMemory(key, value)
        if (name === 'investments' && Array.isArray(results[i])) {
          invNeedsSave = results[i].some(h => h.isMF && !h.investmentMode)
        }
      })

      setData(dataMap)
      setDataSource('supabase')
      setHasSupabaseData(true)
      console.log('Store loaded from Supabase. Data keys:', Object.keys(dataMap))
      console.log('Collection sizes:', { investments: dataMap.investments?.length, gold: dataMap.gold?.length, realEstate: dataMap.realEstate?.length })
      if (invNeedsSave) setCollection('investments', dataMap.investments)
    } else {
      // ── Path B: Supabase empty — read from encrypted localStorage ──
      // _memoryStore is already populated by autoUnlock() before AppProvider mounts.
      // Do NOT mirror back to memory here — that would overwrite real data with seed defaults.
      const dataMap = readFromLocalStorage()
      setData(dataMap)
      setDataSource('localStorage')
      setHasSupabaseData(false)
      console.log('Store loaded from localStorage. Data keys:', Object.keys(dataMap))
      console.log('Collection sizes:', { investments: dataMap.investments?.length, gold: dataMap.gold?.length, realEstate: dataMap.realEstate?.length })
    }
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return
    if (loadedRef.current) return
    loadedRef.current = true
    loadAll()
  }, [isLoaded, user, loadAll])

  // ── Handle backup restore / applyImport ─────────────────────────────────
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
        setCollection(name, value)
      })
      setData(newData)
    }

    window.addEventListener('fwos:datachanged', handleExternalChange)
    return () => window.removeEventListener('fwos:datachanged', handleExternalChange)
  }, [])

  // ── Real-time sync ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return

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

  // ── set(key, value) ──────────────────────────────────────────────────────
  const set = useCallback((key, value) => {
    const collection = KEY_TO_COLLECTION[key]
    if (!collection) return

    _storeWriting = true
    save(key, value)
    _storeWriting = false

    setData(prev => prev ? { ...prev, [collection]: value } : prev)
    setDirty(true)
    setCollection(collection, value)
  }, [])

  // ── flush() ──────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    await flushAll()
    setDirty(false)
  }, [])

  // ── reloadAll() ──────────────────────────────────────────────────────────
  const reloadAll = useCallback(() => {
    loadedRef.current = false
    loadAll()
  }, [loadAll])

  // ── migrateToSupabase() — reads already-loaded data, writes to Supabase ─
  // When data[collection] is empty (e.g. Supabase had no realEstate row and
  // fell back to seed defaults), we also try the encrypted localStorage via
  // load() so the original user data is not silently skipped.
  const migrateToSupabase = useCallback(async () => {
    if (!data) return { error: 'No data in memory' }

    const results = {}

    for (const collection of ORDERED_COLLECTIONS) {
      let value = data[collection]

      // If the in-memory value is empty, check if localStorage has real data
      const storageKey = COLLECTION_TO_KEY[collection]
      const inMemEmpty = Array.isArray(value)
        ? value.length === 0
        : !value || Object.keys(value).length === 0

      if (inMemEmpty && storageKey) {
        const fromLocal = load(storageKey, null)
        const localHasData = Array.isArray(fromLocal)
          ? fromLocal.length > 0
          : fromLocal !== null && fromLocal !== undefined
        if (localHasData) {
          console.log(`[migrate] ${collection}: in-memory empty, using localStorage fallback (${Array.isArray(fromLocal) ? fromLocal.length + ' items' : 'object'})`)
          value = fromLocal
        }
      }

      const count = Array.isArray(value) ? value.length : (typeof value === 'object' && value ? Object.keys(value).length : 0)
      console.log(`[migrate] ${collection}: ${Array.isArray(value) ? count + ' items' : typeof value}`)

      const isEmpty = Array.isArray(value)
        ? value.length === 0
        : !value || Object.keys(value).length === 0

      if (isEmpty) {
        results[collection] = 'empty'
        continue
      }

      try {
        await setCollection(collection, value)
        results[collection] = `✓ ${Array.isArray(value) ? count + ' items' : 'object'}`
      } catch (e) {
        results[collection] = `✗ ${e.message}`
      }
    }

    console.log('=== MIGRATION RESULTS ===')
    console.log(JSON.stringify(results, null, 2))
    return results
  }, [data])

  return (
    <AppContext.Provider value={{
      data, set, reloadAll, dirty, flush,
      dataSource, migrateToSupabase, hasSupabaseData,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useStore must be inside AppProvider')
  return ctx
}

// ── Selector hooks ───────────────────────────────────────────────────────────
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
export function useMembers()      { return useStore().data?.members      ?? DEFAULT_MEMBERS }
