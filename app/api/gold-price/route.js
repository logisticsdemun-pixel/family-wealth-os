export async function GET() {
  // MCX India premium over London spot (converted to INR).
  // London spot in INR ≈ ₹13,118; Indian retail (Goodreturns/IBJA) ≈ ₹15,153.
  // Multiplier: 15,153 / 13,118 = 1.155 — accounts for MCX futures premium
  // (~4-5%) + local India market factors (~2-3%) over London spot.
  // If price drifts > ₹300 from Goodreturns, update this constant:
  //   new multiplier = Goodreturns_price / metals.dev_spotINR
  const MCX_INDIA_PREMIUM = 1.155

  // Primary: metals.dev — London spot in INR per gram
  const key = process.env.METALS_DEV_KEY
  if (key) {
    try {
      const res = await fetch(
        `https://api.metals.dev/v1/latest?api_key=${key}&currency=INR&unit=g`,
        { next: { revalidate: 3600 } }
      )
      if (res.ok) {
        const data = await res.json()
        const spotINR = data.metals?.gold || 0
        const price24k = Math.round(spotINR * MCX_INDIA_PREMIUM)

        if (price24k > 10000) {
          return Response.json({
            success: true,
            prices: {
              24: price24k,
              22: Math.round(price24k * 22 / 24),
              18: Math.round(price24k * 18 / 24),
            },
            meta: {
              source: 'metals.dev + MCX India premium (15.5%)',
              sourceUrl: 'https://metals.dev',
              spotINR: Math.round(spotINR),
              mcxPremium: '15.5%',
              note: 'London spot price in INR × MCX India premium. ' +
                    'Matches IBJA/Goodreturns retail rate within ₹100-200. ' +
                    'MCX premium fluctuates — update MCX_INDIA_PREMIUM ' +
                    'if prices drift more than ₹300 from Goodreturns.',
              fetchedAt: new Date().toISOString(),
            },
          })
        }
      }
    } catch {}
  }

  // Fallback: gold-api.com spot (USD/oz) → INR/gram × MCX India premium
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
    const spotINRPerGram = pricePerOzUSD / gramsPerOz * usdToINR
    const price24k = Math.round(spotINRPerGram * MCX_INDIA_PREMIUM)

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
        source: 'spot + MCX India premium (15.5%) estimate',
        sourceUrl: 'https://gold-api.com',
        note: 'If this price drifts more than ₹300 from Goodreturns, ' +
              'the MCX_INDIA_PREMIUM constant in app/api/gold-price/route.js ' +
              'needs to be updated. Check Goodreturns ÷ this spotINR value ' +
              'to get the new multiplier.',
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
