import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Stock price via Yahoo Finance (server-side — no CORS)
async function tryYahooHost(ticker, host) {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`${host}: ${res.status}`)
  const data = await res.json()
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (price == null) throw new Error('No price in response')
  return price
}

async function fetchStock(ticker) {
  // If ticker has no exchange suffix, try .NS (NSE) then .BO (BSE)
  const hasSuffix = ticker.includes('.')
  const candidates = hasSuffix ? [ticker] : [`${ticker}.NS`, `${ticker}.BO`]
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']

  for (const t of candidates) {
    for (const host of hosts) {
      try { return await tryYahooHost(t, host) } catch {}
    }
  }
  throw new Error(`No price found for ${ticker}`)
}

// Mutual fund latest NAV via MFAPI
async function fetchMF(mfCode) {
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(mfCode)}/latest`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`MFAPI: ${res.status}`)
  const data = await res.json()
  const nav = parseFloat(data?.data?.[0]?.nav)
  if (isNaN(nav)) throw new Error('No NAV in response')
  return nav
}

// Historical NAV for a specific date (DD-MM-YYYY in MFAPI)
async function fetchMFHistorical(mfCode, dateStr) {
  const [y, m, d] = dateStr.split('-')
  const mfapiDate = `${d}-${m}-${y}`
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(mfCode)}`, {
    next: { revalidate: 86400 },
  })
  if (!res.ok) throw new Error(`MFAPI: ${res.status}`)
  const data = await res.json()
  // Find exact date or fall back to nearest earlier entry
  const entry = data?.data?.find(e => e.date === mfapiDate) ?? data?.data?.[0]
  if (!entry) throw new Error('No NAV data for date')
  const nav = parseFloat(entry.nav)
  if (isNaN(nav)) throw new Error('Invalid NAV')
  const [nd, nm, ny] = entry.date.split('-')
  return { nav, resolvedDate: `${ny}-${nm}-${nd}` }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const mf = searchParams.get('mf')
  const date = searchParams.get('date')

  if (!ticker && !mf) {
    return NextResponse.json({ error: 'Pass ?ticker= or ?mf=' }, { status: 400 })
  }

  try {
    if (mf && date) {
      const { nav, resolvedDate } = await fetchMFHistorical(mf, date)
      return NextResponse.json({ nav, date: resolvedDate })
    }
    const price = ticker ? await fetchStock(ticker) : await fetchMF(mf)
    return NextResponse.json({ price })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
