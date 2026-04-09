# Synthia 项目说明文档

## 项目概述

Synthia 是一个 AI 写真生成平台，用户可以上传照片，选择不同风格，生成艺术写真图片。项目部署在 Cloudflare 平台上，使用 Cloudflare Workers 作为后端 API，Cloudflare D1 作为数据库，Cloudflare Pages 托管前端。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| 路由 | React Router DOM v6 |
| 后端 | Cloudflare Workers |
| 数据库 | Cloudflare D1 (SQLite) |
| 托管 | Cloudflare Pages |
| AI API | 豆包 Doubao API (图片生成) |

---

## 项目结构

```
synthia/
├── api/                          # 后端 API (Cloudflare Workers)
│   ├── src/
│   │   └── index.js              # API 入口文件，所有接口处理逻辑
│   ├── schema.sql                # 数据库表结构定义
│   ├── wrangler.toml             # Workers 配置文件
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
后端调用豆包 API（API KEY 安全存储在 Workers Secret）
    ↓
流式返回生成的图片 URL
    ↓
前端展示结果，保存记录到数据库
```

**安全设计**:
- API KEY 存储在 Cloudflare Workers Secret，不在前端暴露
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,           -- 手机号
  password TEXT DEFAULT '',             -- 密码（可选）
  points INTEGER DEFAULT 100,           -- 积分余额
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### transactions 表 - 积分交易记录

```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,             -- 用户ID
  amount INTEGER NOT NULL,              -- 金额（正数充值，负数消费）
  type TEXT NOT NULL,                   -- 类型：'充值' 或 '消费'
  description TEXT NOT NULL,            -- 描述
  balance INTEGER NOT NULL,             -- 交易后余额
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### generations 表 - 生成记录

```sql
CREATE TABLE generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,             -- 用户ID
  images TEXT NOT NULL,                 -- 图片URL数组（JSON）
  prompt TEXT NOT NULL,                 -- 使用的描述词
  scene TEXT DEFAULT '',                -- 场景
  image_count INTEGER NOT NULL,         -- 图片数量
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,             -- 过期时间（24小时）
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### used_prompts 表 - 已使用的描述词

```sql
CREATE TABLE used_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  prompt_id INTEGER NOT NULL,           -- 描述词ID
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, prompt_id)            -- 防止重复
);
```

---

## 环境变量

### 前端 (.env.production)

```env
VITE_USE_API=true
VITE_API_URL=https://synthia-api.83123472g.workers.dev
VITE_DOUBAO_API_KEY=xxx   # 注意：此变量已不使用，API KEY 在后端配置
```

### 后端 (Cloudflare Workers Secret)

```bash
# 设置豆包 API KEY
npx wrangler secret put DOUBAO_API_KEY
```

### 后端 (wrangler.toml)

```toml
name = "synthia-api"
main = "src/index.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "synthia-db"
database_id = "551bbb9a-c286-4c9a-b822-3f45fc86a372"

[vars]
ENVIRONMENT = "production"
```

---

## 部署流程

### 首次部署

1. **创建 D1 数据库**
   ```bash
   cd api
   npx wrangler d1 create synthia-db
   # 记录返回的 database_id，更新到 wrangler.toml
   ```

2. **初始化数据库**
   ```bash
   npx wrangler d1 execute synthia-db --remote --file=./schema.sql
   ```

3. **设置 API Secret**
   ```bash
   npx wrangler secret put DOUBAO_API_KEY
   # 输入豆包 API KEY
   ```

4. **部署后端**
   ```bash
   npx wrangler deploy
   ```

5. **构建并部署前端**
   ```bash
   cd ..
   npm run build
   npx wrangler pages deploy dist --project-name=synthia
   ```

### 日常更新

```bash
# 更新后端
cd api && npx wrangler deploy

# 更新前端
npm run build && npx wrangler pages deploy dist --project-name=synthia
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

- **API KEY 保护**: 豆包 API KEY 存储在后端 Workers Secret，前端不可见
- **Token 认证**: 使用 Token 而非 Cookie，避免跨域问题
- **敏感信息**: 不要在前端代码中打印敏感信息

### 2. 数据清理

- 生成记录 24 小时后自动过期
- 需要配置 Cron Trigger 调用 `/api/generations/cleanup` 清理

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

- 检查后端是否配置了 `DOUBAO_API_KEY` Secret
- 检查豆包 API 是否正常

### 3. 跨域问题

- 确认后端 CORS 配置正确
- 确认前端 API URL 配置正确

### 4. 数据库连接失败

- 确认 D1 数据库已创建
- 确认 `wrangler.toml` 中 database_id 正确

---

## 未来优化建议

1. **Token 安全性**: 当前 token 只是简单的用户ID，建议改用 JWT
2. **验证码功能**: 当前验证码登录是模拟的，建议接入真实短信服务
3. **支付系统**: 接入真实支付进行积分充值
4. **图片存储**: 当前图片 URL 来自豆包，建议转存到 R2 或其他存储
5. **用户等级**: 增加会员系统，不同等级不同权限
