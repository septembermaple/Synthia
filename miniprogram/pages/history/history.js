const api = require('../../utils/api');
const { saveRemoteImage } = require('../../utils/file');

Page({
  data: {
    records: [],
    loading: false,
    error: ''
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const records = await api.getGenerations();
      this.setData({
        records: Array.isArray(records) ? records.map(this.normalizeRecord) : []
      });
    } catch (error) {
      this.setData({ error: '登录后可查看生成历史', records: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  normalizeRecord(record) {
    let images = record.images || [];
    if (typeof images === 'string') {
      try {
        images = JSON.parse(images);
      } catch (error) {
        images = images ? [images] : [];
      }
    }
    return Object.assign({}, record, {
      images: Array.isArray(images) ? images : [],
      timeText: record.created_at || record.createdAt || '',
      title: record.prompt || record.scene || 'AI 写真'
    });
  },

  async saveImage(e) {
    try {
      await saveRemoteImage(e.currentTarget.dataset.url);
      wx.showToast({ title: '已保存' });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id;
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '删除记录',
        content: '确定删除这条生成记录吗？',
        success: (res) => resolve(res.confirm)
      });
    });
    if (!ok) return;
    try {
      await api.deleteGeneration(id);
      wx.showToast({ title: '已删除' });
      this.load();
    } catch (error) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  }
});
