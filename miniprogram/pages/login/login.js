const api = require('../../utils/api');

Page({
  data: {
    mode: 'password',
    passwordTabClass: 'active',
    codeTabClass: '',
    isPasswordMode: true,
    phone: '',
    code: '',
    password: '',
    agreed: false,
    loading: false,
    error: '',
    countdown: 0,
    countdownText: '发送'
  },

  setMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      mode,
      passwordTabClass: mode === 'password' ? 'active' : '',
      codeTabClass: mode === 'code' ? 'active' : '',
      isPasswordMode: mode === 'password',
      error: ''
    });
  },

  onPhoneInput(e) {
    this.setData({ phone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) });
  },

  onCodeInput(e) {
    this.setData({ code: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onAgreeChange(e) {
    this.setData({ agreed: e.detail.value.length > 0 });
  },

  sendCode() {
    if (this.data.phone.length !== 11) {
      this.setData({ error: '请输入正确的手机号' });
      return;
    }
    wx.showToast({ title: '验证码已发送', icon: 'none' });
    this.setData({ countdown: 60, countdownText: '60s' });
    const timer = setInterval(() => {
      const next = this.data.countdown - 1;
      this.setData({ countdown: next, countdownText: next > 0 ? `${next}s` : '发送' });
      if (next <= 0) clearInterval(timer);
    }, 1000);
  },

  async submit() {
    if (this.data.phone.length !== 11) {
      this.setData({ error: '请输入正确的手机号' });
      return;
    }
    if (!this.data.agreed) {
      this.setData({ error: '请先同意用户协议和隐私政策' });
      return;
    }
    if (this.data.mode === 'password' && !this.data.password) {
      this.setData({ error: '请输入密码' });
      return;
    }
    if (this.data.mode === 'code' && this.data.code.length !== 6) {
      this.setData({ error: '请输入 6 位验证码' });
      return;
    }

    this.setData({ loading: true, error: '' });
    try {
      const data = this.data.mode === 'password'
        ? await api.loginWithPassword(this.data.phone, this.data.password)
        : await api.login(this.data.phone, this.data.code);
      if (data.user) getApp().globalData.user = data.user;
      wx.switchTab({ url: '/pages/index/index' });
    } catch (error) {
      this.setData({ error: error.message || '登录失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openLegal(e) {
    wx.navigateTo({ url: `/pages/legal/legal?type=${e.currentTarget.dataset.type}` });
  }
});
