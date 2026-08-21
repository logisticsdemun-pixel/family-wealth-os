export const dynamic = 'force-dynamic'

export async function GET() {
  const METALS_KEY = process.env.METALS_DEV_KEY

  // ── SOURCE 1: metals.dev (primary — reads ibja_gold directly) ───────────
  // metals.dev returns ibja_gold and mcx_gold in the same payload as London
  // spot. Use ibja_gold as-is — no multiplier needed.  Recalibration note:
  // the old approach (data.metals.gold × 1.245) overshot by ~10% in Aug 2026
  // because the multiplier was stale. ibja_gold is always the exact IBJA
  // retail rate; no estimation required.
  if (METALS_KEY) {
    try {
      const res = await fetch(
        `https://api.metals.dev/v1/latest?api_key=${METALS_KEY}&currency=INR&unit=g`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const data = await res.json()
        // Prefer ibja_gold (IBJA retail, exact). Fall back to mcx_gold.
        const price24k = data.metals?.ibja_gold || data.metals?.mcx_gold
        if (price24k && price24k > 5000) {
          return Response.json({
            success: true,
            prices: {
              '24': Math.round(price24k),
              '22': Math.round(price24k * 22 / 24),
              '18': Math.round(price24k * 18 / 24),
            },
            meta: {
              source: 'metals.dev (ibja_gold)',
              ibjaINR:  Math.round(price24k),
              spotINR:  Math.round(data.metals?.gold || 0),
              fetchedAt: new Date().toISOString(),
              note: 'IBJA retail rate read directly from metals.dev — no multiplier applied.',
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
  // Multiplier recalibrated 2026-08-21: London spot ₹14,147/g, IBJA ₹15,950/g
  // → real ratio 1.1274. Use 1.13 (slight headroom for dealer spread).
  // If prices drift >₹300 from IBJA, recalibrate:
  //   new_multiplier = IBJA_price / spotINR_per_gram
  try {
    const [goldRes, fxRes] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' }),
      fetch('https://api.frankfurter.app/latest?from=USD&to=INR', { cache: 'no-store' }),
    ])

    if (goldRes.ok && fxRes.ok) {
      const goldData = await goldRes.json()
      const fxData   = await fxRes.json()

      const pricePerOzUSD   = goldData.price
      const usdToINR        = fxData.rates?.INR || 85.5
      const TROY_OZ_TO_GRAM = 31.1035

      if (pricePerOzUSD > 0) {
        const MCX_MULTIPLIER = 1.13
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
            spotUSD:   Math.round(pricePerOzUSD * 100) / 100,
            usdToINR:  Math.round(usdToINR * 100) / 100,
            spotINR:   Math.round(spotINR),
            multiplier: MCX_MULTIPLIER,
            fetchedAt: new Date().toISOString(),
            note: 'metals.dev unavailable. USD spot + live FX + India duties (×1.13, recalibrated 2026-08-21).',
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
