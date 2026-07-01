-- ============================================
-- Rumah Padi Dashboard — D1 Database Schema
-- Jalankan ini dalam Cloudflare D1 Console
-- ============================================

-- FB Ads metrics (disync dari Facebook Marketing API)
CREATE TABLE IF NOT EXISTS fb_ads (
  ad_id          TEXT PRIMARY KEY,
  ad_name        TEXT,
  campaign_name  TEXT,
  adset_name     TEXT,
  spend          REAL    DEFAULT 0,
  impressions    INTEGER DEFAULT 0,
  reach          INTEGER DEFAULT 0,
  ctr            REAL    DEFAULT 0,
  purchases      INTEGER DEFAULT 0,
  cost_per_purchase REAL DEFAULT 0,
  purchase_roas  REAL    DEFAULT 0,
  lpv            INTEGER DEFAULT 0,
  cost_per_lpv   REAL    DEFAULT 0,
  hook_rate      REAL    DEFAULT 0,
  date_start     TEXT,
  date_stop      TEXT,
  synced_at      TEXT    DEFAULT (datetime('now'))
);

-- Donation records dari Onpay (masuk via webhook)
CREATE TABLE IF NOT EXISTS donations (
  id             INTEGER PRIMARY KEY,
  uid            TEXT    UNIQUE,
  donor_name     TEXT,
  donor_email    TEXT,
  amount         REAL    DEFAULT 0,
  source         TEXT,
  campaign_name  TEXT,
  adset_name     TEXT,
  ad_name        TEXT,
  is_new         INTEGER DEFAULT 0,
  payment_method TEXT,
  status         TEXT    DEFAULT 'confirmed',
  confirmed_at   TEXT,
  created_at     TEXT,
  raw_extra_2    TEXT,
  raw_extra_3    TEXT
);

-- Log sync
CREATE TABLE IF NOT EXISTS sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT,
  status     TEXT,
  message    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index untuk speed
CREATE INDEX IF NOT EXISTS idx_donations_ad   ON donations(ad_name);
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_fb_spend       ON fb_ads(spend DESC);
