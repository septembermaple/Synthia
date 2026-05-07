-- 为 generations 表增加管理员可见的完整提示词列（已有库执行一次）
-- npx wrangler d1 execute synthia-db --remote --file=./migrate-generations-prompt-full.sql

ALTER TABLE generations ADD COLUMN prompt_full TEXT DEFAULT '';

-- 历史行：用已有 prompt 回填完整提示词列（旧数据可能仅为截断预览）
UPDATE generations SET prompt_full = prompt WHERE IFNULL(prompt_full, '') = '';
