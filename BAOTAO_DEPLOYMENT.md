# Synthia 宝塔面板完整部署指南

> 本指南适用于**全新服务器**，从安装宝塔面板开始，一步一步完成整个项目的部署。

---

## 目录

1. [服务器准备](#1-服务器准备)
2. [安装宝塔面板](#2-安装宝塔面板)
3. [安装 LNMP 环境](#3-安装-lnmp-环境)
4. [创建数据库](#4-创建数据库)
5. [上传项目代码](#5-上传项目代码)
6. [配置后端服务](#6-配置后端服务)
7. [配置前端站点](#7-配置前端站点)
8. [配置 HTTPS](#8-配置-https)
9. [验证部署](#9-验证部署)
10. [常见问题排查](#10-常见问题排查)
11. [安全建议](#11-安全建议)

---

## 1. 服务器准备

### 1.1 服务器要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2核 | 4核 |
| 内存 | 2GB | 4GB |
| 磁盘 | 20GB | 50GB |
| 系统 | CentOS 7.x / Ubuntu 18.04+ | CentOS 7.x |

### 1.2 开放端口

在服务器安全组/防火墙中开放以下端口：

| 端口 | 用途 |
|------|------|
| 80 | HTTP 访问 |
| 443 | HTTPS 访问 |
| 8888 | 宝塔面板（默认） |
| 3000 | 后端 API（临时，后续用反向代理） |

---

## 2. 安装宝塔面板

### 2.1 登录服务器

使用 SSH 工具（如 Xshell、Putty）连接服务器：

```bash
ssh root@你的服务器IP
```

### 2.2 执行安装命令

根据操作系统选择对应命令：

**CentOS / RHEL / Fedora：**
```bash
yum install -y wget && wget -O install.sh http://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec
```

**Ubuntu / Debian：**
```bash
wget -O install.sh http://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

### 2.3 记录登录信息

安装完成后，会显示宝塔面板的登录信息：

```
==================================================================
宝塔面板安装成功！
==================================================================
面板地址: http://你的服务器IP:8888/随机字符
用户名: admin
密码: 随机密码
==================================================================
```

**务必保存好这些信息！**

### 2.4 登录宝塔面板

在浏览器中访问面板地址，输入用户名和密码登录。

---

## 3. 安装 LNMP 环境

### 3.1 进入软件商店

登录宝塔面板后：
1. 左侧菜单 → **软件商店**
2. 点击 **一键安装套件**

### 3.2 选择 LNMP

在弹出的套件选择界面：
- 选择 **LNMP (推荐)**
- 确认版本：
  - Nginx：默认最新版本
  - MySQL：5.7 或 8.0（项目要求 >= 5.7）
  - PHP：默认版本（我们用不到，但宝塔需要）
- 安装方式：**极速安装**
- 点击 **一键安装**

### 3.3 等待安装完成

安装过程可能需要 5-15 分钟，耐心等待。

---

## 4. 创建数据库

### 4.1 进入数据库管理

左侧菜单 → **数据库** → **添加数据库**

### 4.2 创建数据库

填写以下信息：

| 字段 | 值 |
|------|------|
| 数据库名 | `synthia` |
| 用户名 | `synthia_user` |
| 密码 | 设置一个强密码（记下来！） |
| 权限 | 保持默认（本地） |

点击 **提交**。

### 4.3 导入数据库结构

1. 在数据库列表中找到 `synthia`，点击右侧的 **管理** 按钮
2. 进入 phpMyAdmin 界面
3. 点击顶部菜单 **导入**
4. 点击 **选择文件**，选择项目中的 `api/schema.sql` 文件
5. 点击底部 **执行** 按钮

---

## 5. 上传项目代码

### 5.1 创建目录结构

1. 左侧菜单 → **文件**
2. 进入 `/www/wwwroot/` 目录
3. 创建两个目录：
   - `synthia-frontend`：存放前端代码
   - `synthia-api`：存放后端代码

### 5.2 上传代码

有两种方式：

**方式一：使用宝塔文件管理上传**

1. 进入 `synthia-api` 目录，点击 **上传**
2. 上传项目 `api/` 目录下的所有文件
3. 进入 `synthia-frontend` 目录，上传项目根目录下除 `api/` 外的所有文件

**方式二：使用 Git 克隆（推荐）**

1. 左侧菜单 → **终端**
2. 进入 `/www/wwwroot/` 目录：
```bash
cd /www/wwwroot/
```
3. 克隆项目：
```bash
git clone 你的仓库地址 synthia-project
```
4. 移动文件：
```bash
mv synthia-project/api/* synthia-api/
mv synthia-project/* synthia-frontend/
rm -rf synthia-project
```

---

## 6. 配置后端服务

### 6.1 安装 Node.js

1. 左侧菜单 → **软件商店** → **运行环境**
2. 找到 **Node.js**，点击 **安装**
3. 选择版本：推荐 **20.x LTS**
4. 等待安装完成

### 6.2 安装 PM2 管理器

1. 在软件商店中搜索 **PM2 管理器**
2. 点击 **安装**

### 6.3 配置环境变量

1. 进入 `/www/wwwroot/synthia-api/` 目录
2. 找到 `.env.example` 文件，复制一份并重命名为 `.env`
3. 编辑 `.env` 文件：

```bash
# 服务端口
PORT=3000

# 环境：production | development
ENVIRONMENT=production

# MySQL 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=synthia_user
DB_PASSWORD=你设置的数据库密码
DB_NAME=synthia

# JWT 密钥（生产环境务必更换为随机长字符串）
JWT_SECRET=生成一个随机长字符串（如：openssl rand -hex 32）

# 豆包 / 方舟 API Key
DOUBAO_API_KEY=你的豆包API密钥
ARK_API_KEY=
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-seed-2-0-mini-260215

# 管理员手机号（逗号分隔）
ADMIN_PHONES=13111111111,13222222222

# 管理员密钥（用于接口调用鉴权）
ADMIN_SECRET=你的管理员密钥

# CORS 允许的前端域名（逗号分隔）
ALLOWED_ORIGINS=https://你的域名

# 每张图片消耗积分
POINTS_PER_IMAGE=10
```

### 6.4 安装后端依赖

1. 左侧菜单 → **终端**
2. 进入后端目录：
```bash
cd /www/wwwroot/synthia-api/
```
3. 安装依赖：
```bash
npm install
```

### 6.5 启动后端服务

1. 左侧菜单 → **PM2 管理器**
2. 点击 **添加项目**
3. 填写信息：

| 字段 | 值 |
|------|------|
| 项目名称 | `synthia-api` |
| 项目路径 | `/www/wwwroot/synthia-api` |
| 启动文件 | `src/index.js` |
| 启动方式 | `npm start` |

4. 点击 **提交**

5. 验证启动：确保状态为 **online**

---

## 7. 配置前端站点

### 7.1 创建网站

1. 左侧菜单 → **网站** → **添加站点**
2. 填写信息：

| 字段 | 值 |
|------|------|
| 域名 | 你的域名（如 `synthia.example.com`） |
| 根目录 | `/www/wwwroot/synthia-frontend/dist` |
| PHP版本 | 选择 **纯静态** |
| 数据库 | 不创建（已有） |

3. 点击 **提交**

### 7.2 构建前端

1. 左侧菜单 → **终端**
2. 进入前端目录：
```bash
cd /www/wwwroot/synthia-frontend/
```
3. 安装依赖：
```bash
npm install
```
4. 创建生产环境配置文件：
```bash
echo 'VITE_API_URL=https://你的域名/api' > .env.production
```
5. 构建前端：
```bash
npm run build
```

### 7.3 配置反向代理

1. 在网站列表中找到你的站点，点击 **设置**
2. 点击 **反向代理** → **添加反向代理**
3. 填写：

| 字段 | 值 |
|------|------|
| 代理名称 | `api` |
| 目标URL | `http://127.0.0.1:3000` |
| 代理目录 | `/api/` |

4. 点击 **提交**

### 7.4 配置前端路由

1. 在网站设置中点击 **配置文件**
2. 找到 `location /` 块，修改为：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

3. 点击 **保存**

---

## 8. 配置 HTTPS

### 8.1 申请 SSL 证书

1. 在网站设置中点击 **SSL**
2. 选择 **Let's Encrypt**
3. 勾选你的域名
4. 点击 **申请**

### 8.2 强制 HTTPS

1. 申请成功后，勾选 **强制 HTTPS**
2. 点击 **保存**

---

## 9. 验证部署

### 9.1 测试前端

访问 `https://你的域名`，应能看到 Synthia 应用界面。

### 9.2 测试 API

访问 `https://你的域名/api/auth/me`，应返回：
```json
{"error":"未登录"}
```

### 9.3 测试登录功能

在应用中尝试登录，应能成功获取用户信息。

### 9.4 测试图片生成

尝试生成一张图片，验证积分系统和图片生成功能正常。

---

## 10. 常见问题排查

### 问题 1：前端无法访问

- **检查**：Nginx 是否启动
- **解决**：左侧菜单 → **软件商店** → 找到 Nginx → 点击 **重启**

### 问题 2：API 无法访问

- **检查**：PM2 中 `synthia-api` 是否在线
- **检查**：防火墙是否开放 3000 端口（临时）
- **检查**：反向代理配置是否正确

### 问题 3：数据库连接失败

- **检查**：`.env` 中的数据库配置是否正确
- **检查**：数据库用户是否有访问权限
- **检查**：MySQL 服务是否启动

### 问题 4：前端构建失败

- **检查**：Node.js 版本是否 >= 18
- **检查**：依赖是否安装成功
- **检查**：`.env.production` 文件是否正确

### 问题 5：图片生成失败

- **检查**：`DOUBAO_API_KEY` 是否正确配置
- **检查**：服务器网络是否能访问外部 API

---

## 11. 安全建议

### 11.1 修改宝塔面板端口

1. 左侧菜单 → **面板设置**
2. 修改 **面板端口**（如改为 8889）
3. 在安全组中开放新端口，关闭旧端口

### 11.2 加强数据库安全

1. 禁止数据库远程访问（保持默认配置）
2. 使用强密码
3. 定期备份数据库

### 11.3 定期更新

1. 定期更新宝塔面板
2. 定期更新系统软件
3. 定期更新项目代码

### 11.4 开启防火墙

1. 左侧菜单 → **安全** → **防火墙**
2. 只开放必要端口（80、443、宝塔端口）

---

## 附录：常用命令

### PM2 管理命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs synthia-api

# 重启服务
pm2 restart synthia-api

# 停止服务
pm2 stop synthia-api
```

### Nginx 命令

```bash
# 重启 Nginx
service nginx restart

# 查看 Nginx 状态
service nginx status

# 检查配置
nginx -t
```

### MySQL 命令

```bash
# 登录 MySQL
mysql -u synthia_user -p

# 备份数据库
mysqldump -u synthia_user -p synthia > backup.sql

# 恢复数据库
mysql -u synthia_user -p synthia < backup.sql
```

---

**部署完成！** 🎉

如有问题，请查看宝塔面板日志或联系技术支持。
