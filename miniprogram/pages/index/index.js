const api = require('../../utils/api');
const { chooseImages, readImageAsDataUrl, saveRemoteImage } = require('../../utils/file');
const { flattenScenes, visualStyles } = require('../../utils/data');
const { maxUploadFiles, pointsPerImage } = require('../../utils/config');

Page({
  data: {
    user: null,
    pointsText: '0',
    images: [],
    primaryIndex: 0,
    sceneOptions: flattenScenes(),
    styleOptions: visualStyles,
    sizeOptions: [
      { value: '2K', label: '2K 推荐' },
      { value: '3K', label: '3K 更清晰' },
      { value: '4K', label: '4K 超高细节' }
    ],
    countOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    sceneIndex: -1,
    styleIndex: -1,
    sizeIndex: 0,
    sceneText: '请选择场景',
    styleText: '跟随场景推荐',
    sizeText: '2K 推荐',
    imageCount: 1,
    keepFace: true,
    loading: false,
    results: [],
    error: ''
  },

  onShow() {
    this.loadUser();
  },

  async onLoad() {
    try {
      const data = await api.getImageOutputSizes();
      if (Array.isArray(data.sizes) && data.sizes.length) {
        this.setData({ sizeOptions: data.sizes, sizeText: data.sizes[0].label || data.sizes[0].value || data.sizes[0] });
      }
    } catch (error) {}
  },

  async loadUser() {
    try {
      const user = await api.getCurrentUser();
      getApp().globalData.user = user;
      this.setData({ user, pointsText: String((user && user.points) || 0) });
    } catch (error) {
      getApp().globalData.user = null;
      this.setData({ user: null, pointsText: '0' });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  async chooseImage() {
    const remain = maxUploadFiles - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传${maxUploadFiles}张`, icon: 'none' });
      return;
    }
    const files = await chooseImages(remain);
    if (!files.length) return;
    const images = this.data.images.concat(files.map((file) => ({
      path: file.tempFilePath,
      size: file.size || 0
    })));
    this.setData({ images: this.withActiveImages(images, this.data.primaryIndex || 0), primaryIndex: this.data.primaryIndex || 0, error: '' });
  },

  setPrimary(e) {
    const primaryIndex = Number(e.currentTarget.dataset.index) || 0;
    this.setData({ primaryIndex, images: this.withActiveImages(this.data.images, primaryIndex) });
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.images.filter((_, i) => i !== index);
    let primaryIndex = this.data.primaryIndex;
    if (index < primaryIndex) primaryIndex -= 1;
    if (index === primaryIndex) primaryIndex = Math.min(primaryIndex, Math.max(images.length - 1, 0));
    this.setData({
      images: this.withActiveImages(images, primaryIndex),
      primaryIndex
    });
  },

  withActiveImages(images, primaryIndex) {
    return images.map((image, index) => Object.assign({}, image, {
      activeClass: index === primaryIndex ? 'active' : '',
      isPrimary: index === primaryIndex
    }));
  },

  onSceneChange(e) {
    const sceneIndex = Number(e.detail.value);
    const scene = this.data.sceneOptions[sceneIndex];
    const styleIndex = this.data.styleOptions.indexOf(scene.style);
    const nextStyleIndex = styleIndex >= 0 ? styleIndex : this.data.styleIndex;
    this.setData({
      sceneIndex,
      styleIndex: nextStyleIndex,
      sceneText: scene.label,
      styleText: nextStyleIndex >= 0 ? this.data.styleOptions[nextStyleIndex] : '跟随场景推荐',
      error: ''
    });
  },

  onStyleChange(e) {
    const styleIndex = Number(e.detail.value);
    this.setData({ styleIndex, styleText: this.data.styleOptions[styleIndex] });
  },

  onSizeChange(e) {
    const sizeIndex = Number(e.detail.value);
    const size = this.data.sizeOptions[sizeIndex];
    this.setData({ sizeIndex, sizeText: size.label || size.value || size });
  },

  onCountChange(e) {
    const index = Number(e.detail.value);
    this.setData({ imageCount: this.data.countOptions[index] || 1 });
  },

  onKeepFaceChange(e) {
    this.setData({ keepFace: e.detail.value });
  },

  async generate() {
    if (this.data.loading) return;
    if (!this.data.user) {
      this.goLogin();
      return;
    }
    if (!this.data.images.length) {
      this.setData({ error: '请先上传至少一张照片' });
      return;
    }
    if (this.data.sceneIndex < 0) {
      this.setData({ error: '请选择场景主题' });
      return;
    }
    const pointsRequired = this.data.imageCount * pointsPerImage;
    if ((this.data.user.points || 0) < pointsRequired) {
      this.setData({ error: `积分不足，生成需要 ${pointsRequired} 积分` });
      return;
    }

    this.setData({ loading: true, error: '', results: [] });
    wx.showLoading({ title: '生成中' });
    try {
      const primary = this.data.images[this.data.primaryIndex] || this.data.images[0];
      const imageBase64 = await readImageAsDataUrl(primary.path);
      const scene = this.data.sceneOptions[this.data.sceneIndex];
      const size = this.data.sizeOptions[this.data.sizeIndex] || this.data.sizeOptions[0];
      const style = this.data.styleIndex >= 0 ? this.data.styleOptions[this.data.styleIndex] : scene.style;
      const result = await api.generatePortrait({
        scene: scene.name,
        style,
        keepFace: this.data.keepFace,
        imageBase64,
        imageCount: this.data.imageCount,
        size: size.value || size
      });
      const urls = Array.isArray(result.urls) ? result.urls : [];
      if (!urls.length) throw new Error('没有获取到生成图片');
      this.setData({ results: urls });
      await api.saveGeneration(urls, `${scene.name} / ${style}`, scene.name, urls.length, `${scene.name} / ${style}`);
      await this.loadUser();
    } catch (error) {
      this.setData({ error: error.message || '生成失败，请稍后重试' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  async saveImage(e) {
    const url = e.currentTarget.dataset.url;
    try {
      await saveRemoteImage(url);
      wx.showToast({ title: '已保存' });
    } catch (error) {
      wx.showToast({ title: '保存失败，请检查权限', icon: 'none' });
    }
  }
});
