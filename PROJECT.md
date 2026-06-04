# Synthia 项目说明文档

## 项目概述

Synthia 是一个 AI 写真生成平台，用户可以上传照片，选择不同风格，生成艺术写真图片。项目使用 Node.js + Express 作为后端 API，MySQL 作为数据库。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| 路由 | React Router DOM v6 |
| 后端 | Node.js + Express |
| 数据库 | MySQL |
| AI API | 豆包 Doubao API (图片生成) |

---

## 项目结构

```
synthia/
├── api/                          # 后端 API (Node.js + Express)
│   ├── src/
│   │   └── index.js              # API 入口文件，所有接口处理逻辑
│   ├── schema.sql                # 数据库表结构定义
│   ├── .env                      # 后端环境变量（不提交）
│   └── package.json
│
├── src/                          # 前端 React 应用
│   ├── components/
│   │   └── ProtectedRoute.jsx    # 路由保护组件
│   ├── contexts/
│   │   └── AuthContext.jsx       # 认证上下文，管理用户状态
│   ├── data/
│   │   └── promptLibrary.js      # 随机生成的描述词库
│   ├── pages/
│   │   ├── Login.jsx             # 登录页面
│   │   └── Dashboard.jsx         # 用户中心页面
│   ├── services/
│   │   └── api.js                # API 服务封装，所有后端请求
│   ├── App.jsx                   # 主应用组件
│   ├── main.jsx                  # 入口文件
│   └── index.css                 # 全局样式
│
├── .env                          # 开发环境变量
├── .env.production               # 生产环境变量
├── .env.local                    # 本地环境变量（不提交）
├── vite.config.js                # Vite 配置
└── package.json
```

---

## 核心模块说明

### 1. 认证系统 (AuthContext.jsx)

**认证方式**: Token 认证（非 Cookie）

**工作流程**:
1. 用户登录成功后，后端返回 `token`（用户ID）
2. 前端将 `token` 存储到 `localStorage`（key: `synthia_token`）
3. 后续请求在 `Authorization: Bearer <token>` header 中携带 token
4. 后端通过解析 header 获取用户ID进行验证

**为什么不用 Cookie**:
- 前端和 API 部署在不同域名（跨域）
- 现代浏览器对第三方 Cookie 限制严格
- Token 方案更可靠

### 2. API 服务层 (api.js)

**职责**: 封装所有后端请求，统一管理 token

**关键方法**:
- `getToken()` / `setToken()` - 管理 localStorage 中的 token
- `request()` - 统一请求方法，自动添加 Authorization header
- `generateImages()` - 图片生成，支持流式响应

### 3. 图片生成流程

```
用户上传图片 → 选择风格/场景 → 点击生成
    ↓
前端调用 api.generateImages()
    ↓
请求发送到后端 /api/images/generate
    ↓
后端调用豆包 API（API KEY 安全存储在 .env 中）
    ↓
流式返回生成的图片 URL
    ↓
前端展示结果，保存记录到数据库
```

**安全设计**:
- API KEY 存储在后端 .env 配置文件中，不在前端暴露
- 前端只调用后端代理接口，不直接调用豆包 API

---

## API 接口文档

### 认证相关

| 接口 | 方法 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/api/auth/login` | POST | 验证码登录 | `{phone, code}` | `{user, token, isNewUser, hasPassword}` |
| `/api/auth/login-password` | POST | 密码登录 | `{phone, password}` | `{success, user, token}` |
| `/api/auth/logout` | POST | 登出 | - | `{success}` |
| `/api/auth/me` | GET | 获取当前用户 | - | `{id, phone, points, createdAt}` |
| `/api/auth/update-password` | POST | 修改密码 | `{oldPassword, newPassword}` | `{success, message}` |

### 积分相关

| 接口 | 方法 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/api/points/balance` | GET | 获取积分余额 | - | `{points}` |
| `/api/points/add` | POST | 充值积分 | `{amount, description}` | `{success, points}` |
| `/api/points/consume` | POST | 消费积分 | `{amount, description}` | `{success, points}` |
| `/api/points/transactions` | GET | 获取交易记录 | `?limit=20` | `[{id, amount, type, description, balance, created_at}]` |

### 图片生成

| 接口 | 方法 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/api/images/generate` | POST | 生成图片 | `{prompt, imageBase64, imageCount}` | SSE 流式响应 |

### 生成记录

| 接口 | 方法 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/api/generations` | GET | 获取生成记录 | - | `[{id, images, prompt, scene, ...}]` |
| `/api/generations` | POST | 保存生成记录 | `{images, prompt, scene, imageCount}` | `{success, id, expiresAt}` |
| `/api/generations/:id` | DELETE | 删除记录 | - | `{success}` |
| `/api/generations/cleanup` | POST | 清理过期记录 | - | `{success, deletedCount}` |

### 描述词管理

| 接口 | 方法 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/api/prompts/used` | GET | 获取已使用的描述词ID | - | `[promptId, ...]` |
| `/api/prompts/mark-used` | POST | 标记描述词已使用 | `{promptId}` | `{success}` |

---

## 数据库结构

### users 表 - 用户信息

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  phone VARCHAR(20) UNIQUE NOT NULL,           -- 手机号
  password VARCHAR(255) DEFAULT '',             -- 密码（可选）
  points INT DEFAULT 100,                       -- 积分余额
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### transactions 表 - 积分交易记录

```sql
CREATE TABLE transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,                         -- 用户ID
  amount INT NOT NULL,                          -- 金额（正数充值，负数消费）
  type VARCHAR(20) NOT NULL,                    -- 类型：'充值' 或 '消费'
  description VARCHAR(255) NOT NULL,            -- 描述
  balance INT NOT NULL,                         -- 交易后余额
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### generations 表 - 生成记录

```sql
CREATE TABLE generations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,                         -- 用户ID
  images TEXT NOT NULL,                         -- 图片URL数组（JSON）
  prompt TEXT NOT NULL,                         -- 使用的描述词
  scene VARCHAR(100) DEFAULT '',                -- 场景
  image_count INT NOT NULL,                     -- 图片数量
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,                 -- 过期时间（24小时）
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### used_prompts 表 - 已使用的描述词

```sql
CREATE TABLE used_prompts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  prompt_id INT NOT NULL,                       -- 描述词ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_user_prompt (user_id, prompt_id) -- 防止重复
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### prompts 表 - 提示词库

```sql
CREATE TABLE prompts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  description TEXT NOT NULL,                    -- 提示词内容
  image_count INT DEFAULT 3,                    -- 生成图片数量
  is_active TINYINT DEFAULT 1,                  -- 是否启用（1启用，0禁用）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**说明**：
- 提示词存储在数据库中，支持动态管理
- `image_count` 字段指定该提示词生成多少张图片
- `is_active` 字段控制提示词是否可用
- "随便来三张"功能从该表获取提示词

---

## 环境变量

### 前端 (.env.production)

```env
VITE_USE_API=true
VITE_API_URL=https://synthia-api.example.com
VITE_DOUBAO_API_KEY=xxx   # 注意：此变量已不使用，API KEY 在后端配置
```

### 后端 (api/.env)

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=synthia_user
DB_PASSWORD=your_db_password
DB_NAME=synthia

# 豆包 API
DOUBAO_API_KEY=your_doubao_api_key

# 跨域配置
CORS_ORIGIN=https://synthia.example.com
```

---

## 部署流程

### 首次部署

1. **创建 MySQL 数据库**
   ```bash
   mysql -u root -p
   CREATE DATABASE synthia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'synthia_user'@'localhost' IDENTIFIED BY 'your_db_password';
   GRANT ALL PRIVILEGES ON synthia.* TO 'synthia_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. **初始化数据库表结构**
   ```bash
   mysql -u synthia_user -p synthia < api/schema.sql
   ```

3. **配置后端环境变量**
   ```bash
   cd api
   cp .env.example .env
   # 编辑 .env 文件，填入数据库连接信息和豆包 API KEY
   ```

4. **安装后端依赖并启动**
   ```bash
   cd api
   npm install
   npm start
   ```

5. **构建前端**
   ```bash
   cd ..
   npm install
   npm run build
   # 将 dist 目录部署到 Web 服务器（如 Nginx）
   ```

### 日常更新

```bash
# 更新后端
cd api && git pull && npm install && npm restart

# 更新前端
npm run build
# 将 dist 目录重新部署到 Web 服务器
```

---

## 积分系统

### 积分规则

| 操作 | 消耗积分 |
|------|----------|
| 普通生成（每张） | 10 积分 |
| 随机生成（3张） | 30 积分 |
| 新用户注册 | 赠送 100 积分 |

### 积分存储

- 存储在 `users.points` 字段
- 每次变动记录到 `transactions` 表
- 支持充值和消费两种类型

---

## 重要注意事项

### 1. 安全相关

- **API KEY 保护**: 豆包 API KEY 存储在后端 .env 配置文件中，前端不可见
- **Token 认证**: 使用 Token 而非 Cookie，避免跨域问题
- **敏感信息**: 不要在前端代码中打印敏感信息
- **.env 文件**: 确保 .env 文件已加入 .gitignore，不要提交到代码仓库

### 2. 数据清理

- 生成记录 24 小时后自动过期
- 需要配置定时任务（如 cron）调用 `/api/generations/cleanup` 清理

### 3. 跨域配置

后端已配置 CORS：
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};
```

### 4. 测试账户

```
手机号: 13111111111 / 13222222222 / 13333333333
密码: Admin123456
```

---

## 常见问题排查

### 1. 登录后 401 Unauthorized

- 检查 localStorage 中是否有 `synthia_token`
- 检查请求 header 中是否携带 `Authorization: Bearer <token>`

### 2. 图片生成失败

- 检查后端 .env 文件中是否配置了 `DOUBAO_API_KEY`
- 检查豆包 API 是否正常

### 3. 跨域问题

- 确认后端 CORS 配置正确
- 确认前端 API URL 配置正确

### 4. 数据库连接失败

- 确认 MySQL 服务已启动
- 检查 .env 文件中数据库连接信息（DB_HOST、DB_PORT、DB_USER、DB_PASSWORD、DB_NAME）是否正确
- 确认数据库用户权限已正确配置

---

## 未来优化建议

1. **Token 安全性**: 当前 token 只是简单的用户ID，建议改用 JWT
2. **验证码功能**: 当前验证码登录是模拟的，建议接入真实短信服务
3. **支付系统**: 接入真实支付进行积分充值
4. **图片存储**: 当前图片 URL 来自豆包，建议转存到 R2 或其他存储
5. **用户等级**: 增加会员系统，不同等级不同权限
