# Grey Diary — Changes

## Session Bug: Root Cause and Fix

**Root cause.** The app kept showing the password screen after switching Chrome tabs
or after a hot-module reload (Fast Refresh in dev mode). The problem was that
`isUnlocked` lived in `useState(false)` inside a React component. React's `useState`
resets to its initial value whenever a component remounts — which happens on every
Fast Refresh cycle and can also happen when the browser discards a tab from memory.

**Three fixes were applied.**

1. **Module-level auth state** (`app/lib/auth.js`). A JavaScript module is evaluated
   once per browser JS context and cached. The new `_unlocked` variable lives at
   module scope, surviving any number of React remounts as long as the browser tab
   stays open. `unlock()` sets `_unlocked = true` and writes `fwos:session` to
   `localStorage` as a breadcrumb. `lock()` clears both. `isSessionUnlocked()`
   returns the current value.

2. **Auth boundary lifted to layout** (`app/components/AuthShell.js`). `AuthShell`
   is a client component imported by `app/layout.js`. It wraps all page content,
   mounts once at the application boundary, and reads its initial `isUnlocked` state
   from `isSessionUnlocked()` — not from `false`. During Fast Refresh only the inner
   tab components remount; `AuthShell` itself typically stays mounted.

3. **`beforeunload` lock moved to `AuthShell`.** The browser tab close event now
   calls `lock()`, which clears both the in-memory flag and the `localStorage` key,
   so every new tab open starts locked (correct behaviour).

**Net result.** Simple tab switches and Fast Refresh restarts no longer show the
password screen. A full page reload (tab discard, forced refresh) does require
re-authentication — that is intentional and correct.

---

## Update Holdings Button

An **↑ Update Holdings** button appears in the Investments page header, to the left
of Refresh Prices. It opens a three-tab modal for bulk importing holdings from Excel.

### Tab A — Family Finance Tracker

Upload the Family Finance Tracker `.xlsx` workbook. The wizard reads the sheet named
**Holdings** (or **Investments**, **Equity**, **Portfolio**, **Stocks** — first match
wins). Rows are matched against existing holdings by **Name + Member** (case-
insensitive). Matched rows are updated; unmatched rows are added as new holdings.

Columns recognised (case-insensitive, underscores/hyphens ignored):

| Field | Accepted column names |
|---|---|
| Name | Name, StockName, FundName, Security |
| Member | Member, Owner, Person |
| Type | Type, AssetType, Category |
| Units | Units, Quantity, Shares |
| Buy Price | BuyPrice, PurchasePrice, AvgPrice, NAV, CostPrice |
| Ticker | Ticker, Symbol, NSETicker |
| MFAPI Code | MFCode, SchemeCode, AMFICode |
| Current Price | CurrentPrice, MarketPrice, LTP, Price |

After importing, click **Refresh Prices** to fetch live prices for updated holdings.

### Tab B — Zerodha Holdings

Upload the Zerodha Kite Holdings export (`.xlsx`). Go to **Zerodha Kite → Portfolio
→ Holdings → Download** to get this file.

Columns used: **Instrument**, **Qty**, **Avg cost**, **LTP**.

Select which member the holdings belong to before uploading. The diff table shows
every holding with a checkbox — uncheck any row to skip it. New holdings receive a
**deterministic ID** (`slug(member)|slug(ticker)|na`) so re-importing the same file
on a future date updates them correctly without duplicating rows.

New tickers are added with a `.NS` suffix (NSE default). If a stock trades only on
BSE, edit the ticker manually in the Investments table after import and change `.NS`
to `.BO`.

**P&L report guard.** If the uploaded file is a P&L / trade report instead of a
Holdings export, the wizard detects the `Trade type` column and shows a clear error
message rather than silently importing wrong data.

### Tab C — Zerodha MF

Upload the Zerodha Console MF Holdings export (`.xlsx`). Go to **Zerodha Console →
Reports → Holdings** to get this file.

Columns used: **Scheme Name**, **Units**, **Avg NAV**, **Current NAV**.

Select the member before uploading. Each scheme is matched against existing MF
holdings for that member using word-overlap on the scheme name. Matched schemes are
updated (units, avg NAV, current NAV). Unmatched schemes are added as new holdings
with a `VERIFY_AMFI` flag in their `flags` array.

**After importing unmatched schemes**, open each flagged holding in the Investments
table (Edit mode), set the correct MFAPI scheme code, and remove the `VERIFY_AMFI`
flag. The MFAPI code is needed for live NAV fetching via Refresh Prices.

---

## Stock Symbols

- All stocks imported via **Zerodha Holdings** receive an `.NS` suffix by default
  (National Stock Exchange). Manually edit to `.BO` for BSE-only listings.
- The price API (`/api/price`) auto-tries `.NS` then `.BO` when a ticker has no
  exchange suffix, so stocks stored without a suffix will still get prices — but
  storing the suffix explicitly avoids ambiguity.
- MF holdings use MFAPI scheme codes, not tickers. The code is a numeric string
  (e.g. `120503`). Find it at [mfapi.in](https://api.mfapi.in/mf/search?q=...).

---

## Known Limitations

- **Zerodha MF fuzzy matching** uses word overlap on scheme names. Schemes with very
  short or generic names (e.g. "Liquid Fund") may match incorrectly. Review the diff
  table carefully and check for `VERIFY_AMFI` flags after import.

- **Family Tracker import does not auto-refresh prices.** After importing, click
  Refresh Prices manually to fetch live prices for updated holdings.

- **Tab discard still requires re-authentication.** When the browser discards a tab
  from memory (happens on low-memory mobile or after extended background time), the
  JS context is destroyed and `_unlocked` resets. The `fwos:session` localStorage key
  is preserved, but the AES key is gone so the user must re-enter the password. This
  is by design — the encryption key cannot survive a full process termination.

- **MFAPI is read-only and updated once per day.** NAVs reflect the previous
  business day's close. Prices fetched before ~10 PM IST may show the prior day's NAV.

- **Yahoo Finance may rate-limit price fetches.** The price API retries across
  `query1` and `query2` hosts. If all fetches fail (rare), affected holdings show a
  red dot; click Refresh Prices again after a few minutes.
