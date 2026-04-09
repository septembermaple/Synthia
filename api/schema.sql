-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  password TEXT DEFAULT '',
  points INTEGER DEFAULT 100,
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

-- 创建已使用描述词表
CREATE TABLE IF NOT EXISTS used_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  prompt_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, prompt_id)
);

-- 创建提示词库表
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  image_count INTEGER DEFAULT 3,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_expires_at ON generations(expires_at);
CREATE INDEX IF NOT EXISTS idx_used_prompts_user_id ON used_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON prompts(is_active);

-- 插入测试账户
INSERT OR IGNORE INTO users (phone, password, points) VALUES 
  ('13111111111', 'Admin123456', 100),
  ('13222222222', 'Admin123456', 100),
  ('13333333333', 'Admin123456', 100);

-- 插入初始提示词
INSERT OR IGNORE INTO prompts (id, description, image_count, is_active) VALUES 
  (1, '（保持图一人物的五官不变）清瘦精致的脸形，白皙的皮肤，留着深棕色韩版微分碎盖，自然且蓬松。左耳戴着一枚简约银质耳钉。眼神慵懒淡漠，略带疏离感，表情平静冷峻，没有明显笑容，传递出一种漫不经心的氛围感。以正脸且低角度自拍视角呈现，人物整张脸及脖子都是红的，貌似喝醉酒红脸一般，右手自然地握着一只装有半杯金黄色酒液的透明威士忌杯，手臂放松地搭在身侧，整体姿态随性放松。身穿一件宽松的黑色机能风连帽外套，光线打到衣服正面大片范围，面料呈现哑光质感，版型简约利落。背景是昏暗的Livehouse或小型酒吧场景，左后方有两三个红色白色舞台灯，空气中弥漫着细腻的烟雾，光线在烟雾中形成明显的光束效果。远处可见深色的天花板结构与灰色皮质沙发，整体环境营造出一种迷离又充满氛围感的夜场氛围。写实人像风格，高清晰度，细腻的皮肤纹理与衣物质感，自然的光影层次，冷调与暖调光线对比强烈，颗粒感轻微，突出人物主体与环境的沉浸感。比例3:4', 3, 1);
