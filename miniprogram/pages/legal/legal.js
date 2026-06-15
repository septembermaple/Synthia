const contents = {
  terms: {
    title: '用户协议',
    body: [
      '欢迎使用 Synthia。你应保证上传内容拥有合法权利，不得上传违法、侵权或违反平台规则的内容。',
      'AI 生成结果仅供个人创作和合规用途。因使用生成内容产生的责任，由使用者自行承担。',
      '平台可能根据模型服务、合规要求和产品策略调整功能、积分规则和服务范围。'
    ]
  },
  privacy: {
    title: '隐私政策',
    body: [
      '我们会处理你提交的手机号、登录凭证、上传图片和生成记录，用于账号登录、图片生成、积分核算和历史记录展示。',
      '上传图片会发送至服务端和模型服务用于完成生成请求。请勿上传他人敏感图片或未经授权的内容。',
      '你可以在账号相关功能中管理登录状态和历史记录。'
    ]
  }
};

Page({
  data: {
    title: '用户协议',
    body: []
  },

  onLoad(query) {
    const data = contents[query.type] || contents.terms;
    this.setData(data);
    wx.setNavigationBarTitle({ title: data.title });
  }
});
