const api = require('../../utils/api');

Page({
  data: {
    user: null,
    userPhone: '',
    pointsText: '0',
    redeemCode: '',
    message: '',
    transactions: []
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const user = await api.getCurrentUser();
      const transactions = await api.getTransactions(20);
      getApp().globalData.user = user;
      const normalized = Array.isArray(transactions)
        ? transactions.map((item) => Object.assign({}, item, {
          descText: item.description || item.type || '积分变动',
          timeText: item.created_at || item.createdAt || '',
          amountText: `${Number(item.amount) > 0 ? '+' : ''}${item.amount}`
        }))
        : [];
      this.setData({
        user,
        userPhone: user.phone || '已登录用户',
        pointsText: String(user.points || 0),
        transactions: normalized
      });
    } catch (error) {
      this.setData({ user: null, userPhone: '', pointsText: '0', transactions: [] });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onRedeemInput(e) {
    this.setData({ redeemCode: e.detail.value.trim(), message: '' });
  },

  async redeem() {
    if (!this.data.redeemCode) {
      this.setData({ message: '请输入兑换码' });
      return;
    }
    try {
      const result = await api.redeemCode(this.data.redeemCode);
      this.setData({ message: result.message || '兑换成功', redeemCode: '' });
      await this.load();
    } catch (error) {
      this.setData({ message: error.message || '兑换失败' });
    }
  },

  async logout() {
    await api.logout();
    getApp().globalData.user = null;
    this.setData({ user: null, userPhone: '', pointsText: '0', transactions: [] });
    wx.showToast({ title: '已退出' });
  }
});
