-- Transaction Ledger — run manually in Supabase SQL Editor
-- This is the append-only event store for all wealth movements.
-- DO NOT execute until the security-hardening branch is deployed
-- and Clerk JWT is accepted by Supabase (see LEDGER.md).

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id   TEXT        NOT NULL DEFAULT 'saxena-family',
  member_id   TEXT        NOT NULL,
  txn_type    TEXT        NOT NULL CHECK (txn_type IN (
                'buy', 'sell', 'sip_allotment', 'opening_balance',
                'gold_purchase', 'gold_sale', 'emi_payment',
                'premium_payment', 'deposit', 'withdrawal', 'correction'
              )),
  asset_class TEXT        NOT NULL CHECK (asset_class IN (
                'stock', 'mutual_fund', 'gold', 'real_estate',
                'deposit', 'loan', 'insurance', 'cash'
              )),
  asset_ref   TEXT,           -- ticker / mfCode / holding id
  quantity    NUMERIC,         -- units / grams
  price       NUMERIC,         -- per-unit price at transaction
  amount      NUMERIC NOT NULL, -- total value (quantity * price)
  txn_date    DATE    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'manual'
                CHECK (source IN (
                  'manual', 'sip_cron', 'zerodha_import',
                  'cas_import', 'system'
                )),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  TEXT            -- Clerk user id (null for cron rows)
);

CREATE INDEX IF NOT EXISTS idx_txn_family_date
  ON transactions(family_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_txn_asset
  ON transactions(family_id, asset_class, asset_ref);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated all" ON transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
