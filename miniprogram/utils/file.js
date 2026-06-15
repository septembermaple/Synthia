function readImageAsDataUrl(path) {
  const fs = wx.getFileSystemManager();
  return new Promise((resolve, reject) => {
    fs.readFile({
      filePath: path,
      encoding: 'base64',
      success: (res) => {
        const ext = String(path).toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
        resolve(`data:image/${ext};base64,${res.data}`);
      },
      fail: (err) => reject(new Error(err.errMsg || '读取图片失败'))
    });
  });
}

function chooseImages(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => resolve(res.tempFiles || []),
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) resolve([]);
        else reject(new Error(err.errMsg || '选择图片失败'));
      }
    });
  });
}

function saveRemoteImage(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('下载图片失败'));
          return;
        }
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: resolve,
          fail: reject
        });
      },
      fail: reject
    });
  });
}

module.exports = {
  chooseImages,
  readImageAsDataUrl,
  saveRemoteImage
};
