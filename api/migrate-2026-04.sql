-- 2026-04 安全 / 功能更新迁移脚本
-- 用法：
--   本地：npx wrangler d1 execute synthia-db --local --file=./migrate-2026-04.sql
--   线上：npx wrangler d1 execute synthia-db --remote --file=./migrate-2026-04.sql

-- 0) 已使用提示词记录表（旧库可能未创建）
CREATE TABLE IF NOT EXISTS used_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  prompt_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, prompt_id)
);
CREATE INDEX IF NOT EXISTS idx_used_prompts_user ON used_prompts(user_id);

-- 1) 管理员审计日志表
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  admin_phone TEXT DEFAULT '',
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  payload TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at);

-- 2) 把历史测试账号的密码改为占位禁用值；避免在未接验证码前误把 password='' 当成"已设置"
UPDATE users
SET password = 'pbkdf2$disabled$00$00',
    updated_at = CURRENT_TIMESTAMP
WHERE phone IN ('13111111111', '13222222222', '13333333333')
  AND (password = '' OR password IS NULL OR password NOT LIKE 'pbkdf2$%');
