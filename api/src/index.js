export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const origin = request.headers.get('Origin') || '*';
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === '/api/images/generate' && method === 'POST') {
      return await handleImageGeneration(request, env, corsHeaders);
    }

    try {
      const result = await handleRequest(request, env, path, method);
      
      const headers = {
        'Content-Type': 'application/json',
        ...corsHeaders,
      };

      return new Response(JSON.stringify(result.data), {
        status: result.status || 200,
        headers
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      });
    }
  }
};

async function handleImageGeneration(request, env, corsHeaders) {
  const userId = getUserId(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const apiKey = env.DOUBAO_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API密钥未配置' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  try {
    const body = await request.json();
    const { prompt, imageBase64, imageCount } = body;

    console.log('=== DEBUG: 图片生成请求参数 ===');
    console.log('imageCount:', imageCount);
    console.log('prompt length:', prompt?.length);
    console.log('================================');

    const requestData = {
      model: 'doubao-seedream-4-0-250828',
      prompt: prompt,
      image: [imageBase64],
      sequential_image_generation: 'auto',
      sequential_image_generation_options: {
        max_images: imageCount || 1
      },
      response_format: 'url',
      size: '2K',
      stream: true,
      watermark: false
    };

    console.log('🚀 发送的请求数据 full requestData：', requestData);

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `API请求失败: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log('🚀 接收的响应数据 full response：', response);

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
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
    return await handleCleanupGenerations(env);
  } else if (path.startsWith('/api/generations/') && method === 'DELETE') {
    return await handleDeleteGeneration(request, env);
  } else if (path === '/api/prompts' && method === 'GET') {
    return await handleGetPrompts(request, env);
  } else if (path === '/api/prompts/used' && method === 'GET') {
    return await handleGetUsedPrompts(request, env);
  } else if (path === '/api/prompts/mark-used' && method === 'POST') {
    return await handleMarkPromptUsed(request, env);
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

function generateToken(userId) {
  return String(userId);
}

async function handleLogin(request, env) {
  const { phone, code } = await request.json();
  
  if (!phone || phone.length !== 11) {
    return { data: { error: '请输入正确的手机号' }, status: 400 };
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

  const token = generateToken(user.id);

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
  const { phone, password } = await request.json();
  
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE phone = ?'
  ).bind(phone).first();

  if (!user) {
    return { data: { error: '用户不存在' }, status: 400 };
  }

  if (!user.password) {
    return { data: { error: '该用户未设置密码，请使用验证码登录' }, status: 400 };
  }

  if (user.password !== password) {
    return { data: { error: '密码错误' }, status: 400 };
  }

  const token = generateToken(user.id);

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
  const userId = getUserId(request);
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
  const userId = getUserId(request);
  const { oldPassword, newPassword } = await request.json();

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first();

  if (user.password && user.password !== oldPassword) {
    return { data: { error: '原密码错误' }, status: 400 };
  }

  await env.DB.prepare(
    'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newPassword, userId).run();

  return { data: { success: true, message: '密码修改成功' } };
}

async function handleGetBalance(request, env) {
  const userId = getUserId(request);
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const user = await env.DB.prepare(
    'SELECT points FROM users WHERE id = ?'
  ).bind(userId).first();

  return { data: { points: user.points } };
}

async function handleAddPoints(request, env) {
  const userId = getUserId(request);
  const { amount, description } = await request.json();

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
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

  return { data: { success: true, points: newPoints } };
}

async function handleConsumePoints(request, env) {
  const userId = getUserId(request);
  const { amount, description } = await request.json();

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const user = await env.DB.prepare(
    'SELECT points FROM users WHERE id = ?'
  ).bind(userId).first();

  if (user.points < amount) {
    return { data: { error: '积分不足' }, status: 400 };
  }

  const newPoints = user.points - amount;
  
  await env.DB.prepare(
    'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(newPoints, userId).run();

  await env.DB.prepare(
    'INSERT INTO transactions (user_id, amount, type, description, balance) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, -amount, '消费', description, newPoints).run();

  return { data: { success: true, points: newPoints } };
}

async function handleGetTransactions(request, env) {
  const userId = getUserId(request);
  const limit = parseInt(new URL(request.url).searchParams.get('limit')) || 20;

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const transactions = await env.DB.prepare(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all();

  return { data: transactions.results };
}

async function handleGetGenerations(request, env) {
  const userId = getUserId(request);
  
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const generations = await env.DB.prepare(
    'SELECT * FROM generations WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC'
  ).bind(userId).all();

  return { 
    data: generations.results.map(g => ({
      ...g,
      images: JSON.parse(g.images),
      remainingTime: new Date(g.expires_at) - new Date()
    }))
  };
}

async function handleSaveGeneration(request, env) {
  const userId = getUserId(request);
  const { images, prompt, scene, imageCount } = await request.json();

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  
  const result = await env.DB.prepare(
    'INSERT INTO generations (user_id, images, prompt, scene, image_count, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, JSON.stringify(images), prompt, scene, imageCount, expiresAt).run();

  return { 
    data: { 
      success: true, 
      id: result.meta.last_row_id,
      expiresAt 
    }
  };
}

async function handleCleanupGenerations(env) {
  const result = await env.DB.prepare(
    'DELETE FROM generations WHERE expires_at < CURRENT_TIMESTAMP'
  ).run();

  return { 
    data: { 
      success: true, 
      deletedCount: result.meta.changes 
    }
  };
}

async function handleDeleteGeneration(request, env) {
  const userId = getUserId(request);
  const url = new URL(request.url);
  const recordId = url.pathname.split('/').pop();

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
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
  const userId = getUserId(request);
  
  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  const prompts = await env.DB.prepare(
    'SELECT prompt_id FROM used_prompts WHERE user_id = ?'
  ).bind(userId).all();

  return { data: prompts.results.map(p => p.prompt_id) };
}

async function handleMarkPromptUsed(request, env) {
  const userId = getUserId(request);
  const { promptId } = await request.json();

  if (!userId) {
    return { data: { error: '未登录' }, status: 401 };
  }

  await env.DB.prepare(
    'INSERT OR IGNORE INTO used_prompts (user_id, prompt_id) VALUES (?, ?)'
  ).bind(userId, promptId).run();

  return { data: { success: true } };
}
