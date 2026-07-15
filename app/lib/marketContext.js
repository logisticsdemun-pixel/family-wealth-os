// Static market knowledge snapshot — July 2026.
// All numbers are hard-coded point-in-time references for NARRATIVE CONTEXT only.
// The advisor MUST use computed family data for all actionable numbers and figures.
// Recalibrate this file whenever you want to update the market snapshot.

export const STATIC_MARKET_KNOWLEDGE = {
  asOf: 'July 2026',
  macroIndia: {
    repoRate: 6.25,       // RBI repo rate %
    cpi: 4.2,             // CPI YoY %
    gdpGrowth: 6.8,       // FY26 GDP growth estimate %
    tenYearGSec: 6.85,    // 10-year G-Sec yield %
    usdInr: 84.5,         // approximate USD/INR
  },
  equity: {
    nifty50Level: 24800,
    niftyPE: 22.4,        // trailing P/E
    niftyPEComment: 'slightly above long-term average of ~20×',
    marketPhase: 'consolidation after the 2025 bull run',
    sectorOutlook: {
      overweight:  ['Financials', 'IT', 'Pharma', 'Defence'],
      neutral:     ['FMCG', 'Auto', 'Cement'],
      underweight: ['Metals', 'PSU Banks'],
    },
  },
  gold: {
    narrativeContext: 'Near multi-year highs driven by global uncertainty and sustained central-bank buying',
    outlook: 'Cautious hold; consider partial rebalancing if gold exceeds 15% of total portfolio',
  },
  fixedIncome: {
    fdRates: '6.5–7.5% for 1–3 year tenors at major Indian banks',
    outlook: 'RBI rate-cut cycle expected in H2 2026 — consider locking in longer tenors before rates fall',
    debtFundNote: 'Medium-to-long duration debt funds may benefit as rates ease',
  },
  realEstate: {
    sentiment: 'Residential demand robust in Tier-1 cities; luxury segment outperforming',
    outlook: 'Highly illiquid asset class — high concentration constrains financial flexibility and emergency access',
  },
}

export function buildMarketContextSummary() {
  const m = STATIC_MARKET_KNOWLEDGE
  const eq = m.equity
  const fi = m.fixedIncome
  return `INDIAN MARKET CONTEXT — ${m.asOf} (static snapshot for narrative grounding only):

Macro:
  RBI Repo Rate: ${m.macroIndia.repoRate}%
  CPI Inflation: ${m.macroIndia.cpi}%
  GDP Growth Estimate: ${m.macroIndia.gdpGrowth}%
  10-Year G-Sec Yield: ${m.macroIndia.tenYearGSec}%
  USD/INR: ~${m.macroIndia.usdInr}

Equity:
  Nifty 50: ~${eq.nifty50Level.toLocaleString('en-IN')} (PE ${eq.niftyPE}×, ${eq.niftyPEComment})
  Market phase: ${eq.marketPhase}
  Sector overweight:  ${eq.sectorOutlook.overweight.join(', ')}
  Sector neutral:     ${eq.sectorOutlook.neutral.join(', ')}
  Sector underweight: ${eq.sectorOutlook.underweight.join(', ')}

Gold:
  ${m.gold.narrativeContext}.
  Outlook: ${m.gold.outlook}.

Fixed Income:
  FD Rates: ${fi.fdRates}.
  Outlook: ${fi.outlook}.
  Debt funds: ${fi.debtFundNote}.

Real Estate:
  ${m.realEstate.sentiment}.
  ${m.realEstate.outlook}.

CRITICAL RULE: Every specific rupee figure, percentage, or count you cite in your response MUST come from the family financial data provided to you — never from this market snapshot or your training memory. Use this context only to add qualitative colour and explain broader trends.`
}
