# Transaction Ledger Design

## Purpose

The `transactions` table is the append-only event store for every wealth movement in Grey Diary / Family Wealth OS. It starts accumulating real history immediately via the SIP cron writer and will become the source of truth for holdings as later slices migrate data.

## Schema summary

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | auto |
| `family_id` | TEXT | always `'saxena-family'` for now |
| `member_id` | TEXT | short slug: `aseem`, `poonam`, `devashish`, `shivansh` |
| `txn_type` | TEXT (enum) | see below |
| `asset_class` | TEXT (enum) | see below |
| `asset_ref` | TEXT | ticker, mfCode, or holding UUID |
| `quantity` | NUMERIC | units / grams; null for cash transactions |
| `price` | NUMERIC | per-unit at transaction; null when not applicable |
| `amount` | NUMERIC NOT NULL | total rupee value |
| `txn_date` | DATE NOT NULL | effective date (not created_at) |
| `source` | TEXT (enum) | `manual` / `sip_cron` / `zerodha_import` / `cas_import` / `system` |
| `notes` | TEXT | free text; corrections reference original row id here |
| `created_at` | TIMESTAMPTZ | wall-clock insert time |
| `created_by` | TEXT | Clerk user id; null for cron/system rows |

## `txn_type` values

| Value | Meaning |
|-------|---------|
| `buy` | Purchase of a security or asset |
| `sell` | Disposal of a security or asset |
| `sip_allotment` | Monthly SIP unit allotment (written by `sip_cron`) |
| `opening_balance` | Initial snapshot when migrating existing holdings |
| `gold_purchase` | Gold acquisition |
| `gold_sale` | Gold disposal |
| `emi_payment` | Loan EMI outflow |
| `premium_payment` | Insurance premium outflow |
| `deposit` | Cash deposit / FD creation |
| `withdrawal` | Cash withdrawal / FD redemption |
| `correction` | Reversal / amendment; references original row in `notes` |

## Append-only convention

Rows are **never updated or deleted**. To correct an error:
1. Insert a `correction` row with `amount = -(original_amount)` and `notes = "corrects <original_id>"`.
2. Insert the correct row.

This preserves a complete audit trail and makes reconciliation straightforward.

## How holdings are derived (future slices)

Later slices will compute current holdings by folding the ledger:

```
current_units[member][asset_ref] =
  SUM(quantity) for buy/sip_allotment
  - SUM(quantity) for sell
```

Until that migration happens, existing holdings remain in the `investments`, `gold`, `fixedIncome`, and `cashAssets` collections. The ledger and the collections will temporarily contain overlapping data; the migration slice will reconcile them by inserting `opening_balance` rows and deprecating the old collections.

## Current writers

- **`sip_cron`** (`app/lib/sipProcessor.js`): inserts one `sip_allotment` row per successful unit allotment. Best-effort — a write failure does not fail the allotment itself.

## Prerequisites before running `transactions.sql`

1. The `security-hardening` branch must be deployed to production so the app sends Clerk JWTs to Supabase.
2. Clerk JWKS must be registered in Supabase → Auth → JWT Settings so Supabase can verify Clerk tokens and grant the `authenticated` role.
3. The RLS policy on `transactions` (`authenticated all`) depends on step 2.

## Indexes

- `idx_txn_family_date` — primary query pattern: all transactions for a family ordered by date (ledger view, cash flow report)
- `idx_txn_asset` — query pattern: history for a specific holding (asset detail drill-down)
