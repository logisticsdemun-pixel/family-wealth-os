import { createClient } from '@supabase/supabase-js'
import { getInstalmentDate, getAllotmentDate } from './holidays'

const FAMILY_ID = 'saxena-family'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function readInvestments() {
  const { data, error } = await getServiceClient()
    .from('family_data')
    .select('data')
    .eq('family_id', FAMILY_ID)
    .eq('collection', 'investments')
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return Array.isArray(data?.data) ? data.data : null
}

async function writeInvestments(investments) {
  const { error } = await getServiceClient()
    .from('family_data')
    .upsert(
      { family_id: FAMILY_ID, collection: 'investments', data: investments },
      { onConflict: 'family_id,collection' }
    )
  if (error) throw error
}

function getCurrentSIPAmount(sip) {
  const base = sip.monthlyAmount || sip.amount || sip.sipAmount || 0
  if (!sip.hasStepUp || !sip.stepUpPct || !sip.startDate) return base
  const yearsElapsed = Math.floor(
    (Date.now() - new Date(sip.startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  )
  if (yearsElapsed <= 0) return base
  return Math.round(base * Math.pow(1 + sip.stepUpPct / 100, yearsElapsed))
}

async function fetchMFNav(mfCode) {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(mfCode)}/latest`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    const nav = parseFloat(json?.data?.[0]?.nav)
    return isNaN(nav) ? null : nav
  } catch {
    return null
  }
}

export async function processPendingSIPAllotments() {
  const investments = await readInvestments()
  if (!investments) return { processed: 0, skipped: 0, error: 'No investments in Supabase' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString().slice(0, 10)
  const monthKey = todayISO.slice(0, 7) // YYYY-MM

  let processed = 0
  let skipped = 0
  const updated = investments.map(inv => ({ ...inv }))

  for (let i = 0; i < updated.length; i++) {
    const inv = updated[i]
    const sip = inv.sip

    if (inv.investmentMode !== 'sip' || !sip || sip.status !== 'Active') {
      skipped++
      continue
    }

    if (!sip.instalmentDate) {
      skipped++
      continue
    }

    // Already processed this month
    if (sip.lastAllotmentDate && sip.lastAllotmentDate.startsWith(monthKey)) {
      skipped++
      continue
    }

    // Check if today >= allotment date (T+1 business day after instalmentDate)
    const instDate = getInstalmentDate(sip.instalmentDate, today.getMonth(), today.getFullYear())
    const allotDate = getAllotmentDate(instDate)
    if (today < allotDate) {
      skipped++
      continue
    }

    const amount = getCurrentSIPAmount(sip)
    let nav = null
    let unitsAdded = 0
    let note = null

    if (inv.mfCode) {
      nav = await fetchMFNav(inv.mfCode)
      if (nav) {
        unitsAdded = parseFloat((amount / nav).toFixed(4))
      } else {
        note = 'NAV fetch failed'
      }
    }

    const allotmentEntry = {
      date: todayISO,
      amount,
      nav,
      units: unitsAdded,
      ...(note ? { note } : {}),
    }

    updated[i] = {
      ...inv,
      ...(nav ? { units: (inv.units || 0) + unitsAdded, currentPrice: nav } : {}),
      sip: {
        ...sip,
        lastAllotmentDate: todayISO,
        allotmentHistory: [...(sip.allotmentHistory || []), allotmentEntry],
      },
    }

    console.log(`[sipProcessor] ${inv.name}: amount=${amount} nav=${nav} units=${unitsAdded}`)
    processed++
  }

  if (processed > 0) {
    await writeInvestments(updated)
  }

  return { processed, skipped, date: todayISO }
}
