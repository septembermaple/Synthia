-- 更新提示词的 image_count 为 3
UPDATE prompts SET image_count = 3 WHERE id = 1;

-- 验证更新结果
SELECT id, image_count FROM prompts WHERE id = 1;
