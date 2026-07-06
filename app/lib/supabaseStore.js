import { getSupabase } from './supabase'

// Single family app — all members share one family_id row per collection
const FAMILY_ID = 'saxena-family'

// All collections stored in family_data table.
// Most are arrays; goldPrices and priceCache are plain objects.
export const COLLECTIONS = [
  'investments',
  'fixedIncome',
  'gold',
  'goldPrices',
  'loans',
  'realEstate',
  'insurance',
  'cashAssets',
  'liabilities',
  'snapshots',
  'priceCache',
  'goals',
  'members',
]

// ── Read a collection ──────────────────────────────────────────────────────
export async function getCollection(collection) {
  try {
    const { data, error } = await getSupabase()
      .from('family_data')
      .select('data')
      .eq('family_id', FAMILY_ID)
      .eq('collection', collection)
      .single()

    if (error) {
      // PGRST116 = no rows found — collection not yet written
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data?.data ?? null
  } catch (e) {
    console.error(`getCollection(${collection}) failed:`, e)
    return null
  }
}

// ── Write a collection (full replace) ─────────────────────────────────────
export async function setCollection(collection, value) {
  try {
    const { error } = await getSupabase()
      .from('family_data')
      .upsert(
        { family_id: FAMILY_ID, collection, data: value },
        { onConflict: 'family_id,collection' }
      )

    if (error) throw error
    return true
  } catch (e) {
    console.error(`setCollection(${collection}) failed:`, e)
    return false
  }
}

// ── Upsert one item inside an array collection ─────────────────────────────
export async function upsertItem(collection, item) {
  const items = (await getCollection(collection)) ?? []
  const arr = Array.isArray(items) ? items : []
  const idx = arr.findIndex(i => String(i.id) === String(item.id))
  const updated = idx >= 0
    ? arr.map((i, n) => n === idx ? item : i)
    : [...arr, item]
  return setCollection(collection, updated)
}

// ── Remove one item from an array collection ───────────────────────────────
export async function removeItem(collection, id) {
  const items = (await getCollection(collection)) ?? []
  const arr = Array.isArray(items) ? items : []
  return setCollection(collection, arr.filter(i => String(i.id) !== String(id)))
}

// ── User settings ──────────────────────────────────────────────────────────
export async function getUserSettings(userId) {
  try {
    const { data, error } = await getSupabase()
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data?.settings ?? null
  } catch (e) {
    console.error('getUserSettings failed:', e)
    return null
  }
}

export async function saveUserSettings(userId, settings) {
  try {
    const { error } = await getSupabase()
      .from('user_settings')
      .upsert({ user_id: userId, settings }, { onConflict: 'user_id' })

    if (error) throw error
    return true
  } catch (e) {
    console.error('saveUserSettings failed:', e)
    return false
  }
}
