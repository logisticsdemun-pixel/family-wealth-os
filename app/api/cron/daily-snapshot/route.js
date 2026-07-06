import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { computeAllMetrics, computeMemberMetrics } from '../../../lib/metrics'
import { MEMBERS } from '../../../lib/format'

export const runtime = 'nodejs'

const FAMILY_ID = 'saxena-family'
const MAX_SNAPSHOTS = 365

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function loadCollection(name) {
  const { data, error } = await getServiceClient()
    .from('family_data')
    .select('data')
    .eq('family_id', FAMILY_ID)
    .eq('collection', name)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.data ?? null
}

async function saveSnapshots(snapshots) {
  const { error } = await getServiceClient()
    .from('family_data')
    .upsert(
      { family_id: FAMILY_ID, collection: 'snapshots', data: snapshots },
      { onConflict: 'family_id,collection' }
    )
  if (error) throw error
}

// GET — called by Vercel cron at schedule "45 17 * * *" (11:15pm IST)
export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const expected   = process.env.CRON_SECRET

  const ok = !!expected && timingSafeEqualStr(authHeader, `Bearer ${expected}`)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = new Date().toISOString().slice(0, 10)

    // 1. Load all collections needed for metrics
    const [
      investments, fixedIncome, gold, goldPrices,
      loans, liabilities, cashAssets, realEstate,
      rawSnapshots,
    ] = await Promise.all([
      loadCollection('investments'),
      loadCollection('fixedIncome'),
      loadCollection('gold'),
      loadCollection('goldPrices'),
      loadCollection('loans'),
      loadCollection('liabilities'),
      loadCollection('cashAssets'),
      loadCollection('realEstate'),
      loadCollection('snapshots'),
    ])

    const data = {
      investments:  Array.isArray(investments)  ? investments  : [],
      fixedIncome:  Array.isArray(fixedIncome)  ? fixedIncome  : [],
      gold:         Array.isArray(gold)          ? gold          : [],
      goldPrices:   goldPrices   ?? { 24: 15496, 22: 14205, 18: 9386 },
      loans:        Array.isArray(loans)         ? loans         : [],
      liabilities:  Array.isArray(liabilities)   ? liabilities   : [],
      cashAssets:   Array.isArray(cashAssets)    ? cashAssets    : [],
      realEstate:   Array.isArray(realEstate)    ? realEstate    : [],
    }

    // 2. Compute family-level metrics
    const family = computeAllMetrics(data)
    const { netWorth, totalAssets, liabilities: totalLiab } = family

    if (!netWorth || netWorth <= 0) {
      return NextResponse.json({ skipped: true, reason: 'netWorth is zero or negative — likely no data loaded' })
    }

    // 3. Validate against previous snapshot (reject >50% swing)
    const snapshots = Array.isArray(rawSnapshots) ? rawSnapshots : []
    const previous  = snapshots
      .filter(s => s.date !== today && s.netWorth > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0]

    if (previous) {
      const delta = Math.abs((netWorth - previous.netWorth) / previous.netWorth) * 100
      if (delta > 50) {
        console.warn(`[daily-snapshot] Outlier rejected: ${delta.toFixed(1)}% change from ${previous.netWorth} to ${netWorth}`)
        return NextResponse.json({
          skipped: true,
          reason:  `change of ${delta.toFixed(1)}% vs previous snapshot exceeds 50% guard`,
          previous: previous.netWorth,
          computed: netWorth,
        })
      }
    }

    // 4. Compute per-member breakdown
    const byMember = {}
    for (const member of MEMBERS) {
      const mx = computeMemberMetrics(data, member)
      byMember[member] = {
        netWorth:    Math.round(mx.netWorth),
        investments: Math.round(mx.investments),
        gold:        Math.round(mx.gold),
        realEstate:  Math.round(mx.realEstate),
        cash:        Math.round(mx.cash),
        liabilities: Math.round(mx.liabilities),
      }
    }

    // 5. Build byCategory
    const byCategory = {
      investments: Math.round(family.investments),
      gold:        Math.round(family.gold),
      realEstate:  Math.round(family.realEstate),
      cash:        Math.round(family.cash),
      liabilities: Math.round(totalLiab),
    }

    // 6. Build priceCache snapshot (ticker/mfCode → currentPrice)
    const priceSnap = {}
    for (const inv of data.investments) {
      if (inv.currentPrice != null) {
        const key = inv.isMF ? inv.mfCode : inv.ticker
        if (key) priceSnap[key] = inv.currentPrice
      }
    }

    // 7. Upsert snapshot for today
    const entry = {
      date:        today,
      netWorth:    Math.round(netWorth),
      totalAssets: Math.round(totalAssets),
      liabilities: Math.round(totalLiab),
      byMember,
      byCategory,
      priceCache:  priceSnap,
    }

    const existingIdx = snapshots.findIndex(s => s.date === today)
    const updated = existingIdx >= 0
      ? snapshots.map((s, i) => i === existingIdx ? entry : s)
      : [...snapshots, entry]

    const sorted = updated
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_SNAPSHOTS)

    await saveSnapshots(sorted)

    console.log(`[daily-snapshot] Saved snapshot for ${today}: netWorth=${Math.round(netWorth)}`)
    return NextResponse.json({ ok: true, date: today, netWorth: Math.round(netWorth) })

  } catch (e) {
    console.error('[daily-snapshot] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
