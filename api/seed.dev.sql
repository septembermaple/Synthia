-- 开发环境种子数据：仅在本地 / 测试环境执行
-- 注意：占位密码 'pbkdf2$disabled$00$00' 无法通过任何输入校验，
-- 因此这些账号无法用密码登录；同时未接短信验证前不要把此文件灌入生产库。

INSERT OR IGNORE INTO users (phone, password, points) VALUES
  ('13111111111', 'pbkdf2$disabled$00$00', 100),
  ('13222222222', 'pbkdf2$disabled$00$00', 100),
  ('13333333333', 'pbkdf2$disabled$00$00', 100);
