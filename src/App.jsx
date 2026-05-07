import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import api from './services/api';
import StatsBar from './components/StatsBar';

const sceneCategories = {
  '自然与旷野': [
    { name: '森林秘境', lighting: '丁达尔效应', style: '日系柔光' },
    { name: '海滨沙滩', lighting: '黄金小时', style: '欧美时尚' },
    { name: '雪地公园', lighting: '柔和自然光', style: '韩系柔光' },
    { name: '午后花园', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '荒漠孤岭', lighting: '强对比硬光', style: '欧美高级感' },
    { name: '热带雨林', lighting: '侧逆光', style: '油画质感' },
    { name: '薰衣草花海', lighting: '黄金小时', style: '唯美小清新' },
    { name: '悬崖边境', lighting: '强对比硬光', style: '极简高级感' },
    { name: '极光之夜', lighting: '霓虹氛围灯', style: '艺术质感' },
    { name: '向日葵田', lighting: '黄金小时', style: '唯美小清新' },
    { name: '芦苇荡', lighting: '侧逆光', style: '港风胶片' },
    { name: '溶洞奇观', lighting: '侧逆光', style: '艺术质感' },
    { name: '红枫林', lighting: '黄金小时', style: '电影感' },
    { name: '瀑布溪流', lighting: '柔和自然光', style: '日系柔光' }
  ],
  '都市与现代': [
    { name: '职场办公室', lighting: '柔和自然光', style: '极简高级感' },
    { name: '天台顶层', lighting: '黄金小时', style: '欧美时尚' },
    { name: '地下通道', lighting: '霓虹氛围灯', style: '港风胶片' },
    { name: '私人停机坪', lighting: '强对比硬光', style: '欧美高级感' },
    { name: '极简美术馆', lighting: '柔和自然光', style: '极简高级感' },
    { name: '高空无边泳池', lighting: '黄金小时', style: '欧美时尚' },
    { name: '中央车站', lighting: '柔和自然光', style: '黑白纪实' },
    { name: '网球场/体育场', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '现代图书馆', lighting: '柔和自然光', style: '韩系柔光' },
    { name: '高端买手店', lighting: '伦勃朗光', style: '欧美高级感' },
    { name: '地铁车厢', lighting: '霓虹氛围灯', style: '港风胶片' }
  ],
  '怀旧与复古': [
    { name: '复古街道', lighting: '侧逆光', style: '港风胶片' },
    { name: '室内咖啡厅', lighting: '百叶窗投影', style: '法式复古' },
    { name: '老式理发店', lighting: '暖色霓虹灯', style: '港风胶片' },
    { name: '古着杂货铺', lighting: '柔和自然光', style: '港风胶片' },
    { name: '民国照相馆', lighting: '柔和自然光', style: '艺术质感' },
    { name: '公路加油站', lighting: '强对比硬光', style: '欧美时尚' },
    { name: '废弃工厂', lighting: '强对比硬光', style: '黑白纪实' },
    { name: '老式剧院', lighting: '伦勃朗光', style: '电影感' },
    { name: '黑胶唱片店', lighting: '百叶窗投影', style: '港风胶片' },
    { name: '90年代校园', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '老街小巷', lighting: '侧逆光', style: '港风胶片' },
    { name: '绿皮火车', lighting: '百叶窗投影', style: '法式复古' }
  ],
  '幻想与艺术': [
    { name: '高级影棚', lighting: '伦勃朗光', style: '时尚杂志风' },
    { name: '赛博霓虹街', lighting: '霓虹氛围灯', style: '艺术质感' },
    { name: '欧式古堡', lighting: '伦勃朗光', style: '油画质感' },
    { name: '云端之上', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '水下秘境', lighting: '侧逆光', style: '艺术质感' },
    { name: '废土末世', lighting: '强对比硬光', style: '电影感' },
    { name: '巴洛克大厅', lighting: '伦勃朗光', style: '油画质感' },
    { name: '日式庭院', lighting: '侧逆光', style: '日系柔光' },
    { name: '魔法图书馆', lighting: '丁达尔效应', style: '艺术质感' },
    { name: '外星基地', lighting: '霓虹氛围灯', style: '极简高级感' },
    { name: '中式竹林', lighting: '丁达尔效应', style: '黑白纪实' },
    { name: '糖果色乐园', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '维多利亚温室', lighting: '丁达尔效应', style: '唯美小清新' }
  ],
  '生活日常': [
    { name: '清晨卧室', lighting: '柔和自然光', style: '韩系柔光' },
    { name: '私家车内', lighting: '侧逆光', style: '港风胶片' },
    { name: '洗衣房', lighting: '柔和自然光', style: '日系柔光' },
    { name: '厨房烟火', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '屋顶足球场', lighting: '黄金小时', style: '欧美时尚' },
    { name: '街角花店', lighting: '柔和自然光', style: '唯美小清新' },
    { name: '篮球公园', lighting: '强对比硬光', style: '欧美高级感' },
    { name: '艺术画室', lighting: '侧逆光', style: '油画质感' },
    { name: '拳击馆', lighting: '伦勃朗光', style: '黑白纪实' },
    { name: '深夜便利店', lighting: '霓虹氛围灯', style: '港风胶片' }
  ]
};

const visualStyles = [
  '法式复古', '日系小清新', '港风胶片', '欧美时尚', '极简高级感', 
  '黑白电影', '油画质感', '莫兰迪艺术', '韩系柔光', '唯美小清新',
  '欧美高级感', '艺术质感', '电影感', '时尚杂志风', '黑白纪实'
];

const compositions = ['特写', '半身照', '全身照', '俯拍', '仰拍'];

const lightings = [
  '丁达尔效应', '伦勃朗光', '黄金小时', '百叶窗投影', '霓虹彩光', 
  '侧逆光', '柔和自然光', '强对比硬光', '霓虹氛围灯', '暖色霓虹灯'
];

const moods = ['自然感', '冷酷感', '忧郁感', '互动感', '沉思感'];

function App({ requireAuth }) {
  const { user, isAdmin, logout, saveGenerationRecord, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [images, setImages] = useState([]);
  const [primaryImageId, setPrimaryImageId] = useState(null);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageCount, setImageCount] = useState(1);
  const [keepFace, setKeepFace] = useState(true);
  const abortControllerRef = useRef(null);
  const [activeTab, setActiveTab] = useState('全部');
  const [heroStyleIndex, setHeroStyleIndex] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef(null);

  const [basicParams, setBasicParams] = useState({
    sceneCategory: '',
    scene: '',
    visualStyle: '',
    gender: '女',
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

  const MAX_UPLOAD_FILES = 5;
  const MAX_FILE_SIZE = 12 * 1024 * 1024;
  const MAX_LONG_EDGE = 1280;
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const acceptFiles = (files) => {
    setError('');
    const valid = [];
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`不支持的图片格式：${file.name}（仅支持 JPG/PNG/WEBP）`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`图片过大：${file.name}（最大 ${MAX_FILE_SIZE / (1024 * 1024)}MB）`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;

    setImages(prev => {
      const remain = MAX_UPLOAD_FILES - prev.length;
      if (remain <= 0) {
        setError(`最多只能上传 ${MAX_UPLOAD_FILES} 张图片`);
        return prev;
      }
      const next = valid.slice(0, remain).map(file => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        url: URL.createObjectURL(file),
        file,
      }));
      const merged = [...prev, ...next];
      if (!primaryImageId && merged.length > 0) {
        setPrimaryImageId(merged[0].id);
      }
      return merged;
    });
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    acceptFiles(files);
    e.target.value = '';
  };

  const compressImageToDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.onloadend = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解析失败'));
        img.onload = () => {
          let { width, height } = img;
          const longEdge = Math.max(width, height);
          if (longEdge > MAX_LONG_EDGE) {
            const ratio = MAX_LONG_EDGE / longEdge;
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          resolve(canvas.toDataURL(mime, 0.9));
        };
        img.src = reader.result;
      };
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
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    acceptFiles(files);
  };

  const generatePromptWithLLM = async (scene, style, gender) => {
    try {
      const result = await api.generatePrompt(scene, style, gender);

      if (result.success && result.prompt) {
        return result.prompt;
      }
      throw new Error(result.error || 'LLM生成失败');
    } catch (err) {
      console.error('LLM调用失败:', err);
      throw err;
    }
  };

  const generateImages = async () => {
    if (loading) return;

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (images.length === 0) {
      setError('请先上传至少一张图片');
      return;
    }

    if (!basicParams.scene) {
      setError('请选择场景主题');
      return;
    }

    const pointsRequired = imageCount * 10;
    if (user.points < pointsRequired) {
      setError(`积分不足！生成${imageCount}张图片需要${pointsRequired}积分，当前积分：${user.points}`);
      return;
    }

    const primary = images.find(i => i.id === primaryImageId) || images[0];

    setLoading(true);
    setError('');
    setResults([]);
    setProgress({ current: 0, total: imageCount });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const imageBase64 = await compressImageToDataUrl(primary.file);

      const categoryScenes = basicParams.sceneCategory ? sceneCategories[basicParams.sceneCategory] : [];
      const sceneData = categoryScenes.find(s => s.name === basicParams.scene);
      const style = basicParams.visualStyle || (sceneData ? sceneData.style : '');
      let finalPrompt = await generatePromptWithLLM(basicParams.scene, style, basicParams.gender);

      // 固定规则：参考图人物优先；勾选「人脸保持」时额外锁住五官造型
      const ruleImagePrecedence =
        '（人物以上传参考图为准；若文案在性别、年龄段、人种、体态、发型或服饰等与画面人物不一致，以图片为准。）';
      const ruleKeepFace = '（保持图中人物的五官不变）';
      if (keepFace) {
        finalPrompt = ruleKeepFace + ruleImagePrecedence + finalPrompt;
      } else {
        finalPrompt = ruleImagePrecedence + finalPrompt;
      }

      const generatedImages = await api.generateImages(
        finalPrompt,
        imageBase64,
        imageCount,
        (url) => {
          setResults(prev => {
            const next = [...prev, url];
            setProgress({ current: next.length, total: imageCount });
            return next;
          });
        },
        controller.signal,
      );

      if (generatedImages.length > 0) {
        await refreshUser();
        await saveGenerationRecord(
          generatedImages,
          finalPrompt.substring(0, 100),
          basicParams.scene,
          imageCount,
          finalPrompt,
        );
      } else {
        throw new Error('未获取到生成的图片');
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setError('已取消生成');
      } else {
        setError(`生成图片失败: ${err.message}`);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setProgress(null);
    }
  };

  const cancelGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const removeImage = (id) => {
    setImages(prevImages => {
      const target = prevImages.find(img => img.id === id);
      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }
      const next = prevImages.filter(img => img.id !== id);
      if (primaryImageId === id) {
        setPrimaryImageId(next[0]?.id || null);
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      images.forEach(img => {
        if (img.url) URL.revokeObjectURL(img.url);
      });
    };
  }, []);

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
            {isAdmin && (
              <button className="dashboard-btn" onClick={() => navigate('/admin')}>管理后台</button>
            )}
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

      {/* Stats Bar */}
      <StatsBar />

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
        
        <div className="upload-container-new">
          {/* Left: Upload Area */}
          <div className="upload-left">
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
                  <p className="upload-hint">支持 JPG、PNG、WEBP，最多 {MAX_UPLOAD_FILES} 张，单张 ≤ {MAX_FILE_SIZE / (1024 * 1024)}MB</p>
                </>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
                  {images.map(img => {
                    const isPrimary = img.id === primaryImageId;
                    return (
                      <div
                        key={img.id}
                        style={{ position: 'relative', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPrimaryImageId(img.id);
                        }}
                      >
                        <img
                          src={img.url}
                          alt="预览"
                          style={{
                            width: '150px',
                            height: '150px',
                            objectFit: 'cover',
                            borderRadius: '12px',
                            outline: isPrimary ? '3px solid #6c5ce7' : 'none',
                            boxShadow: isPrimary ? '0 0 0 2px rgba(108,92,231,0.3)' : 'none',
                          }}
                        />
                        {isPrimary && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '6px',
                              left: '6px',
                              background: 'rgba(108,92,231,0.95)',
                              color: 'white',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '999px',
                            }}
                          >
                            主图
                          </div>
                        )}
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
                            fontSize: '14px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {images.length > 1 && (
                <p className="upload-hint" style={{ marginTop: '0.75rem', fontSize: '12px', opacity: 0.7 }}>
                  点击任意图片可设为主图（仅主图会被用于生成）
                </p>
              )}
            </div>
          </div>

          {/* Right: Settings Panel */}
          <div className="upload-right">
            <div className="settings-panel">
              {/* Tabs */}
              <div className="settings-tabs">
                <button 
                  className={`settings-tab ${!showAdvanced ? 'active' : ''}`}
                  onClick={() => setShowAdvanced(false)}
                >
                  基础设置
                </button>
                <button 
                  className={`settings-tab ${showAdvanced ? 'active' : ''}`}
                  onClick={() => setShowAdvanced(true)}
                >
                  高级设置
                </button>
              </div>

              {/* 基础设置内容 */}
              {!showAdvanced && (
                <div className="settings-content">
                  <div className="setting-item">
                    <label className="setting-label">场景主题</label>
                    <select
                      className="setting-select"
                      value={basicParams.sceneCategory && basicParams.scene ? `${basicParams.sceneCategory}|||${basicParams.scene}` : ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setBasicParams(prev => ({ 
                            ...prev, 
                            sceneCategory: '',
                            scene: '',
                            visualStyle: '',
                          }));
                          return;
                        }
                        const [category, sceneName] = e.target.value.split('|||');
                        const sceneData = sceneCategories[category]?.find(s => s.name === sceneName);
                        setBasicParams(prev => ({ 
                          ...prev, 
                          sceneCategory: category,
                          scene: sceneName,
                          visualStyle: sceneData ? sceneData.style : prev.visualStyle
                        }));
                      }}
                    >
                      <option value="">请选择场景</option>
                      {Object.entries(sceneCategories).map(([category, scenes]) => (
                        <optgroup key={category} label={category}>
                          {scenes.map(scene => (
                            <option key={scene.name} value={`${category}|||${scene.name}`}>
                              {scene.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="setting-item">
                    <label className="setting-label">性别</label>
                    <select
                      className="setting-select"
                      value={basicParams.gender}
                      onChange={(e) => setBasicParams(prev => ({ ...prev, gender: e.target.value }))}
                    >
                      <option value="女">女</option>
                      <option value="男">男</option>
                    </select>
                  </div>

                  <div className="setting-item">
                    <label className="setting-label">生成数量</label>
                    <select
                      className="setting-select"
                      value={imageCount}
                      onChange={(e) => setImageCount(Number(e.target.value))}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(count => (
                        <option key={count} value={count}>{count} 张</option>
                      ))}
                    </select>
                  </div>

                  <div className="setting-item">
                    <label className="setting-label">人脸保持</label>
                    <label className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={keepFace}
                        onChange={(e) => setKeepFace(e.target.checked)}
                      />
                      <span>保持原有人物五官特征</span>
                    </label>
                  </div>

                </div>
              )}

              {/* 高级设置内容 */}
              {showAdvanced && (
                <div className="settings-content">
                  <div className="setting-item">
                    <label className="setting-label">视觉风格</label>
                    <select
                      className="setting-select"
                      value={basicParams.visualStyle}
                      onChange={(e) => setBasicParams(prev => ({ ...prev, visualStyle: e.target.value }))}
                    >
                      <option value="">请选择风格</option>
                      {visualStyles.map(style => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </div>

                  <div className="setting-item">
                    <label className="setting-label">构图</label>
                    <select
                      className="setting-select"
                      value={advancedParams.composition}
                      onChange={(e) => setAdvancedParams(prev => ({ ...prev, composition: e.target.value }))}
                    >
                      <option value="">请选择构图</option>
                      {compositions.map(comp => (
                        <option key={comp} value={comp}>{comp}</option>
                      ))}
                    </select>
                  </div>

                  <div className="setting-item">
                    <label className="setting-label">光影</label>
                    <select
                      className="setting-select"
                      value={advancedParams.lighting}
                      onChange={(e) => setAdvancedParams(prev => ({ ...prev, lighting: e.target.value }))}
                    >
                      <option value="">请选择光影</option>
                      {lightings.map(light => (
                        <option key={light} value={light}>{light}</option>
                      ))}
                    </select>
                  </div>

                  <div className="setting-item">
                    <label className="setting-label">情绪</label>
                    <select
                      className="setting-select"
                      value={advancedParams.mood}
                      onChange={(e) => setAdvancedParams(prev => ({ ...prev, mood: e.target.value }))}
                    >
                      <option value="">请选择情绪</option>
                      {moods.map(mood => (
                        <option key={mood} value={mood}>{mood}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <button
                className="generate-button"
                onClick={generateImages}
                disabled={loading}
              >
                {loading
                  ? (progress ? `生成中 ${progress.current}/${progress.total}...` : '生成中...')
                  : '开始生成'}
              </button>
              {loading && (
                <button
                  className="cancel-generate-btn"
                  type="button"
                  onClick={cancelGeneration}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'inherit',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  取消生成
                </button>
              )}

              <div className="expiry-notice">
                ⏰ 生成结果保存24小时，请及时下载
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>
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
