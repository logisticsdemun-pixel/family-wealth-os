export async function GET() {
  // Primary: metals.dev — IBJA benchmark rate
  const key = process.env.METALS_DEV_KEY
  if (key) {
    try {
      const res = await fetch(
        `https://api.metals.dev/v1/latest?api_key=${key}&currency=INR&unit=g`,
        { next: { revalidate: 3600 } }
      )
      if (res.ok) {
        const d = await res.json()
        const price24k = d?.metals?.gold
        if (price24k && !isNaN(price24k)) {
          return Response.json({
            success: true,
            prices: {
              24: Math.round(price24k),
              22: Math.round(price24k * 22 / 24),
              18: Math.round(price24k * 18 / 24),
            },
            meta: {
              source: 'metals.dev (IBJA benchmark)',
              sourceUrl: 'https://metals.dev',
              fetchedAt: new Date().toISOString(),
            },
          })
        }
      }
    } catch {}
  }

  // Fallback: international spot price + Indian duties formula
  // Duties: import duty 6% + AIDC cess 5% + GST 3% ≈ ×1.1459
  try {
    const goldRes = await fetch(
      'https://api.gold-api.com/price/XAU',
      { headers: { 'Content-Type': 'application/json' }, next: { revalidate: 3600 } }
    )
    if (!goldRes.ok) throw new Error(`Gold API error: ${goldRes.status}`)

    const goldData = await goldRes.json()
    const pricePerOzUSD = goldData.price
    if (!pricePerOzUSD || isNaN(pricePerOzUSD)) throw new Error('Invalid price returned from gold API')

    const fxRes = await fetch(
      'https://api.frankfurter.app/latest?from=USD&to=INR',
      { next: { revalidate: 3600 } }
    )
    let usdToINR = 84.5
    if (fxRes.ok) {
      const fxData = await fxRes.json()
      usdToINR = fxData.rates?.INR || 84.5
    }

    const gramsPerOz = 31.1035
    const DUTIES = 1.06 * 1.05 * 1.03  // import duty + AIDC cess + GST
    const spotPerGramINR = pricePerOzUSD / gramsPerOz * usdToINR
    const price24k = Math.round(spotPerGramINR * DUTIES)

    return Response.json({
      success: true,
      prices: {
        24: price24k,
        22: Math.round(price24k * 22 / 24),
        18: Math.round(price24k * 18 / 24),
      },
      meta: {
        spotPriceUSD: Math.round(pricePerOzUSD * 100) / 100,
        usdToINR: Math.round(usdToINR * 100) / 100,
        source: 'spot + duties estimate',
        sourceUrl: 'https://gold-api.com',
        note: 'International spot price × import duty (6%) + AIDC cess (5%) + GST (3%). Retail prices may vary.',
        fetchedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
      fallback: "Update gold prices manually using today's rate from IBJA (ibja.co) or your jeweller.",
    }, { status: 502 })
  }
}
