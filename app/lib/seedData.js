export const SEED_INVESTMENTS = [
  // Poonam — Stocks
  { id: 1, member: 'Poonam Saxena', type: 'Stock', name: 'LG Electronics India', ticker: 'LGEINDIA.BO', mfCode: null, isMF: false, units: 13, buyPrice: 1140, currentPrice: null },
  { id: 2, member: 'Poonam Saxena', type: 'Stock', name: 'Midwest Limited', ticker: 'MIDWESTLTD.BO', mfCode: null, isMF: false, units: 7, buyPrice: 1065, currentPrice: null },
  // Poonam — Mutual Funds
  { id: 3, member: 'Poonam Saxena', type: 'Mutual Fund', name: 'Motilal Oswal Midcap', ticker: null, mfCode: '120503', isMF: true, units: 126.216, buyPrice: 118.83, currentPrice: null },
  { id: 4, member: 'Poonam Saxena', type: 'Mutual Fund', name: 'Quant Smallcap', ticker: null, mfCode: '120828', isMF: true, units: 71.573, buyPrice: 279.42, currentPrice: null },
  { id: 5, member: 'Poonam Saxena', type: 'Mutual Fund', name: 'Edelweiss Nifty 50 Index', ticker: null, mfCode: '147946', isMF: true, units: 1017.009, buyPrice: 14.74, currentPrice: null },
  { id: 6, member: 'Poonam Saxena', type: 'Mutual Fund', name: 'Parag Parikh Flexicap', ticker: null, mfCode: '122639', isMF: true, units: 160.94, buyPrice: 93.19, currentPrice: null },
  { id: 7, member: 'Poonam Saxena', type: 'Mutual Fund', name: 'HDFC Balance Advantage', ticker: null, mfCode: '118989', isMF: true, units: 26.557, buyPrice: 564.79, currentPrice: null },
  // Devashish — Stocks
  { id: 8, member: 'Devashish Saxena', type: 'Stock', name: 'CPPLUS', ticker: 'CPPLUS.BO', mfCode: null, isMF: false, units: 15, buyPrice: 675, currentPrice: null },
  { id: 9, member: 'Devashish Saxena', type: 'Stock', name: 'CRIZAC', ticker: 'CRIZAC.NS', mfCode: null, isMF: false, units: 10, buyPrice: 245, currentPrice: null },
  { id: 10, member: 'Devashish Saxena', type: 'Stock', name: 'HDB Financial Services', ticker: 'HDBFS.NS', mfCode: null, isMF: false, units: 20, buyPrice: 740, currentPrice: null },
  { id: 11, member: 'Devashish Saxena', type: 'Stock', name: 'Inox India', ticker: 'INOXINDIA.NS', mfCode: null, isMF: false, units: 6, buyPrice: 660, currentPrice: null },
  { id: 12, member: 'Devashish Saxena', type: 'Stock', name: 'Jupiter Life', ticker: 'JLHL.NS', mfCode: null, isMF: false, units: 5, buyPrice: 735, currentPrice: null },
  { id: 13, member: 'Devashish Saxena', type: 'Stock', name: 'Reliance Industries', ticker: 'RELIANCE.NS', mfCode: null, isMF: false, units: 7, buyPrice: 1277.14, currentPrice: null },
  { id: 14, member: 'Devashish Saxena', type: 'Stock', name: 'Shanti Gold', ticker: 'SHANTIGOLD.BO', mfCode: null, isMF: false, units: 10, buyPrice: 199, currentPrice: null },
  { id: 15, member: 'Devashish Saxena', type: 'Stock', name: 'Waaree Energy', ticker: 'WAAREEENER.NS', mfCode: null, isMF: false, units: 5, buyPrice: 1503, currentPrice: null },
  // Devashish — Short Term Fund
  { id: 16, member: 'Devashish Saxena', type: 'Short Term Fund', name: 'Aditya Birla SL Savings', ticker: null, mfCode: '119533', isMF: true, units: 146.187, buyPrice: 567.73, currentPrice: null },
  // Shivansh — Mutual Funds
  { id: 17, member: 'Shivansh Saxena', type: 'Mutual Fund', name: 'Motilal Oswal Midcap', ticker: null, mfCode: '120503', isMF: true, units: 20.922, buyPrice: 119.48, currentPrice: null },
  { id: 18, member: 'Shivansh Saxena', type: 'Mutual Fund', name: 'Quant Smallcap', ticker: null, mfCode: '120828', isMF: true, units: 17.827, buyPrice: 280.45, currentPrice: null },
  { id: 19, member: 'Shivansh Saxena', type: 'Mutual Fund', name: 'Edelweiss Nifty 50 Index', ticker: null, mfCode: '147946', isMF: true, units: 168.316, buyPrice: 14.85, currentPrice: null },
  { id: 20, member: 'Shivansh Saxena', type: 'Mutual Fund', name: 'Parag Parikh Flexicap', ticker: null, mfCode: '122639', isMF: true, units: 26.818, buyPrice: 93.21, currentPrice: null },
  { id: 21, member: 'Shivansh Saxena', type: 'Mutual Fund', name: 'HDFC Balance Advantage', ticker: null, mfCode: '118989', isMF: true, units: 4.406, buyPrice: 567.35, currentPrice: null },
]

export const SEED_FIXED_INCOME = [
  { id: 1, member: 'Devashish Saxena', name: 'HDFC Sweep-in FD', principal: 100000, rate: 6.6, maturityValue: 113635.6, maturityDate: '' },
]

export const SEED_GOLD = [
  // Aseem — Investment
  { id: 1, member: 'Aseem Saxena', category: 'Investment', name: 'Coin', grams: 50, carat: 24, buyPricePerGram: 3200 },
  // Poonam — Investment
  { id: 2, member: 'Poonam Saxena', category: 'Investment', name: 'Coin', grams: 15, carat: 24, buyPricePerGram: 1293.267 },
  { id: 3, member: 'Poonam Saxena', category: 'Investment', name: 'Swarnakala', grams: 50, carat: 24, buyPricePerGram: 14200 },
  // Poonam — Jewellery
  { id: 4, member: 'Poonam Saxena', category: 'Jewellery', name: 'Ring w/Diamond', grams: 2.38, carat: 18, buyPricePerGram: 7250 },
  { id: 5, member: 'Poonam Saxena', category: 'Jewellery', name: 'Earring + Pendant', grams: 8.81, carat: 22, buyPricePerGram: 1466 },
  { id: 6, member: 'Poonam Saxena', category: 'Jewellery', name: 'Earrings', grams: 11.8, carat: 22, buyPricePerGram: 2514 },
  { id: 7, member: 'Poonam Saxena', category: 'Jewellery', name: 'Latkan + Chain + Tops', grams: 10.48, carat: 22, buyPricePerGram: 2702 },
  { id: 8, member: 'Poonam Saxena', category: 'Jewellery', name: 'Earrings', grams: 2.946, carat: 22, buyPricePerGram: 2815 },
  { id: 9, member: 'Poonam Saxena', category: 'Jewellery', name: 'Set', grams: 12.03, carat: 22, buyPricePerGram: 2731 },
  { id: 10, member: 'Poonam Saxena', category: 'Jewellery', name: 'Earring', grams: 4.3, carat: 22, buyPricePerGram: 2731 },
  { id: 11, member: 'Poonam Saxena', category: 'Jewellery', name: 'Pendant + Mangalsutra', grams: 25.19, carat: 22, buyPricePerGram: 3761 },
  { id: 12, member: 'Poonam Saxena', category: 'Jewellery', name: 'Set', grams: 16.07, carat: 22, buyPricePerGram: 4346 },
  { id: 13, member: 'Poonam Saxena', category: 'Jewellery', name: 'Earring', grams: 5.5, carat: 22, buyPricePerGram: 4346 },
  // Devashish — Investment
  { id: 14, member: 'Devashish Saxena', category: 'Investment', name: 'Coin (Gift)', grams: 1, carat: 24, buyPricePerGram: 0 },
]

export const DEFAULT_GOLD_PRICES = { 24: 15496, 22: 14205, 18: 9386 }

export const SEED_LOANS = [
  {
    id: 1,
    lender: 'HDFC Bank',
    type: 'Home Loan',
    member: 'Aseem Saxena',
    isShared: true,
    principal: 5000000,
    rate: 8.5,
    months: 240,
    emi: 52636,
    startDate: '2022-06-01',
    outstandingOverride: null,
  },
  {
    id: 2,
    lender: 'Canara Bank',
    type: 'Car Loan',
    member: 'Aseem Saxena',
    isShared: false,
    principal: null,
    rate: null,
    months: null,
    emi: 7785,
    startDate: null,
    outstandingOverride: null,
  },
]

export const SEED_INSURANCE = []
export const SEED_CASH_ASSETS = []
export const SEED_LIABILITIES = []
export const SEED_REAL_ESTATE = []
