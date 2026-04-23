const PBKDF2_ITERATIONS = 100000;
const POINTS_PER_IMAGE_DEFAULT = 10;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = buildCorsHeaders(request, env);
    const corsHeaders = cors.headers;

    if (method === 'OPTIONS') {
      if (!cors.isAllowed) {
        return jsonResponse({ error: 'CORS origin not allowed' }, 403, corsHeaders);
      }
      return new Response(null, { headers: { ...corsHeaders, ...securityHeaders() } });
    }
    if (!cors.isAllowed) {
      return jsonResponse({ error: 'CORS origin not allowed' }, 403, corsHeaders);
    }

    if (path === '/api/images/generate' && method === 'POST') {
      return await handleImageGeneration(request, env, corsHeaders);
    }

    if (path === '/api/llm/generate-prompt' && method === 'POST') {
      return await handleGeneratePrompt(request, env, corsHeaders);
    }

    try {
      const result = await handleRequest(request, env, path, method);
      return jsonResponse(result.data, result.status || 200, corsHeaders);
    } catch (error) {
      logError(env, 'top-level', error);
      return jsonResponse({ error: maskError(env, error) }, 500, corsHeaders);
    }
  }
};

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  };
}

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...securityHeaders(),
    }
  });
}

function isProduction(env) {
  return env.ENVIRONMENT === 'production';
}

function maskError(env, error) {
  if (isProduction(env)) {
    return '服务器内部错误，请稍后再试';
  }
  return error?.message || '服务器内部错误';
}

function logError(env, tag, error) {
  if (!isProduction(env)) {
    console.error(`[${tag}]`, error?.stack || error?.message || error);
    return;
  }
  console.error(`[${tag}] ${error?.message || 'unknown'}`);
}

function debugLog(env, ...args) {
  if (!isProduction(env)) {
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

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isAdminPhone(phone, env) {
  const list = (env.ADMIN_PHONES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return !!phone && list.includes(phone);
}

function checkAdminSecret(request, env) {
  const secret = env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = request.headers.get('X-Admin-Secret');
  return !!provided && provided === secret;
}

// 要求当前登录用户是管理员（手机号在 ADMIN_PHONES 中）或携带 X-Admin-Secret
async function requireAdmin(request, env) {
  if (checkAdminSecret(request, env)) {
    return { ok: true, userId: null };
  }
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { ok: false, status: 401, error: '未登录' };
  }
  const user = await env.DB.prepare('SELECT phone FROM users WHERE id = ?').bind(userId).first();
  if (!user || !isAdminPhone(user.phone, env)) {
    return { ok: false, status: 403, error: '无管理员权限' };
  }
  return { ok: true, userId: Number(userId), phone: user.phone };
}

// 查询指定类型（image/text/video）当前默认启用的模型；找不到返回 null
async function getDefaultModel(env, modelType) {
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM ai_models WHERE model_type = ? AND enabled = 1 ORDER BY is_default DESC, id DESC LIMIT 1'
    ).bind(modelType).first();
    return row || null;
  } catch (error) {
    logError(env, 'getDefaultModel', error);
    return null;
  }
}

async function logUsage(env, { userId, model, modelType, units, pointsCost, success, errorMsg, durationMs }) {
  try {
    await env.DB.prepare(
      `INSERT INTO api_usage_logs
        (user_id, model_id, model_type, model_name, units, points_cost, success, error_msg, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      userId || null,
      model?.id || null,
      modelType,
      model?.display_name || model?.model_id || '',
      units || 1,
      pointsCost || 0,
      success ? 1 : 0,
      (errorMsg || '').slice(0, 500),
      durationMs || 0
    ).run();
  } catch (error) {
    logError(env, 'logUsage', error);
  }
}

async function handleImageGeneration(request, env, corsHeaders) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401, corsHeaders);
  }

  const apiKey = env.DOUBAO_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: '服务不可用' }, 500, corsHeaders);
  }

  // 速率限制：每分钟最多 10 次 / 每用户
  const ip = getClientIp(request);
  const rate = await checkRateLimit(env, `img:${userId}`, 10, 60);
  if (!rate.allowed) {
    return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, corsHeaders);
  }
  // 额外按 IP 限流，防止同一 IP 多账号刷
  const ipRate = await checkRateLimit(env, `img-ip:${ip}`, 30, 60);
  if (!ipRate.allowed) {
    return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: '请求参数无效' }, 400, corsHeaders);
  }
  const { prompt, imageBase64, imageCount } = body;

  if (!isNonEmptyString(prompt, 4000)) {
    return jsonResponse({ error: '提示词长度非法' }, 400, corsHeaders);
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return jsonResponse({ error: '图片参数无效' }, 400, corsHeaders);
  }
  // 限制 base64 图片大小：约 6MB（base64 ≈ 原文 * 1.37）
  if (imageBase64.length > 6 * 1024 * 1024) {
    return jsonResponse({ error: '图片过大，请压缩后重试' }, 413, corsHeaders);
  }
  const safeImageCount = parsePositiveInt(imageCount, 4);
  if (!safeImageCount) {
    return jsonResponse({ error: '生成数量需为 1~4' }, 400, corsHeaders);
  }

  // 从数据库读取默认图片模型；失败则回退到硬编码
  const model = await getDefaultModel(env, 'image');
  const modelApiId = model?.model_id || 'doubao-seedream-4-0-250828';
  const modelApiUrl = model?.api_url || 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
  const pointsPerImage = model?.price_per_unit
    || parsePositiveInt(env.POINTS_PER_IMAGE, 10000)
    || POINTS_PER_IMAGE_DEFAULT;
  const totalCost = pointsPerImage * safeImageCount;

  // 每日额度检查
  if (model?.quota_daily && model.quota_daily > 0) {
    const used = await getTodayUsageCount(env, model.id);
    if (used + safeImageCount > model.quota_daily) {
      return jsonResponse({ error: '今日模型调用额度已满' }, 429, corsHeaders);
    }
  }

  const deduct = await deductPointsAtomic(env, userId, totalCost, `生成${safeImageCount}张图片`);
  if (!deduct.ok) {
    const status = deduct.reason === 'insufficient' ? 402 : 500;
    return jsonResponse({ error: deduct.message }, status, corsHeaders);
  }

  debugLog(env, 'image generate', { userId, imageCount: safeImageCount, promptLen: prompt.length, modelApiId });

  const startedAt = Date.now();
  try {
    const requestData = {
      model: modelApiId,
      prompt,
      image: [imageBase64],
      sequential_image_generation: 'auto',
      sequential_image_generation_options: {
        max_images: safeImageCount
      },
      response_format: 'url',
      size: '2K',
      stream: true,
      watermark: false
    };

    const response = await fetch(modelApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      await refundPoints(env, userId, totalCost, '图片生成失败退款');
      logError(env, 'image-generate-upstream', new Error(`upstream ${response.status}`));
      await logUsage(env, {
        userId, model, modelType: 'image', units: safeImageCount,
        pointsCost: 0, success: false,
        errorMsg: `upstream ${response.status}`,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse({ error: '图片生成服务异常' }, 502, corsHeaders);
    }

    await logUsage(env, {
      userId, model, modelType: 'image', units: safeImageCount,
      pointsCost: totalCost, success: true,
      durationMs: Date.now() - startedAt,
    });

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...corsHeaders,
        ...securityHeaders(),
      }
    });
  } catch (error) {
    await refundPoints(env, userId, totalCost, '图片生成异常退款');
    logError(env, 'image-generate', error);
    await logUsage(env, {
      userId, model, modelType: 'image', units: safeImageCount,
      pointsCost: 0, success: false,
      errorMsg: error?.message || 'unknown',
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse({ error: maskError(env, error) }, 500, corsHeaders);
  }
}

async function getTodayUsageCount(env, modelId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare(
      "SELECT COALESCE(SUM(units), 0) AS used FROM api_usage_logs WHERE model_id = ? AND success = 1 AND date(created_at) = ?"
    ).bind(modelId, today).first();
    return Number(row?.used || 0);
  } catch (error) {
    logError(env, 'getTodayUsageCount', error);
    return 0;
  }
}

async function handleGeneratePrompt(request, env, corsHeaders) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401, corsHeaders);
  }

  // 每用户每分钟 20 次
  const rate = await checkRateLimit(env, `llm:${userId}`, 20, 60);
  if (!rate.allowed) {
    return jsonResponse({ error: '请求过于频繁，请稍后再试' }, 429, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: '请求参数无效' }, 400, corsHeaders);
  }
  const { scene, style } = body;
  if (!isNonEmptyString(scene, 200)) {
    return jsonResponse({ error: '场景参数无效' }, 400, corsHeaders);
  }
  if (style !== undefined && style !== null && (typeof style !== 'string' || style.length > 200)) {
    return jsonResponse({ error: '风格参数无效' }, 400, corsHeaders);
  }

  const arkApiKey = env.ARK_API_KEY || env.DOUBAO_API_KEY;
  if (!arkApiKey) {
    return jsonResponse({ error: '服务不可用' }, 500, corsHeaders);
  }

  // 动态读取默认文本模型
  const model = await getDefaultModel(env, 'text');
  const arkApiUrl = model?.api_url || env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  const arkModel = model?.model_id || env.ARK_MODEL || 'doubao-seed-2-0-mini-260215';

  const inputKeyword = `[关键词：场景为：${scene}，风格为：${style || '未指定'}][我需要你帮我生成一段顶级的写真指令描述，包括但不限于风格，场景，人物，动作，镜头，光学等。待会我要用这段描述给图片大模型生成图片]`;

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
          {
            role: 'system',
            content: 'You are a professional photography prompt expert. Generate detailed and creative photography prompts.'
          },
          {
            role: 'user',
            content: inputKeyword
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(env, 'llm-upstream', new Error(`status ${response.status}: ${errorText.slice(0, 300)}`));
      await logUsage(env, {
        userId, model, modelType: 'text', units: 1,
        pointsCost: 0, success: false,
        errorMsg: `upstream ${response.status}`,
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse({ error: '文案生成服务异常' }, 502, corsHeaders);
    }

    const data = await response.json();
    const generatedPrompt = data?.choices?.[0]?.message?.content;

    if (!generatedPrompt) {
      await logUsage(env, {
        userId, model, modelType: 'text', units: 1,
        pointsCost: 0, success: false,
        errorMsg: 'empty response',
        durationMs: Date.now() - startedAt,
      });
      return jsonResponse({ error: '文案生成失败' }, 502, corsHeaders);
    }

    // LLM 按 1k token 计价，简单起见当前按次记录（单次视为 1 个 unit）
    await logUsage(env, {
      userId, model, modelType: 'text', units: 1,
      pointsCost: model?.price_per_unit || 0,
      success: true,
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse({ success: true, prompt: generatedPrompt }, 200, corsHeaders);
  } catch (error) {
    logError(env, 'llm-generate', error);
    await logUsage(env, {
      userId, model, modelType: 'text', units: 1,
      pointsCost: 0, success: false,
      errorMsg: error?.message || 'unknown',
      durationMs: Date.now() - startedAt,
    });
    return jsonResponse({ error: maskError(env, error) }, 500, corsHeaders);
  }
}

async function handleRequest(request, env, path, method) {
  if (path === '/api/auth/login' && method === 'POST') {
    return await handleLogin(request, env);
  } else if (path === '/api/auth/login-password' && method === 'POST') {
    return await handleLoginWithPassword(request, env);
  } else if (path === '/api/auth/logout' && method === 'POST') {
    return handleLogout();
  } else if (path === '/api/auth/me' && method === 'GET') {
    return await handleGetCurrentUser(request, env);
  } else if (path === '/api/auth/update-password' && method === 'POST') {
    return await handleUpdatePassword(request, env);
  } else if (path === '/api/points/balance' && method === 'GET') {
    return await handleGetBalance(request, env);
  } else if (path === '/api/points/add' && method === 'POST') {
    return await handleAddPoints(request, env);
  } else if (path === '/api/points/consume' && method === 'POST') {
    return await handleConsumePoints(request, env);
  } else if (path === '/api/points/transactions' && method === 'GET') {
    return await handleGetTransactions(request, env);
  } else if (path === '/api/generations' && method === 'GET') {
    return await handleGetGenerations(request, env);
  } else if (path === '/api/generations' && method === 'POST') {
    return await handleSaveGeneration(request, env);
  } else if (path === '/api/generations/cleanup' && method === 'POST') {
    return await handleCleanupGenerations(request, env);
  } else if (path.startsWith('/api/generations/') && method === 'DELETE') {
    return await handleDeleteGeneration(request, env);
  } else if (path === '/api/prompts' && method === 'GET') {
    return await handleGetPrompts(request, env);
  } else if (path === '/api/prompts/used' && method === 'GET') {
    return await handleGetUsedPrompts(request, env);
  } else if (path === '/api/prompts/mark-used' && method === 'POST') {
    return await handleMarkPromptUsed(request, env);
  } else if (path === '/api/admin/me' && method === 'GET') {
    return await handleAdminMe(request, env);
  } else if (path === '/api/admin/models' && method === 'GET') {
    return await handleAdminListModels(request, env);
  } else if (path === '/api/admin/models' && method === 'POST') {
    return await handleAdminCreateModel(request, env);
  } else if (path.match(/^\/api\/admin\/models\/\d+$/) && method === 'PUT') {
    return await handleAdminUpdateModel(request, env, path);
  } else if (path.match(/^\/api\/admin\/models\/\d+$/) && method === 'DELETE') {
    return await handleAdminDeleteModel(request, env, path);
  } else if (path.match(/^\/api\/admin\/models\/\d+\/set-default$/) && method === 'POST') {
    return await handleAdminSetDefaultModel(request, env, path);
  } else if (path === '/api/admin/stats/overview' && method === 'GET') {
    return await handleAdminStatsOverview(request, env);
  } else if (path === '/api/admin/stats/usage' && method === 'GET') {
    return await handleAdminStatsUsage(request, env);
  } else if (path === '/api/admin/stats/top-users' && method === 'GET') {
    return await handleAdminStatsTopUsers(request, env);
  } else if (path === '/api/admin/stats/models' && method === 'GET') {
    return await handleAdminStatsModels(request, env);
  } else {
    return { data: { error: 'Not found' }, status: 404 };
  }
}

function getUserId(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://synthia-bk4.pages.dev')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const isBrowserRequest = !!origin;
  const isAllowed = !isBrowserRequest || allowedOrigins.includes(origin);
  const allowOrigin = isBrowserRequest ? (isAllowed ? origin : allowedOrigins[0] || 'null') : '*';

  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  // 仅在来源被允许且为具体 Origin（非通配符）时，才允许携带凭据
  if (isBrowserRequest && isAllowed) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return {
    isAllowed,
    headers,
  };
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(str) {
  return base64UrlEncode(new TextEncoder().encode(str));
}

function base64UrlDecodeToString(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
  return atob(padded);
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function generateToken(userId, env, tokenVersion = 0) {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET未配置');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(userId),
    ver: Number(tokenVersion) || 0,
    iat: now,
    exp: now + 7 * 24 * 60 * 60
  };
  const headerB64 = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyTokenAndGetUserId(token, env) {
  const secret = env.JWT_SECRET;
  if (!secret) {
    return null;
  }
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig));
  if (!constantTimeEqual(expectedSigB64, signatureB64)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || !payload?.exp || payload.exp < now) {
    return null;
  }

  // 校验 tokenVersion：用户改密码后会递增 token_version，使旧 token 失效
  try {
    const user = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(payload.sub).first();
    if (!user) return null;
    const currentVer = Number(user.token_version || 0);
    const payloadVer = Number(payload.ver || 0);
    if (currentVer !== payloadVer) return null;
  } catch (error) {
    // 若列不存在（老库未迁移），放行以便向后兼容
    logError(env, 'token-version-check', error);
  }

  return String(payload.sub);
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

async function hashPassword(password) {
  // Cloudflare Workers 限制 PBKDF2 迭代次数最多 100000
  const iterations = PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  const hash = new Uint8Array(bits);
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(hash)}`;
}

async function verifyPassword(inputPassword, storedPassword) {
  if (typeof inputPassword !== 'string' || typeof storedPassword !== 'string') {
    return false;
  }
  if (!storedPassword.startsWith('pbkdf2$')) {
    return false;
  }
  const [, iterText, saltHex, hashHex] = storedPassword.split('$');
  const iterations = parseInt(iterText, 10);

  if (!Number.isFinite(iterations) || iterations <= 0 || iterations > PBKDF2_ITERATIONS) {
    return false;
  }

  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(inputPassword), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

// 条件原子扣减积分；失败时不会扣款
async function deductPointsAtomic(env, userId, amount, description) {
  if (!isPositiveInteger(amount)) {
    return { ok: false, reason: 'invalid', message: '扣减金额无效' };
  }
  try {
    const update = await env.DB.prepare(
      'UPDATE users SET points = points - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND points >= ?'
    ).bind(amount, userId, amount).run();
    if (!update.meta.changes) {
      return { ok: false, reason: 'insufficient', message: '积分不足' };
    }
    const user = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();
    const balance = user?.points ?? 0;
    await env.DB.prepare(
      'INSERT INTO transactions (user_id, amount, type, description, balance) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, -amount, '消费', description || '消费', balance).run();
    return { ok: true, balance };
  } catch (error) {
    logError(env, 'deductPoints', error);
    return { ok: false, reason: 'error', message: '扣减失败' };
  }
}

async function refundPoints(env, userId, amount, description) {
  if (!isPositiveInteger(amount)) return { ok: false };
  try {
    await env.DB.prepare(
      'UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(amount, userId).run();
    const user = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();
    const balance = user?.points ?? 0;
    await env.DB.prepare(
      'INSERT INTO transactions (user_id, amount, type, description, balance) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, amount, '退款', description || '退款', balance).run();
    return { ok: true, balance };
  } catch (error) {
    logError(env, 'refundPoints', error);
    return { ok: false };
  }
}

async function ensureRateLimitTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL
    )
  `).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON auth_rate_limits(window_start)').run();
}

async function checkRateLimit(env, key, limit, windowSeconds) {
  await ensureRateLimitTable(env);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, window_start FROM auth_rate_limits WHERE key = ?').bind(key).first();

  // 1% 概率顺便清理一天前的记录，避免表无限增长
  if (Math.random() < 0.01) {
    try {
      await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now - 86400).run();
    } catch (error) {
      logError(env, 'rate-limit-gc', error);
    }
  }

  if (!row || now - row.window_start >= windowSeconds) {
    await env.DB.prepare('INSERT OR REPLACE INTO auth_rate_limits (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
    return { allowed: true, remaining: limit - 1 };
  }

  if (row.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  const newCount = row.count + 1;
  await env.DB.prepare('UPDATE auth_rate_limits SET count = ? WHERE key = ?').bind(newCount, key).run();
  return { allowed: true, remaining: limit - newCount };
}

async function handleLogin(request, env) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const { phone } = body;

  if (!isValidPhone(phone)) {
    return { data: { error: '请输入正确的手机号' }, status: 400 };
  }

  // 注意：验证码校验尚未接入真实短信服务（暂留），code 字段当前不做校验
  let user = await env.DB.prepare(
    'SELECT * FROM users WHERE phone = ?'
  ).bind(phone).first();

  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    const result = await env.DB.prepare(
      'INSERT INTO users (phone, points) VALUES (?, 100)'
    ).bind(phone).run();
    
    user = await env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(result.meta.last_row_id).first();
  }

  const token = await generateToken(user.id, env, user.token_version);

  return {
    data: {
      user: {
        id: user.id,
        phone: user.phone,
        points: user.points,
        createdAt: user.created_at
      },
      token,
      isNewUser,
      hasPassword: !!user.password
    }
  };
}

async function handleLoginWithPassword(request, env) {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const { phone, password } = body;

  if (!isValidPhone(phone)) {
    return { data: { error: '请输入正确的手机号' }, status: 400 };
  }
  if (!isNonEmptyString(password, 128)) {
    return { data: { error: '密码格式错误' }, status: 400 };
  }

  const ip = getClientIp(request);
  const rateKey = `pwd:${ip}:${phone}`;
  const rate = await checkRateLimit(env, rateKey, 8, 600);
  if (!rate.allowed) {
    return { data: { error: '尝试次数过多，请10分钟后再试' }, status: 429 };
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE phone = ?'
  ).bind(phone).first();

  if (!user) {
    return { data: { error: '手机号或密码错误' }, status: 400 };
  }

  if (!user.password) {
    return { data: { error: '该用户未设置密码，请使用验证码登录' }, status: 400 };
  }

  const isHashedPassword = user.password && user.password.startsWith('pbkdf2$');
  let passwordValid = false;
  if (isHashedPassword) {
    passwordValid = await verifyPassword(password, user.password);
  } else {
    // 兼容旧数据：首次正确登录后升级为哈希密码
    passwordValid = user.password === password;
    if (passwordValid) {
      const hashedPassword = await hashPassword(password);
      await env.DB.prepare(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(hashedPassword, user.id).run();
    }
  }

  if (!passwordValid) {
    return { data: { error: '手机号或密码错误' }, status: 400 };
  }

  const token = await generateToken(user.id, env, user.token_version);

  return {
    data: {
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        points: user.points,
        createdAt: user.created_at
      },
      token
    }
  };
}

function handleLogout() {
  return {
    data: { success: true }
  };
}

async function handleGetCurrentUser(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const user = await env.DB.prepare(
    'SELECT id, phone, points, created_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return { data: { error: '用户不存在' }, status: 404 };
  }

  return {
    data: {
      id: user.id,
      phone: user.phone,
      points: user.points,
      createdAt: user.created_at
    }
  };
}

async function handleUpdatePassword(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const { oldPassword, newPassword } = body;

  if (!isNonEmptyString(newPassword, 128) || newPassword.length < 6) {
    return { data: { error: '新密码长度需为 6~128 位' }, status: 400 };
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!user) {
    return { data: { error: '用户不存在' }, status: 404 };
  }

  if (user.password) {
    if (!isNonEmptyString(oldPassword, 128)) {
      return { data: { error: '原密码错误' }, status: 400 };
    }
    const validOldPassword = user.password.startsWith('pbkdf2$')
      ? await verifyPassword(oldPassword, user.password)
      : user.password === oldPassword;
    if (!validOldPassword) {
      return { data: { error: '原密码错误' }, status: 400 };
    }
  }

  const hashedPassword = await hashPassword(newPassword);
  // 递增 token_version，使旧 token 立即失效
  await env.DB.prepare(
    'UPDATE users SET password = ?, token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(hashedPassword, userId).run();

  // 生成新 token 供前端替换
  const updated = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(userId).first();
  const newToken = await generateToken(userId, env, updated?.token_version);

  return { data: { success: true, message: '密码修改成功', token: newToken } };
}

async function handleGetBalance(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const user = await env.DB.prepare(
    'SELECT points FROM users WHERE id = ?'
  ).bind(userId).first();

  return { data: { points: user.points } };
}

async function handleAddPoints(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const amount = parsePositiveInt(body.amount, 100000);
  if (!amount) {
    return { data: { error: '充值金额非法' }, status: 400 };
  }
  const description = typeof body.description === 'string' ? body.description.slice(0, 200) : '充值';

  const user = await env.DB.prepare('SELECT phone, points FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    return { data: { error: '用户不存在' }, status: 404 };
  }

  // 安全：仅管理员（ADMIN_PHONES 白名单）可通过此接口给自己加积分
  // 未来接入真实支付时，此接口应改为支付回调专用或完全下线
  if (!isAdminPhone(user.phone, env) && !checkAdminSecret(request, env)) {
    return { data: { error: '充值功能暂未开放' }, status: 403 };
  }

  await env.DB.prepare(
    'UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(amount, userId).run();

  const after = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();
  const newPoints = after?.points ?? user.points + amount;

  await env.DB.prepare(
    'INSERT INTO transactions (user_id, amount, type, description, balance) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, amount, '充值', description, newPoints).run();

  return { data: { success: true, points: newPoints, message: '充值成功' } };
}

async function handleConsumePoints(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const amount = parsePositiveInt(body.amount, 100000);
  if (!amount) {
    return { data: { error: '消费金额非法' }, status: 400 };
  }
  const description = typeof body.description === 'string' ? body.description.slice(0, 200) : '消费';

  const result = await deductPointsAtomic(env, userId, amount, description);
  if (!result.ok) {
    const status = result.reason === 'insufficient' ? 400 : 500;
    return { data: { error: result.message }, status };
  }

  return { data: { success: true, points: result.balance } };
}

async function handleGetTransactions(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const rawLimit = parseInt(new URL(request.url).searchParams.get('limit'), 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  const transactions = await env.DB.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all();

  return { data: transactions.results };
}

async function handleGetGenerations(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const generations = await env.DB.prepare(
    'SELECT * FROM generations WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC'
  ).bind(userId).all();

  return {
    data: generations.results.map(g => {
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
        remainingTime: new Date(g.expires_at) - new Date()
      };
    })
  };
}

async function handleSaveGeneration(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const { images, prompt, scene, imageCount } = body;

  if (!Array.isArray(images) || images.length === 0 || images.length > 10) {
    return { data: { error: '图片参数无效' }, status: 400 };
  }
  for (const url of images) {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
      return { data: { error: '图片URL格式错误' }, status: 400 };
    }
  }
  const safePrompt = typeof prompt === 'string' ? prompt.slice(0, 4000) : '';
  const safeScene = typeof scene === 'string' ? scene.slice(0, 200) : '';
  const safeImageCount = parsePositiveInt(imageCount, 10) || images.length;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO generations (user_id, images, prompt, scene, image_count, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, JSON.stringify(images), safePrompt, safeScene, safeImageCount, expiresAt).run();

  return {
    data: {
      success: true,
      id: result.meta.last_row_id,
      expiresAt
    }
  };
}

async function handleCleanupGenerations(request, env) {
  // 需要管理员密钥或配置了 cron 触发（此处走接口方式需校验）
  if (!checkAdminSecret(request, env)) {
    return { data: { error: '无权访问' }, status: 403 };
  }

  const result = await env.DB.prepare(
    'DELETE FROM generations WHERE expires_at < CURRENT_TIMESTAMP'
  ).run();

  // 顺便清理过期的限流记录（一天前的）
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(cutoff).run();
  } catch (error) {
    logError(env, 'cleanup-rate-limits', error);
  }

  return { 
    data: { 
      success: true, 
      deletedCount: result.meta.changes 
    }
  };
}

async function handleDeleteGeneration(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const url = new URL(request.url);
  const rawId = url.pathname.split('/').pop();
  const recordId = parsePositiveInt(rawId);
  if (!recordId) {
    return { data: { error: '记录ID无效' }, status: 400 };
  }

  const result = await env.DB.prepare(
    'DELETE FROM generations WHERE id = ? AND user_id = ?'
  ).bind(recordId, userId).run();

  if (result.meta.changes === 0) {
    return { data: { error: '记录不存在或无权删除' }, status: 404 };
  }

  return { data: { success: true } };
}

async function handleGetPrompts(request, env) {
  const prompts = await env.DB.prepare(
    'SELECT id, description, image_count FROM prompts WHERE is_active = 1 ORDER BY id'
  ).all();

  return { data: prompts.results };
}

async function handleGetUsedPrompts(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const prompts = await env.DB.prepare(
    'SELECT prompt_id FROM used_prompts WHERE user_id = ?'
  ).bind(userId).all();

  return { data: prompts.results.map(p => p.prompt_id) };
}

async function handleMarkPromptUsed(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const body = await readJsonBody(request);
  const promptId = parsePositiveInt(body?.promptId);
  if (!promptId) {
    return { data: { error: 'promptId 无效' }, status: 400 };
  }

  await env.DB.prepare(
    'INSERT OR IGNORE INTO used_prompts (user_id, prompt_id) VALUES (?, ?)'
  ).bind(userId, promptId).run();

  return { data: { success: true } };
}

// =============== 管理后台接口 ===============

async function handleAdminMe(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) {
    return { data: { error: guard.error }, status: guard.status };
  }
  return { data: { isAdmin: true, phone: guard.phone || '' } };
}

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

async function handleAdminListModels(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const rows = await env.DB.prepare(
    'SELECT * FROM ai_models ORDER BY model_type, is_default DESC, id DESC'
  ).all();
  return { data: rows.results || [] };
}

async function handleAdminCreateModel(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const body = await readJsonBody(request);
  if (!body) return { data: { error: '请求参数无效' }, status: 400 };
  const m = sanitizeModelInput(body);
  if (!m.modelType) return { data: { error: 'model_type 仅支持 text/image/video' }, status: 400 };
  if (!m.modelId) return { data: { error: 'model_id 必填' }, status: 400 };
  if (!m.displayName) return { data: { error: 'display_name 必填' }, status: 400 };

  // 若设置为默认，则先清除同类型其他默认
  if (m.isDefault) {
    await env.DB.prepare('UPDATE ai_models SET is_default = 0 WHERE model_type = ?').bind(m.modelType).run();
  }

  const result = await env.DB.prepare(
    `INSERT INTO ai_models (provider, model_type, model_id, display_name, api_url, enabled, is_default, price_per_unit, unit, quota_daily, info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(m.provider, m.modelType, m.modelId, m.displayName, m.apiUrl, m.enabled, m.isDefault, m.price, m.unit, m.quota, m.info).run();

  return { data: { success: true, id: result.meta.last_row_id } };
}

async function handleAdminUpdateModel(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/').pop());
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  const body = await readJsonBody(request);
  if (!body) return { data: { error: '请求参数无效' }, status: 400 };
  const m = sanitizeModelInput(body);
  if (!m.modelType) return { data: { error: 'model_type 仅支持 text/image/video' }, status: 400 };
  if (!m.modelId) return { data: { error: 'model_id 必填' }, status: 400 };
  if (!m.displayName) return { data: { error: 'display_name 必填' }, status: 400 };

  if (m.isDefault) {
    await env.DB.prepare('UPDATE ai_models SET is_default = 0 WHERE model_type = ? AND id <> ?').bind(m.modelType, id).run();
  }

  await env.DB.prepare(
    `UPDATE ai_models
     SET provider = ?, model_type = ?, model_id = ?, display_name = ?, api_url = ?,
         enabled = ?, is_default = ?, price_per_unit = ?, unit = ?, quota_daily = ?, info = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(m.provider, m.modelType, m.modelId, m.displayName, m.apiUrl, m.enabled, m.isDefault, m.price, m.unit, m.quota, m.info, id).run();

  return { data: { success: true } };
}

async function handleAdminDeleteModel(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/').pop());
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  await env.DB.prepare('DELETE FROM ai_models WHERE id = ?').bind(id).run();
  return { data: { success: true } };
}

async function handleAdminSetDefaultModel(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/')[4]);
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  const model = await env.DB.prepare('SELECT model_type FROM ai_models WHERE id = ?').bind(id).first();
  if (!model) return { data: { error: '模型不存在' }, status: 404 };

  await env.DB.prepare('UPDATE ai_models SET is_default = 0 WHERE model_type = ?').bind(model.model_type).run();
  await env.DB.prepare('UPDATE ai_models SET is_default = 1, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run();

  return { data: { success: true } };
}

async function handleAdminStatsOverview(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const [userCnt, totalPoints, usageTotal, usageToday, usage7d, usage30d, byType] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
    env.DB.prepare('SELECT COALESCE(SUM(points),0) AS n FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1').first(),
    env.DB.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 AND date(created_at) = date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 AND created_at >= datetime('now','-7 days')").first(),
    env.DB.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 AND created_at >= datetime('now','-30 days')").first(),
    env.DB.prepare("SELECT model_type, COUNT(*) AS calls, COALESCE(SUM(units),0) AS units, COALESCE(SUM(points_cost),0) AS cost FROM api_usage_logs WHERE success = 1 GROUP BY model_type").all(),
  ]);

  return {
    data: {
      userCount: userCnt?.n || 0,
      totalUserPoints: totalPoints?.n || 0,
      total: usageTotal || {},
      today: usageToday || {},
      last7days: usage7d || {},
      last30days: usage30d || {},
      byType: byType?.results || [],
    }
  };
}

async function handleAdminStatsUsage(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days'), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 30;
  const modelType = url.searchParams.get('model_type');

  let sql = `SELECT date(created_at) AS day,
                    model_type,
                    COUNT(*) AS calls,
                    COALESCE(SUM(units),0) AS units,
                    COALESCE(SUM(points_cost),0) AS cost,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
             FROM api_usage_logs
             WHERE created_at >= datetime('now', ?)`;
  const binds = [`-${days} days`];
  if (modelType && ['text', 'image', 'video'].includes(modelType)) {
    sql += ' AND model_type = ?';
    binds.push(modelType);
  }
  sql += ' GROUP BY day, model_type ORDER BY day DESC';

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return { data: rows.results || [] };
}

async function handleAdminStatsTopUsers(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get('limit'), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;

  const rows = await env.DB.prepare(
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
     LIMIT ?`
  ).bind(limit).all();

  return { data: (rows.results || []).map(r => ({
    ...r,
    phone: r.phone ? String(r.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-'
  })) };
}

async function handleAdminStatsModels(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const rows = await env.DB.prepare(
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
  ).all();

  return { data: rows.results || [] };
}
