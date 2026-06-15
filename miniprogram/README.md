# Synthia 微信小程序

这是从现有 React/Vite 前端迁移出的原生微信小程序版本，复用现有 `api/` Node.js 后端。

## 使用方式

1. 启动后端：

```bash
cd api
npm run dev
```

2. 在 `miniprogram/utils/config.js` 修改 `apiBaseUrl`。

本地调试可使用 `http://localhost:3000`，真机和正式发布必须改为已备案、已配置到微信小程序 request 合法域名的 HTTPS 地址。

3. 用微信开发者工具导入 `miniprogram/` 目录。

## 已迁移功能

- 手机号验证码/密码登录
- 图片选择和主图设置
- 场景、风格、尺寸、张数、人脸保持
- 调用 `/api/images/generate-portrait` 生成写真
- 保存生成记录、查看历史、删除历史
- 保存图片到系统相册
- 积分展示、兑换码、积分流水
- 用户协议和隐私政策页面

## 迁移说明

小程序运行时不支持 React、DOM、`localStorage`、浏览器 `fetch` 流读取和 Blob 下载。本版本已替换为原生页面、`wx.request`、`wx.setStorageSync`、`wx.chooseMedia`、`wx.downloadFile` 和 `wx.saveImageToPhotosAlbum`。
