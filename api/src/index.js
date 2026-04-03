export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let response;

      if (path === '/api/auth/login' && method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/api/auth/login-password' && method === 'POST') {
        response = await handleLoginWithPassword(request, env);
      } else if (path === '/api/auth/me' && method === 'GET') {
        response = await handleGetCurrentUser(request, env);
      } else if (path === '/api/auth/update-password' && method === 'POST') {
        response = await handleUpdatePassword(request, env);
      } else if (path === '/api/points/balance' && method === 'GET') {
        response = await handleGetBalance(request, env);
      } else if (path === '/api/points/add' && method === 'POST') {
        response = await handleAddPoints(request, env);
      } else if (path === '/api/points/consume' && method === 'POST') {
        response = await handleConsumePoints(request, env);
      } else if (path === '/api/points/transactions' && method === 'GET') {
        response = await handleGetTransactions(request, env);
      } else if (path === '/api/generations' && method === 'GET') {
        response = await handleGetGenerations(request, env);
      } else if (path === '/api/generations' && method === 'POST') {
        response = await handleSaveGeneration(request, env);
      } else if (path === '/api/generations/cleanup' && method === 'POST') {
        response = await handleCleanupGenerations(request, env);
      } else if (path.startsWith('/api/generations/') && method === 'DELETE') {
        response = await handleDeleteGeneration(request, env);
      } else if (path === '/api/prompts/used' && method === 'GET') {
        response = await handleGetUsedPrompts(request, env);
      } else if (path === '/api/prompts/mark-used' && method === 'POST') {
        response = await handleMarkPromptUsed(request, env);
      } else {
        response = jsonResponse({ error: 'Not found' }, 404);
      }

      return response;
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  }
};

async function handleLogin(request, env) {
  const { phone, code } = await request.json();
  
  if (!phone || phone.length !== 11) {
    return jsonResponse({ error: '请输入正确的手机号' }, 400);
  }

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

  return jsonResponse({
    user: {
      id: user.id,
      phone: user.phone,
      points: user.points,
      createdAt: user.created_at
    },
    isNewUser,
    hasPassword: !!user.password
  });
}

async function handleLoginWithPassword(request, env) {
  const { phone, password } = await request.json();
  
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE phone = ?'
  ).bind(phone).first();

  if (!user) {
    return jsonResponse({ error: '用户不存在' }, 400);
  }

  if (!user.password) {
    return jsonResponse({ error: '该用户未设置密码，请使用验证码登录' }, 400);
  }

  if (user.password !== password) {
    return jsonResponse({ error: '密码错误' }, 400);
  }

  return jsonResponse({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      points: user.points,
      createdAt: user.created_at
    }
  });
}

async function handleGetCurrentUser(request, env) {
  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT id, phone, points, created_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return jsonResponse({ error: '用户不存在' }, 404);
  }

  return jsonResponse({
    id: user.id,
    phone: user.phone,
    points: user.points,
    createdAt: user.created_at
  });
}

async function handleUpdatePassword(request, env) {
  const userId = request.headers.get('X-User-Id');
  const { oldPassword, newPassword } = await request.json();

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first();

  if (user.password && user.password !== oldPassword) {
    return jsonResponse({ error: '原密码错误' }, 400);
  }

  await env.DB.prepare(
    'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newPassword, userId).run();

  return jsonResponse({ success: true, message: '密码修改成功' });
}

async function handleGetBalance(request, env) {
  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT points FROM users WHERE id = ?'
  ).bind(userId).first();

  return jsonResponse({ points: user.points });
}

async function handleAddPoints(request, env) {
  const userId = request.headers.get('X-User-Id');
  const { amount, description } = await request.json();

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT points FROM users WHERE id = ?'
  ).bind(userId).first();

  const newPoints = user.points + amount;
  
  await env.DB.prepare(
    'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newPoints, userId).run();

  await env.DB.prepare(
    'INSERT INTO transactions (user_id, amount, type, description, balance) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, amount, '充值', description, newPoints).run();

  return jsonResponse({ success: true, points: newPoints });
}

async function handleConsumePoints(request, env) {
  const userId = request.headers.get('X-User-Id');
  const { amount, description } = await request.json();

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT points FROM users WHERE id = ?'
  ).bind(userId).first();

  if (user.points < amount) {
    return jsonResponse({ error: '积分不足' }, 400);
  }

  const newPoints = user.points - amount;
  
  await env.DB.prepare(
    'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newPoints, userId).run();

  await env.DB.prepare(
    'INSERT INTO transactions (user_id, amount, type, description, balance) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, -amount, '消费', description, newPoints).run();

  return jsonResponse({ success: true, points: newPoints });
}

async function handleGetTransactions(request, env) {
  const userId = request.headers.get('X-User-Id');
  const limit = parseInt(new URL(request.url).searchParams.get('limit')) || 20;

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const transactions = await env.DB.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all();

  return jsonResponse(transactions.results);
}

async function handleGetGenerations(request, env) {
  const userId = request.headers.get('X-User-Id');
  
  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const generations = await env.DB.prepare(
    'SELECT * FROM generations WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC'
  ).bind(userId).all();

  return jsonResponse(generations.results.map(g => ({
    ...g,
    images: JSON.parse(g.images),
    remainingTime: new Date(g.expires_at) - new Date()
  })));
}

async function handleSaveGeneration(request, env) {
  const userId = request.headers.get('X-User-Id');
  const { images, prompt, scene, imageCount } = await request.json();

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  const result = await env.DB.prepare(
    'INSERT INTO generations (user_id, images, prompt, scene, image_count, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, JSON.stringify(images), prompt, scene, imageCount, expiresAt).run();

  return jsonResponse({ 
    success: true, 
    id: result.meta.last_row_id,
    expiresAt 
  });
}

async function handleCleanupGenerations(request, env) {
  const result = await env.DB.prepare(
    'DELETE FROM generations WHERE expires_at < CURRENT_TIMESTAMP'
  ).run();

  return jsonResponse({ 
    success: true, 
    deletedCount: result.meta.changes 
  });
}

async function handleDeleteGeneration(request, env) {
  const userId = request.headers.get('X-User-Id');
  const url = new URL(request.url);
  const recordId = url.pathname.split('/').pop();

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const result = await env.DB.prepare(
    'DELETE FROM generations WHERE id = ? AND user_id = ?'
  ).bind(recordId, userId).run();

  if (result.meta.changes === 0) {
    return jsonResponse({ error: '记录不存在或无权删除' }, 404);
  }

  return jsonResponse({ success: true });
}

async function handleGetUsedPrompts(request, env) {
  const userId = request.headers.get('X-User-Id');
  
  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  const prompts = await env.DB.prepare(
    'SELECT prompt_id FROM used_prompts WHERE user_id = ?'
  ).bind(userId).all();

  return jsonResponse(prompts.results.map(p => p.prompt_id));
}

async function handleMarkPromptUsed(request, env) {
  const userId = request.headers.get('X-User-Id');
  const { promptId } = await request.json();

  if (!userId) {
    return jsonResponse({ error: '未登录' }, 401);
  }

  await env.DB.prepare(
    'INSERT OR IGNORE INTO used_prompts (user_id, prompt_id) VALUES (?, ?)'
  ).bind(userId, promptId).run();

  return jsonResponse({ success: true });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
    }
  });
}
