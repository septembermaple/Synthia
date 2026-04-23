-- 迁移脚本：为已有数据库添加 users.token_version 字段
-- 运行方式：
--   npx wrangler d1 execute synthia-db --remote --file=./migrate-token-version.sql

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
