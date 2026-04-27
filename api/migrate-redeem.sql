-- 迁移脚本：兑换码系统
-- 运行方式：
--   npx wrangler d1 execute synthia-db --remote --file=./migrate-redeem.sql

-- 兑换码主表
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,                -- 兑换码（去除易混字符的大写字母+数字）
  points INTEGER NOT NULL,                  -- 单次兑换可获得积分
  max_uses INTEGER NOT NULL DEFAULT 1,      -- 最大使用次数（>1 即多人共用码）
  used_count INTEGER NOT NULL DEFAULT 0,    -- 已使用次数
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'disabled'
  expires_at TEXT,                          -- 可选过期时间（ISO 字符串），NULL = 永不过期
  batch_id TEXT DEFAULT '',                 -- 批次号（同批生成共享）
  note TEXT DEFAULT '',                     -- 备注
  created_by INTEGER,                       -- 创建管理员 user_id
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_status  ON redeem_codes(status);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_batch   ON redeem_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_created ON redeem_codes(created_at);

-- 兑换记录（同一码同一用户最多一次，用于防重复领取）
CREATE TABLE IF NOT EXISTS redeem_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_redeem_logs_code    ON redeem_logs(code_id);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_user    ON redeem_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_created ON redeem_logs(created_at);
