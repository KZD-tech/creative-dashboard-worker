-- ============================================================
-- MULTI-KEMPEN MIGRATION
-- Jalankan SATU statement pada satu masa di D1 Console
-- ============================================================

-- ── BAHAGIAN A: SETUP BARU (fresh install) ─────────────────
-- Jalankan kalau DB masih kosong / setup pertama kali

-- A1. Table kempen
CREATE TABLE IF NOT EXISTS campaigns (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- A2. Table fb_ads dengan (campaign_id, ad_name) sebagai PK
CREATE TABLE IF NOT EXISTS fb_ads (
  campaign_id     TEXT    NOT NULL DEFAULT 'rumah-padi',
  ad_name         TEXT    NOT NULL,
  campaign_name   TEXT,
  adset_name      TEXT,
  spend           REAL    DEFAULT 0,
  impressions     INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  ctr             REAL    DEFAULT 0,
  purchases       INTEGER DEFAULT 0,
  cost_per_result REAL    DEFAULT 0,
  purchase_roas   REAL    DEFAULT 0,
  lpv             INTEGER DEFAULT 0,
  cost_per_lpv    REAL    DEFAULT 0,
  hook_rate       REAL    DEFAULT 0,
  cpc             REAL    DEFAULT 0,
  link_clicks     INTEGER DEFAULT 0,
  frequency       REAL    DEFAULT 0,
  cpm             REAL    DEFAULT 0,
  date_start      TEXT,
  date_stop       TEXT,
  uploaded_at     TEXT    DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, ad_name)
);

-- A3. Table video_links dengan (campaign_id, ad_name) sebagai PK
CREATE TABLE IF NOT EXISTS video_links (
  campaign_id TEXT NOT NULL DEFAULT 'rumah-padi',
  ad_name     TEXT NOT NULL,
  youtube_url TEXT,
  updated_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, ad_name)
);

-- A4. Table donations
CREATE TABLE IF NOT EXISTS donations (
  id             INTEGER PRIMARY KEY,
  uid            TEXT    UNIQUE,
  donor_name     TEXT,
  donor_email    TEXT,
  amount         REAL    DEFAULT 0,
  source         TEXT,
  campaign_id    TEXT    DEFAULT 'rumah-padi',
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

-- A5. Log sync
CREATE TABLE IF NOT EXISTS sync_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT,
  status     TEXT,
  message    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);


-- ── BAHAGIAN B: MIGRATE DATA SEDIA ADA ────────────────────
-- Jalankan HANYA kalau dah ada data Rumah Padi sebelum ini
-- Skip kalau fresh install

-- B1. Insert kempen Rumah Padi sebagai default
INSERT OR IGNORE INTO campaigns (id, name) VALUES ('rumah-padi', 'Rumah Padi Anak Yatim Budun');

-- B2. Backup fb_ads lama
CREATE TABLE fb_ads_bak AS SELECT * FROM fb_ads;

-- B3. Drop dan buat semula fb_ads (dengan campaign_id PK)
DROP TABLE fb_ads;

CREATE TABLE fb_ads (
  campaign_id     TEXT    NOT NULL DEFAULT 'rumah-padi',
  ad_name         TEXT    NOT NULL,
  campaign_name   TEXT,
  adset_name      TEXT,
  spend           REAL    DEFAULT 0,
  impressions     INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  ctr             REAL    DEFAULT 0,
  purchases       INTEGER DEFAULT 0,
  cost_per_result REAL    DEFAULT 0,
  purchase_roas   REAL    DEFAULT 0,
  lpv             INTEGER DEFAULT 0,
  cost_per_lpv    REAL    DEFAULT 0,
  hook_rate       REAL    DEFAULT 0,
  cpc             REAL    DEFAULT 0,
  link_clicks     INTEGER DEFAULT 0,
  frequency       REAL    DEFAULT 0,
  cpm             REAL    DEFAULT 0,
  date_start      TEXT,
  date_stop       TEXT,
  uploaded_at     TEXT    DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, ad_name)
);

-- B4. Restore data lama dengan campaign_id = 'rumah-padi'
INSERT INTO fb_ads
  (campaign_id, ad_name, campaign_name, adset_name,
   spend, impressions, reach, ctr,
   purchases, cost_per_result, purchase_roas,
   lpv, cost_per_lpv, hook_rate,
   cpc, link_clicks, frequency, cpm,
   date_start, date_stop, uploaded_at)
SELECT
  'rumah-padi', ad_name, campaign_name, adset_name,
  spend, impressions, reach, ctr,
  purchases, cost_per_result, purchase_roas,
  lpv, cost_per_lpv, hook_rate,
  COALESCE(cpc, 0), COALESCE(link_clicks, 0),
  COALESCE(frequency, 0), COALESCE(cpm, 0),
  date_start, date_stop, uploaded_at
FROM fb_ads_bak;

-- B5. Buang backup
DROP TABLE fb_ads_bak;

-- B6. Tambah campaign_id ke donations
ALTER TABLE donations ADD COLUMN campaign_id TEXT DEFAULT 'rumah-padi';

-- B7. Backup video_links lama
CREATE TABLE video_links_bak AS SELECT * FROM video_links;

-- B8. Drop dan buat semula video_links
DROP TABLE video_links;

CREATE TABLE video_links (
  campaign_id TEXT NOT NULL DEFAULT 'rumah-padi',
  ad_name     TEXT NOT NULL,
  youtube_url TEXT,
  updated_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, ad_name)
);

-- B9. Restore video_links
INSERT INTO video_links SELECT 'rumah-padi', ad_name, youtube_url, updated_at FROM video_links_bak;

-- B10. Buang backup
DROP TABLE video_links_bak;


-- ── SEMAK ─────────────────────────────────────────────────
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
SELECT * FROM campaigns;
