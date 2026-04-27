const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

const TOKEN_KEY = 'synthia_token';
const REFRESH_TOKEN_KEY = 'synthia_refresh_token';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this._refreshPromise = null;
  }

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setRefreshToken(token) {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  async _refreshAccessToken() {
    if (!this._refreshPromise) {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) return null;
      this._refreshPromise = (async () => {
        try {
          const url = `${this.baseURL}/api/auth/refresh`;
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!resp.ok) {
            this.setToken(null);
            this.setRefreshToken(null);
            return null;
          }
          const data = await resp.json();
          if (data?.token) this.setToken(data.token);
          if (data?.refreshToken) this.setRefreshToken(data.refreshToken);
          return data?.token || null;
        } catch {
          return null;
        } finally {
          this._refreshPromise = null;
        }
      })();
    }
    return this._refreshPromise;
  }

  async request(endpoint, options = {}, _retry = false) {
    const url = `${this.baseURL}${endpoint}`;
    const token = this.getToken();

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, config);

    if (response.status === 401 && !_retry && this.getRefreshToken()) {
      const newToken = await this._refreshAccessToken();
      if (newToken) {
        return await this.request(endpoint, options, true);
      }
    }

    let data = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }
    return data;
  }

  async login(phone, code) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async loginWithPassword(phone, password) {
    const data = await this.request('/api/auth/login-password', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async logout() {
    this.setToken(null);
    this.setRefreshToken(null);
    try {
      return await this.request('/api/auth/logout', {
        method: 'POST',
      });
    } catch {
      return { success: true };
    }
  }

  async deleteAccount(password, confirm) {
    return await this.request('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password, confirm }),
    });
  }

  async getCurrentUser() {
    return await this.request('/api/auth/me');
  }

  async updatePassword(oldPassword, newPassword) {
    return await this.request('/api/auth/update-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  }

  async addPoints(amount, description) {
    return await this.request('/api/points/add', {
      method: 'POST',
      body: JSON.stringify({ amount, description }),
    });
  }

  async consumePoints(amount, description) {
    return await this.request('/api/points/consume', {
      method: 'POST',
      body: JSON.stringify({ amount, description }),
    });
  }

  async getTransactions(limit = 20) {
    return await this.request(`/api/points/transactions?limit=${limit}`);
  }

  async getGenerations() {
    return await this.request('/api/generations');
  }

  async saveGeneration(images, prompt, scene, imageCount) {
    return await this.request('/api/generations', {
      method: 'POST',
      body: JSON.stringify({ images, prompt, scene, imageCount }),
    });
  }

  async deleteGeneration(recordId) {
    return await this.request(`/api/generations/${recordId}`, {
      method: 'DELETE',
    });
  }

  async generatePrompt(scene, style) {
    return await this.request('/api/llm/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({ scene, style }),
    });
  }

  async getPublicStats() {
    return await this.request('/api/stats/public');
  }

  async redeemCode(code) {
    return await this.request('/api/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async getRedeemHistory(limit = 20) {
    return await this.request(`/api/redeem/history?limit=${limit}`);
  }

  async adminListRedeemCodes(params = {}) {
    const usp = new URLSearchParams();
    if (params.limit) usp.set('limit', String(params.limit));
    if (params.status) usp.set('status', params.status);
    if (params.batch_id) usp.set('batch_id', params.batch_id);
    if (params.q) usp.set('q', params.q);
    const qs = usp.toString();
    return await this.request(`/api/admin/redeem-codes${qs ? `?${qs}` : ''}`);
  }

  async adminGenerateRedeemCodes(payload) {
    return await this.request('/api/admin/redeem-codes/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async adminDisableRedeemCode(id) {
    return await this.request(`/api/admin/redeem-codes/${id}/disable`, {
      method: 'POST',
    });
  }

  async adminRedeemCodeLogs(id) {
    return await this.request(`/api/admin/redeem-codes/${id}/logs`);
  }

  async adminMe() {
    return await this.request('/api/admin/me');
  }

  async adminListModels() {
    return await this.request('/api/admin/models');
  }

  async adminCreateModel(data) {
    return await this.request('/api/admin/models', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async adminUpdateModel(id, data) {
    return await this.request(`/api/admin/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async adminDeleteModel(id) {
    return await this.request(`/api/admin/models/${id}`, {
      method: 'DELETE',
    });
  }

  async adminSetDefaultModel(id) {
    return await this.request(`/api/admin/models/${id}/set-default`, {
      method: 'POST',
    });
  }

  async adminStatsOverview() {
    return await this.request('/api/admin/stats/overview');
  }

  async adminStatsUsage(days = 30, modelType = '') {
    const params = new URLSearchParams();
    if (days) params.set('days', String(days));
    if (modelType) params.set('model_type', modelType);
    return await this.request(`/api/admin/stats/usage?${params.toString()}`);
  }

  async adminStatsTopUsers(limit = 10) {
    return await this.request(`/api/admin/stats/top-users?limit=${limit}`);
  }

  async adminStatsModels() {
    return await this.request('/api/admin/stats/models');
  }

  async generateImages(prompt, imageBase64, imageCount, onImageGenerated, signal) {
    const url = `${this.baseURL}/api/images/generate`;
    const token = this.getToken();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt, imageBase64, imageCount }),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || '生成失败');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const generatedImages = [];
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data:')) {
            const dataStr = trimmedLine.substring(5).trim();
            if (dataStr === '[DONE]' || !dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data && data.url) {
                generatedImages.push(data.url);
                if (onImageGenerated) onImageGenerated(data.url);
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      try { reader.cancel(); } catch {}
      throw err;
    }

    return generatedImages;
  }
}

export const api = new ApiService();
export default api;
