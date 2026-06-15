const { apiBaseUrl } = require('./config');

const TOKEN_KEY = 'synthia_token';
const REFRESH_TOKEN_KEY = 'synthia_refresh_token';

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) wx.setStorageSync(TOKEN_KEY, token);
  else wx.removeStorageSync(TOKEN_KEY);
}

function getRefreshToken() {
  return wx.getStorageSync(REFRESH_TOKEN_KEY) || '';
}

function setRefreshToken(token) {
  if (token) wx.setStorageSync(REFRESH_TOKEN_KEY, token);
  else wx.removeStorageSync(REFRESH_TOKEN_KEY);
}

function request(endpoint, options = {}, retry = false) {
  const token = getToken();
  const header = Object.assign(
    { 'Content-Type': 'application/json' },
    options.header || {},
    token ? { Authorization: `Bearer ${token}` } : {}
  );

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl}${endpoint}`,
      method: options.method || 'GET',
      data: options.data || {},
      header,
      timeout: options.timeout || 120000,
      success: async (res) => {
        if (res.statusCode === 401 && !retry && getRefreshToken()) {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            request(endpoint, options, true).then(resolve).catch(reject);
            return;
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
          return;
        }
        const msg = res.data && (res.data.error || res.data.message);
        reject(new Error(msg || `请求失败(${res.statusCode})`));
      },
      fail: (err) => reject(new Error(err.errMsg || '网络请求失败'))
    });
  });
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const data = await request('/api/auth/refresh', {
      method: 'POST',
      data: { refreshToken }
    }, true);
    if (data.token) setToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return data.token || null;
  } catch (error) {
    setToken('');
    setRefreshToken('');
    return null;
  }
}

function persistTokens(data) {
  if (data && data.token) setToken(data.token);
  if (data && data.refreshToken) setRefreshToken(data.refreshToken);
}

module.exports = {
  getToken,
  setToken,
  setRefreshToken,
  request,

  async login(phone, code) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      data: { phone, code }
    });
    persistTokens(data);
    return data;
  },

  async loginWithPassword(phone, password) {
    const data = await request('/api/auth/login-password', {
      method: 'POST',
      data: { phone, password }
    });
    persistTokens(data);
    return data;
  },

  async logout() {
    setToken('');
    setRefreshToken('');
    try {
      return await request('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      return { success: true };
    }
  },

  getCurrentUser() {
    return request('/api/auth/me');
  },

  updatePassword(oldPassword, newPassword) {
    return request('/api/auth/update-password', {
      method: 'POST',
      data: { oldPassword, newPassword }
    });
  },

  getTransactions(limit = 20) {
    return request(`/api/points/transactions?limit=${limit}`);
  },

  redeemCode(code) {
    return request('/api/redeem', {
      method: 'POST',
      data: { code }
    });
  },

  getRedeemHistory(limit = 20) {
    return request(`/api/redeem/history?limit=${limit}`);
  },

  getGenerations() {
    return request('/api/generations');
  },

  deleteGeneration(id) {
    return request(`/api/generations/${id}`, { method: 'DELETE' });
  },

  saveGeneration(images, prompt, scene, imageCount, promptFull) {
    return request('/api/generations', {
      method: 'POST',
      data: { images, prompt, scene, imageCount, promptFull }
    });
  },

  getImageOutputSizes() {
    return request('/api/images/output-sizes');
  },

  generatePortrait(payload) {
    return request('/api/images/generate-portrait', {
      method: 'POST',
      data: payload,
      timeout: 300000
    });
  }
};
