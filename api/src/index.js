import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import nodeCron from 'node-cron';

dotenv.config();

// =============== 配置 ===============

const PORT = parseInt(process.env.PORT || '3000', 10);
const PBKDF2_ITERATIONS = 100000;
const POINTS_PER_IMAGE_DEFAULT = 10;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_DISABLED_MARKER = 'pbkdf2$disabled$00$00';

const PROMPT_BLACKLIST = [
  '色情', '裸体', '裸露', '性器官', '强奸', '乱伦', '儿童色情', '未成年裸',
  '暴力', '血腥', '斩首', '自杀', '杀人',
  '毒品', '吸毒', '冰毒', '海洛因',
  '恐怖', '炸弹', '枪支', '爆炸物制作',
  '法轮功', '反共', '台独', '港独', '藏独',
];

const PORTRAIT_RULE_IMAGE_PRECEDENCE =
  '（人物以上传参考图为准；若文案在性别与画面人物不一致，以图片为准，并且帮我重新生成该段的合适描述。）';
const PORTRAIT_RULE_KEEP_FACE = '（保持图中人物的五官不变）';

const IMAGE_GEN_SIZE_BANDS = new Set(['1K', '2K', '3K', '4K']);
const SIZE_BAND_ORDER = ['1K', '2K', '3K', '4K'];

function orderSizeBands(list) {
  const set = new Set(list.filter(b => IMAGE_GEN_SIZE_BANDS.has(b)));
  return SIZE_BAND_ORDER.filter(b => set.has(b));
}

function labelForOutputSizeBand(value) {
  switch (value) {
    case '1K': return '1K · 标清（相对更快）';
    case '2K': return '2K · 推荐';
    case '3K': return '3K · 更清晰';
    case '4K': return '4K · 超高细节';
    default: return value;
  }
}

function parseConfiguredOutputSizes(infoField) {
  if (typeof infoField !== 'string' || !infoField.trim()) return null;
  try {
    const obj = JSON.parse(infoField);
    if (!obj || typeof obj !== 'object') return null;
    const arr = obj.output_sizes || obj.image_output_sizes || obj.sizes;
    if (!Array.isArray(arr)) return null;
    const bands = arr.map((x) => String(x).trim().toUpperCase()).filter((b) => IMAGE_GEN_SIZE_BANDS.has(b));
    const ordered = orderSizeBands(bands);
    return ordered.length ? ordered : null;
  } catch {
    return null;
  }
}

function inferOutputSizeBandsFromModelIdentifier(modelId) {
  const id = String(modelId || '').toLowerCase();
  if (!id) return orderSizeBands(['2K', '3K', '4K']);
  if (/seedream-5|seedream.?5|seed-5|_-5-|\.5\b/i.test(id)) {
    return orderSizeBands(['2K', '3K']);
  }
  if (/seedream-4|seedream.?4|seed.?4-|\.4\b/i.test(id)) {
    return orderSizeBands(['1K', '2K', '4K']);
  }
  if (/seedream/i.test(id)) {
    return orderSizeBands(['1K', '2K', '3K', '4K']);
  }
  return orderSizeBands(['2K', '3K', '4K']);
}

function resolveBandsFromImageModelRow(model) {
  const modelApiId = model?.model_id || 'doubao-seedream-4-0-250828';
  const fromConfig = model ? parseConfiguredOutputSizes(model.info) : null;
  if (fromConfig && fromConfig.length) return fromConfig;
  return inferOutputSizeBandsFromModelIdentifier(modelApiId);
}

function sanitizeImageGenerationSize(raw) {
  if (typeof raw !== 'string') return '2K';
  const trimmed = raw.trim().replace(/\s+/g, '');
  const px = /^(\d{3,4})x(\d{3,4})$/i.exec(trimmed);
  if (px) {
    const W = Number(px[1]);
    const H = Number(px[2]);
    if (W >= 512 && W <= 8192 && H >= 512 && H <= 8192) {
      return `${W}x${H}`;
    }
  }
  const band = trimmed.toUpperCase();
  if (IMAGE_GEN_SIZE_BANDS.has(band)) return band;
  return '2K';
}

function clampImageSizeToAllowedBands(canonicalSize, allowedBands) {
  if (!allowedBands || allowedBands.length === 0) return canonicalSize;
  if (/^\d{3,4}x\d{3,4}$/i.test(canonicalSize)) {
    return canonicalSize;
  }
  const set = new Set(allowedBands);
  if (set.has(canonicalSize)) return canonicalSize;
  return allowedBands[0] || '2K';
}

function buildPortraitFinalPrompt(llmBody, keepFace, imageCount) {
  const kf = keepFace === true || keepFace === 1 || keepFace === '1';
  const body = typeof llmBody === 'string' ? llmBody : '';
  const n =
    typeof imageCount === 'number' && Number.isFinite(imageCount) && imageCount > 0
      ? imageCount
      : 1;
  const countClause = `（我要生成${n}张图片）`;
  if (kf) {
    return countClause + PORTRAIT_RULE_KEEP_FACE + PORTRAIT_RULE_IMAGE_PRECEDENCE + body;
  }
  return countClause + PORTRAIT_RULE_IMAGE_PRECEDENCE + body;
}

function collectHttpsUrlsUnique(root) {
  const seen = new Set();
  const out = [];
  const visit = (node, depth) => {
    if (depth > 24 || node == null) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node) && !seen.has(node)) {
        seen.add(node);
        out.push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) visit(x, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      if (typeof node.url === 'string') visit(node.url, depth + 1);
      for (const k of Object.keys(node)) {
        if (k !== 'url') visit(node[k], depth + 1);
      }
    }
  };
  visit(root, 0);
  return out;
}

function extractUrlsFromUpstreamImageBody(rawBody) {
  let parsedJson = null;
  const accumulated = [];
  const seen = new Set();
  const addAll = (from) => {
    for (const u of collectHttpsUrlsUnique(from)) {
      if (!seen.has(u)) {
        seen.add(u);
        accumulated.push(u);
      }
    }
  };

  if (typeof rawBody !== 'string') {
    return { urls: [], parsedJson };
  }
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return { urls: [], parsedJson };
  }

  try {
    parsedJson = JSON.parse(trimmed);
    addAll(parsedJson);
    if (accumulated.length > 0) return { urls: accumulated, parsedJson };
  } catch {
    parsedJson = null;
  }

  for (const line of rawBody.split('\n')) {
    const t = line.trim().replace(/\r$/, '');
    if (!t.startsWith('data:')) continue;
    const ds = t.substring(5).trim();
    if (!ds || ds === '[DONE]') continue;
    try {
      const evt = JSON.parse(ds);
      addAll(evt);
    } catch {}
  }

  return { urls: accumulated, parsedJson };
}

async function collectImageUrlsFromArkSseStream(body) {
  if (!body) return [];
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawFull = '';
  const accumulated = [];
  const seen = new Set();
  const addAll = (from) => {
    for (const u of collectHttpsUrlsUnique(from)) {
      if (!seen.has(u)) {
        seen.add(u);
        accumulated.push(u);
      }
    }
  };
  const handleLine = (line) => {
    const t = line.trim().replace(/\r$/, '');
    if (!t.startsWith('data:')) return;
    const ds = t.substring(5).trim();
    if (!ds || ds === '[DONE]') return;
    try {
      addAll(JSON.parse(ds));
    } catch {}
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      rawFull += chunk;
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) handleLine(line);
    }
    for (const line of buffer.split('\n')) handleLine(line);
    if (accumulated.length === 0 && rawFull.trim()) {
      const extra = extractUrlsFromUpstreamImageBody(rawFull);
      for (const u of extra.urls) {
        if (!seen.has(u)) {
          seen.add(u);
          accumulated.push(u);
        }
      }
    }
  } catch {
    try { reader.releaseLock(); } catch {}
  }
  return accumulated;
}

// =============== MySQL 连接池 ===============

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'synthia',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: '+08:00',
});

// =============== 工具函数 ===============

function isProduction() {
  return process.env.ENVIRONMENT === 'production';
}

function maskError(error) {
  if (isProduction()) {
    return '服务器内部错误，请稍后再试';
  }
  return error?.message || '服务器内部错误';
}

function logError(tag, error) {
  if (!isProduction()) {
    console.error(`[${tag}]`, error?.stack || error?.message || error);
    return;
  }
  console.error(`[${tag}] ${error?.message || 'unknown'}`);
}

function debugLog(...args) {
  if (!isProduction()) {
    console.log(...args);
  }
}

function isValidPhone(phone) {
  return typeof phone === 'string' && /^1[3-9]\d{9}$/.test(phone);
}

function isNonEmptyString(value, maxLen = 2000) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLen;
}

function isPositiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value > 0 && value <= max;
}

function parsePositiveInt(value, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > max) return null;
  return n;
}

function isAdminPhone(phone) {
  const list = (process.env.ADMIN_PHONES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return !!phone && list.includes(phone);
}

function checkAdminSecret(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-admin-secret'];
  return !!provided && provided === secret;
}

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 6 || password.length > 128) return false;
  if (!/[A-Za-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  return true;
}

function isImageDataUrl(value) {
  if (typeof value !== 'string') return false;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m) return false;
  const b64 = m[2];
  const head = b64.slice(0, 16);
  let bin;
  try { bin = Buffer.from(head, 'base64').toString('binary'); } catch { return false; }
  if (bin.length < 4) return false;
  const b0 = bin.charCodeAt(0), b1 = bin.charCodeAt(1), b2 = bin.charCodeAt(2), b3 = bin.charCodeAt(3);
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return true;
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return true;
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return true;
  return false;
}

function containsBlockedKeyword(text) {
  if (typeof text !== 'string' || !text) return null;
  const lower = text.toLowerCase();
  for (const word of PROMPT_BLACKLIST) {
    if (text.includes(word) || lower.includes(word.toLowerCase())) {
      return word;
    }
  }
  return null;
}

function getClientIp(req) {
  return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function getUserId(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// =============== JWT ===============

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(str) {
  return base64UrlEncode(Buffer.from(str, 'utf-8'));
}

function base64UrlDecodeToString(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    Buffer.from(secret, 'utf-8'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJwt(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET未配置');
  const headerB64 = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, Buffer.from(signingInput, 'utf-8'));
  const signatureB64 = base64UrlEncode(Buffer.from(signature));
  return `${signingInput}.${signatureB64}`;
}

async function generateToken(userId, tokenVersion = 0) {
  const now = Math.floor(Date.now() / 1000);
  return await signJwt({
    sub: String(userId),
    ver: Number(tokenVersion) || 0,
    typ: 'access',
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  });
}

async function generateRefreshToken(userId, tokenVersion = 0) {
  const now = Math.floor(Date.now() / 1000);
  return await signJwt({
    sub: String(userId),
    ver: Number(tokenVersion) || 0,
    typ: 'refresh',
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_SECONDS,
  });
}

async function issueTokenPair(userId, tokenVersion = 0) {
  const [token, refreshToken] = await Promise.all([
    generateToken(userId, tokenVersion),
    generateRefreshToken(userId, tokenVersion),
  ]);
  return { token, refreshToken };
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function decodeAndVerifyJwt(token, expectedType) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, Buffer.from(signingInput, 'utf-8'));
  const expectedSigB64 = base64UrlEncode(Buffer.from(expectedSig));
  if (!constantTimeEqual(expectedSigB64, signatureB64)) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || !payload?.exp || payload.exp < now) return null;
  if (expectedType && payload.typ && payload.typ !== expectedType) return null;
  if (expectedType === 'access' && !payload.typ) {
    // 兼容旧 token
  }

  try {
    const [rows] = await pool.execute('SELECT token_version FROM users WHERE id = ?', [payload.sub]);
    if (!rows.length) return null;
    const currentVer = Number(rows[0].token_version || 0);
    const payloadVer = Number(payload.ver || 0);
    if (currentVer !== payloadVer) return null;
  } catch (error) {
    logError('token-version-check', error);
  }

  return payload;
}

async function verifyTokenAndGetUserId(token) {
  const payload = await decodeAndVerifyJwt(token, 'access');
  return payload ? String(payload.sub) : null;
}

// =============== 密码 ===============

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function fromHex(hex) {
  return Buffer.from(hex, 'hex');
}

async function hashPassword(password) {
  const iterations = PBKDF2_ITERATIONS;
  const salt = crypto.randomBytes(16);
  const key = await crypto.subtle.importKey('raw', Buffer.from(password, 'utf-8'), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  const hash = Buffer.from(bits);
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(hash)}`;
}

async function verifyPassword(inputPassword, storedPassword) {
  if (typeof inputPassword !== 'string' || typeof storedPassword !== 'string') return false;
  if (!storedPassword.startsWith('pbkdf2$')) return false;
  const [, iterText, saltHex, hashHex] = storedPassword.split('$');
  const iterations = parseInt(iterText, 10);
  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > PBKDF2_ITERATIONS) return false;

  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);

  const key = await crypto.subtle.importKey('raw', Buffer.from(inputPassword, 'utf-8'), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  const actual = Buffer.from(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

// =============== 数据库操作封装 ===============

async function dbFirst(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function dbAll(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function dbRun(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows,
    changedRows: result.changedRows,
  };
}

async function dbBatch(statements) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const results = [];
    for (const { sql, params } of statements) {
      const [r] = await conn.execute(sql, params);
      results.push({
        insertId: r.insertId,
        affectedRows: r.affectedRows,
        changedRows: r.changedRows,
      });
    }
    await conn.commit();
    return results;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// =============== 限流 ===============

async function checkRateLimit(key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  try {
    // MySQL UPSERT: INSERT ... ON DUPLICATE KEY UPDATE
    const row = await dbFirst(
      `INSERT INTO auth_rate_limits (\`key\`, count, window_start)
       VALUES (?, 1, ?)
       ON DUPLICATE KEY UPDATE
         count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`,
      [key, now, now, windowSeconds, now, windowSeconds, now]
    );
    // ON DUPLICATE KEY UPDATE 不返回更新后的值，需要再查一次
    const updated = await dbFirst('SELECT count FROM auth_rate_limits WHERE `key` = ?', [key]);
    const count = Number(updated?.count || 0);
    if (count > limit) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, limit - count) };
  } catch (error) {
    logError('rate-limit', error);
    return { allowed: true, remaining: limit };
  }
}

// =============== 积分操作 ===============

async function deductPointsAtomic(userId, amount, description) {
  if (!isPositiveInteger(amount)) {
    return { ok: false, reason: 'invalid', message: '扣减金额无效' };
  }
  try {
    const safeDesc = (typeof description === 'string' ? description : '消费').slice(0, 200);
    const results = await dbBatch([
      {
        sql: 'UPDATE users SET points = points - ?, updated_at = NOW() WHERE id = ? AND points >= ?',
        params: [amount, userId, amount],
      },
      {
        sql: `INSERT INTO transactions (user_id, amount, type, description, balance)
              SELECT ?, ?, '消费', ?, points FROM users WHERE id = ?`,
        params: [userId, -amount, safeDesc, userId],
      },
    ]);
    if (!results?.[0]?.affectedRows) {
      return { ok: false, reason: 'insufficient', message: '积分不足' };
    }
    const user = await dbFirst('SELECT points FROM users WHERE id = ?', [userId]);
    return { ok: true, balance: user?.points ?? 0 };
  } catch (error) {
    logError('deductPoints', error);
    return { ok: false, reason: 'error', message: '扣减失败' };
  }
}

async function refundPoints(userId, amount, description) {
  if (!isPositiveInteger(amount)) return { ok: false };
  try {
    const safeDesc = (typeof description === 'string' ? description : '退款').slice(0, 200);
    const results = await dbBatch([
      {
        sql: 'UPDATE users SET points = points + ?, updated_at = NOW() WHERE id = ?',
        params: [amount, userId],
      },
      {
        sql: `INSERT INTO transactions (user_id, amount, type, description, balance)
              SELECT ?, ?, '退款', ?, points FROM users WHERE id = ?`,
        params: [userId, amount, safeDesc, userId],
      },
    ]);
    if (!results?.[0]?.affectedRows) return { ok: false };
    const user = await dbFirst('SELECT points FROM users WHERE id = ?', [userId]);
    return { ok: true, balance: user?.points ?? 0 };
  } catch (error) {
    logError('refundPoints', error);
    return { ok: false };
  }
}

// =============== 模型查询 ===============

async function getDefaultModel(modelType) {
  try {
    return await dbFirst(
      'SELECT * FROM ai_models WHERE model_type = ? AND enabled = 1 ORDER BY is_default DESC, id DESC LIMIT 1',
      [modelType]
    );
  } catch (error) {
    logError('getDefaultModel', error);
    return null;
  }
}

async function logUsage({ userId, model, modelType, units, pointsCost, success, errorMsg, durationMs }) {
  try {
    await dbRun(
      `INSERT INTO api_usage_logs
        (user_id, model_id, model_type, model_name, units, points_cost, success, error_msg, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        model?.id || null,
        modelType,
        model?.display_name || model?.model_id || '',
        units || 1,
        pointsCost || 0,
        success ? 1 : 0,
        (errorMsg || '').slice(0, 500),
        durationMs || 0,
      ]
    );
  } catch (error) {
    logError('logUsage', error);
  }
}

async function getTodayUsageCount(modelId) {
  try {
    const row = await dbFirst(
      "SELECT COALESCE(SUM(units), 0) AS used FROM api_usage_logs WHERE model_id = ? AND success = 1 AND DATE(created_at) = CURDATE()",
      [modelId]
    );
    return Number(row?.used || 0);
  } catch (error) {
    logError('getTodayUsageCount', error);
    return 0;
  }
}

// =============== 管理员权限 ===============

async function requireAdmin(req) {
  if (checkAdminSecret(req)) {
    return { ok: true, userId: null, phone: null };
  }
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return { ok: false, status: 401, error: '未登录' };
  }
  const user = await dbFirst('SELECT phone FROM users WHERE id = ?', [userId]);
  if (!user || !isAdminPhone(user.phone)) {
    return { ok: false, status: 403, error: '无管理员权限' };
  }
  return { ok: true, userId: Number(userId), phone: user.phone };
}

async function logAdminAudit({ adminUserId, adminPhone, action, target, payload }) {
  try {
    let payloadStr = '';
    if (payload != null) {
      try { payloadStr = JSON.stringify(payload).slice(0, 2000); } catch { payloadStr = ''; }
    }
    await dbRun(
      `INSERT INTO admin_audit_logs (admin_user_id, admin_phone, action, target, payload)
       VALUES (?, ?, ?, ?, ?)`,
      [
        adminUserId || null,
        (adminPhone || '').slice(0, 20),
        String(action || '').slice(0, 100),
        String(target || '').slice(0, 200),
        payloadStr,
      ]
    );
  } catch (error) {
    logError('logAdminAudit', error);
  }
}

// =============== Express 应用 ===============

const app = express();

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // 非浏览器请求（无 origin）放行
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '10mb' }));

// 安全头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

// =============== 图片输出尺寸 ===============

app.get('/api/images/output-sizes', async (req, res) => {
  try {
    let model = null;
    try { model = await getDefaultModel('image'); } catch {}
    const bands = resolveBandsFromImageModelRow(model);
    const fallback = bands[0] || '2K';
    const sizes = bands.map((value) => ({
      value,
      label: labelForOutputSizeBand(value),
    }));
    return res.json({ sizes, defaultSize: fallback });
  } catch (error) {
    logError('output-sizes', error);
    const fallbackBands = ['2K', '3K', '4K'];
    return res.json({
      sizes: fallbackBands.map((value) => ({ value, label: labelForOutputSizeBand(value) })),
      defaultSize: '2K',
    });
  }
});

// =============== LLM 提示词生成 ===============

async function invokePortraitLlmPrompt({ userId, scene, style, gender }, signal) {
  const arkApiKey = process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY;
  if (!arkApiKey) {
    return { ok: false, error: '服务不可用', status: 500 };
  }
  let model = null;
  try { model = await getDefaultModel('text'); } catch {}
  const arkApiUrl = model?.api_url || process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  const arkModel = model?.model_id || process.env.ARK_MODEL || 'doubao-seed-2-0-mini-260215';

  const inputKeyword = `[关键词：人物性别为${gender}，场景为：${scene}，风格为：${style || '未指定'}][我需要你帮我生成一段顶级的写真指令描述，包括但不限于风格，场景，人物（需与上述性别一致），动作，镜头，光学，表情等。待会我要用这段描述给图片大模型生成图片]`;

  const startedAt = Date.now();
  try {
    const response = await fetch(arkApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${arkApiKey}`
      },
      body: JSON.stringify({
        model: arkModel,
        messages: [
          { role: 'system', content: 'You are a professional photography prompt expert. Generate detailed and creative photography prompts.' },
          { role: 'user', content: inputKeyword }
        ]
      }),
      signal,
    });

    if (!response.ok) {
      await logUsage({
        userId, model, modelType: 'text', units: 1,
        pointsCost: 0, success: false,
        errorMsg: `upstream ${response.status}`,
        durationMs: Date.now() - startedAt,
      });
      return { ok: false, error: '文案生成服务异常', status: 502 };
    }

    const data = await response.json();
    const generatedPrompt = data?.choices?.[0]?.message?.content;

    if (!generatedPrompt || typeof generatedPrompt !== 'string') {
      await logUsage({
        userId, model, modelType: 'text', units: 1,
        pointsCost: 0, success: false,
        errorMsg: 'empty response',
        durationMs: Date.now() - startedAt,
      });
      return { ok: false, error: '文案生成失败', status: 502 };
    }

    await logUsage({
      userId, model, modelType: 'text', units: 1,
      pointsCost: model?.price_per_unit || 0,
      success: true,
      durationMs: Date.now() - startedAt,
    });

    return { ok: true, text: generatedPrompt.trim() };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, error: '已取消', status: 408, abort: true };
    }
    logError('portrait-llm', error);
    await logUsage({
      userId, model, modelType: 'text', units: 1,
      pointsCost: 0, success: false,
      errorMsg: error?.message || 'unknown',
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, error: maskError(error), status: 500 };
  }
}

// =============== 生成记录持久化 ===============

async function persistPortraitGeneration(userId, imageUrls, sceneName, preview, fullPrompt) {
  const safePrompt = typeof preview === 'string' ? preview.slice(0, 4000) : '';
  const safePromptFull = typeof fullPrompt === 'string' ? fullPrompt.slice(0, 8000) : '';
  const safeScene = typeof sceneName === 'string' ? sceneName.slice(0, 200) : '';
  const n = Array.isArray(imageUrls) ? imageUrls.length : 0;
  if (n === 0) return null;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const result = await dbRun(
    'INSERT INTO generations (user_id, images, prompt, prompt_full, scene, image_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, JSON.stringify(imageUrls), safePrompt, safePromptFull, safeScene, n, expiresAt]
  );
  return result.insertId;
}

// =============== 写真生成管线 ===============

app.post('/api/images/generate-portrait', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务不可用' });
  }

  const ip = getClientIp(req);
  const llmRate = await checkRateLimit(`llm:${userId}`, 20, 60);
  if (!llmRate.allowed) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const imgRate = await checkRateLimit(`img:${userId}`, 10, 60);
  if (!imgRate.allowed) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const ipRate = await checkRateLimit(`img-ip:${ip}`, 30, 60);
  if (!ipRate.allowed) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }

  const { scene, style, gender, keepFace, imageBase64, imageCount, size: rawSize } = body;

  if (!isNonEmptyString(scene, 200)) {
    return res.status(400).json({ error: '场景参数无效' });
  }
  if (style !== undefined && style !== null && (typeof style !== 'string' || style.length > 200)) {
    return res.status(400).json({ error: '风格参数无效' });
  }
  const genderLabel = gender === '男' || gender === '女' ? gender : '女';

  if (containsBlockedKeyword(scene) || containsBlockedKeyword(style || '')) {
    return res.status(400).json({ error: '场景或风格包含敏感内容' });
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return res.status(400).json({ error: '图片参数无效' });
  }
  if (imageBase64.length > 6 * 1024 * 1024) {
    return res.status(413).json({ error: '图片过大，请压缩后重试' });
  }
  if (!isImageDataUrl(imageBase64)) {
    return res.status(400).json({ error: '图片格式无效，仅支持 JPG/PNG/WEBP' });
  }
  const safeImageCount = parsePositiveInt(imageCount, 10);
  if (!safeImageCount) {
    return res.status(400).json({ error: '生成数量需为 1~10' });
  }
  const keepFaceBool = keepFace === true || keepFace === 1 || keepFace === '1';

  const model = await getDefaultModel('image');
  const outputBandsForPortrait = resolveBandsFromImageModelRow(model);
  const safeSize = clampImageSizeToAllowedBands(sanitizeImageGenerationSize(rawSize), outputBandsForPortrait);
  const modelApiId = model?.model_id || 'doubao-seedream-4-0-250828';
  const modelApiUrl = model?.api_url || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
  const pointsPerImage = model?.price_per_unit
    || parsePositiveInt(process.env.POINTS_PER_IMAGE, 10000)
    || POINTS_PER_IMAGE_DEFAULT;
  const totalCost = pointsPerImage * safeImageCount;

  if (model?.quota_daily && model.quota_daily > 0) {
    const used = await getTodayUsageCount(model.id);
    if (used + safeImageCount > model.quota_daily) {
      return res.status(429).json({ error: '今日模型调用额度已满' });
    }
  }

  const deduct = await deductPointsAtomic(userId, totalCost, `生成${safeImageCount}张图片`);
  if (!deduct.ok) {
    const status = deduct.reason === 'insufficient' ? 402 : 500;
    return res.status(status).json({ error: deduct.message });
  }

  // 移除 req.signal，避免请求被提前取消
  // const signal = req.signal;
  const signal = undefined;
  const startedAt = Date.now();

  try {
    const llm = await invokePortraitLlmPrompt(
      { userId, scene, style: typeof style === 'string' ? style : '', gender: genderLabel },
      signal
    );
    if (llm.abort) {
      await refundPoints(userId, totalCost, '用户取消退款');
      return res.status(408).json({ error: '已取消' });
    }
    if (!llm.ok || !llm.text) {
      await refundPoints(userId, totalCost, '文案生成失败退款');
      await logUsage({
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: llm.error || 'llm failed',
        durationMs: Date.now() - startedAt,
      });
      return res.status(llm.status || 502).json({ error: llm.error || '文案生成失败' });
    }

    let finalPrompt = buildPortraitFinalPrompt(llm.text, keepFaceBool, safeImageCount);
    if (!isNonEmptyString(finalPrompt, 4000)) {
      await refundPoints(userId, totalCost, '文案为空退款');
      return res.status(502).json({ error: '文案生成异常' });
    }

    const blocked = containsBlockedKeyword(finalPrompt);
    if (blocked) {
      await refundPoints(userId, totalCost, '提示词校验失败退款');
      await logUsage({
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: 'blocked composed prompt',
        durationMs: Date.now() - startedAt,
      });
      return res.status(400).json({ error: '生成内容不合规，已拒绝' });
    }

    const useImageStream = safeImageCount > 1;
    const requestData = {
      model: modelApiId,
      prompt: finalPrompt,
      image: [imageBase64],
      sequential_image_generation: 'auto',
      sequential_image_generation_options: { max_images: 10 },
      response_format: 'url',
      size: safeSize,
      stream: useImageStream,
      watermark: false,
    };

    const imgResp = await fetch(modelApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData),
      signal,
    });

    if (!imgResp.ok) {
      await refundPoints(userId, totalCost, '图片生成失败退款');
      logError('portrait-pipeline-img', new Error(`upstream ${imgResp.status}`));
      await logUsage({
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: `upstream ${imgResp.status}`,
        durationMs: Date.now() - startedAt,
      });
      return res.status(502).json({ error: '图片生成服务异常' });
    }

    let urls;
    let parsedJson = null;
    if (useImageStream && imgResp.body) {
      urls = await collectImageUrlsFromArkSseStream(imgResp.body);
    } else {
      const rawBody = await imgResp.text();
      const extracted = extractUrlsFromUpstreamImageBody(rawBody);
      urls = extracted.urls;
      parsedJson = extracted.parsedJson;
    }

    if (urls.length === 0 && parsedJson && typeof parsedJson === 'object' && parsedJson.error) {
      await refundPoints(userId, totalCost, '图片生成失败退款');
      await logUsage({
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: String(parsedJson.error),
        durationMs: Date.now() - startedAt,
      });
      return res.status(502).json({ error: '图片生成服务异常' });
    }

    if (urls.length === 0) {
      await refundPoints(userId, totalCost, '未返回图片退款');
      await logUsage({
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: 'no urls in upstream json',
        durationMs: Date.now() - startedAt,
      });
      return res.status(502).json({ error: '图片生成未完成，请稍后重试' });
    }

    const shortfall = Math.max(0, safeImageCount - urls.length);
    if (shortfall > 0) {
      const refundAmt = shortfall * pointsPerImage;
      await refundPoints(userId, refundAmt, `仅生成${urls.length}张，差额退款`);
    }

    await logUsage({
      userId, model, modelType: 'image', units: urls.length,
      pointsCost: pointsPerImage * urls.length,
      success: true,
      durationMs: Date.now() - startedAt,
    });

    const recordId = await persistPortraitGeneration(userId, urls, scene, finalPrompt.slice(0, 100), finalPrompt);

    return res.json({
      success: true,
      urls,
      recordId,
      requested: safeImageCount,
      generated: urls.length,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      await refundPoints(userId, totalCost, '用户取消退款');
      return res.status(408).json({ error: '已取消' });
    }
    await refundPoints(userId, totalCost, '生成异常退款');
    logError('portrait-pipeline', error);
    await logUsage({
      userId, model, modelType: 'image', units: safeImageCount,
      pointsCost: 0, success: false,
      errorMsg: error?.message || 'unknown',
      durationMs: Date.now() - startedAt,
    });
    return res.status(500).json({ error: maskError(error) });
  }
});

// =============== 图片生成（流式） ===============

app.post('/api/images/generate', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务不可用' });
  }

  const ip = getClientIp(req);
  const rate = await checkRateLimit(`img:${userId}`, 10, 60);
  if (!rate.allowed) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  const ipRate = await checkRateLimit(`img-ip:${ip}`, 30, 60);
  if (!ipRate.allowed) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }
  const { prompt, imageBase64, imageCount, size: rawImgSize } = body;

  if (!isNonEmptyString(prompt, 4000)) {
    return res.status(400).json({ error: '提示词长度非法' });
  }
  const blocked = containsBlockedKeyword(prompt);
  if (blocked) {
    return res.status(400).json({ error: '提示词包含敏感内容，已拒绝' });
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return res.status(400).json({ error: '图片参数无效' });
  }
  if (imageBase64.length > 6 * 1024 * 1024) {
    return res.status(413).json({ error: '图片过大，请压缩后重试' });
  }
  if (!isImageDataUrl(imageBase64)) {
    return res.status(400).json({ error: '图片格式无效，仅支持 JPG/PNG/WEBP' });
  }
  const safeImageCount = parsePositiveInt(imageCount, 10);
  if (!safeImageCount) {
    return res.status(400).json({ error: '生成数量需为 1~10' });
  }

  const model = await getDefaultModel('image');
  const outputBandsForImage = resolveBandsFromImageModelRow(model);
  const safeSize = clampImageSizeToAllowedBands(sanitizeImageGenerationSize(rawImgSize), outputBandsForImage);
  const modelApiId = model?.model_id || 'doubao-seedream-4-0-250828';
  const modelApiUrl = model?.api_url || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
  const pointsPerImage = model?.price_per_unit
    || parsePositiveInt(process.env.POINTS_PER_IMAGE, 10000)
    || POINTS_PER_IMAGE_DEFAULT;
  const totalCost = pointsPerImage * safeImageCount;

  if (model?.quota_daily && model.quota_daily > 0) {
    const used = await getTodayUsageCount(model.id);
    if (used + safeImageCount > model.quota_daily) {
      return res.status(429).json({ error: '今日模型调用额度已满' });
    }
  }

  const deduct = await deductPointsAtomic(userId, totalCost, `生成${safeImageCount}张图片`);
  if (!deduct.ok) {
    const status = deduct.reason === 'insufficient' ? 402 : 500;
    return res.status(status).json({ error: deduct.message });
  }

  debugLog('image generate', { userId, imageCount: safeImageCount, promptLen: prompt.length, modelApiId });

  const startedAt = Date.now();
  try {
    const requestData = {
      model: modelApiId,
      prompt,
      image: [imageBase64],
      sequential_image_generation: 'auto',
      sequential_image_generation_options: { max_images: 10 },
      response_format: 'url',
      size: safeSize,
      stream: true,
      watermark: false,
    };

    const response = await fetch(modelApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      await refundPoints(userId, totalCost, '图片生成失败退款');
      logError('image-generate-upstream', new Error(`upstream ${response.status}`));
      await logUsage({
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: `upstream ${response.status}`,
        durationMs: Date.now() - startedAt,
      });
      return res.status(502).json({ error: '图片生成服务异常' });
    }

    await logUsage({
      userId, model, modelType: 'image', units: safeImageCount,
      pointsCost: totalCost, success: true,
      durationMs: Date.now() - startedAt,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    response.body.pipeTo(new WritableStream({
      write(chunk) {
        res.write(chunk);
      },
      close() {
        res.end();
      },
      abort() {
        res.end();
      },
    })).catch(() => {
      res.end();
    });
  } catch (error) {
    await refundPoints(userId, totalCost, '图片生成异常退款');
    logError('image-generate', error);
    await logUsage({
      userId, model, modelType: 'image', units: safeImageCount,
      pointsCost: 0, success: false,
      errorMsg: error?.message || 'unknown',
      durationMs: Date.now() - startedAt,
    });
    return res.status(500).json({ error: maskError(error) });
  }
});

// =============== 认证接口 ===============

app.post('/api/auth/login', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }
  const { phone } = body;

  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }

  const ip = getClientIp(req);
  const ipRate = await checkRateLimit(`login-ip:${ip}`, 10, 60);
  if (!ipRate.allowed) {
    return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
  }
  const phoneRate = await checkRateLimit(`login-phone:${phone}`, 8, 600);
  if (!phoneRate.allowed) {
    return res.status(429).json({ error: '该手机号尝试过于频繁，请稍后再试' });
  }
  const regRate = await checkRateLimit(`register-ip:${ip}`, 5, 86400);

  let user = await dbFirst('SELECT * FROM users WHERE phone = ?', [phone]);

  let isNewUser = false;
  if (!user) {
    if (!regRate.allowed) {
      return res.status(429).json({ error: '当前网络环境注册次数过多，请稍后再试' });
    }
    isNewUser = true;
    const result = await dbRun('INSERT INTO users (phone, points) VALUES (?, 100)', [phone]);
    user = await dbFirst('SELECT * FROM users WHERE id = ?', [result.insertId]);
  }

  const { token, refreshToken } = await issueTokenPair(user.id, user.token_version);
  const hasPassword = !!user.password && user.password !== PASSWORD_DISABLED_MARKER && user.password.startsWith('pbkdf2$');

  return res.json({
    user: {
      id: user.id,
      phone: user.phone,
      points: user.points,
      createdAt: user.created_at,
    },
    token,
    refreshToken,
    isNewUser,
    hasPassword,
  });
});

app.post('/api/auth/login-password', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }
  const { phone, password } = body;

  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }
  if (!isNonEmptyString(password, 128)) {
    return res.status(400).json({ error: '密码格式错误' });
  }

  const ip = getClientIp(req);
  const rate = await checkRateLimit(`pwd:${ip}:${phone}`, 8, 600);
  if (!rate.allowed) {
    return res.status(429).json({ error: '尝试次数过多，请10分钟后再试' });
  }
  const ipRate = await checkRateLimit(`login-ip:${ip}`, 30, 60);
  if (!ipRate.allowed) {
    return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
  }

  const user = await dbFirst('SELECT * FROM users WHERE phone = ?', [phone]);

  if (!user) {
    return res.status(400).json({ error: '手机号或密码错误' });
  }

  if (!user.password || user.password === PASSWORD_DISABLED_MARKER) {
    return res.status(400).json({ error: '该用户未设置密码，请使用验证码登录' });
  }

  const isHashedPassword = user.password.startsWith('pbkdf2$');
  let passwordValid = false;
  if (isHashedPassword) {
    passwordValid = await verifyPassword(password, user.password);
  } else {
    passwordValid = user.password === password;
    if (passwordValid) {
      const hashedPassword = await hashPassword(password);
      await dbRun(
        'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
        [hashedPassword, user.id]
      );
    }
  }

  if (!passwordValid) {
    return res.status(400).json({ error: '手机号或密码错误' });
  }

  const { token, refreshToken } = await issueTokenPair(user.id, user.token_version);

  return res.json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      points: user.points,
      createdAt: user.created_at,
    },
    token,
    refreshToken,
  });
});

app.post('/api/auth/logout', (req, res) => {
  return res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const user = await dbFirst('SELECT id, phone, points, created_at FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  return res.json({
    id: user.id,
    phone: user.phone,
    points: user.points,
    createdAt: user.created_at,
  });
});

app.post('/api/auth/update-password', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }
  const { oldPassword, newPassword } = body;

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ error: '新密码需 6~128 位且同时包含字母和数字' });
  }

  const user = await dbFirst('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (user.password && user.password !== PASSWORD_DISABLED_MARKER) {
    if (!isNonEmptyString(oldPassword, 128)) {
      return res.status(400).json({ error: '原密码错误' });
    }
    const validOldPassword = user.password.startsWith('pbkdf2$')
      ? await verifyPassword(oldPassword, user.password)
      : user.password === oldPassword;
    if (!validOldPassword) {
      return res.status(400).json({ error: '原密码错误' });
    }
  }

  const hashedPassword = await hashPassword(newPassword);
  await dbRun(
    'UPDATE users SET password = ?, token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = ?',
    [hashedPassword, userId]
  );

  const updated = await dbFirst('SELECT token_version FROM users WHERE id = ?', [userId]);
  const { token: newToken, refreshToken } = await issueTokenPair(userId, updated?.token_version);

  return res.json({ success: true, message: '密码修改成功', token: newToken, refreshToken });
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken 必填' });
  }
  const ip = getClientIp(req);
  const rate = await checkRateLimit(`refresh-ip:${ip}`, 60, 60);
  if (!rate.allowed) {
    return res.status(429).json({ error: '请求过于频繁' });
  }
  const payload = await decodeAndVerifyJwt(refreshToken, 'refresh');
  if (!payload) {
    return res.status(401).json({ error: 'refreshToken 无效或已过期' });
  }
  const user = await dbFirst('SELECT id, token_version FROM users WHERE id = ?', [payload.sub]);
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  const { token, refreshToken: newRefresh } = await issueTokenPair(user.id, user.token_version);
  return res.json({ success: true, token, refreshToken: newRefresh });
});

app.post('/api/auth/delete-account', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }
  const body = req.body;
  const confirm = body?.confirm;
  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: '请在 confirm 字段输入 DELETE 以确认' });
  }

  const user = await dbFirst('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (user.password && user.password !== PASSWORD_DISABLED_MARKER && user.password.startsWith('pbkdf2$')) {
    const password = body?.password;
    if (!isNonEmptyString(password, 128) || !await verifyPassword(password, user.password)) {
      return res.status(400).json({ error: '密码校验失败' });
    }
  }

  try {
    await dbBatch([
      { sql: 'DELETE FROM transactions WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM generations WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM used_prompts WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM api_usage_logs WHERE user_id = ?', params: [userId] },
      { sql: 'DELETE FROM users WHERE id = ?', params: [userId] },
    ]);
  } catch (error) {
    logError('delete-account', error);
    return res.status(500).json({ error: '注销失败，请稍后再试' });
  }

  return res.json({ success: true });
});

// =============== 积分接口 ===============

app.get('/api/points/balance', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const user = await dbFirst('SELECT points FROM users WHERE id = ?', [userId]);
  return res.json({ points: user?.points ?? 0 });
});

app.post('/api/points/add', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const body = req.body;
  const amount = parsePositiveInt(body?.amount, 100000);
  if (!amount) {
    return res.status(400).json({ error: '充值金额非法' });
  }
  const description = typeof body.description === 'string' ? body.description.slice(0, 200) : '充值';

  const user = await dbFirst('SELECT phone, points FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const isAdmin = isAdminPhone(user.phone) || checkAdminSecret(req);
  if (!isAdmin) {
    return res.status(403).json({ error: '充值功能暂未开放' });
  }

  const safeDesc = description.slice(0, 200);
  await dbBatch([
    {
      sql: 'UPDATE users SET points = points + ?, updated_at = NOW() WHERE id = ?',
      params: [amount, userId],
    },
    {
      sql: `INSERT INTO transactions (user_id, amount, type, description, balance)
            SELECT ?, ?, '充值', ?, points FROM users WHERE id = ?`,
      params: [userId, amount, safeDesc, userId],
    },
  ]);

  const after = await dbFirst('SELECT points FROM users WHERE id = ?', [userId]);
  const newPoints = after?.points ?? user.points + amount;

  await logAdminAudit({
    adminUserId: userId, adminPhone: user.phone,
    action: 'points.add', target: `user:${userId}`,
    payload: { amount, description: safeDesc },
  });

  return res.json({ success: true, points: newPoints, message: '充值成功' });
});

app.post('/api/points/consume', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const body = req.body;
  const amount = parsePositiveInt(body?.amount, 100000);
  if (!amount) {
    return res.status(400).json({ error: '消费金额非法' });
  }
  const description = typeof body.description === 'string' ? body.description.slice(0, 200) : '消费';

  const result = await deductPointsAtomic(userId, amount, description);
  if (!result.ok) {
    const status = result.reason === 'insufficient' ? 400 : 500;
    return res.status(status).json({ error: result.message });
  }

  return res.json({ success: true, points: result.balance });
});

app.get('/api/points/transactions', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  const transactions = await dbAll(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );

  return res.json(transactions);
});

// =============== 生成记录接口 ===============

app.get('/api/generations', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const generations = await dbAll(
    `SELECT id, user_id, images, scene, image_count, created_at, expires_at
     FROM generations
     WHERE user_id = ? AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );

  return res.json(generations.map(g => {
    let images = [];
    try {
      const parsed = JSON.parse(g.images);
      images = Array.isArray(parsed) ? parsed : [];
    } catch {
      images = [];
    }
    return {
      ...g,
      images,
      remainingTime: new Date(g.expires_at) - new Date(),
    };
  }));
});

app.post('/api/generations', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }
  const { images, prompt, promptFull, scene, imageCount } = body;

  if (!Array.isArray(images) || images.length === 0 || images.length > 10) {
    return res.status(400).json({ error: '图片参数无效' });
  }
  for (const url of images) {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
      return res.status(400).json({ error: '图片URL格式错误' });
    }
  }
  const safePrompt = typeof prompt === 'string' ? prompt.slice(0, 4000) : '';
  const safePromptFull =
    typeof promptFull === 'string' && promptFull.length > 0
      ? promptFull.slice(0, 8000)
      : safePrompt;
  const safeScene = typeof scene === 'string' ? scene.slice(0, 200) : '';
  const safeImageCount = parsePositiveInt(imageCount, 10) || images.length;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const result = await dbRun(
    'INSERT INTO generations (user_id, images, prompt, prompt_full, scene, image_count, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, JSON.stringify(images), safePrompt, safePromptFull, safeScene, safeImageCount, expiresAt]
  );

  return res.json({ success: true, id: result.insertId, expiresAt });
});

app.post('/api/generations/cleanup', async (req, res) => {
  if (!checkAdminSecret(req)) {
    return res.status(403).json({ error: '无权访问' });
  }

  const result = await dbRun('DELETE FROM generations WHERE expires_at < NOW()');

  try {
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await dbRun('DELETE FROM auth_rate_limits WHERE window_start < ?', [cutoff]);
  } catch (error) {
    logError('cleanup-rate-limits', error);
  }

  return res.json({ success: true, deletedCount: result.affectedRows });
});

app.delete('/api/generations/:id', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const recordId = parsePositiveInt(req.params.id);
  if (!recordId) {
    return res.status(400).json({ error: '记录ID无效' });
  }

  const result = await dbRun(
    'DELETE FROM generations WHERE id = ? AND user_id = ?',
    [recordId, userId]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: '记录不存在或无权删除' });
  }

  return res.json({ success: true });
});

// =============== 提示词接口 ===============

app.get('/api/prompts', async (req, res) => {
  const prompts = await dbAll(
    'SELECT id, description, image_count FROM prompts WHERE is_active = 1 ORDER BY id'
  );
  return res.json(prompts);
});

app.get('/api/prompts/used', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const prompts = await dbAll(
    'SELECT prompt_id FROM used_prompts WHERE user_id = ?',
    [userId]
  );
  return res.json(prompts.map(p => p.prompt_id));
});

app.post('/api/prompts/mark-used', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const promptId = parsePositiveInt(req.body?.promptId);
  if (!promptId) {
    return res.status(400).json({ error: 'promptId 无效' });
  }

  try {
    await dbRun(
      'INSERT IGNORE INTO used_prompts (user_id, prompt_id) VALUES (?, ?)',
      [userId, promptId]
    );
  } catch {
    // 忽略重复键错误
  }

  return res.json({ success: true });
});

// =============== 兑换码接口 ===============

const REDEEM_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRedeemCode() {
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += REDEEM_CHARSET[bytes[i] % REDEEM_CHARSET.length];
  }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function normalizeRedeemCode(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toUpperCase().replace(/[\s-]+/g, '');
}

function redeemCodeStatus(row) {
  if (!row) return 'not_found';
  if (row.status === 'disabled') return 'disabled';
  if (row.expires_at) {
    const exp = Date.parse(row.expires_at);
    if (Number.isFinite(exp) && exp < Date.now()) return 'expired';
  }
  if (row.used_count >= row.max_uses) return 'used_up';
  return 'active';
}

app.post('/api/redeem', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }

  const ip = getClientIp(req);
  const ru = await checkRateLimit(`redeem-u:${userId}`, 10, 60);
  if (!ru.allowed) {
    return res.status(429).json({ error: '兑换过于频繁，请稍后再试' });
  }
  const ri = await checkRateLimit(`redeem-ip:${ip}`, 30, 60);
  if (!ri.allowed) {
    return res.status(429).json({ error: '兑换过于频繁，请稍后再试' });
  }

  const raw = req.body?.code;
  const normalized = normalizeRedeemCode(raw);
  if (!normalized || normalized.length < 6 || normalized.length > 32) {
    return res.status(400).json({ error: '兑换码格式错误' });
  }
  const formatted = normalized.length === 12
    ? `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`
    : normalized;

  const row = await dbFirst(
    'SELECT * FROM redeem_codes WHERE code = ? OR REPLACE(code, "-", "") = ?',
    [formatted, normalized]
  );

  if (!row) {
    return res.status(404).json({ error: '兑换码不存在' });
  }

  const stat = redeemCodeStatus(row);
  if (stat === 'disabled') return res.status(400).json({ error: '该兑换码已停用' });
  if (stat === 'expired')  return res.status(400).json({ error: '该兑换码已过期' });
  if (stat === 'used_up')  return res.status(400).json({ error: '该兑换码已被领取完' });

  const existed = await dbFirst(
    'SELECT 1 FROM redeem_logs WHERE code_id = ? AND user_id = ?',
    [row.id, userId]
  );
  if (existed) {
    return res.status(400).json({ error: '你已领取过该兑换码' });
  }

  const points = parsePositiveInt(row.points, 10000000);
  if (!points) {
    return res.status(500).json({ error: '兑换码配置异常' });
  }

  let batchResults;
  try {
    batchResults = await dbBatch([
      {
        sql: `UPDATE redeem_codes
              SET used_count = used_count + 1, updated_at = NOW()
              WHERE id = ? AND status = 'active' AND used_count < max_uses
                AND (expires_at IS NULL OR expires_at > NOW())`,
        params: [row.id],
      },
      {
        sql: 'INSERT INTO redeem_logs (code_id, code, user_id, points, ip) VALUES (?, ?, ?, ?, ?)',
        params: [row.id, row.code, userId, points, (ip || '').slice(0, 64)],
      },
      {
        sql: 'UPDATE users SET points = points + ?, updated_at = NOW() WHERE id = ?',
        params: [points, userId],
      },
      {
        sql: `INSERT INTO transactions (user_id, amount, type, description, balance)
              SELECT ?, ?, '充值', ?, points FROM users WHERE id = ?`,
        params: [userId, points, `兑换码 ${row.code}`, userId],
      },
    ]);
  } catch (error) {
    logError('redeem', error);
    return res.status(400).json({ error: '兑换失败，请确认兑换码是否已使用' });
  }

  if (!batchResults?.[0]?.affectedRows) {
    return res.status(400).json({ error: '该兑换码已被领取完' });
  }

  const after = await dbFirst('SELECT points FROM users WHERE id = ?', [userId]);

  return res.json({
    success: true,
    points,
    balance: after?.points ?? 0,
    message: `兑换成功，已到账 ${points} 积分`,
  });
});

app.get('/api/redeem/history', async (req, res) => {
  const token = getUserId(req);
  const userId = token ? await verifyTokenAndGetUserId(token) : null;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

  const rows = await dbAll(
    'SELECT id, code, points, created_at FROM redeem_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit]
  );

  return res.json(rows);
});

// =============== 公开统计 ===============

function virtualBaseline() {
  const ANCHOR_TS = Date.parse('2024-01-01T00:00:00Z');
  const USERS_PER_SECOND = 0.022;
  const IMAGES_PER_SECOND = 0.78;
  const SEED_USERS = 8200;
  const SEED_IMAGES = 352000;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - ANCHOR_TS) / 1000));
  return {
    users: SEED_USERS + Math.floor(elapsedSec * USERS_PER_SECOND),
    images: SEED_IMAGES + Math.floor(elapsedSec * IMAGES_PER_SECOND),
    tickPerSecond: { users: USERS_PER_SECOND, images: IMAGES_PER_SECOND },
  };
}

app.get('/api/stats/public', async (req, res) => {
  let realUsers = 0;
  let realImages = 0;
  try {
    const [u, g] = await Promise.all([
      dbFirst('SELECT COUNT(*) AS n FROM users'),
      dbFirst("SELECT COALESCE(SUM(units), 0) AS n FROM api_usage_logs WHERE model_type = 'image' AND success = 1"),
    ]);
    realUsers = Number(u?.n || 0);
    realImages = Number(g?.n || 0);
  } catch (error) {
    logError('public-stats', error);
  }

  const VIRTUAL = virtualBaseline();
  const userCount = realUsers + VIRTUAL.users;
  const imageCount = realImages + VIRTUAL.images;

  return res.json({
    userCount,
    imageCount,
    realUsers,
    realImages,
    virtualUsers: VIRTUAL.users,
    virtualImages: VIRTUAL.images,
    tickPerSecond: VIRTUAL.tickPerSecond,
    serverTs: Date.now(),
  });
});

// =============== 管理后台接口 ===============

app.get('/api/admin/me', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  return res.json({ isAdmin: true, phone: guard.phone || '' });
});

app.get('/api/admin/generations', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 300) : 100;

  const rows = await dbAll(
    `SELECT g.*, u.phone AS user_phone
     FROM generations g
     INNER JOIN users u ON u.id = g.user_id
     WHERE g.expires_at > NOW()
     ORDER BY g.created_at DESC
     LIMIT ?`,
    [limit]
  );

  const list = (rows || []).map((g) => {
    let images = [];
    try {
      const parsed = JSON.parse(g.images);
      images = Array.isArray(parsed) ? parsed : [];
    } catch {
      images = [];
    }
    return {
      ...g,
      images,
      remainingTime: new Date(g.expires_at) - new Date(),
    };
  });

  return res.json(list);
});

function sanitizeModelInput(body) {
  const provider = typeof body.provider === 'string' && body.provider.length <= 50
    ? body.provider.trim() : 'volcengine';
  const modelType = ['text', 'image', 'video'].includes(body.model_type) ? body.model_type : null;
  const modelId = typeof body.model_id === 'string' && body.model_id.length > 0 && body.model_id.length <= 200
    ? body.model_id.trim() : null;
  const displayName = typeof body.display_name === 'string' && body.display_name.length > 0 && body.display_name.length <= 100
    ? body.display_name.trim() : null;
  const apiUrl = typeof body.api_url === 'string' && body.api_url.length <= 500
    ? body.api_url.trim() : '';
  const unit = ['image', 'token_1k', 'second'].includes(body.unit) ? body.unit : 'image';
  const enabled = body.enabled === false || body.enabled === 0 ? 0 : 1;
  const isDefault = body.is_default === true || body.is_default === 1 ? 1 : 0;
  const priceRaw = Number(body.price_per_unit);
  const price = Number.isInteger(priceRaw) && priceRaw >= 0 && priceRaw <= 1000000 ? priceRaw : 10;
  const quotaRaw = Number(body.quota_daily);
  const quota = Number.isInteger(quotaRaw) && quotaRaw >= 0 && quotaRaw <= 100000000 ? quotaRaw : 0;
  let info = '';
  if (body.info !== undefined && body.info !== null) {
    if (typeof body.info === 'string') {
      info = body.info.slice(0, 2000);
    } else {
      try { info = JSON.stringify(body.info).slice(0, 2000); } catch { info = ''; }
    }
  }
  return { provider, modelType, modelId, displayName, apiUrl, unit, enabled, isDefault, price, quota, info };
}

app.get('/api/admin/models', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const rows = await dbAll('SELECT * FROM ai_models ORDER BY model_type, is_default DESC, id DESC');
  return res.json(rows || []);
});

app.post('/api/admin/models', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const body = req.body;
  if (!body) return res.status(400).json({ error: '请求参数无效' });
  const m = sanitizeModelInput(body);
  if (!m.modelType) return res.status(400).json({ error: 'model_type 仅支持 text/image/video' });
  if (!m.modelId) return res.status(400).json({ error: 'model_id 必填' });
  if (!m.displayName) return res.status(400).json({ error: 'display_name 必填' });

  if (m.isDefault) {
    await dbRun('UPDATE ai_models SET is_default = 0 WHERE model_type = ?', [m.modelType]);
  }

  const result = await dbRun(
    `INSERT INTO ai_models (provider, model_type, model_id, display_name, api_url, enabled, is_default, price_per_unit, unit, quota_daily, info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.provider, m.modelType, m.modelId, m.displayName, m.apiUrl, m.enabled, m.isDefault, m.price, m.unit, m.quota, m.info]
  );

  await logAdminAudit({
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.create', target: `model:${result.insertId}`,
    payload: m,
  });

  return res.json({ success: true, id: result.insertId });
});

app.put('/api/admin/models/:id', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id 无效' });

  const body = req.body;
  if (!body) return res.status(400).json({ error: '请求参数无效' });
  const m = sanitizeModelInput(body);
  if (!m.modelType) return res.status(400).json({ error: 'model_type 仅支持 text/image/video' });
  if (!m.modelId) return res.status(400).json({ error: 'model_id 必填' });
  if (!m.displayName) return res.status(400).json({ error: 'display_name 必填' });

  if (m.isDefault) {
    await dbRun('UPDATE ai_models SET is_default = 0 WHERE model_type = ? AND id <> ?', [m.modelType, id]);
  }

  await dbRun(
    `UPDATE ai_models
     SET provider = ?, model_type = ?, model_id = ?, display_name = ?, api_url = ?,
         enabled = ?, is_default = ?, price_per_unit = ?, unit = ?, quota_daily = ?, info = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [m.provider, m.modelType, m.modelId, m.displayName, m.apiUrl, m.enabled, m.isDefault, m.price, m.unit, m.quota, m.info, id]
  );

  await logAdminAudit({
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.update', target: `model:${id}`,
    payload: m,
  });

  return res.json({ success: true });
});

app.delete('/api/admin/models/:id', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id 无效' });

  await dbRun('DELETE FROM ai_models WHERE id = ?', [id]);

  await logAdminAudit({
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.delete', target: `model:${id}`,
  });

  return res.json({ success: true });
});

app.post('/api/admin/models/:id/set-default', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id 无效' });

  const model = await dbFirst('SELECT model_type FROM ai_models WHERE id = ?', [id]);
  if (!model) return res.status(404).json({ error: '模型不存在' });

  await dbBatch([
    { sql: 'UPDATE ai_models SET is_default = 0 WHERE model_type = ?', params: [model.model_type] },
    { sql: 'UPDATE ai_models SET is_default = 1, enabled = 1, updated_at = NOW() WHERE id = ?', params: [id] },
  ]);

  await logAdminAudit({
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.set_default', target: `model:${id}`,
    payload: { model_type: model.model_type },
  });

  return res.json({ success: true });
});

// =============== 管理统计接口 ===============

app.get('/api/admin/stats/overview', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const [userCnt, totalPoints, usageTotal, usageToday, usage7d, usage30d, byType] = await Promise.all([
    dbFirst('SELECT COUNT(*) AS n FROM users'),
    dbFirst('SELECT COALESCE(SUM(points),0) AS n FROM users'),
    dbFirst('SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1'),
    dbFirst("SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 AND DATE(created_at) = CURDATE()"),
    dbFirst("SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"),
    dbFirst("SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)"),
    dbAll("SELECT model_type, COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 GROUP BY model_type"),
  ]);

  return res.json({
    userCount: userCnt?.n || 0,
    totalUserPoints: totalPoints?.n || 0,
    total: usageTotal || {},
    today: usageToday || {},
    last7days: usage7d || {},
    last30days: usage30d || {},
    byType: byType || [],
  });
});

app.get('/api/admin/stats/usage', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const daysRaw = parseInt(req.query.days, 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 30;
  const modelType = req.query.model_type;

  let sql = `SELECT DATE(created_at) AS day,
                    model_type,
                    COUNT(*) AS calls,
                    COALESCE(SUM(units),0) AS units,
                    COALESCE(SUM(points_cost),0) AS cost,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
             FROM api_usage_logs
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
  const params = [days];
  if (modelType && ['text', 'image', 'video'].includes(modelType)) {
    sql += ' AND model_type = ?';
    params.push(modelType);
  }
  sql += ' GROUP BY day, model_type ORDER BY day DESC';

  const rows = await dbAll(sql, params);
  return res.json(rows || []);
});

app.get('/api/admin/stats/top-users', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;

  const rows = await dbAll(
    `SELECT l.user_id,
            u.phone,
            COUNT(*) AS calls,
            COALESCE(SUM(l.units),0) AS units,
            COALESCE(SUM(l.points_cost),0) AS cost
     FROM api_usage_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.success = 1
     GROUP BY l.user_id
     ORDER BY cost DESC
     LIMIT ?`,
    [limit]
  );

  return res.json((rows || []).map(r => ({
    ...r,
    phone: r.phone ? String(r.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-',
  })));
});

app.get('/api/admin/stats/models', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const rows = await dbAll(
    `SELECT l.model_id,
            l.model_name,
            l.model_type,
            COUNT(*) AS calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS ok,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed,
            COALESCE(SUM(l.units),0) AS units,
            COALESCE(SUM(l.points_cost),0) AS cost,
            COALESCE(AVG(l.duration_ms),0) AS avg_ms
     FROM api_usage_logs l
     GROUP BY l.model_id, l.model_name, l.model_type
     ORDER BY cost DESC`
  );

  return res.json(rows || []);
});

function redeemRatePercent(used, total) {
  const u = Number(used || 0);
  const t = Number(total || 0);
  if (!t || t <= 0) return 0;
  return Math.round((u / t) * 10000) / 100;
}

app.get('/api/admin/stats/redeem', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const daysRaw = parseInt(req.query.days, 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 30;

  try {
    const summaryRow = await dbFirst(`
      SELECT
        COUNT(*) AS code_count,
        SUM(CASE WHEN status = 'active' AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 ELSE 0 END) AS active_available,
        SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled_count,
        COALESCE(SUM(max_uses), 0) AS total_slots,
        COALESCE(SUM(used_count), 0) AS used_slots,
        COALESCE(SUM(max_uses * points), 0) AS points_capacity,
        COALESCE(SUM(used_count * points), 0) AS points_redeemed
      FROM redeem_codes
    `);

    const logTotal = await dbFirst(
      'SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS pts FROM redeem_logs'
    );
    const log7d = await dbFirst(
      "SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS pts FROM redeem_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );

    const daily = await dbAll(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS redemptions,
              COALESCE(SUM(points), 0) AS points
       FROM redeem_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY day
       ORDER BY day ASC`,
      [days]
    );

    const batches = await dbAll(`
      SELECT
        batch_id,
        MAX(note) AS note,
        COUNT(*) AS codes_count,
        COALESCE(SUM(max_uses), 0) AS total_slots,
        COALESCE(SUM(used_count), 0) AS used_slots,
        COALESCE(SUM(max_uses * points), 0) AS points_capacity,
        COALESCE(SUM(used_count * points), 0) AS points_redeemed,
        MAX(created_at) AS last_created
      FROM redeem_codes
      WHERE batch_id IS NOT NULL AND batch_id != ''
      GROUP BY batch_id
      ORDER BY last_created DESC
      LIMIT 100
    `);

    const orphan = await dbFirst(`
      SELECT
        COUNT(*) AS codes_count,
        COALESCE(SUM(max_uses), 0) AS total_slots,
        COALESCE(SUM(used_count), 0) AS used_slots,
        COALESCE(SUM(max_uses * points), 0) AS points_capacity,
        COALESCE(SUM(used_count * points), 0) AS points_redeemed,
        MAX(created_at) AS last_created
      FROM redeem_codes
      WHERE batch_id IS NULL OR batch_id = ''
    `);

    const totalSlots = Number(summaryRow?.total_slots || 0);
    const usedSlots = Number(summaryRow?.used_slots || 0);
    const pointsCap = Number(summaryRow?.points_capacity || 0);
    const pointsRed = Number(summaryRow?.points_redeemed || 0);

    const mapBatchRow = (r, batchIdOverride) => ({
      batch_id: batchIdOverride ?? r.batch_id,
      note: r.note || '',
      codes_count: Number(r.codes_count || 0),
      total_slots: Number(r.total_slots || 0),
      used_slots: Number(r.used_slots || 0),
      points_capacity: Number(r.points_capacity || 0),
      points_redeemed: Number(r.points_redeemed || 0),
      last_created: r.last_created || null,
      slot_redemption_rate: redeemRatePercent(r.used_slots, r.total_slots),
      points_redemption_rate: redeemRatePercent(r.points_redeemed, r.points_capacity),
    });

    const byBatch = (batches || []).map(row => mapBatchRow(row));
    if (orphan && Number(orphan.codes_count || 0) > 0) {
      byBatch.push(mapBatchRow({ ...orphan, note: '' }, '(无批次)'));
    }

    return res.json({
      summary: {
        code_count: Number(summaryRow?.code_count || 0),
        active_available: Number(summaryRow?.active_available || 0),
        disabled_count: Number(summaryRow?.disabled_count || 0),
        total_slots: totalSlots,
        used_slots: usedSlots,
        slot_redemption_rate: redeemRatePercent(usedSlots, totalSlots),
        points_capacity: pointsCap,
        points_redeemed: pointsRed,
        points_redemption_rate: redeemRatePercent(pointsRed, pointsCap),
        redeem_events_total: Number(logTotal?.n || 0),
        redeem_points_total: Number(logTotal?.pts || 0),
        redeem_events_7d: Number(log7d?.n || 0),
        redeem_points_7d: Number(log7d?.pts || 0),
      },
      by_batch: byBatch,
      daily_redemptions: daily || [],
    });
  } catch (error) {
    logError('admin-stats-redeem', error);
    return res.status(500).json({ error: '兑换码统计不可用，请确认已执行数据库迁移' });
  }
});

// =============== 管理兑换码接口 ===============

app.get('/api/admin/redeem-codes', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const status = req.query.status;
  const batchId = req.query.batch_id;
  const keyword = req.query.q;

  const conditions = [];
  const params = [];
  if (status && ['active', 'disabled'].includes(status)) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (batchId) {
    conditions.push('batch_id = ?');
    params.push(batchId.slice(0, 64));
  }
  if (keyword) {
    conditions.push('(code LIKE ? OR note LIKE ?)');
    const kw = `%${keyword.slice(0, 60)}%`;
    params.push(kw, kw);
  }
  let sql = 'SELECT * FROM redeem_codes';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = await dbAll(sql, params);
  return res.json(rows || []);
});

app.post('/api/admin/redeem-codes/generate', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: '请求参数无效' });
  }
  const points = parsePositiveInt(body.points, 10000000);
  if (!points) return res.status(400).json({ error: '面值积分非法' });
  const count = parsePositiveInt(body.count, 200);
  if (!count) return res.status(400).json({ error: '生成数量需为 1~200' });
  const maxUses = parsePositiveInt(body.max_uses, 1000000) || 1;

  let expiresAt = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== '') {
    const t = Date.parse(body.expires_at);
    if (!Number.isFinite(t)) {
      return res.status(400).json({ error: '过期时间格式无效' });
    }
    expiresAt = new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : '';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const batchId = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-`
    + `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}-`
    + Math.random().toString(36).slice(2, 6).toUpperCase();

  const generated = [];
  for (let i = 0; i < count; i++) {
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = generateRedeemCode();
      try {
        await dbRun(
          `INSERT INTO redeem_codes (code, points, max_uses, status, expires_at, batch_id, note, created_by)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
          [code, points, maxUses, expiresAt, batchId, note, guard.userId]
        );
        generated.push(code);
        inserted = true;
      } catch (error) {
        if (attempt === 4) {
          logError('redeem-generate', error);
          return res.status(500).json({ error: '生成失败，请稍后再试' });
        }
      }
    }
  }

  await logAdminAudit({
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'redeem.generate', target: `batch:${batchId}`,
    payload: { count: generated.length, points, max_uses: maxUses, expires_at: expiresAt, note },
  });

  return res.json({
    success: true,
    batch_id: batchId,
    codes: generated,
    count: generated.length,
  });
});

app.post('/api/admin/redeem-codes/:id/disable', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id 无效' });

  const result = await dbRun(
    "UPDATE redeem_codes SET status = 'disabled', updated_at = NOW() WHERE id = ?",
    [id]
  );

  if (!result?.affectedRows) {
    return res.status(404).json({ error: '兑换码不存在' });
  }

  await logAdminAudit({
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'redeem.disable', target: `code:${id}`,
  });

  return res.json({ success: true });
});

app.get('/api/admin/redeem-codes/:id/logs', async (req, res) => {
  const guard = await requireAdmin(req);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'id 无效' });

  const rows = await dbAll(
    `SELECT l.id, l.user_id, u.phone, l.points, l.created_at
     FROM redeem_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.code_id = ?
     ORDER BY l.created_at DESC
     LIMIT 200`,
    [id]
  );

  const masked = (rows || []).map(r => ({
    ...r,
    phone: r.phone ? String(r.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-',
  }));

  return res.json(masked);
});

// =============== 已废弃接口 ===============

app.post('/api/llm/generate-prompt', (req, res) => {
  return res.status(410).json({
    error: '该接口已在服务端合并，请使用 POST /api/images/generate-portrait',
    code: 'USE_GENERATE_PORTRAIT',
  });
});

// =============== 定时清理 ===============

nodeCron.schedule('0 * * * *', async () => {
  try {
    await dbRun('DELETE FROM generations WHERE expires_at < NOW()');
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await dbRun('DELETE FROM auth_rate_limits WHERE window_start < ?', [cutoff]);
    console.log('[cron] 清理完成');
  } catch (error) {
    logError('scheduled-cleanup', error);
  }
});

// =============== 启动 ===============

app.listen(PORT, () => {
  console.log(`Synthia API running on http://localhost:${PORT}`);
});
