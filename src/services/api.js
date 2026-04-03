const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    const userId = localStorage.getItem('synthia_user_id');
    if (userId) {
      headers['X-User-Id'] = userId;
    }
    
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '请求失败');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async login(phone, code) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
    
    if (data.user) {
      localStorage.setItem('synthia_user_id', data.user.id);
      localStorage.setItem('synthia_user', JSON.stringify(data.user));
    }
    
    return data;
  }

  async loginWithPassword(phone, password) {
    const data = await this.request('/api/auth/login-password', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    
    if (data.success && data.user) {
      localStorage.setItem('synthia_user_id', data.user.id);
      localStorage.setItem('synthia_user', JSON.stringify(data.user));
    }
    
    return data;
  }

  async logout() {
    localStorage.removeItem('synthia_user_id');
    localStorage.removeItem('synthia_user');
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

  async getBalance() {
    return await this.request('/api/points/balance');
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

  async cleanupGenerations() {
    return await this.request('/api/generations/cleanup', {
      method: 'POST',
    });
  }

  async deleteGeneration(recordId) {
    return await this.request(`/api/generations/${recordId}`, {
      method: 'DELETE',
    });
  }

  async getUsedPrompts() {
    return await this.request('/api/prompts/used');
  }

  async markPromptUsed(promptId) {
    return await this.request('/api/prompts/mark-used', {
      method: 'POST',
      body: JSON.stringify({ promptId }),
    });
  }
}

export const api = new ApiService();
export default api;
