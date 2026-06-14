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

## Real Estate Tab

A dedicated **Real Estate** tab appears between Loans and Insurance in the navigation bar. It tracks property assets across the family.

### Property schema

Each property stores: name, type (Residential / Commercial / Land / Other), city/area, current value, purchase price, purchase date, monthly rent, primary owner (member), primary ownership %, co-owners list, linked loans, and notes.

### Co-owner support

Properties can have multiple family co-owners in addition to the primary owner. Each co-owner has a member name and an ownership percentage. The primary owner's % and all co-owner %s are tracked independently — they need not sum to 100 (e.g. a property can have 40% family ownership with the remainder held by outsiders).

- **Dashboard** uses the sum of primary + all family co-owner percentages when computing the family total Real Estate value.
- **Per-member views** show only that member's attributable portion (primary % or co-owner %).
- **Real Estate page** filters show a property for a member if they are the primary owner **or** a co-owner.
- The **Attributable Value** summary card on the Real Estate page reflects the active member's ownership-adjusted value.

### Linked loans (bidirectional)

Loans can be linked to a property from either the Loans tab or the Real Estate add/edit modal. The relationship is stored on the loan (`linkedPropertyId`). Deleting a property automatically unlinks all associated loans.

### Dashboard integration

- Real Estate appears as a metric card between Investments and Gold.
- Included in the allocation bar (purple segment).
- Each family member's Real Estate column appears in the member breakdown table.
- Net worth history snapshots include Real Estate value.

---

## MF SIP vs Lumpsum

Mutual Fund holdings in the Investments tab can now be configured as **SIP** (Systematic Investment Plan) or **Lumpsum**.

### SIP configuration

Click the **SIP** button (🔄) on any MF holding row to open the SIP Config modal:
- Toggle between Lumpsum and SIP mode.
- Set a monthly SIP amount and start date.
- View the full instalment history for the holding.

### Adding SIP instalments

Click **+inst** on a SIP-mode MF holding to record a new instalment:
1. Enter the instalment date and amount.
2. Click **Look up NAV** — the app fetches the NAV for that date from MFAPI (or the closest available date).
3. Confirm to add the instalment. Units are accumulated and the average NAV is updated using a weighted average.

### SIP summary card

A summary card above the MF holdings table shows:
- Number of active SIPs.
- Total monthly outgo across all active SIPs.
- Next upcoming SIP date and fund name.

### Next SIP date

Computed from the SIP start date: the next occurrence of the same day-of-month that is on or after today.

---

## Central Data Store & Live Dashboard

All app data now flows through a single React context (`AppProvider` in `app/lib/store.js`). Previously each tab loaded its own copy of data from storage on mount and re-saved independently. Now:

- **Single load on unlock.** All collections (investments, gold, loans, real estate, fixed income, cash, liabilities, insurance, snapshots, price cache) are read once from the AES-decrypted memory store when the app unlocks, and shared across all tabs.
- **Live dashboard.** Any write in any tab (adding a loan, editing a holding, changing gold prices) is immediately reflected in the Dashboard without needing to navigate away and back. The `fwos:datachanged` event bus carries the signal; the central store re-reads the updated collection.
- **`applyImport` (backup restore) now triggers a reload.** Previously, restoring a backup did not refresh open tabs. Now `applyImport` dispatches `fwos:datachanged` after `flushAll()` completes, so the store reloads all data automatically.

## SaveBar — Unsaved Changes Indicator

A floating **SaveBar** appears in the bottom-right corner of the screen whenever you have uncommitted writes (i.e., you have added, edited, or deleted something since the last explicit save). It shows:

- An amber pulsing dot indicating pending data.
- An **"Unsaved changes"** label.
- A **"Save"** button — flushes all pending AES encryption to `localStorage` and clears the indicator.
- A **"Save to History"** button — does the same as Save, then also records a net worth snapshot with today's date (subject to the ₹1,000 delta guard).

The **"Save" button in the Investments header** is now wired to the same `store.flush()` call, so clicking it clears the global indicator too.

---

---

## Layout Redesign — Sidebar Navigation

The app's top navigation bar has been replaced with a **permanent left sidebar** and a minimal **top bar**. This is a visual restructure only — no data logic, store hooks, or filtering was changed.

### New layout structure

```
┌──────────────┬───────────────────────────────────────────┐
│   Sidebar    │  TopBar (greeting · Save · icons · avatar)│
│   200px      ├───────────────────────────────────────────┤
│              │  MemberFilter (All · Aseem · Poonam · …)  │
│  Nav items   ├───────────────────────────────────────────┤
│  with live   │                                           │
│  values      │   Active page content (scrollable)        │
│              │                                           │
│  ──────────  │                                           │
│  Goals       │                                           │
│  ARTHA       │                                           │
│  Beneficiary │                                           │
│  ──────────  │                                           │
│  Family info │                                           │
└──────────────┴───────────────────────────────────────────┘
```

### How navigation works

Navigation is **client-side state only** — no URL routing, no page reloads. `AppShell` (`app/components/AppShell.js`) owns two state variables:

- `activePage` — which tab is shown (`'dashboard'`, `'investments'`, `'gold'`, `'realestate'`, `'loans'`, `'insurance'`, `'artha'`)
- `activeMember` — current member filter (`'All'` or a full name like `'Aseem Saxena'`)

Clicking a sidebar item calls `setActivePage(id)`. All seven page components are imported at the top of `AppShell` and rendered with `{activePage === 'x' && <X />}`. The `key={activePage}` wrapper triggers a `fadeIn` CSS animation (0.15 s) on every navigation.

### Sidebar live values

The sidebar reads directly from the store via selector hooks and shows compact totals next to each nav item:

| Nav item | Value displayed |
|---|---|
| Net Worth | investments + fixed income + gold + real estate + cash − loans − liabilities |
| Investments | portfolio value (units × current price) + fixed income principals |
| Real Estate | sum of `currentValue × ownershipPct` across all properties |
| Gold | grams × current gold price per carat |
| Loans | total outstanding across all loans + manual liabilities (shown in red) |

These numbers re-render the instant any write is made anywhere in the app — no save required for the sidebar display.

### How to add a new page or tab

1. Create the page component, e.g. `app/mypages/Pension.js`
2. Add a row to `NAV_ITEMS` in `app/components/Sidebar.js`:
   ```js
   { id: 'pension', label: 'Pension', icon: 'ti-piggy-bank' }
   ```
3. Import the component in `app/components/AppShell.js` and add a conditional render:
   ```js
   import Pension from './mypages/Pension'
   // ...inside the page-content div:
   {activePage === 'pension' && <Pension {...pageProps} />}
   ```
4. Pass `activeMember` via `pageProps` if the page supports per-member filtering.

### Components removed or renamed

| Before | After | Notes |
|---|---|---|
| `app/components/Nav.js` | deleted | Replaced by Sidebar + TopBar |
| Top nav bar in `page.js` | `AppShell` in `app/components/AppShell.js` | Shell now owns `activePage` + `activeMember` |
| `app/page.js` (full layout) | 4-line wrapper: renders `<AppShell />` | All layout logic moved to AppShell |

### Dashboard redesign (Phase 2)

The dashboard was restructured to a Kubera-style three-row layout:

- **Hero row** — joined card group (3 equal columns, 0.5 px dividers, single outer border): Net Worth with 1-day and 1-year change indicators · Total Assets · Total Liabilities
- **Metric row** — joined card group (4 equal columns): Investments (with unrealised gain) · Real Estate · Gold · Cash & FDs — each with a Tabler icon and a count/gain subtitle
- **Bottom row left** — net worth history AreaChart (purple gradient, h = 120 px, last 90 snapshots) with placeholder text when fewer than 2 snapshots exist; member breakdown table (All view only)
- **Bottom row right** (220 px fixed) — allocation bars (label 90 px + bar 4 px + percentage 40 px) for Real Estate / Gold / Investments / Cash & FDs; member net worth list with avatars

**Snapshot change calculation.** 1-day change uses the second-to-last snapshot (`snapshots[n-2]`). 1-year change finds the first snapshot whose date is on or after one year ago. Both fall back to the current net worth (showing ±0) when insufficient history exists.

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
