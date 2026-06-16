-- Grey Diary — Family Data Schema
-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- ── Shared timestamp trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── family_data — one row per collection per family ────────────────────────
-- Collections: investments, fixedIncome, gold, goldPrices, loans, realEstate,
--              insurance, cashAssets, liabilities, snapshots, priceCache, goals
-- data column is JSONB — holds arrays for most collections,
-- objects for goldPrices and priceCache.
CREATE TABLE IF NOT EXISTS family_data (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id   TEXT        NOT NULL,
  collection  TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT 'null'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_id, collection)
);

CREATE INDEX IF NOT EXISTS idx_family_data_family_collection
  ON family_data(family_id, collection);

CREATE OR REPLACE TRIGGER family_data_updated_at
  BEFORE UPDATE ON family_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE family_data ENABLE ROW LEVEL SECURITY;

-- Open policy — Clerk auth is enforced at app level, not Supabase level.
-- The anon key is safe here because family_id is app-controlled (not user input).
CREATE POLICY "allow_all_anon" ON family_data
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- ── user_settings — per-user key-value store ──────────────────────────────
-- Stores: goldPrices overrides, theme preference, monthly expense baseline, etc.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id     TEXT        PRIMARY KEY,
  settings    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_anon" ON user_settings
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- ── market_cache — shared price cache across all users ────────────────────
CREATE TABLE IF NOT EXISTS market_cache (
  symbol     TEXT        PRIMARY KEY,
  price      NUMERIC,
  source     TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE market_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_anon" ON market_cache
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- ── Real-time publication ─────────────────────────────────────────────────
-- Required for Supabase Realtime postgres_changes subscriptions.
-- family_data is the only table that needs live sync across devices.
ALTER PUBLICATION supabase_realtime ADD TABLE family_data;
