-- 迁移脚本：新增管理后台所需的表
-- 运行方式：
--   npx wrangler d1 execute synthia-db --remote --file=./migrate-admin.sql

-- AI 模型配置表
CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'volcengine',
  model_type TEXT NOT NULL,           -- 'text' | 'image' | 'video'
  model_id TEXT NOT NULL,             -- 调用接口时使用的真实模型ID
  display_name TEXT NOT NULL,         -- 显示名
  api_url TEXT DEFAULT '',            -- 自定义接口地址（可空，默认用代码配置）
  enabled INTEGER NOT NULL DEFAULT 1, -- 是否启用
  is_default INTEGER NOT NULL DEFAULT 0, -- 同一 type 中仅一个为默认
  price_per_unit INTEGER NOT NULL DEFAULT 10, -- 每次/每千token消耗积分
  unit TEXT NOT NULL DEFAULT 'image', -- 'image' | 'token_1k' | 'second'
  quota_daily INTEGER NOT NULL DEFAULT 0, -- 每日额度（0=不限）
  info TEXT DEFAULT '',               -- JSON 扩展信息
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_models_type ON ai_models(model_type);
CREATE INDEX IF NOT EXISTS idx_ai_models_enabled ON ai_models(enabled);

-- API 调用日志表（用于报表统计）
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  model_id INTEGER,                   -- 关联 ai_models.id（可空，历史记录/外部模型）
  model_type TEXT NOT NULL,           -- text | image | video
  model_name TEXT DEFAULT '',         -- 冗余字段，方便查询
  units INTEGER NOT NULL DEFAULT 1,   -- 本次调用的计量数（图片数/token数/秒数）
  points_cost INTEGER NOT NULL DEFAULT 0, -- 本次消耗积分（负表示退款）
  success INTEGER NOT NULL DEFAULT 1,
  error_msg TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_model ON api_usage_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_type ON api_usage_logs(model_type);

-- 初始化当前在用的模型
INSERT OR IGNORE INTO ai_models (provider, model_type, model_id, display_name, enabled, is_default, price_per_unit, unit, info)
VALUES
  ('volcengine', 'image', 'doubao-seedream-4-0-250828', 'Doubao Seedream 4.0', 1, 1, 10, 'image', '{"description":"主力图片生成模型"}'),
  ('volcengine', 'text',  'doubao-seed-2-0-mini-260215', 'Doubao Seed 2.0 Mini', 1, 1, 1, 'token_1k', '{"description":"文案生成模型"}');
