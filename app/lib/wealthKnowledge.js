// Frameworks from published personal finance literature,
// encoded as deterministic thresholds and rules.

export const THRESHOLDS = {

  // Monika Halan — "Let's Talk Money"
  // The Three Boxes: Protect → Grow → Income (in that order)
  halan: {
    emergencyFundMonthsMinimum: 6,
    emergencyFundMonthsAmber: 3,
    termLifeCoverMultiple: 10,              // 10× annual gross income
    healthCoverMinimumPerPerson: 1000000,   // ₹10L
    sipMinimumPctOfIncome: 20,             // 20% of gross household income
    fdMaxPctOfPortfolio: 15,               // FDs should not dominate
    goalInstruments: {
      under1Year:         'Liquid fund or FD',
      oneToThreeYears:    'Short-duration debt fund',
      threeToSevenYears:  'Balanced / hybrid fund',
      sevenPlus:          'Equity SIP (index fund)',
    },
  },

  // Benjamin Graham — "The Intelligent Investor"
  graham: {
    defensiveMinEquityPct: 25,        // never below 25% equity
    defensiveMaxEquityPct: 75,        // never above 75% equity
    rebalanceDriftTriggerPct: 5,      // rebalance when drifts >5% from target
  },

  // Morgan Housel — "The Psychology of Money"
  housel: {
    maxLiabilityToAssetRatio: 0.40,   // liabilities > 40% of assets = risk
    minHoldingPeriodYears: 5,         // < 5 years in equity = short horizon risk
  },

  // Peter Lynch — "One Up On Wall Street"
  lynch: {
    maxSingleStockPctOfEquity: 20,    // no single stock > 20% of equity holdings
    preferBusinessesYouUnderstand: true,
  },

  // John Bogle — "The Little Book of Common Sense Investing"
  bogle: {
    maxExpenseRatio: 1.0,             // flag active funds with ER > 1%
    indexFundCoreAllocationPct: 60,   // at least 60% of equity in index funds
  },

  // Standard Indian personal finance benchmarks
  india: {
    realEstateMaxPctOfAssets: 60,
    goldMaxPctOfAssets: 15,
    goldMinPctOfAssets: 5,            // below 5% is under-hedged
    liquidityRunwayMinMonths: 6,
    liquidityRunwayAmberMonths: 3,
    termInsuranceRequiredIfDependants: true,
    equityForGoalsOver7Years: true,
  },
}

// ── Human-readable insight bodies ─────────────────────────────────────────────
// Each function takes computed values and returns a string.

export const INSIGHT_BODIES = {

  // HALAN FRAMEWORKS
  emergencyFundCritical: (months, shortfall) =>
    `Liquidity covers only ${months.toFixed(1)} months of expenses — ` +
    `below the 3-month minimum. Monika Halan's "first box" principle: ` +
    `build your emergency fund before any investment. ` +
    `Add ${shortfall} to a liquid fund immediately.`,

  emergencyFundAmber: (months, shortfall) =>
    `Liquidity covers ${months.toFixed(1)} months — below the ` +
    `6-month target. Top up by ${shortfall} before increasing SIPs ` +
    `or making new investments (Halan's protect-first sequence).`,

  sipBelowTarget: (currentPct, targetPct, gap) =>
    `Household SIP is ${currentPct.toFixed(1)}% of income — below the ` +
    `${targetPct}% target from Halan's "grow box." ` +
    `Increasing SIP by ${gap}/month closes the gap. ` +
    `Small SIP increases, compounded over 10+ years, ` +
    `have an outsized impact on terminal wealth.`,

  goalHorizonMismatch: (goalName, yearsLeft, currentInstrument, recommended) =>
    `"${goalName}" is ${yearsLeft.toFixed(1)} years away but linked to ` +
    `${currentInstrument}. Halan's goal-horizon map recommends ` +
    `${recommended} for this timeframe. ` +
    `Mismatched instruments either under-earn (too conservative) ` +
    `or carry unnecessary volatility risk.`,

  // GRAHAM FRAMEWORKS
  equityTooLow: (equityPct) =>
    `Investable portfolio has only ${equityPct.toFixed(1)}% in equity — ` +
    `below Graham's defensive floor of 25%. ` +
    `Even conservative investors need equity to beat inflation ` +
    `over 10+ years. Consider routing the next FD maturity ` +
    `into a Nifty 50 index fund SIP rather than renewing.`,

  equityTooHigh: (equityPct) =>
    `Equity is ${equityPct.toFixed(1)}% of investable assets — ` +
    `above Graham's 75% ceiling. At this concentration, a 30% ` +
    `market correction reduces total wealth by over 20%. ` +
    `Rebalance 5–10% toward debt or gold.`,

  allocationDrifted: (assetClass, targetPct, actualPct) =>
    `${assetClass} has drifted to ${actualPct.toFixed(1)}% of the portfolio ` +
    `— more than 5% from its target of ${targetPct.toFixed(1)}%. ` +
    `Graham's rebalancing rule: drift beyond 5% from target ` +
    `is a signal to trim and redeploy, not to let it ride.`,

  // HOUSEL FRAMEWORKS
  highLiabilityRatio: (ratio) =>
    `Liabilities are ${(ratio * 100).toFixed(1)}% of total assets. ` +
    `Housel's tail-risk framework: high leverage combined with ` +
    `income disruption is the scenario that permanently impairs ` +
    `household wealth. Target liabilities below 40% of assets ` +
    `before increasing investment allocation.`,

  shortHorizonInEquity: (holdingYears) =>
    `Some equity holdings have been held less than ${holdingYears} years. ` +
    `Housel's "long tail of returns" principle: equity returns are ` +
    `heavily concentrated in a small number of periods. ` +
    `Exiting early statistically means missing those periods. ` +
    `Stay invested unless the goal horizon has genuinely shortened.`,

  // LYNCH FRAMEWORKS
  singleStockConcentration: (stockName, pct) =>
    `${stockName} is ${pct.toFixed(1)}% of equity holdings — ` +
    `above Lynch's 20% single-stock ceiling. ` +
    `Concentration in one name amplifies company-specific risk ` +
    `with no additional expected return. ` +
    `Trim on the next rally and redeploy into the index.`,

  // BOGLE FRAMEWORKS
  highExpenseRatio: (fundName, er) =>
    `${fundName} has an expense ratio of ${(er || 0).toFixed(2)}% — ` +
    `above the 1% threshold Bogle identifies as the ` +
    `long-term drag on active fund returns. ` +
    `Over 20 years, a 1% expense ratio compounds into a ` +
    `~18% reduction in terminal corpus. ` +
    `Switch to the direct plan or a comparable index fund.`,

  lowIndexAllocation: (indexPct) =>
    `Only ${indexPct.toFixed(1)}% of equity is in index funds. ` +
    `Bogle's evidence: over 15-year periods, 80–90% of active ` +
    `funds underperform their benchmark index after costs. ` +
    `The core portfolio (60%+) should be in low-cost index funds; ` +
    `active funds can occupy the satellite.`,

  // INDIA-SPECIFIC BENCHMARKS
  goldUnderHedged: (goldPct) =>
    `Gold is only ${goldPct.toFixed(1)}% of assets — below the ` +
    `5% minimum hedge threshold. Gold's low correlation to ` +
    `equity and its role as an inflation hedge during ` +
    `currency stress makes it a meaningful portfolio stabiliser. ` +
    `Consider Sovereign Gold Bonds (tax-efficient, 2.5% interest) ` +
    `or a Gold ETF rather than physical gold.`,

  noTermInsurance: (memberName) =>
    `${memberName} has no term life insurance on record. ` +
    `With dependants in the family, term cover of ` +
    `10× gross annual income protects the family's ` +
    `financial plan against the loss of a primary earner. ` +
    `A ₹1Cr term policy for a 35-year-old costs approximately ` +
    `₹8,000–12,000/year.`,
}
