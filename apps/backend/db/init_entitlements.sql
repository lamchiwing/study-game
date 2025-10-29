-- init_entitlements.sql
-- Tables ----------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  user_id            TEXT PRIMARY KEY,
  email              TEXT,
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                 TEXT PRIMARY KEY,   -- Stripe subscription id
  user_id            TEXT NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  price_id           TEXT NOT NULL,      -- price_...
  status             TEXT NOT NULL,      -- active / canceled / incomplete...
  current_period_end TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ent_grants (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES customers(user_id) ON DELETE CASCADE,
  plan        TEXT NOT NULL,            -- starter / pro
  subject     TEXT,                     -- NULL = 通配（所有科目）
  grade_from  INT  DEFAULT 1,
  grade_to    INT  DEFAULT 6,
  expires_at  TIMESTAMPTZ               -- NULL = 永久
);

-- Indexes ---------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ent_grants_user     ON ent_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_ent_grants_userplan ON ent_grants(user_id, plan);

-- (可選) 檢視：快速查看合併後的權限跨度
-- DROP VIEW IF EXISTS v_user_latest_plan;
-- CREATE VIEW v_user_latest_plan AS
-- SELECT user_id,
--        CASE
--          WHEN EXISTS (SELECT 1 FROM ent_grants g2 WHERE g2.user_id = g.user_id AND g2.plan='pro') THEN 'pro'
--          WHEN EXISTS (SELECT 1 FROM ent_grants g2 WHERE g2.user_id = g.user_id AND g2.plan='starter') THEN 'starter'
--          ELSE 'free'
--        END AS plan
-- FROM ent_grants g
-- GROUP BY user_id;

-- (可選) 測試資料 -------------------------------------------
-- INSERT INTO customers(user_id, email) VALUES
--   ('user_001','test1@example.com') ON CONFLICT (user_id) DO NOTHING;
-- INSERT INTO ent_grants(user_id, plan, subject, grade_from, grade_to)
-- VALUES ('user_001','starter','chinese',1,1);
