-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password TEXT,
  points INT DEFAULT 100,
  token_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建积分交易记录表
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  type VARCHAR(20) NOT NULL,
  description VARCHAR(500) NOT NULL,
  balance INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建生成记录表
CREATE TABLE IF NOT EXISTS generations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  images TEXT NOT NULL,
  prompt TEXT NOT NULL,
  prompt_full TEXT NOT NULL,
  scene VARCHAR(200) DEFAULT '',
  image_count INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 限流记录表（用于密码登录尝试、图片生成等接口的速率限制）
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  `key` VARCHAR(200) PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  window_start BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI 模型配置表（可由管理后台动态维护）
CREATE TABLE IF NOT EXISTS ai_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(50) NOT NULL DEFAULT 'volcengine',
  model_type VARCHAR(20) NOT NULL COMMENT 'text | image | video',
  model_id VARCHAR(200) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  api_url VARCHAR(500) DEFAULT '',
  enabled TINYINT NOT NULL DEFAULT 1,
  is_default TINYINT NOT NULL DEFAULT 0,
  price_per_unit INT NOT NULL DEFAULT 10,
  unit VARCHAR(20) NOT NULL DEFAULT 'image',
  quota_daily INT NOT NULL DEFAULT 0,
  info TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- API 调用日志表（用于报表统计）
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  model_id INT,
  model_type VARCHAR(20) NOT NULL,
  model_name VARCHAR(200) DEFAULT '',
  units INT NOT NULL DEFAULT 1,
  points_cost INT NOT NULL DEFAULT 0,
  success TINYINT NOT NULL DEFAULT 1,
  error_msg TEXT,
  duration_ms INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 已使用提示词记录（避免给同一用户重复推送相同提示词）
CREATE TABLE IF NOT EXISTS used_prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  prompt_id VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_prompt (user_id, prompt_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 管理员操作审计日志
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT,
  admin_phone VARCHAR(20) DEFAULT '',
  action VARCHAR(100) NOT NULL,
  target VARCHAR(200) DEFAULT '',
  payload TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 兑换码主表
CREATE TABLE IF NOT EXISTS redeem_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  points INT NOT NULL,
  max_uses INT NOT NULL DEFAULT 1,
  used_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active | disabled',
  expires_at TIMESTAMP NULL,
  batch_id VARCHAR(64) DEFAULT '',
  note VARCHAR(200) DEFAULT '',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 兑换记录（同码同人仅一次）
CREATE TABLE IF NOT EXISTS redeem_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code_id INT NOT NULL,
  code VARCHAR(20) NOT NULL,
  user_id INT NOT NULL,
  points INT NOT NULL,
  ip VARCHAR(64) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code_user (code_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 创建索引
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_generations_user_id ON generations(user_id);
CREATE INDEX idx_generations_expires_at ON generations(expires_at);
CREATE INDEX idx_rate_limits_window ON auth_rate_limits(window_start);
CREATE INDEX idx_ai_models_type ON ai_models(model_type);
CREATE INDEX idx_ai_models_enabled ON ai_models(enabled);
CREATE INDEX idx_usage_user ON api_usage_logs(user_id);
CREATE INDEX idx_usage_model ON api_usage_logs(model_id);
CREATE INDEX idx_usage_created ON api_usage_logs(created_at);
CREATE INDEX idx_usage_type ON api_usage_logs(model_type);
CREATE INDEX idx_admin_audit_admin ON admin_audit_logs(admin_user_id);
CREATE INDEX idx_admin_audit_created ON admin_audit_logs(created_at);
CREATE INDEX idx_redeem_codes_status ON redeem_codes(status);
CREATE INDEX idx_redeem_codes_batch ON redeem_codes(batch_id);
CREATE INDEX idx_redeem_codes_created ON redeem_codes(created_at);
CREATE INDEX idx_redeem_logs_code ON redeem_logs(code_id);
CREATE INDEX idx_redeem_logs_user ON redeem_logs(user_id);
CREATE INDEX idx_redeem_logs_created ON redeem_logs(created_at);
