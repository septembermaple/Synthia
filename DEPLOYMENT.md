# Synthia - Node.js + Express + MySQL 部署指南

## 📋 部署前准备

1. 安装 Node.js (v18+)
2. 安装 MySQL (5.7+ 或 8.0+)
3. 准备一台服务器（或本地开发机）

## 🚀 部署步骤

### 1. 安装 MySQL 并创建数据库

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库
CREATE DATABASE synthia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 退出 MySQL
EXIT;
```

### 2. 初始化数据库表结构

```bash
cd api
mysql -u root -p synthia < schema.sql
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下关键配置：

```env
# 服务端口
PORT=3000

# 环境：production | development
ENVIRONMENT=production

# MySQL 数据库配置
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=synthia

# JWT 密钥（生产环境务必更换为随机长字符串）
JWT_SECRET=你的JWT密钥

# 豆包 / 方舟 API Key
DOUBAO_API_KEY=你的豆包API密钥

# 管理员手机号（逗号分隔）
ADMIN_PHONES=13111111111,13222222222

# 管理员密钥（用于接口调用鉴权）
ADMIN_SECRET=你的管理员密钥

# CORS 允许的前端域名（逗号分隔）
ALLOWED_ORIGINS=https://your-frontend-domain.com

# 每张图片消耗积分
POINTS_PER_IMAGE=10
```

### 4. 安装依赖并启动 API

```bash
cd api
npm install
npm start
```

API 将运行在 `http://localhost:3000`

### 5. 使用 PM2 管理进程（推荐生产环境）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
cd api
pm2 start src/index.js --name synthia-api

# 设置开机自启
pm2 startup
pm2 save
```

常用 PM2 命令：

```bash
pm2 status              # 查看进程状态
pm2 logs synthia-api    # 查看日志
pm2 restart synthia-api # 重启服务
pm2 stop synthia-api    # 停止服务
pm2 delete synthia-api  # 删除进程
```

### 6. 配置前端环境变量

在项目根目录创建 `.env.production`：

```env
VITE_API_URL=https://your-api-domain.com
VITE_DOUBAO_API_KEY=你的豆包API密钥
```

### 7. 构建前端

```bash
# 在项目根目录
npm install
npm run build
```

### 8. 部署前端

前端构建产物为 `dist` 文件夹，可部署到任意静态托管服务：

#### 方法一：Nginx

```nginx
server {
    listen 80;
    server_name your-frontend-domain.com;
    root /var/www/synthia/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### 方法二：其他静态托管

将 `dist` 文件夹上传至任意静态托管平台，如：
- Vercel
- Netlify
- Cloudflare Pages
- 阿里云 OSS + CDN
- 腾讯云 COS + CDN

### 9. 定时清理（已内置）

项目已通过 `node-cron` 内置了每小时自动清理过期数据的定时任务，无需额外配置。服务启动后自动生效。

## 📁 项目结构

```
synthia/
├── api/                    # Node.js + Express API
│   ├── src/
│   │   └── index.js       # API 入口文件
│   ├── schema.sql         # MySQL 数据库 Schema
│   ├── .env.example       # 环境变量示例
│   ├── .env               # 环境变量（不提交到 Git）
│   └── package.json
├── src/                    # React 前端
│   ├── services/
│   │   └── api.js         # API 服务层
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Admin.jsx
│   │   └── Legal.jsx
│   ├── components/
│   │   ├── ErrorBoundary.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── StatsBar.jsx
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

API 将运行在 `http://localhost:3000`

### 启动前端

```bash
# 在项目根目录
npm install
npm run dev
```

前端将运行在 `http://localhost:5173`

### 本地数据库

确保本地已安装并运行 MySQL，创建数据库后执行 Schema：

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS synthia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p synthia < api/schema.sql
```

## 🔐 环境变量

### API (.env)

```env
PORT=3000
ENVIRONMENT=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=synthia
JWT_SECRET=your_jwt_secret_here
DOUBAO_API_KEY=your_doubao_api_key
ARK_API_KEY=
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-seed-2-0-mini-260215
ADMIN_PHONES=13111111111,13222222222
ADMIN_SECRET=your_admin_secret_here
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
POINTS_PER_IMAGE=10
```

### 前端 (.env)

```env
VITE_API_URL=http://localhost:3000
VITE_DOUBAO_API_KEY=你的豆包API密钥
```

## 📊 数据库管理

### 查询数据

```bash
mysql -u root -p synthia -e "SELECT * FROM users;"
```

### 导出数据

```bash
mysqldump -u root -p synthia > backup.sql
```

### 导入数据

```bash
mysql -u root -p synthia < backup.sql
```

### 执行迁移脚本

```bash
mysql -u root -p synthia < api/migrate-2026-04.sql
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

### 服务器
- 入门级云服务器（1核2G）：约 ¥30~50/月
- 推荐配置（2核4G）：约 ¥60~100/月

### MySQL
- 使用服务器自建 MySQL：免费（含在服务器费用中）
- 云数据库（如 RDS）：约 ¥50~200/月

### 前端托管
- Nginx 自建：免费（含在服务器费用中）
- Vercel / Netlify 免费额度：100GB 带宽/月
- Cloudflare Pages：无限带宽

### AI API 调用
- 豆包/方舟 API：按实际使用量计费

**预计月费用：¥30~100**（取决于服务器配置和 AI API 调用量）

## 🛡️ 安全建议

1. **API 密钥保护**
   - 不要在前端暴露豆包 API 密钥
   - 使用 `.env` 文件管理敏感信息，确保 `.env` 已加入 `.gitignore`

2. **用户认证**
   - 当前使用 JWT + token_version 双重认证
   - 生产环境务必设置强随机 `JWT_SECRET`

3. **速率限制**
   - 服务端已内置基于 IP 和用户的速率限制
   - 可通过 Nginx 添加额外的请求频率限制

4. **HTTPS**
   - 生产环境务必启用 HTTPS
   - 可使用 Let's Encrypt 免费证书
   - 配置 Nginx 反向代理并启用 SSL

5. **数据库安全**
   - 不要使用 root 账号连接数据库，创建专用账号并限制权限
   - 定期备份数据库
   - 限制 MySQL 仅监听本地连接（`bind-address = 127.0.0.1`）

6. **环境变量**
   - 生产环境的 `.env` 文件不要提交到版本控制
   - 定期更换 `JWT_SECRET` 和 `ADMIN_SECRET`

## 📞 故障排查

### API 无法启动
1. 检查 `.env` 配置是否正确
2. 确认 Node.js 版本 >= 18
3. 检查端口 3000 是否被占用
4. 查看 PM2 日志：`pm2 logs synthia-api`

### 数据库连接失败
1. 确认 MySQL 服务已启动
2. 检查 `.env` 中的数据库连接信息
3. 确认数据库已创建：`mysql -u root -p -e "SHOW DATABASES;"`
4. 检查数据库用户权限

### 前端无法调用 API
1. 检查 CORS 配置（`.env` 中的 `ALLOWED_ORIGINS`）
2. 确认 API URL 正确
3. 查看浏览器控制台错误
4. 检查 Nginx 反向代理配置

## 🎉 部署完成！

访问你的应用：
- 前端：`https://your-frontend-domain.com`
- API：`https://your-api-domain.com`

测试账户：
- 手机号：13111111111 / 13222222222 / 13333333333
- 密码：Admin123456
