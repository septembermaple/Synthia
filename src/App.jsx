import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import api from './services/api';

function App({ requireAuth }) {
  const { user, logout, consumePoints, saveGenerationRecord, markPromptAsUsed, getUsedPromptIds, getPromptsList } = useAuth();
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageCount, setImageCount] = useState(1);
  const [keepFace, setKeepFace] = useState(true);
  const [selectedScene, setSelectedScene] = useState('');
  const [activeTab, setActiveTab] = useState('全部');
  const [heroStyleIndex, setHeroStyleIndex] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const fileInputRef = useRef(null);

  const prompts = [
    { name: '专业写真', description: '光线柔和，色彩丰富', category: '复古', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=800&fit=crop' },
    { name: '艺术肖像', description: '黑白风格，高对比度', category: '复古', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=800&fit=crop&sat=-100' },
    { name: '时尚杂志', description: '鲜艳色彩，动感', category: '现代', image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=800&fit=crop' },
    { name: '自然户外', description: '阳光明媚，清新', category: '自然', image: 'https://images.unsplash.com/photo-1519742866993-66d3cfef4bbd?w=600&h=800&fit=crop' },
    { name: '复古胶片', description: '胶片质感，温暖色调', category: '复古', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=800&fit=crop' },
    { name: '赛博朋克', description: '霓虹灯光，未来科技', category: '幻想', image: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&h=800&fit=crop' },
    { name: '简约风格', description: '干净背景，突出人物', category: '现代', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=800&fit=crop' },
    { name: '梦幻风格', description: '柔和光晕，浪漫氛围', category: '幻想', image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=800&fit=crop' },
    { name: '酒吧氛围', description: '昏暗灯光，迷离氛围', category: '现代', image: 'https://images.unsplash.com/photo-1495603889488-42d1d66e5523?w=600&h=800&fit=crop' }
  ];

  const scenes = [
    { name: '末日废土', description: '末日废土场景，荒凉的沙漠，破败的建筑残骸，灰暗的天空，废墟中的生存者氛围，破旧的衣物，风沙弥漫，末日后的世界' },
    { name: '古装仙侠', description: '古装仙侠场景，飘逸的汉服，仙气缭绕，古风建筑，竹林深处，云雾缭绕的山峰，修仙者的意境，水墨画风格背景' },
    { name: '现代都市', description: '现代都市场景，繁华的街道，高楼大厦，霓虹灯闪烁，都市夜景，时尚的现代建筑，车水马龙' },
    { name: '自然森林', description: '自然森林场景，茂密的树林，阳光透过树叶，清新的空气，野花盛开，小溪流淌，自然的宁静' },
    { name: '海边沙滩', description: '海边沙滩场景，金色的沙滩，蔚蓝的大海，椰树摇曳，阳光明媚，海浪轻拍，度假氛围' },
    { name: '雪景冰原', description: '雪景冰原场景，白雪皑皑，冰天雪地，雪花飘落，冰川山脉，寒冷而纯净的氛围' }
  ];

  const tabs = ['全部', '复古', '幻想', '自然', '现代'];

  const heroStyles = [
    { name: '港风复古', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800' },
    { name: '末日废土', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800' },
    { name: '星空梦幻', image: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800' }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroStyleIndex((prev) => (prev + 1) % heroStyles.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const imagePreviews = files.map(file => ({
      id: Date.now() + Math.random(),
      url: URL.createObjectURL(file),
      file
    }));

    setImages(prevImages => [...prevImages, ...imagePreviews]);
  };

  const imageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

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

    const imagePreviews = files.map(file => ({
      id: Date.now() + Math.random(),
      url: URL.createObjectURL(file),
      file
    }));

    setImages(prevImages => [...prevImages, ...imagePreviews]);
  };

  const randomGenerate = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (images.length === 0) {
      setError('请先上传至少一张图片');
      return;
    }

    const promptsList = getPromptsList();
    if (promptsList.length === 0) {
      setError('暂无可用的提示词，请稍后再试');
      return;
    }

    const prompt = promptsList[0];
    const imageCount = Number(prompt.image_count) || 3;
    const pointsRequired = imageCount * 10;

    if (user.points < pointsRequired) {
      setError(`积分不足！生成${imageCount}张图片需要${pointsRequired}积分，当前积分：${user.points}`);
      return;
    }

    const consumeResult = await consumePoints(pointsRequired, `随机生成${imageCount}张图片（ID: ${prompt.id}）`);
    if (!consumeResult.success) {
      setError(consumeResult.message);
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const imageBase64 = await imageToBase64(images[0].file);
      const finalPrompt = `（生成${imageCount}张图片）${prompt.description}`;

      const generatedImages = await api.generateImages(
        finalPrompt,
        imageBase64,
        imageCount,
        (url) => {
          setResults(prev => [...prev, url]);
        }
      );

      if (generatedImages.length > 0) {
        await markPromptAsUsed(prompt.id);
        await saveGenerationRecord(generatedImages, `随机生成（ID: ${prompt.id}）`, '', imageCount);
      } else {
        throw new Error('未获取到生成的图片');
      }
    } catch (err) {
      setError(`生成图片失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateImages = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    if (images.length === 0) {
      setError('请先上传至少一张图片');
      return;
    }

    if (!selectedPrompt) {
      setError('请选择一个风格');
      return;
    }

    const pointsRequired = imageCount * 10;
    if (user.points < pointsRequired) {
      setError(`积分不足！生成${imageCount}张图片需要${pointsRequired}积分，当前积分：${user.points}`);
      return;
    }

    const consumeResult = await consumePoints(pointsRequired, `生成${imageCount}张${selectedPrompt.name}风格图片`);
    if (!consumeResult.success) {
      setError(consumeResult.message);
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const imageBase64 = await imageToBase64(images[0].file);

      let finalPrompt = selectedPrompt.description;
      
      if (keepFace) {
        finalPrompt = '（保持图一人物的五官不变）' + finalPrompt;
      }
      
      if (selectedScene) {
        const sceneData = scenes.find(s => s.name === selectedScene);
        if (sceneData) {
          finalPrompt = finalPrompt + '，' + sceneData.description;
        }
      }

      const generatedImages = await api.generateImages(
        finalPrompt,
        imageBase64,
        imageCount,
        (url) => {
          setResults(prev => [...prev, url]);
        }
      );

      if (generatedImages.length > 0) {
        await saveGenerationRecord(generatedImages, selectedPrompt.name, selectedScene, imageCount);
      } else {
        throw new Error('未获取到生成的图片');
      }
    } catch (err) {
      setError(`生成图片失败: ${err.message}`);
      console.error('Error generating images:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeImage = (id) => {
    setImages(prevImages => prevImages.filter(img => img.id !== id));
  };

  const filteredPrompts = activeTab === '全部' 
    ? prompts 
    : prompts.filter(p => p.category === activeTab);

  return (
    <div className="app-container">
      {/* User Menu */}
      <div className="user-menu">
        {user ? (
          <>
            <div className="user-info">
              <span className="user-phone">{user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</span>
              <span className="user-points-display">💰 {user.points || 0} 积分</span>
            </div>
            <button className="dashboard-btn" onClick={() => navigate('/dashboard')}>用户中心</button>
            <button className="logout-btn" onClick={logout}>退出</button>
          </>
        ) : (
          <button className="login-btn" onClick={() => navigate('/login')}>登录</button>
        )}
      </div>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="auth-overlay">
          <div className="auth-modal">
            <h2>需要登录</h2>
            <p>请先登录后再使用图片生成功能</p>
            <div className="auth-modal-buttons">
              <button className="cancel-btn" onClick={() => setShowAuthModal(false)}>取消</button>
              <button className="confirm-btn" onClick={() => navigate('/login')}>去登录</button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero-section">
        <h1 className="hero-title">上传一张照片，遇见平行世界的你</h1>
        <p className="hero-subtitle">AI驱动的写真生成，让每一张自拍都成为艺术品</p>
        
        <div className="hero-image-container">
          <img 
            src={heroStyles[heroStyleIndex].image} 
            alt={heroStyles[heroStyleIndex].name}
            className="hero-image"
          />
          <div className="hero-overlay"></div>
        </div>

        <div className="scroll-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
          </svg>
        </div>
      </section>

      {/* Gallery Section */}
      <section className="gallery-section">
        <h2 className="section-title">风格画廊</h2>
        
        <div className="tab-bar">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`tab-item ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="gallery-grid">
          {filteredPrompts.map((prompt, index) => (
            <div
              key={index}
              className={`style-card ${selectedPrompt?.name === prompt.name ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setSelectedPrompt(prompt);
              }}
            >
              <img 
                src={prompt.image}
                alt={prompt.name}
                className="style-card-image"
              />
              <div className="style-card-overlay">
                <h3 className="style-card-title">{prompt.name}</h3>
                <p className="style-card-description">{prompt.description}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setSelectedPrompt(prompt);
                  }}
                  style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1.5rem',
                    background: selectedPrompt?.name === prompt.name 
                      ? 'var(--accent-color)' 
                      : 'rgba(255, 255, 255, 0.2)',
                    border: '1px solid var(--accent-color)',
                    borderRadius: '20px',
                    color: 'white',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    pointerEvents: 'auto'
                  }}
                >
                  {selectedPrompt?.name === prompt.name ? '已选择 ✓' : '选择此风格'}
                </button>
              </div>
              {selectedPrompt?.name === prompt.name && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  width: '30px',
                  height: '30px',
                  background: 'var(--accent-color)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '1.2rem',
                  zIndex: 10
                }}>
                  ✓
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Upload Section */}
      <section className="upload-section">
        <h2 className="section-title">开始创作</h2>
        
        {selectedPrompt && (
          <div style={{ 
            maxWidth: '800px', 
            margin: '0 auto 2rem', 
            padding: '1rem 1.5rem',
            background: 'var(--glass-bg)',
            borderRadius: '12px',
            border: '1px solid var(--accent-color)',
            textAlign: 'center'
          }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: '0.5rem' }}>已选择风格：</span>
            <span style={{ color: 'var(--accent-color)', fontWeight: '600' }}>{selectedPrompt.name}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>- {selectedPrompt.description}</span>
          </div>
        )}
        
        <div className="upload-container">
          <div 
            className="upload-box"
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
            
            {loading && (
              <div className="scanning-overlay">
                <div className="scanning-line"></div>
                <p className="scanning-text">正在分析面部特征...</p>
              </div>
            )}

            {images.length === 0 ? (
              <>
                <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p className="upload-text">拖拽或点击上传照片</p>
                <p className="upload-hint">支持 JPG、PNG 格式</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
                {images.map(img => (
                  <div key={img.id} style={{ position: 'relative' }}>
                    <img 
                      src={img.url} 
                      alt="预览" 
                      style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '12px' }}
                    />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(img.id);
                      }}
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        background: '#ff6b6b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Options Panel */}
          <div className="options-panel">
            <div className="option-group">
              <label className="option-label">人脸保持</label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={keepFace}
                  onChange={(e) => setKeepFace(e.target.checked)}
                />
                <span>保持原有人物五官特征</span>
              </label>
            </div>

            <div className="option-group">
              <label className="option-label">选择场景</label>
              <div className="option-grid">
                {scenes.map(scene => (
                  <button
                    key={scene.name}
                    className={`option-chip ${selectedScene === scene.name ? 'selected' : ''}`}
                    onClick={() => setSelectedScene(scene.name === selectedScene ? '' : scene.name)}
                  >
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="option-group">
              <label className="option-label">生成数量</label>
              <div className="option-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(count => (
                  <button
                    key={count}
                    className={`option-chip ${imageCount === count ? 'selected' : ''}`}
                    onClick={() => setImageCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="button-group">
              <button 
                className="generate-button"
                onClick={generateImages}
                disabled={loading}
              >
                {loading ? '生成中...' : '开始生成'}
              </button>
              
              <button 
                className="random-generate-button"
                onClick={randomGenerate}
                disabled={loading}
              >
                🎲 随便来三张
              </button>
            </div>
            
            <div className="expiry-notice">
              ⏰ 生成结果保存24小时，请及时下载
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>
        </div>
      </section>

      {/* Results Section */}
      {results.length > 0 && (
        <section className="results-section">
          <h2 className="section-title">生成结果</h2>
          <div className="expiry-notice results-notice">
            ⏰ 生成结果保存24小时，过期后将自动删除，请及时下载
          </div>
          <div className="results-actions">
            <button 
              className="download-all-results-btn"
              onClick={async () => {
                for (let i = 0; i < results.length; i++) {
                  try {
                    const response = await fetch(results[i]);
                    const blob = await response.blob();
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `synthia_${Date.now()}_${i + 1}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(blobUrl);
                    await new Promise(resolve => setTimeout(resolve, 500));
                  } catch (error) {
                    window.open(results[i], '_blank');
                  }
                }
              }}
            >
              📦 打包下载全部
            </button>
          </div>
          <div className="results-grid">
            {results.map((result, index) => (
              <div key={index} className="result-card">
                <img 
                  src={result} 
                  alt={`生成结果 ${index + 1}`} 
                  className="result-image"
                />
                <button 
                  className="download-result-btn"
                  onClick={async () => {
                    try {
                      const response = await fetch(result);
                      const blob = await response.blob();
                      const blobUrl = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      a.download = `synthia_${Date.now()}_${index + 1}.jpg`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(blobUrl);
                    } catch (error) {
                      window.open(result, '_blank');
                    }
                  }}
                >
                  下载图片
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
