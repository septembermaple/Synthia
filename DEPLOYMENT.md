# Synthia - Cloudflare 部署指南

## 📋 部署前准备

1. 注册 [Cloudflare](https://dash.cloudflare.com/) 账号
2. 安装 Node.js (v16+)
3. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

## 🚀 部署步骤

### 1. 登录 Cloudflare

```bash
wrangler login
```

### 2. 创建 D1 数据库

```bash
cd api
npm run db:create
```

记录输出的 `database_id`，更新 `wrangler.toml` 文件：

```toml
[[d1_databases]]
binding = "DB"
database_name = "synthia-db"
database_id = "你的数据库ID"
```

### 3. 初始化数据库

```bash
npm run db:migrate
```

### 4. 部署 API

```bash
npm run deploy
```

记录输出的 API URL，例如：`https://synthia-api.your-subdomain.workers.dev`

### 5. 配置前端环境变量

在项目根目录创建 `.env.production`：

```env
VITE_API_URL=https://synthia-api.your-subdomain.workers.dev
VITE_DOUBAO_API_KEY=你的豆包API密钥
```

### 6. 构建前端

```bash
cd ..
npm run build
```

### 7. 部署前端到 Cloudflare Pages

#### 方法一：通过 Dashboard

1. 访问 [Cloudflare Pages](https://pages.cloudflare.com/)
2. 点击"创建项目"
3. 选择"直接上传"
4. 上传 `dist` 文件夹

#### 方法二：通过 Wrangler

```bash
wrangler pages deploy dist --project-name=synthia
```

### 8. 配置定时任务清理过期数据

在 Cloudflare Dashboard 中：

1. 进入 Workers & Pages
2. 选择你的 API Worker
3. 点击"Triggers"标签
4. 添加 Cron Trigger：`0 * * * *`（每小时执行）
5. 配置清理端点：`/api/generations/cleanup`

## 📁 项目结构

```
synthia/
├── api/                    # Cloudflare Workers API
│   ├── src/
│   │   └── index.js       # API 入口文件
│   ├── schema.sql         # 数据库 Schema
│   ├── wrangler.toml      # Workers 配置
│   └── package.json
├── src/                    # React 前端
│   ├── services/
│   │   └── api.js         # API 服务层
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   └── Dashboard.jsx
│   ├── data/
│   │   └── promptLibrary.js
│   └── App.jsx
└── dist/                   # 构建输出
```

## 🔧 本地开发

### 启动 API 服务

```bash
cd api
npm install
npm run dev
```

API 将运行在 `http://localhost:8787`

### 启动前端

```bash
# 在项目根目录
npm install
npm run dev
```

前端将运行在 `http://localhost:5173`

### 本地数据库

```bash
cd api
npm run db:migrate:local
```

本地数据库文件：`.wrangler/state/v3/d1/miniflare-D1DatabaseObject`

## 🔐 环境变量

### API (wrangler.toml)

```toml
[vars]
ENVIRONMENT = "production"
```

### 前端 (.env)

```env
VITE_API_URL=http://localhost:8787
VITE_DOUBAO_API_KEY=你的豆包API密钥
```

## 📊 数据库管理

### 查询数据

```bash
wrangler d1 execute synthia-db --command="SELECT * FROM users"
```

### 导出数据

```bash
wrangler d1 export synthia-db --output=backup.sql
```

### 导入数据

```bash
wrangler d1 execute synthia-db --file=backup.sql
```

## 🔄 API 端点

### 认证相关
- `POST /api/auth/login` - 验证码登录
- `POST /api/auth/login-password` - 密码登录
- `GET /api/auth/me` - 获取当前用户
- `POST /api/auth/update-password` - 修改密码

### 积分相关
- `GET /api/points/balance` - 获取积分余额
- `POST /api/points/add` - 充值积分
- `POST /api/points/consume` - 消费积分
- `GET /api/points/transactions` - 获取交易记录

### 生成记录
- `GET /api/generations` - 获取生成记录
- `POST /api/generations` - 保存生成记录
- `POST /api/generations/cleanup` - 清理过期记录

### 描述词管理
- `GET /api/prompts/used` - 获取已使用的描述词
- `POST /api/prompts/mark-used` - 标记描述词已使用

## 💰 费用估算

### Cloudflare Workers
- 免费额度：100,000 请求/天
- 超出后：$0.50 / 百万请求

### Cloudflare D1
- 免费额度：5GB 存储，500万行读取/天
- 超出后：$5 / GB 存储，$1 / 百万行读取

### Cloudflare Pages
- 免费额度：无限带宽
- 构建：500次/月

**预计月费用：免费**（在免费额度内）

## 🛡️ 安全建议

1. **API 密钥保护**
   - 不要在前端暴露豆包 API 密钥
   - 使用环境变量管理敏感信息

2. **用户认证**
   - 当前使用简单的 User-ID 认证
   - 生产环境建议使用 JWT 或 Session

3. **速率限制**
   - 在 Workers 中添加速率限制
   - 防止 API 滥用

4. **HTTPS**
   - Cloudflare 自动提供 HTTPS
   - 确保所有 API 调用使用 HTTPS

## 📞 故障排查

### API 无法访问
1. 检查 `wrangler.toml` 配置
2. 确认数据库 ID 正确
3. 查看 Workers 日志

### 数据库连接失败
1. 确认数据库已创建
2. 检查 binding 名称是否正确
3. 运行迁移脚本

### 前端无法调用 API
1. 检查 CORS 配置
2. 确认 API URL 正确
3. 查看浏览器控制台错误

## 🎉 部署完成！

访问你的应用：
- 前端：`https://synthia.pages.dev`
- API：`https://synthia-api.your-subdomain.workers.dev`

测试账户：
- 手机号：13111111111 / 13222222222 / 13333333333
- 密码：Admin123456
