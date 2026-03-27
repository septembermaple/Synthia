import React, { useState, useRef } from 'react';

function App() {
  const [images, setImages] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageCount, setImageCount] = useState(1);
  const fileInputRef = useRef(null);

  // 预置的描述词列表
  const prompts = [
    '专业写真，光线柔和，色彩丰富',
    '艺术肖像，黑白风格，高对比度',
    '时尚杂志风格，鲜艳色彩，动感',
    '自然户外写真，阳光明媚，清新',
    '复古风格，胶片质感，温暖色调',
    '科技感未来风格，霓虹灯光，赛博朋克',
    '简约风格，干净背景，突出人物',
    '梦幻风格，柔和光晕，浪漫氛围',
    '酒吧氛围，清瘦精致的脸形，白皙的皮肤，留着深棕色韩版微分碎盖，自然且蓬松。左耳戴着一枚简约银质耳钉。眼神慵懒淡漠，略带疏离感，表情平静冷峻，没有明显笑容，传递出一种漫不经心的氛围感。以正脸且低角度自拍视角呈现，人物整张脸及脖子都是红的，貌似喝醉酒红脸一般，右手自然地握着一只装有半杯金黄色酒液的透明威士忌杯，手臂放松地搭在身侧，整体姿态随性放松。身穿一件宽松的黑色机能风连帽外套，光线打到衣服正面大片范围，面料呈现哑光质感，版型简约利落。背景是昏暗的Livehouse或小型酒吧场景，左后方有两三个红色白色舞台灯，空气中弥漫着细腻的烟雾，光线在烟雾中形成明显的光束效果。远处可见深色的天花板结构与灰色皮质沙发，整体环境营造出一种迷离又充满氛围感的夜场氛围。写实人像风格，高清晰度，细腻的皮肤纹理与衣物质感，自然的光影层次，冷调与暖调光线对比强烈，颗粒感轻微，突出人物主体与环境的沉浸感。比例3:4'
  ];

  // 处理图片上传
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const imagePreviews = files.map(file => {
      return {
        id: Date.now() + Math.random(),
        url: URL.createObjectURL(file),
        file
      };
    });

    setImages(prevImages => [...prevImages, ...imagePreviews]);
  };

  // 将图片转换为base64
  const imageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 处理拖放
  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const imagePreviews = files.map(file => {
      return {
        id: Date.now() + Math.random(),
        url: URL.createObjectURL(file),
        file
      };
    });

    setImages(prevImages => [...prevImages, ...imagePreviews]);
  };

  // 处理描述词选择
  const handlePromptSelect = (prompt) => {
    setSelectedPrompt(prompt);
  };

  // 调用豆包API生成图片
  const generateImages = async () => {
    if (images.length === 0) {
      setError('请先上传至少一张图片');
      return;
    }

    if (!selectedPrompt) {
      setError('请选择一个描述词');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      // 豆包API配置
      const API_KEY = import.meta.env.VITE_DOUBAO_API_KEY; // 从环境变量获取API密钥
      const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

      if (!API_KEY) {
        throw new Error('请在.env文件中设置VITE_DOUBAO_API_KEY');
      }

      // 将图片转换为base64
      const imageBase64 = await imageToBase64(images[0].file);
      console.log('图片转换为base64成功');

      // 准备请求数据
      const requestData = {
        model: 'doubao-seedream-4-0-250828',
        prompt: selectedPrompt,
        image: [imageBase64],
        sequential_image_generation: 'auto',
        sequential_image_generation_options: {
          max_images: imageCount
        },
        response_format: 'url',
        size: '2K',
        stream: true,
        watermark: true
      };

      console.log('请求数据:', requestData);

      // 发送API请求
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(requestData)
      });

      console.log('API响应状态:', response.status);
      console.log('API响应头:', Object.fromEntries(response.headers));

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let responseText = '';
      let generatedImages = [];
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        responseText += chunk;
        console.log('收到响应块:', chunk);
        
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          
          if (trimmedLine.startsWith('event:')) {
            currentEvent = trimmedLine.substring(6).trim();
            console.log('事件类型:', currentEvent);
          }
          
          if (trimmedLine.startsWith('data:')) {
            const dataStr = trimmedLine.substring(5).trim();
            
            if (dataStr === '[DONE]') {
              console.log('流结束');
              break;
            }
            
            if (dataStr && currentEvent === 'image_generation.partial_succeeded') {
              try {
                const data = JSON.parse(dataStr);
                console.log('解析到图片数据:', data);
                
                if (data && data.url) {
                  generatedImages.push(data.url);
                  console.log('添加图片URL:', data.url);
                }
              } catch (e) {
                console.error('解析数据失败:', e);
                console.error('数据内容:', dataStr);
              }
            }
          }
        }
      }

      console.log('完整响应内容:', responseText);
      console.log('收集到的图片URL:', generatedImages);

      if (generatedImages.length > 0) {
        setResults(generatedImages);
      } else {
        throw new Error(`API响应格式错误\n完整响应: ${responseText}`);
      }
    } catch (err) {
      setError(`生成图片失败: ${err.message}`);
      console.error('Error generating images:', err);
    } finally {
      setLoading(false);
    }
  };

  // 移除上传的图片
  const removeImage = (id) => {
    setImages(prevImages => prevImages.filter(img => img.id !== id));
  };

  return (
    <div className="container">
      <h1>Synthia - 自拍生成写真</h1>
      
      {/* 图片上传区域 */}
      <div 
        className="upload-section"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
        <h3>点击或拖拽上传图片</h3>
        <p>支持上传一张或多张自拍正脸照片</p>
        
        {/* 图片预览 */}
        {images.length > 0 && (
          <div className="image-preview">
            {images.map(img => (
              <div key={img.id} style={{ position: 'relative' }}>
                <img 
                  src={img.url} 
                  alt="预览" 
                  className="preview-image"
                />
                <button 
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    background: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(img.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 描述词选择区域 */}
      <div className="prompt-section">
        <h3>选择描述词</h3>
        <div className="prompt-list">
          {prompts.map((prompt, index) => (
            <div
              key={index}
              className={`prompt-tag ${selectedPrompt === prompt ? 'selected' : ''}`}
              onClick={() => handlePromptSelect(prompt)}
            >
              {prompt}
            </div>
          ))}
        </div>
      </div>

      {/* 图片数量选择 */}
      <div className="image-count-section">
        <h3>生成图片数量</h3>
        <div className="image-count-selector">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(count => (
            <button
              key={count}
              className={`count-button ${imageCount === count ? 'selected' : ''}`}
              onClick={() => setImageCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {/* 生成按钮 */}
      <button 
        className="generate-button"
        onClick={generateImages}
        disabled={loading}
      >
        {loading ? '生成中...' : '生成写真'}
      </button>

      {/* 错误提示 */}
      {error && <div className="error">{error}</div>}

      {/* 加载状态 */}
      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>正在生成写真，请稍候...</p>
        </div>
      )}

      {/* 结果展示区域 */}
      {results.length > 0 && (
        <div className="result-section">
          <h3>生成结果</h3>
          <div className="result-grid">
            {results.map((result, index) => (
              <img 
                key={index} 
                src={result} 
                alt={`生成结果 ${index + 1}`} 
                className="result-image"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;