export async function GET() {
  try {
    const goldRes = await fetch(
      'https://api.gold-api.com/price/XAU',
      {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 3600 },
      }
    )

    if (!goldRes.ok) {
      throw new Error(`Gold API error: ${goldRes.status}`)
    }

    const goldData = await goldRes.json()
    const pricePerOzUSD = goldData.price

    if (!pricePerOzUSD || isNaN(pricePerOzUSD)) {
      throw new Error('Invalid price returned from gold API')
    }

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
    const price24kPerGramUSD = pricePerOzUSD / gramsPerOz
    const price24kINR = Math.round(price24kPerGramUSD * usdToINR)
    const price22kINR = Math.round(price24kINR * 22 / 24)
    const price18kINR = Math.round(price24kINR * 18 / 24)

    return Response.json({
      success: true,
      prices: {
        24: price24kINR,
        22: price22kINR,
        18: price18kINR,
      },
      meta: {
        spotPriceUSD: Math.round(pricePerOzUSD * 100) / 100,
        usdToINR: Math.round(usdToINR * 100) / 100,
        source: 'gold-api.com (international spot price)',
        sourceUrl: 'https://gold-api.com',
        note: 'International spot price in USD converted to INR. ' +
              'Indian retail prices include import duty (~15%), ' +
              'GST (3%), and making charges. Retail prices are ' +
              'typically 15-20% higher than this spot rate.',
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
