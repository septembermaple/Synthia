const api = require('./utils/api');

App({
  globalData: {
    user: null
  },

  async onLaunch() {
    try {
      this.globalData.user = await api.getCurrentUser();
    } catch (error) {
      this.globalData.user = null;
    }
  }
});
