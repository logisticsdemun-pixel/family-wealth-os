# wealthMetrics — hand-computed test cases

These are the reviewer's verification checklist. No test runner required.
Run the function with the input below and confirm the output matches exactly.

---

## Case 1 — Low runway triggers warning insight

### Input

```js
// computeLiquidity
cashAssets  = [{ name: 'HDFC Savings', value: 50000 }]
fixedIncome = []   // no FDs maturing within 30 days

// computeMonthlyObligation
loans       = [{ emi: 25000 }]
investments = []   // no active SIPs
insurance   = [{ premium: 12000 }]  // 12000/12 = 1000/mo

// computeRunway
// obligation.total = 25000 + 0 + 1000 = 26000
// runway = 50000 / 26000 = 1.9 (toFixed(1))
```

### Expected outputs

```
computeLiquidity(cashAssets, fixedIncome)
  → { total: 50000, breakdown: [{ name: 'HDFC Savings', type: 'cash', value: 50000 }] }

computeMonthlyObligation(loans, investments, insurance)
  → { total: 26000, emis: 25000, sips: 0, premiums: 1000 }

computeRunway({ total: 50000 }, { total: 26000 })
  → 1.9

computeDebtRatio(500000, 3000000)
  → 16.7

generateInsights — produces a 'warning' insight with title 'Low emergency fund'
  body contains "1.9 months" and a ₹ gap of round((6-1.9)*26000) = round(106600) = ₹1,06,600
```

---

## Case 2 — Real-estate concentration risk

### Input

```js
byCategory = {
  investments: 200000,
  gold:        100000,
  realEstate:  2700000,
  cash:        500000,
  liabilities: 300000,
}
totalAssets = 3500000   // sum of non-liability categories = 200000+100000+2700000+500000

// pct for realEstate = 2700000/3500000*100 = 77.1%
// pct for cash       = 500000/3500000*100  = 14.3%
// pct for gold       = 100000/3500000*100  = 2.9%   (< 15%, no opportunity insight)
```

### Expected outputs

```
computeConcentration(byCategory, totalAssets)
  → [
      { category: 'realEstate',  value: 2700000, pct: 77.14... },
      { category: 'cash',        value:  500000, pct: 14.28... },
      { category: 'investments', value:  200000, pct:  5.71... },
      { category: 'gold',        value:  100000, pct:  2.85... },
    ]
  (liabilities excluded, sorted descending by value)

generateInsights — produces a 'risk' insight:
  title: 'High realEstate concentration'
  body contains "77.1%" and "60%"

generateInsights — does NOT produce a gold opportunity insight (gold pct 2.9% < 15%)
```

---

## Case 3 — SIP frequency conversion + today's change

### Input

```js
// computeMonthlyObligation — weekly SIP
investments = [
  {
    investmentMode: 'sip',
    sip: { status: 'Active', frequency: 'weekly', amount: 5000, instalmentDate: null },
    name: 'Nifty Index Fund',
  }
]
// weekly 5000 → monthly equivalent = 5000 * 4 = 20000

// computeTodayChange
holding = { isMF: true, mfCode: '120503', units: 100, currentPrice: 152.5 }
latestSnapshot = { priceCache: { '120503': 150.0 } }
// change = (152.5 - 150.0) * 100 = 250

// computeTodayChange — missing key
holdingNoKey = { isMF: false, ticker: null, units: 50, currentPrice: 300 }
// → null  (no ticker)

// classifyFund
classifyFund('Mirae Asset Large Cap Fund')        → 'equity'
classifyFund('HDFC Liquid Fund')                  → 'debt'   (contains 'liquid')
classifyFund('SBI Banking and PSU Debt Fund')     → 'debt'   (contains 'banking and psu')
classifyFund('ICICI Prudential Short Term Fund')  → 'debt'   (contains 'short term')
```

### Expected outputs

```
computeMonthlyObligation([], investments, [])
  → { total: 20000, emis: 0, sips: 20000, premiums: 0 }

computeTodayChange(holding, latestSnapshot)
  → 250

computeTodayChange(holdingNoKey, latestSnapshot)
  → null

classifyFund checks: see inline → expected above
```
