export const dynamic = 'force-dynamic'

export async function GET() {
  const METALS_KEY = process.env.METALS_DEV_KEY

  // ── SOURCE 1: metals.dev (primary — INR rate directly) ──────────────────
  if (METALS_KEY) {
    try {
      const res = await fetch(
        `https://api.metals.dev/v1/latest?api_key=${METALS_KEY}&currency=INR&unit=g`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        // metals.dev returns data.metals.gold as London spot in INR per gram.
        // Indian retail price = spot × MCX_MULTIPLIER which accounts for:
        //   import duty 6% + AIDC 5% + GST 3% + MCX futures premium ~10%
        // Calibrated July 2026: spot ~₹11,500 × 1.245 ≈ ₹14,318 ≈ IBJA retail rate.
        // If prices drift >₹300 from Goodreturns/IBJA, recalibrate:
        //   new_multiplier = IBJA_price / metals.dev_spotINR
        const MCX_MULTIPLIER = 1.245
        const spot24k = data.metals?.gold
        if (spot24k && spot24k > 5000) {
          const price24k = Math.round(spot24k * MCX_MULTIPLIER)
          return Response.json({
            success: true,
            prices: {
              '24': price24k,
              '22': Math.round(price24k * 22 / 24),
              '18': Math.round(price24k * 18 / 24),
            },
            meta: {
              source: 'metals.dev + MCX premium adjustment',
              spotINR: Math.round(spot24k),
              multiplier: MCX_MULTIPLIER,
              fetchedAt: new Date().toISOString(),
              note: 'London spot in INR × import duty + AIDC + GST + MCX premium (×1.245). Matches IBJA retail within ₹100–200.',
            },
          })
        }
      } else {
        console.warn(`[gold-price] metals.dev error: ${res.status}`)
      }
    } catch (e) {
      console.error('[gold-price] metals.dev fetch failed:', e.message)
    }
  }

  // ── SOURCE 2: gold-api.com + frankfurter FX (free, no key) ─────────────
  try {
    const [goldRes, fxRes] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' }),
      fetch('https://api.frankfurter.app/latest?from=USD&to=INR', { cache: 'no-store' }),
    ])

    if (goldRes.ok && fxRes.ok) {
      const goldData = await goldRes.json()
      const fxData   = await fxRes.json()

      const pricePerOzUSD = goldData.price
      const usdToINR      = fxData.rates?.INR || 85.5
      const TROY_OZ_TO_GRAM = 31.1035

      if (pricePerOzUSD > 0) {
        const MCX_MULTIPLIER = 1.245
        const spotINR  = (pricePerOzUSD / TROY_OZ_TO_GRAM) * usdToINR
        const price24k = Math.round(spotINR * MCX_MULTIPLIER)

        return Response.json({
          success: true,
          prices: {
            '24': price24k,
            '22': Math.round(price24k * 22 / 24),
            '18': Math.round(price24k * 18 / 24),
          },
          meta: {
            source: 'gold-api.com + frankfurter.app FX',
            spotUSD: Math.round(pricePerOzUSD * 100) / 100,
            usdToINR: Math.round(usdToINR * 100) / 100,
            spotINR: Math.round(spotINR),
            multiplier: MCX_MULTIPLIER,
            fetchedAt: new Date().toISOString(),
            note: 'metals.dev unavailable. USD spot + live FX + India duties (×1.245) applied.',
          },
        })
      }
    } else {
      console.warn(`[gold-price] gold-api.com: ${goldRes.status}, frankfurter: ${fxRes.status}`)
    }
  } catch (e) {
    console.error('[gold-price] gold-api.com fetch failed:', e.message)
  }

  // ── SOURCE 3: all sources failed ────────────────────────────────────────
  return Response.json({
    success: false,
    error: 'All gold price sources unavailable. Enter price manually.',
    meta: { fetchedAt: new Date().toISOString() },
  }, { status: 503 })
}
