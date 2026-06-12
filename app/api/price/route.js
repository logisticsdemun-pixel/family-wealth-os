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

// Mutual fund NAV via MFAPI
async function fetchMF(mfCode) {
  const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(mfCode)}/latest`, {
    next: { revalidate: 3600 }, // NAVs update once per day
  })
  if (!res.ok) throw new Error(`MFAPI: ${res.status}`)
  const data = await res.json()
  const nav = parseFloat(data?.data?.[0]?.nav)
  if (isNaN(nav)) throw new Error('No NAV in response')
  return nav
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const mf = searchParams.get('mf')

  if (!ticker && !mf) {
    return NextResponse.json({ error: 'Pass ?ticker= or ?mf=' }, { status: 400 })
  }

  try {
    const price = ticker ? await fetchStock(ticker) : await fetchMF(mf)
    return NextResponse.json({ price })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
