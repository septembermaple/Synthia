import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import api from './services/api';
import StatsBar from './components/StatsBar';
import CustomSelect from './components/CustomSelect';

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
  const { user, isAdmin, logout, refreshUser } = useAuth();
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
    imageSize: '2K',
  });
  /** 由后端根据当前默认图生模型返回；null 表示加载中 */
  const [imageOutputSizeOptions, setImageOutputSizeOptions] = useState(null);

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

  useEffect(() => {
    let cancelled = false;
    api.getImageOutputSizes()
      .then((data) => {
        if (cancelled) return;
        const sizes = Array.isArray(data?.sizes) ? data.sizes : [];
        const defaultSize =
          typeof data?.defaultSize === 'string' && data.defaultSize.trim()
            ? data.defaultSize.trim()
            : (sizes[0]?.value ?? '2K');
        if (sizes.length === 0) {
          const fb = ['2K', '3K', '4K'].map((value) => ({ value, label: value }));
          setImageOutputSizeOptions(fb);
          setBasicParams((prev) =>
            fb.some((o) => o.value === prev.imageSize) ? prev : { ...prev, imageSize: '2K' }
          );
          return;
        }
        setImageOutputSizeOptions(sizes);
        setBasicParams((prev) => {
          if (sizes.some((s) => s.value === prev.imageSize)) return prev;
          return { ...prev, imageSize: defaultSize };
        });
      })
      .catch(() => {
        if (cancelled) return;
        const fb = [
          { value: '2K', label: '2K · 推荐' },
          { value: '3K', label: '3K · 更清晰' },
          { value: '4K', label: '4K · 超高细节' },
        ];
        setImageOutputSizeOptions(fb);
        setBasicParams((prev) =>
          fb.some((o) => o.value === prev.imageSize) ? prev : { ...prev, imageSize: '2K' }
        );
      });
    return () => { cancelled = true; };
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

      const portraitResult = await api.generatePortrait(
        {
          scene: basicParams.scene,
          style,
          keepFace,
          imageBase64,
          imageCount,
          size: basicParams.imageSize,
        },
        controller.signal,
      );

      const generatedImages = portraitResult.urls || [];

      if (generatedImages.length > 0) {
        setResults(generatedImages);
        setProgress({ current: generatedImages.length, total: imageCount });
        await refreshUser();
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
        <div className="upload-section-inner">
          <div className="upload-section-header">
            <h2 className="upload-section-title">开始创作</h2>
            <p className="upload-section-desc">上传照片，选择风格，AI 为你生成专属写真</p>
          </div>

          <div className="upload-layout">
            {/* Left: Upload Area */}
            <div className="upload-area-wrap">
              <div
                className="upload-dropzone"
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
                  <div className="upload-empty">
                    <div className="upload-empty-icon">
                      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M24 32V16m0 0l-7 7m7-7l7 7"/>
                        <path d="M6 32v6a4 4 0 004 4h28a4 4 0 004-4v-6"/>
                      </svg>
                    </div>
                    <p className="upload-empty-text">拖拽或点击上传照片</p>
                    <p className="upload-empty-hint">支持 JPG / PNG / WEBP，最多 {MAX_UPLOAD_FILES} 张，单张 ≤ {MAX_FILE_SIZE / (1024 * 1024)}MB</p>
                  </div>
                ) : (
                  <div className="upload-preview-grid">
                    {images.map(img => {
                      const isPrimary = img.id === primaryImageId;
                      return (
                        <div
                          key={img.id}
                          className={`preview-thumb ${isPrimary ? 'preview-thumb--primary' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimaryImageId(img.id);
                          }}
                        >
                          <img src={img.url} alt="预览" className="preview-thumb-img" />
                          {isPrimary && <span className="preview-thumb-badge">主图</span>}
                          <button
                            className="preview-thumb-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(img.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    {images.length < MAX_UPLOAD_FILES && (
                      <div className="preview-thumb preview-thumb--add" onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <p className="upload-tip">点击任意图片设为主图（仅主图用于生成）</p>
              )}
            </div>

            {/* Right: Settings Panel */}
            <div className="settings-wrap">
              <div className="settings-card">
                <div className="settings-card-header">
                  <button
                    className={`settings-tab-btn ${!showAdvanced ? 'active' : ''}`}
                    onClick={() => setShowAdvanced(false)}
                  >
                    基础设置
                  </button>
                  <button
                    className={`settings-tab-btn ${showAdvanced ? 'active' : ''}`}
                    onClick={() => setShowAdvanced(true)}
                  >
                    高级设置
                  </button>
                </div>

                {!showAdvanced && (
                  <div className="settings-body">
                    <div className="field">
                      <label className="field-label">场景主题</label>
                      <CustomSelect
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
                        placeholder="请选择场景"
                        options={[
                          { value: '', label: '请选择场景' },
                          ...Object.entries(sceneCategories).map(([category, scenes]) => ({
                            group: category,
                            options: scenes.map(scene => ({
                              value: `${category}|||${scene.name}`,
                              label: scene.name,
                            })),
                          })),
                        ]}
                      />
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label className="field-label">输出尺寸</label>
                        <CustomSelect
                          disabled={!imageOutputSizeOptions || imageOutputSizeOptions.length === 0}
                          value={
                            imageOutputSizeOptions === null
                              ? ''
                              : (imageOutputSizeOptions.some((o) => o.value === basicParams.imageSize)
                                ? basicParams.imageSize
                                : (imageOutputSizeOptions[0]?.value ?? basicParams.imageSize))
                          }
                          onChange={(e) => setBasicParams(prev => ({ ...prev, imageSize: e.target.value }))}
                          placeholder={imageOutputSizeOptions === null ? '加载可选尺寸…' : '请选择尺寸'}
                          options={
                            imageOutputSizeOptions === null
                              ? [{ value: '', label: '加载可选尺寸…' }]
                              : imageOutputSizeOptions.map(opt => ({ value: opt.value, label: opt.label }))
                          }
                        />
                      </div>
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label className="field-label">生成数量</label>
                        <CustomSelect
                          value={imageCount}
                          onChange={(e) => setImageCount(Number(e.target.value))}
                          options={Array.from({ length: 10 }, (_, i) => i + 1).map(count => ({
                            value: count, label: `${count} 张`,
                          }))}
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">人脸保持</label>
                        <label className="toggle-option">
                          <input
                            type="checkbox"
                            checked={keepFace}
                            onChange={(e) => setKeepFace(e.target.checked)}
                          />
                          <span className="toggle-track"><span className="toggle-thumb" /></span>
                          <span className="toggle-text">保持五官特征</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {showAdvanced && (
                  <div className="settings-body">
                    <div className="field">
                      <label className="field-label">视觉风格</label>
                      <CustomSelect
                        value={basicParams.visualStyle}
                        onChange={(e) => setBasicParams(prev => ({ ...prev, visualStyle: e.target.value }))}
                        placeholder="请选择风格"
                        options={[
                          { value: '', label: '请选择风格' },
                          ...visualStyles.map(style => ({ value: style, label: style })),
                        ]}
                      />
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label className="field-label">构图</label>
                        <CustomSelect
                          value={advancedParams.composition}
                          onChange={(e) => setAdvancedParams(prev => ({ ...prev, composition: e.target.value }))}
                          placeholder="请选择构图"
                          options={[
                            { value: '', label: '请选择构图' },
                            ...compositions.map(comp => ({ value: comp, label: comp })),
                          ]}
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">光影</label>
                        <CustomSelect
                          value={advancedParams.lighting}
                          onChange={(e) => setAdvancedParams(prev => ({ ...prev, lighting: e.target.value }))}
                          placeholder="请选择光影"
                          options={[
                            { value: '', label: '请选择光影' },
                            ...lightings.map(light => ({ value: light, label: light })),
                          ]}
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label className="field-label">情绪</label>
                      <CustomSelect
                        value={advancedParams.mood}
                        onChange={(e) => setAdvancedParams(prev => ({ ...prev, mood: e.target.value }))}
                        placeholder="请选择情绪"
                        options={[
                          { value: '', label: '请选择情绪' },
                          ...moods.map(mood => ({ value: mood, label: mood })),
                        ]}
                      />
                    </div>
                  </div>
                )}

                <div className="settings-footer">
                  <button
                    className="btn-generate"
                    onClick={generateImages}
                    disabled={loading}
                  >
                    {loading
                      ? (progress ? `生成中 ${progress.current}/${progress.total}...` : '生成中...')
                      : '开始生成'}
                  </button>
                  {loading && (
                    <button
                      className="btn-cancel"
                      type="button"
                      onClick={cancelGeneration}
                    >
                      取消生成
                    </button>
                  )}
                  <p className="settings-expiry">生成结果保存 24 小时，请及时下载</p>
                  {error && <div className="settings-error">{error}</div>}
                </div>
              </div>
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
