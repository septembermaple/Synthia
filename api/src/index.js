const PBKDF2_ITERATIONS = 100000;
const POINTS_PER_IMAGE_DEFAULT = 10;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
// 密码占位（用于禁用 / 未设置密码场景），任何输入都无法通过 verifyPassword 校验
const PASSWORD_DISABLED_MARKER = 'pbkdf2$disabled$00$00';

const PROMPT_BLACKLIST = [
  '色情', '裸体', '裸露', '性器官', '强奸', '乱伦', '儿童色情', '未成年裸',
  '暴力', '血腥', '斩首', '自杀', '杀人',
  '毒品', '吸毒', '冰毒', '海洛因',
  '恐怖', '炸弹', '枪支', '爆炸物制作',
  '法轮功', '反共', '台独', '港独', '藏独',
];

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
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledCleanup(env));
  }
};

async function runScheduledCleanup(env) {
  try {
    await env.DB.prepare('DELETE FROM generations WHERE expires_at < CURRENT_TIMESTAMP').run();
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await env.DB.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(cutoff).run();
  } catch (error) {
    logError(env, 'scheduled-cleanup', error);
  }
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };
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
  // 形如 data:image/jpeg;base64,XXXX
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m) return false;
  // 简单 magic-number 校验，避免上游传入伪造内容
  const b64 = m[2];
  // 取头 8 字节足够辨识
  const head = b64.slice(0, 16);
  let bin;
  try { bin = atob(head); } catch { return false; }
  if (bin.length < 4) return false;
  const b0 = bin.charCodeAt(0), b1 = bin.charCodeAt(1), b2 = bin.charCodeAt(2), b3 = bin.charCodeAt(3);
  // JPEG: FF D8 FF
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return true;
  // WEBP: "RIFF....WEBP" - 头 4 字节是 RIFF
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
  const blocked = containsBlockedKeyword(prompt);
  if (blocked) {
    return jsonResponse({ error: '提示词包含敏感内容，已拒绝' }, 400, corsHeaders);
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return jsonResponse({ error: '图片参数无效' }, 400, corsHeaders);
  }
  // 限制 base64 图片大小：约 6MB（base64 ≈ 原文 * 1.37）
  if (imageBase64.length > 6 * 1024 * 1024) {
    return jsonResponse({ error: '图片过大，请压缩后重试' }, 413, corsHeaders);
  }
  if (!isImageDataUrl(imageBase64)) {
    return jsonResponse({ error: '图片格式无效，仅支持 JPG/PNG/WEBP' }, 400, corsHeaders);
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
  if (containsBlockedKeyword(scene) || containsBlockedKeyword(style || '')) {
    return jsonResponse({ error: '场景或风格包含敏感内容' }, 400, corsHeaders);
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
  } else if (path === '/api/auth/refresh' && method === 'POST') {
    return await handleRefreshToken(request, env);
  } else if (path === '/api/auth/update-password' && method === 'POST') {
    return await handleUpdatePassword(request, env);
  } else if (path === '/api/auth/delete-account' && method === 'POST') {
    return await handleDeleteAccount(request, env);
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
  } else if (path === '/api/redeem' && method === 'POST') {
    return await handleRedeemCode(request, env);
  } else if (path === '/api/redeem/history' && method === 'GET') {
    return await handleRedeemHistory(request, env);
  } else if (path === '/api/stats/public' && method === 'GET') {
    return await handlePublicStats(request, env);
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
  } else if (path === '/api/admin/stats/redeem' && method === 'GET') {
    return await handleAdminStatsRedeem(request, env);
  } else if (path === '/api/admin/redeem-codes' && method === 'GET') {
    return await handleAdminListRedeemCodes(request, env);
  } else if (path === '/api/admin/redeem-codes/generate' && method === 'POST') {
    return await handleAdminGenerateRedeemCodes(request, env);
  } else if (path.match(/^\/api\/admin\/redeem-codes\/\d+\/disable$/) && method === 'POST') {
    return await handleAdminDisableRedeemCode(request, env, path);
  } else if (path.match(/^\/api\/admin\/redeem-codes\/\d+\/logs$/) && method === 'GET') {
    return await handleAdminRedeemCodeLogs(request, env, path);
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

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (isBrowserRequest) {
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    // 不被允许时不下发 Allow-Origin，浏览器会按 CORS 错误处理
  } else {
    // 非浏览器（curl 等）调用：不返回任何 Allow-Origin
  }

  return { isAllowed, headers };
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

async function signJwt(payload, env) {
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET未配置');
  }
  const headerB64 = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

async function generateToken(userId, env, tokenVersion = 0) {
  const now = Math.floor(Date.now() / 1000);
  return await signJwt({
    sub: String(userId),
    ver: Number(tokenVersion) || 0,
    typ: 'access',
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
  }, env);
}

async function generateRefreshToken(userId, env, tokenVersion = 0) {
  const now = Math.floor(Date.now() / 1000);
  return await signJwt({
    sub: String(userId),
    ver: Number(tokenVersion) || 0,
    typ: 'refresh',
    iat: now,
    exp: now + REFRESH_TOKEN_TTL_SECONDS,
  }, env);
}

async function issueTokenPair(userId, env, tokenVersion = 0) {
  const [token, refreshToken] = await Promise.all([
    generateToken(userId, env, tokenVersion),
    generateRefreshToken(userId, env, tokenVersion),
  ]);
  return { token, refreshToken };
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

async function decodeAndVerifyJwt(token, env, expectedType) {
  const secret = env.JWT_SECRET;
  if (!secret) return null;
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig));
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
  // 旧 token 兼容：未带 typ 的当成 access
  if (expectedType === 'access' && !payload.typ) {
    // pass - 兼容旧 token
  }

  try {
    const user = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(payload.sub).first();
    if (!user) return null;
    const currentVer = Number(user.token_version || 0);
    const payloadVer = Number(payload.ver || 0);
    if (currentVer !== payloadVer) return null;
  } catch (error) {
    logError(env, 'token-version-check', error);
  }

  return payload;
}

async function verifyTokenAndGetUserId(token, env) {
  const payload = await decodeAndVerifyJwt(token, env, 'access');
  return payload ? String(payload.sub) : null;
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

// 条件原子扣减积分：UPDATE 与流水 INSERT 走 D1 batch，确保流水里的 balance 与扣款结果一致。
async function deductPointsAtomic(env, userId, amount, description) {
  if (!isPositiveInteger(amount)) {
    return { ok: false, reason: 'invalid', message: '扣减金额无效' };
  }
  try {
    const safeDesc = (typeof description === 'string' ? description : '消费').slice(0, 200);
    const results = await env.DB.batch([
      env.DB.prepare(
        'UPDATE users SET points = points - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND points >= ?'
      ).bind(amount, userId, amount),
      env.DB.prepare(
        `INSERT INTO transactions (user_id, amount, type, description, balance)
         SELECT ?, ?, '消费', ?, points FROM users WHERE id = ?`
      ).bind(userId, -amount, safeDesc, userId),
    ]);
    const updateMeta = results?.[0]?.meta;
    if (!updateMeta?.changes) {
      return { ok: false, reason: 'insufficient', message: '积分不足' };
    }
    const user = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();
    return { ok: true, balance: user?.points ?? 0 };
  } catch (error) {
    logError(env, 'deductPoints', error);
    return { ok: false, reason: 'error', message: '扣减失败' };
  }
}

async function refundPoints(env, userId, amount, description) {
  if (!isPositiveInteger(amount)) return { ok: false };
  try {
    const safeDesc = (typeof description === 'string' ? description : '退款').slice(0, 200);
    const results = await env.DB.batch([
      env.DB.prepare(
        'UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(amount, userId),
      env.DB.prepare(
        `INSERT INTO transactions (user_id, amount, type, description, balance)
         SELECT ?, ?, '退款', ?, points FROM users WHERE id = ?`
      ).bind(userId, amount, safeDesc, userId),
    ]);
    if (!results?.[0]?.meta?.changes) return { ok: false };
    const user = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();
    return { ok: true, balance: user?.points ?? 0 };
  } catch (error) {
    logError(env, 'refundPoints', error);
    return { ok: false };
  }
}

// 单语句 UPSERT：window 过期则重置，否则 +1。比读后写降低并发覆盖风险。
async function checkRateLimit(env, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await env.DB.prepare(
      `INSERT INTO auth_rate_limits (key, count, window_start)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ? - auth_rate_limits.window_start >= ? THEN 1 ELSE auth_rate_limits.count + 1 END,
         window_start = CASE WHEN ? - auth_rate_limits.window_start >= ? THEN ? ELSE auth_rate_limits.window_start END
       RETURNING count`
    ).bind(key, now, now, windowSeconds, now, windowSeconds, now).first();

    const count = Number(row?.count || 0);
    if (count > limit) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, limit - count) };
  } catch (error) {
    logError(env, 'rate-limit', error);
    // 出错时放行，避免限流挂掉影响业务
    return { allowed: true, remaining: limit };
  }
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

  const ip = getClientIp(request);
  // 单 IP 1 分钟最多发起 10 次登录/注册尝试
  const ipRate = await checkRateLimit(env, `login-ip:${ip}`, 10, 60);
  if (!ipRate.allowed) {
    return { data: { error: '尝试次数过多，请稍后再试' }, status: 429 };
  }
  // 同手机号 10 分钟最多 8 次（防撞库）
  const phoneRate = await checkRateLimit(env, `login-phone:${phone}`, 8, 600);
  if (!phoneRate.allowed) {
    return { data: { error: '该手机号尝试过于频繁，请稍后再试' }, status: 429 };
  }
  // 同 IP 24h 最多注册 5 个新账号
  const regRate = await checkRateLimit(env, `register-ip:${ip}`, 5, 86400);

  // 注意：验证码校验尚未接入真实短信服务，待接入后这里需要校验 body.code
  let user = await env.DB.prepare(
    'SELECT * FROM users WHERE phone = ?'
  ).bind(phone).first();

  let isNewUser = false;
  if (!user) {
    if (!regRate.allowed) {
      return { data: { error: '当前网络环境注册次数过多，请稍后再试' }, status: 429 };
    }
    isNewUser = true;
    const result = await env.DB.prepare(
      'INSERT INTO users (phone, points) VALUES (?, 100)'
    ).bind(phone).run();

    user = await env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(result.meta.last_row_id).first();
  }

  const { token, refreshToken } = await issueTokenPair(user.id, env, user.token_version);
  const hasPassword = !!user.password && user.password !== PASSWORD_DISABLED_MARKER && user.password.startsWith('pbkdf2$');

  return {
    data: {
      user: {
        id: user.id,
        phone: user.phone,
        points: user.points,
        createdAt: user.created_at
      },
      token,
      refreshToken,
      isNewUser,
      hasPassword,
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
  const rate = await checkRateLimit(env, `pwd:${ip}:${phone}`, 8, 600);
  if (!rate.allowed) {
    return { data: { error: '尝试次数过多，请10分钟后再试' }, status: 429 };
  }
  const ipRate = await checkRateLimit(env, `login-ip:${ip}`, 30, 60);
  if (!ipRate.allowed) {
    return { data: { error: '尝试次数过多，请稍后再试' }, status: 429 };
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE phone = ?'
  ).bind(phone).first();

  if (!user) {
    return { data: { error: '手机号或密码错误' }, status: 400 };
  }

  if (!user.password || user.password === PASSWORD_DISABLED_MARKER) {
    return { data: { error: '该用户未设置密码，请使用验证码登录' }, status: 400 };
  }

  const isHashedPassword = user.password.startsWith('pbkdf2$');
  let passwordValid = false;
  if (isHashedPassword) {
    passwordValid = await verifyPassword(password, user.password);
  } else {
    // 兼容旧明文密码：登录成功后升级为哈希
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

  const { token, refreshToken } = await issueTokenPair(user.id, env, user.token_version);

  return {
    data: {
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        points: user.points,
        createdAt: user.created_at
      },
      token,
      refreshToken,
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

  if (!isStrongPassword(newPassword)) {
    return { data: { error: '新密码需 6~128 位且同时包含字母和数字' }, status: 400 };
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!user) {
    return { data: { error: '用户不存在' }, status: 404 };
  }

  // 已设置密码则必须校验原密码（占位密码视为未设置）
  if (user.password && user.password !== PASSWORD_DISABLED_MARKER) {
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
  await env.DB.prepare(
    'UPDATE users SET password = ?, token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(hashedPassword, userId).run();

  const updated = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(userId).first();
  const { token: newToken, refreshToken } = await issueTokenPair(userId, env, updated?.token_version);

  return { data: { success: true, message: '密码修改成功', token: newToken, refreshToken } };
}

async function handleRefreshToken(request, env) {
  const body = await readJsonBody(request);
  const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  if (!refreshToken) {
    return { data: { error: 'refreshToken 必填' }, status: 400 };
  }
  const ip = getClientIp(request);
  const rate = await checkRateLimit(env, `refresh-ip:${ip}`, 60, 60);
  if (!rate.allowed) {
    return { data: { error: '请求过于频繁' }, status: 429 };
  }
  const payload = await decodeAndVerifyJwt(refreshToken, env, 'refresh');
  if (!payload) {
    return { data: { error: 'refreshToken 无效或已过期' }, status: 401 };
  }
  const user = await env.DB.prepare('SELECT id, token_version FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user) {
    return { data: { error: '用户不存在' }, status: 401 };
  }
  const { token, refreshToken: newRefresh } = await issueTokenPair(user.id, env, user.token_version);
  return { data: { success: true, token, refreshToken: newRefresh } };
}

async function handleDeleteAccount(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }
  const body = await readJsonBody(request);
  const confirm = body?.confirm;
  if (confirm !== 'DELETE') {
    return { data: { error: '请在 confirm 字段输入 DELETE 以确认' }, status: 400 };
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    return { data: { error: '用户不存在' }, status: 404 };
  }

  // 若已设置密码，二次校验密码
  if (user.password && user.password !== PASSWORD_DISABLED_MARKER && user.password.startsWith('pbkdf2$')) {
    const password = body?.password;
    if (!isNonEmptyString(password, 128) || !await verifyPassword(password, user.password)) {
      return { data: { error: '密码校验失败' }, status: 400 };
    }
  }

  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM generations WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM used_prompts WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM api_usage_logs WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
    ]);
  } catch (error) {
    logError(env, 'delete-account', error);
    return { data: { error: '注销失败，请稍后再试' }, status: 500 };
  }

  return { data: { success: true } };
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
  const isAdmin = isAdminPhone(user.phone, env) || checkAdminSecret(request, env);
  if (!isAdmin) {
    return { data: { error: '充值功能暂未开放' }, status: 403 };
  }

  const safeDesc = description.slice(0, 200);
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(amount, userId),
    env.DB.prepare(
      `INSERT INTO transactions (user_id, amount, type, description, balance)
       SELECT ?, ?, '充值', ?, points FROM users WHERE id = ?`
    ).bind(userId, amount, safeDesc, userId),
  ]);

  const after = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();
  const newPoints = after?.points ?? user.points + amount;

  await logAdminAudit(env, {
    adminUserId: userId, adminPhone: user.phone,
    action: 'points.add', target: `user:${userId}`,
    payload: { amount, description: safeDesc },
  });

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

async function logAdminAudit(env, { adminUserId, adminPhone, action, target, payload }) {
  try {
    let payloadStr = '';
    if (payload != null) {
      try { payloadStr = JSON.stringify(payload).slice(0, 2000); } catch { payloadStr = ''; }
    }
    await env.DB.prepare(
      `INSERT INTO admin_audit_logs (admin_user_id, admin_phone, action, target, payload)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      adminUserId || null,
      (adminPhone || '').slice(0, 20),
      String(action || '').slice(0, 100),
      String(target || '').slice(0, 200),
      payloadStr,
    ).run();
  } catch (error) {
    logError(env, 'logAdminAudit', error);
  }
}

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

  await logAdminAudit(env, {
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.create', target: `model:${result.meta.last_row_id}`,
    payload: m,
  });

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

  await logAdminAudit(env, {
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.update', target: `model:${id}`,
    payload: m,
  });

  return { data: { success: true } };
}

async function handleAdminDeleteModel(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/').pop());
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  await env.DB.prepare('DELETE FROM ai_models WHERE id = ?').bind(id).run();

  await logAdminAudit(env, {
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.delete', target: `model:${id}`,
  });

  return { data: { success: true } };
}

async function handleAdminSetDefaultModel(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/')[4]);
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  const model = await env.DB.prepare('SELECT model_type FROM ai_models WHERE id = ?').bind(id).first();
  if (!model) return { data: { error: '模型不存在' }, status: 404 };

  await env.DB.batch([
    env.DB.prepare('UPDATE ai_models SET is_default = 0 WHERE model_type = ?').bind(model.model_type),
    env.DB.prepare('UPDATE ai_models SET is_default = 1, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id),
  ]);

  await logAdminAudit(env, {
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'model.set_default', target: `model:${id}`,
    payload: { model_type: model.model_type },
  });

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

function redeemRatePercent(used, total) {
  const u = Number(used || 0);
  const t = Number(total || 0);
  if (!t || t <= 0) return 0;
  return Math.round((u / t) * 10000) / 100;
}

async function handleAdminStatsRedeem(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get('days'), 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 90) : 30;

  try {
    const summaryRow = await env.DB.prepare(`
      SELECT
        COUNT(*) AS code_count,
        SUM(CASE WHEN status = 'active' AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at > datetime('now')) THEN 1 ELSE 0 END) AS active_available,
        SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled_count,
        COALESCE(SUM(max_uses), 0) AS total_slots,
        COALESCE(SUM(used_count), 0) AS used_slots,
        COALESCE(SUM(max_uses * points), 0) AS points_capacity,
        COALESCE(SUM(used_count * points), 0) AS points_redeemed
      FROM redeem_codes
    `).first();

    const logTotal = await env.DB.prepare(
      'SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS pts FROM redeem_logs'
    ).first();
    const log7d = await env.DB.prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS pts FROM redeem_logs WHERE created_at >= datetime('now', '-7 days')"
    ).first();

    const dailyBind = `-${days} days`;
    const daily = await env.DB.prepare(
      `SELECT date(created_at) AS day,
              COUNT(*) AS redemptions,
              COALESCE(SUM(points), 0) AS points
       FROM redeem_logs
       WHERE created_at >= datetime('now', ?)
       GROUP BY day
       ORDER BY day ASC`
    ).bind(dailyBind).all();

    const batches = await env.DB.prepare(`
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
    `).all();

    const orphan = await env.DB.prepare(`
      SELECT
        COUNT(*) AS codes_count,
        COALESCE(SUM(max_uses), 0) AS total_slots,
        COALESCE(SUM(used_count), 0) AS used_slots,
        COALESCE(SUM(max_uses * points), 0) AS points_capacity,
        COALESCE(SUM(used_count * points), 0) AS points_redeemed,
        MAX(created_at) AS last_created
      FROM redeem_codes
      WHERE batch_id IS NULL OR batch_id = ''
    `).first();

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

    const byBatch = (batches.results || []).map(row => mapBatchRow(row));
    if (orphan && Number(orphan.codes_count || 0) > 0) {
      byBatch.push(mapBatchRow({ ...orphan, note: '' }, '(无批次)'));
    }

    return {
      data: {
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
        daily_redemptions: daily.results || [],
      }
    };
  } catch (error) {
    logError(env, 'admin-stats-redeem', error);
    return {
      data: { error: '兑换码统计不可用，请确认已执行 migrate-redeem.sql 迁移' },
      status: 500,
    };
  }
}

// =============== 公开统计（首页统计条） ===============

async function handlePublicStats(request, env) {
  // 首页"已为 X 位用户生成 Y 张写真"统计条
  // 真实数据 + 虚拟基线（早期 MVP 数据少，做一个时间增长曲线让数字"活"起来）
  // VIRTUAL_BASE_AT 之后每秒再叠加固定增长，避免给用户"产品没人用"的观感。
  let realUsers = 0;
  let realImages = 0;
  try {
    const [u, g] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
      env.DB.prepare(
        "SELECT COALESCE(SUM(units), 0) AS n FROM api_usage_logs WHERE model_type = 'image' AND success = 1"
      ).first(),
    ]);
    realUsers = Number(u?.n || 0);
    realImages = Number(g?.n || 0);
  } catch (error) {
    logError(env, 'public-stats', error);
  }

  const VIRTUAL = virtualBaseline();
  const userCount = realUsers + VIRTUAL.users;
  const imageCount = realImages + VIRTUAL.images;

  return {
    data: {
      userCount,
      imageCount,
      realUsers,
      realImages,
      virtualUsers: VIRTUAL.users,
      virtualImages: VIRTUAL.images,
      tickPerSecond: VIRTUAL.tickPerSecond,
      // 让前端做平滑动画用的"基准秒数"，前端可以基于本地时间继续递增
      serverTs: Date.now(),
    }
  };
}

// 虚拟基线：以 2024-01-01 为锚点开始增长
// 调整这里的常量即可控制"看起来已运营多久"
function virtualBaseline() {
  const ANCHOR_TS = Date.parse('2024-01-01T00:00:00Z');
  const USERS_PER_SECOND = 0.022;     // ~ 1900 用户 / 天
  const IMAGES_PER_SECOND = 0.78;     // ~ 67000 图 / 天
  const SEED_USERS = 8200;
  const SEED_IMAGES = 352000;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - ANCHOR_TS) / 1000));
  return {
    users: SEED_USERS + Math.floor(elapsedSec * USERS_PER_SECOND),
    images: SEED_IMAGES + Math.floor(elapsedSec * IMAGES_PER_SECOND),
    tickPerSecond: { users: USERS_PER_SECOND, images: IMAGES_PER_SECOND },
  };
}

// =============== 兑换码 ===============

// 字符集去掉了 0/O/I/L/1，避免抄写歧义
const REDEEM_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRedeemCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += REDEEM_CHARSET[bytes[i] % REDEEM_CHARSET.length];
  }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function normalizeRedeemCode(input) {
  if (typeof input !== 'string') return '';
  // 去空格、去连字符、转大写
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

async function handleRedeemCode(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  // 防爆破：每用户每分钟最多 10 次，每 IP 每分钟最多 30 次
  const ip = getClientIp(request);
  const ru = await checkRateLimit(env, `redeem-u:${userId}`, 10, 60);
  if (!ru.allowed) {
    return { data: { error: '兑换过于频繁，请稍后再试' }, status: 429 };
  }
  const ri = await checkRateLimit(env, `redeem-ip:${ip}`, 30, 60);
  if (!ri.allowed) {
    return { data: { error: '兑换过于频繁，请稍后再试' }, status: 429 };
  }

  const body = await readJsonBody(request);
  const raw = body?.code;
  const normalized = normalizeRedeemCode(raw);
  if (!normalized || normalized.length < 6 || normalized.length > 32) {
    return { data: { error: '兑换码格式错误' }, status: 400 };
  }
  // 数据库里以 XXXX-XXXX-XXXX 形式存储
  const formatted = normalized.length === 12
    ? `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`
    : normalized;

  const row = await env.DB.prepare(
    'SELECT * FROM redeem_codes WHERE code = ? OR REPLACE(code, "-", "") = ?'
  ).bind(formatted, normalized).first();

  if (!row) {
    return { data: { error: '兑换码不存在' }, status: 404 };
  }

  const stat = redeemCodeStatus(row);
  if (stat === 'disabled') return { data: { error: '该兑换码已停用' }, status: 400 };
  if (stat === 'expired')  return { data: { error: '该兑换码已过期' }, status: 400 };
  if (stat === 'used_up')  return { data: { error: '该兑换码已被领取完' }, status: 400 };

  // 防同一用户重复领取
  const existed = await env.DB.prepare(
    'SELECT 1 FROM redeem_logs WHERE code_id = ? AND user_id = ?'
  ).bind(row.id, userId).first();
  if (existed) {
    return { data: { error: '你已领取过该兑换码' }, status: 400 };
  }

  const points = parsePositiveInt(row.points, 10000000);
  if (!points) {
    return { data: { error: '兑换码配置异常' }, status: 500 };
  }

  // 并发安全：条件 UPDATE + 流水 INSERT + 加积分 + 加交易记录，在一个 batch 里执行
  // used_count 必须严格小于 max_uses 才生效；否则 changes = 0，回退报错
  let batchResults;
  try {
    batchResults = await env.DB.batch([
      env.DB.prepare(
        `UPDATE redeem_codes
         SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'active' AND used_count < max_uses
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
      ).bind(row.id),
      env.DB.prepare(
        `INSERT INTO redeem_logs (code_id, code, user_id, points, ip)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(row.id, row.code, userId, points, (ip || '').slice(0, 64)),
      env.DB.prepare(
        'UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(points, userId),
      env.DB.prepare(
        `INSERT INTO transactions (user_id, amount, type, description, balance)
         SELECT ?, ?, '充值', ?, points FROM users WHERE id = ?`
      ).bind(userId, points, `兑换码 ${row.code}`, userId),
    ]);
  } catch (error) {
    // UNIQUE(code_id,user_id) 触发也走这里
    logError(env, 'redeem', error);
    return { data: { error: '兑换失败，请确认兑换码是否已使用' }, status: 400 };
  }

  // batch[0] 的 changes 为 0 表示并发抢占失败（已被领完 / 被作废）
  if (!batchResults?.[0]?.meta?.changes) {
    return { data: { error: '该兑换码已被领取完' }, status: 400 };
  }

  const after = await env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(userId).first();

  return {
    data: {
      success: true,
      points,
      balance: after?.points ?? 0,
      message: `兑换成功，已到账 ${points} 积分`,
    }
  };
}

async function handleRedeemHistory(request, env) {
  const token = getUserId(request);
  const userId = token ? await verifyTokenAndGetUserId(token, env) : null;
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }
  const limitRaw = parseInt(new URL(request.url).searchParams.get('limit'), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

  const rows = await env.DB.prepare(
    'SELECT id, code, points, created_at FROM redeem_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all();

  return { data: rows.results || [] };
}

async function handleAdminListRedeemCodes(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get('limit'), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const status = url.searchParams.get('status');
  const batchId = url.searchParams.get('batch_id');
  const keyword = url.searchParams.get('q');

  const conditions = [];
  const binds = [];
  if (status && ['active', 'disabled'].includes(status)) {
    conditions.push('status = ?');
    binds.push(status);
  }
  if (batchId) {
    conditions.push('batch_id = ?');
    binds.push(batchId.slice(0, 64));
  }
  if (keyword) {
    conditions.push('(code LIKE ? OR note LIKE ?)');
    const kw = `%${keyword.slice(0, 60)}%`;
    binds.push(kw, kw);
  }
  let sql = 'SELECT * FROM redeem_codes';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  binds.push(limit);

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return { data: rows.results || [] };
}

async function handleAdminGenerateRedeemCodes(request, env) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') {
    return { data: { error: '请求参数无效' }, status: 400 };
  }
  const points = parsePositiveInt(body.points, 10000000);
  if (!points) return { data: { error: '面值积分非法' }, status: 400 };
  // 一次最多生成 200 张，防误操作
  const count = parsePositiveInt(body.count, 200);
  if (!count) return { data: { error: '生成数量需为 1~200' }, status: 400 };
  const maxUses = parsePositiveInt(body.max_uses, 1000000) || 1;

  let expiresAt = null;
  if (body.expires_at !== undefined && body.expires_at !== null && body.expires_at !== '') {
    const t = Date.parse(body.expires_at);
    if (!Number.isFinite(t)) {
      return { data: { error: '过期时间格式无效' }, status: 400 };
    }
    expiresAt = new Date(t).toISOString();
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : '';
  // 批次号自动生成（YYYYMMDD-HHMMSS-RAND）
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const batchId = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-`
    + `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}-`
    + Math.random().toString(36).slice(2, 6).toUpperCase();

  const generated = [];
  for (let i = 0; i < count; i++) {
    // 极小概率撞码，最多重试 5 次
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = generateRedeemCode();
      try {
        await env.DB.prepare(
          `INSERT INTO redeem_codes (code, points, max_uses, status, expires_at, batch_id, note, created_by)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`
        ).bind(code, points, maxUses, expiresAt, batchId, note, guard.userId).run();
        generated.push(code);
        inserted = true;
      } catch (error) {
        if (attempt === 4) {
          logError(env, 'redeem-generate', error);
          return { data: { error: '生成失败，请稍后再试' }, status: 500 };
        }
      }
    }
  }

  await logAdminAudit(env, {
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'redeem.generate', target: `batch:${batchId}`,
    payload: { count: generated.length, points, max_uses: maxUses, expires_at: expiresAt, note },
  });

  return {
    data: {
      success: true,
      batch_id: batchId,
      codes: generated,
      count: generated.length,
    }
  };
}

async function handleAdminDisableRedeemCode(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/')[4]);
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  const result = await env.DB.prepare(
    "UPDATE redeem_codes SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(id).run();

  if (!result?.meta?.changes) {
    return { data: { error: '兑换码不存在' }, status: 404 };
  }

  await logAdminAudit(env, {
    adminUserId: guard.userId, adminPhone: guard.phone,
    action: 'redeem.disable', target: `code:${id}`,
  });

  return { data: { success: true } };
}

async function handleAdminRedeemCodeLogs(request, env, path) {
  const guard = await requireAdmin(request, env);
  if (!guard.ok) return { data: { error: guard.error }, status: guard.status };

  const id = parsePositiveInt(path.split('/')[4]);
  if (!id) return { data: { error: 'id 无效' }, status: 400 };

  const rows = await env.DB.prepare(
    `SELECT l.id, l.user_id, u.phone, l.points, l.created_at
     FROM redeem_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.code_id = ?
     ORDER BY l.created_at DESC
     LIMIT 200`
  ).bind(id).all();

  const masked = (rows.results || []).map(r => ({
    ...r,
    phone: r.phone ? String(r.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '-',
  }));

  return { data: masked };
}
