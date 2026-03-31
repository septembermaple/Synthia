# Synthia - AI 写真生成平台

基于豆包 API 的 AI 写真生成平台，支持多种风格和场景，使用 React + Cloudflare Workers + D1 数据库构建。

## ✨ 功能特性

### 🎨 图片生成
- **多种风格**：专业写真、艺术肖像、时尚杂志、自然户外等9种风格
- **场景选择**：末日废土、古装仙侠、现代都市等6种场景
- **随机生成**："随便来三张"功能，自动选择未使用的描述词
- **批量生成**：支持一次生成1-9张图片

### 👤 用户系统
- **双登录方式**：验证码登录 + 密码登录
- **密码设置**：首次登录引导设置密码
- **测试账户**：内置3个测试账户

### 💰 积分系统
- **积分充值**：支持多种充值金额
- **积分消费**：生成图片消耗积分
- **交易记录**：完整的积分流水

### 📸 历史记录
- **24小时保存**：生成结果保存24小时
- **打包下载**：支持单张和批量下载
- **自动清理**：过期记录自动删除

### 🎲 描述词库
- **30个精选描述**：涵盖各种风格和场景
- **智能去重**：已使用的描述词不会重复

## 🚀 快速开始

### 前置要求
- Node.js >= 16
- npm 或 yarn
- 豆包 API Key

### 本地开发

1. **克隆项目**
```bash
git clone https://github.com/yourusername/synthia.git
cd synthia
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env.local
```

编辑 `.env.local`：
```env
VITE_USE_API=false
VITE_API_URL=http://localhost:8787
VITE_DOUBAO_API_KEY=your_doubao_api_key
```

4. **启动开发服务器**
```bash
npm run dev
```

访问 `http://localhost:5173`

### 使用 Cloudflare D1 数据库

1. **安装 Wrangler**
```bash
npm install -g wrangler
```

2. **登录 Cloudflare**
```bash
wrangler login
```

3. **创建数据库**
```bash
cd api
npm install
npm run db:create
```

4. **更新配置**
编辑 `api/wrangler.toml`，填入数据库ID

5. **初始化数据库**
```bash
npm run db:migrate
```

6. **启动 API**
```bash
npm run dev
```

7. **配置前端**
编辑 `.env.local`：
```env
VITE_USE_API=true
VITE_API_URL=http://localhost:8787
```

## 📦 部署

详细部署指南请查看 [DEPLOYMENT.md](./DEPLOYMENT.md)

### 快速部署

1. **部署 API**
```bash
cd api
npm run deploy
```

2. **构建前端**
```bash
npm run build
```

3. **部署前端**
```bash
wrangler pages deploy dist --project-name=synthia
```

## 🎯 测试账户

```
手机号：13111111111  密码：Admin123456
手机号：13222222222  密码：Admin123456
手机号：13333333333  密码：Admin123456
```

## 🏗️ 项目结构

```
synthia/
├── api/                    # Cloudflare Workers API
│   ├── src/
│   │   └── index.js       # API 入口
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
│   ├── config/
│   │   └── index.js
│   ├── App.jsx
│   └── main.jsx
├── public/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── DEPLOYMENT.md
└── README.md
```

## 🔧 技术栈

### 前端
- React 18
- React Router v6
- Vite
- CSS3 (Glassmorphism)

### 后端
- Cloudflare Workers
- Cloudflare D1 (SQLite)

### API
- 豆包 AI API

## 📊 数据库设计

### 用户表 (users)
- id, phone, password, points, created_at, updated_at

### 交易记录表 (transactions)
- id, user_id, amount, type, description, balance, created_at

### 生成记录表 (generations)
- id, user_id, images, prompt, scene, image_count, created_at, expires_at

### 已使用描述词表 (used_prompts)
- id, user_id, prompt_id, created_at

## 🔐 环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| VITE_USE_API | 是否使用 API | true/false |
| VITE_API_URL | API 地址 | http://localhost:8787 |
| VITE_DOUBAO_API_KEY | 豆包 API 密钥 | your_api_key |

## 📝 开发说明

### 本地存储模式
- 数据保存在 localStorage
- 适合快速开发和测试
- 清除浏览器数据会丢失所有信息

### API 模式
- 数据保存在 Cloudflare D1
- 支持跨设备同步
- 需要部署 Cloudflare Workers

### 切换模式
修改 `.env.local` 中的 `VITE_USE_API` 即可

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [豆包 AI](https://www.doubao.com/)
- [Cloudflare](https://www.cloudflare.com/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
