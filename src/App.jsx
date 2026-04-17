import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import api from './services/api';

function App({ requireAuth }) {
  const { user, logout, consumePoints, saveGenerationRecord } = useAuth();
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageCount, setImageCount] = useState(1);
  const [keepFace, setKeepFace] = useState(true);
  const [activeTab, setActiveTab] = useState('全部');
  const [heroStyleIndex, setHeroStyleIndex] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef(null);

  const [basicParams, setBasicParams] = useState({
    scene: '',
    visualStyle: ''
  });

  const [advancedParams, setAdvancedParams] = useState({
    composition: '',
    lighting: '',
    mood: ''
  });

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

  const sceneThemes = [
    { name: '森林秘境', description: '森林秘境场景，茂密的树林，阳光透过树叶洒下斑驳光影，清新的空气，野花盛开，小溪流淌，自然的宁静与神秘' },
    { name: '室内咖啡厅', description: '室内咖啡厅场景，温馨的灯光，木质家具，咖啡香气，窗边的阳光，舒适的沙发，文艺氛围' },
    { name: '复古街道', description: '复古街道场景，老式建筑，石板路，街边小店，复古招牌，怀旧氛围，时光倒流的感觉' },
    { name: '高级影棚', description: '高级影棚场景，专业灯光设备，纯色背景，反光板，摄影器材，专业拍摄环境' },
    { name: '海滨沙滩', description: '海滨沙滩场景，金色的沙滩，蔚蓝的大海，椰树摇曳，阳光明媚，海浪轻拍，度假氛围' },
    { name: '雪地公园', description: '雪地公园场景，白雪皑皑，冰天雪地，雪花飘落，冰川山脉，寒冷而纯净的氛围' },
    { name: '赛博霓虹街', description: '赛博霓虹街场景，霓虹灯闪烁，未来科技感，高楼大厦，电子屏幕，赛博朋克风格' },
    { name: '职场办公室', description: '职场办公室场景，现代办公环境，落地窗，城市景观，专业商务氛围' },
    { name: '午后花园', description: '午后花园场景，阳光明媚，鲜花盛开，蝴蝶飞舞，温暖舒适的午后时光' },
    { name: '欧式古堡', description: '欧式古堡场景，古老的城堡建筑，石墙，烛光，神秘而优雅的氛围' }
  ];

  const visualStyles = [
    { name: '法式复古', description: '法式复古风格，优雅浪漫，柔和的色调，复古的质感' },
    { name: '日系小清新', description: '日系小清新风格，明亮通透，淡雅的色彩，青春活力' },
    { name: '港风胶片', description: '港风胶片风格，浓郁的色彩，胶片质感，复古怀旧' },
    { name: '欧美时尚', description: '欧美时尚风格，大胆的色彩对比，时尚前卫，高级感' },
    { name: '极简高级感', description: '极简高级感风格，简洁的构图，干净的背景，突出主体' },
    { name: '黑白电影', description: '黑白电影风格，高对比度，经典黑白，艺术感强' },
    { name: '油画质感', description: '油画质感风格，丰富的层次，艺术绘画感，古典美' },
    { name: '莫兰迪艺术', description: '莫兰迪艺术风格，低饱和度，柔和的色彩，高级灰调' },
    { name: '韩系柔光', description: '韩系柔光风格，柔和的光线，温暖的色调，清新自然' }
  ];

  const compositions = [
    { name: '特写', description: '特写构图，突出五官细节，面部表情清晰可见' },
    { name: '半身照', description: '半身照构图，突出动作与情绪，展示上半身姿态' },
    { name: '全身照', description: '全身照构图，展示服饰与环境关系，完整的人物形象' },
    { name: '俯拍', description: '俯拍构图，显得娇小、具有无辜感，独特的视角' },
    { name: '仰拍', description: '仰拍构图，显得高大、气场强大，震撼的视觉效果' }
  ];

  const lightings = [
    { name: '丁达尔效应', description: '丁达尔效应光影，林间散光、仙气，梦幻的光束效果' },
    { name: '伦勃朗光', description: '伦勃朗光，45度侧光、高级质感，经典的肖像布光' },
    { name: '黄金小时', description: '黄金小时光影，日落暖光、柔和，温暖浪漫的氛围' },
    { name: '百叶窗投影', description: '百叶窗投影光影，条纹阴影、故事感，独特的光影效果' },
    { name: '霓虹彩光', description: '霓虹彩光，多色对比、科幻感，未来感十足' },
    { name: '侧逆光', description: '侧逆光，勾勒头发和身体轮廓线，立体感强' }
  ];

  const moods = [
    { name: '自然感', description: '自然感情绪，轻松自在，真实不做作' },
    { name: '冷酷感', description: '冷酷感情绪，高冷疏离，神秘感' },
    { name: '忧郁感', description: '忧郁感情绪，深沉内敛，情感丰富' },
    { name: '互动感', description: '互动感情绪，活泼生动，与镜头互动' },
    { name: '沉思感', description: '沉思感情绪，安静思考，深邃的眼神' }
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

  const buildPrompt = () => {
    let promptParts = [];

    if (keepFace) {
      promptParts.push('保持图一人物的五官不变');
    }

    if (basicParams.scene) {
      const scene = sceneThemes.find(s => s.name === basicParams.scene);
      if (scene) promptParts.push(scene.description);
    }

    if (basicParams.visualStyle) {
      const style = visualStyles.find(s => s.name === basicParams.visualStyle);
      if (style) promptParts.push(style.description);
    }

    if (advancedParams.composition) {
      const comp = compositions.find(c => c.name === advancedParams.composition);
      if (comp) promptParts.push(comp.description);
    }

    if (advancedParams.lighting) {
      const light = lightings.find(l => l.name === advancedParams.lighting);
      if (light) promptParts.push(light.description);
    }

    if (advancedParams.mood) {
      const mood = moods.find(m => m.name === advancedParams.mood);
      if (mood) promptParts.push(mood.description);
    }

    return promptParts.join('，');
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

    const pointsRequired = imageCount * 10;
    if (user.points < pointsRequired) {
      setError(`积分不足！生成${imageCount}张图片需要${pointsRequired}积分，当前积分：${user.points}`);
      return;
    }

    const consumeResult = await consumePoints(pointsRequired, `生成${imageCount}张图片`);
    if (!consumeResult.success) {
      setError(consumeResult.message);
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const imageBase64 = await imageToBase64(images[0].file);
      const finalPrompt = buildPrompt();

      if (!finalPrompt) {
        setError('请至少选择一个参数选项');
        setLoading(false);
        return;
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
        await saveGenerationRecord(generatedImages, finalPrompt.substring(0, 100), '', imageCount);
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
        <h2 className="section-title">画廊</h2>
        
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
              className="style-card"
            >
              <img 
                src={prompt.image}
                alt={prompt.name}
                className="style-card-image"
              />
              <div className="style-card-overlay">
                <h3 className="style-card-title">{prompt.name}</h3>
                <p className="style-card-description">{prompt.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upload Section */}
      <section className="upload-section">
        <h2 className="section-title">开始创作</h2>
        
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
            {/* 人脸保持 */}
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

            {/* 基础参数 */}
            <div className="params-section">
              <h3 className="params-section-title">基础参数</h3>
              
              <div className="option-group">
                <label className="option-label">场景主题</label>
                <div className="option-grid">
                  {sceneThemes.map(scene => (
                    <button
                      key={scene.name}
                      className={`option-chip ${basicParams.scene === scene.name ? 'selected' : ''}`}
                      onClick={() => setBasicParams(prev => ({ ...prev, scene: prev.scene === scene.name ? '' : scene.name }))}
                      title={scene.description}
                    >
                      {scene.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="option-group">
                <label className="option-label">视觉风格</label>
                <div className="option-grid">
                  {visualStyles.map(style => (
                    <button
                      key={style.name}
                      className={`option-chip ${basicParams.visualStyle === style.name ? 'selected' : ''}`}
                      onClick={() => setBasicParams(prev => ({ ...prev, visualStyle: prev.visualStyle === style.name ? '' : style.name }))}
                      title={style.description}
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 高级参数 */}
            <div className="params-section">
              <div 
                className="params-section-header"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <h3 className="params-section-title">高级参数</h3>
                <span className={`expand-icon ${showAdvanced ? 'expanded' : ''}`}>▼</span>
              </div>
              
              {showAdvanced && (
                <>
                  <div className="option-group">
                    <label className="option-label">构图</label>
                    <div className="option-grid">
                      {compositions.map(comp => (
                        <button
                          key={comp.name}
                          className={`option-chip ${advancedParams.composition === comp.name ? 'selected' : ''}`}
                          onClick={() => setAdvancedParams(prev => ({ ...prev, composition: prev.composition === comp.name ? '' : comp.name }))}
                          title={comp.description}
                        >
                          {comp.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="option-group">
                    <label className="option-label">光影</label>
                    <div className="option-grid">
                      {lightings.map(light => (
                        <button
                          key={light.name}
                          className={`option-chip ${advancedParams.lighting === light.name ? 'selected' : ''}`}
                          onClick={() => setAdvancedParams(prev => ({ ...prev, lighting: prev.lighting === light.name ? '' : light.name }))}
                          title={light.description}
                        >
                          {light.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="option-group">
                    <label className="option-label">情绪</label>
                    <div className="option-grid">
                      {moods.map(mood => (
                        <button
                          key={mood.name}
                          className={`option-chip ${advancedParams.mood === mood.name ? 'selected' : ''}`}
                          onClick={() => setAdvancedParams(prev => ({ ...prev, mood: prev.mood === mood.name ? '' : mood.name }))}
                          title={mood.description}
                        >
                          {mood.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 生成数量 */}
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
