-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  password TEXT DEFAULT '',
  points INTEGER DEFAULT 100,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 创建积分交易记录表
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  balance INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建生成记录表
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  images TEXT NOT NULL,
  prompt TEXT NOT NULL,
  scene TEXT DEFAULT '',
  image_count INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 限流记录表（用于密码登录尝试、图片生成等接口的速率限制）
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- AI 模型配置表（可由管理后台动态维护）
CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'volcengine',
  model_type TEXT NOT NULL,           -- 'text' | 'image' | 'video'
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  api_url TEXT DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  price_per_unit INTEGER NOT NULL DEFAULT 10,
  unit TEXT NOT NULL DEFAULT 'image',
  quota_daily INTEGER NOT NULL DEFAULT 0,
  info TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- API 调用日志表（用于报表统计）
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  model_id INTEGER,
  model_type TEXT NOT NULL,
  model_name TEXT DEFAULT '',
  units INTEGER NOT NULL DEFAULT 1,
  points_cost INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1,
  error_msg TEXT DEFAULT '',
  duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_expires_at ON generations(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON auth_rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_ai_models_type ON ai_models(model_type);
CREATE INDEX IF NOT EXISTS idx_ai_models_enabled ON ai_models(enabled);
CREATE INDEX IF NOT EXISTS idx_usage_user ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_model ON api_usage_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_usage_created ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_type ON api_usage_logs(model_type);

-- 插入测试账户（生产环境请删除）
INSERT OR IGNORE INTO users (phone, password, points) VALUES 
  ('13111111111', '', 100),
  ('13222222222', '', 100),
  ('13333333333', '', 100);
