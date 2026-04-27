import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';

// 后端 /api/stats/public 拉到 baseline 后，前端再按 tickPerSecond 在本地继续递增，
// 这样数字看起来"实时在动"，又不会狂打接口。
//
// 后端返回的字段：
//   userCount   : 真实用户 + 虚拟基线
//   imageCount  : 真实图片 + 虚拟基线
//   tickPerSecond : { users, images } 每秒增长速率
//   serverTs    : 服务器 Date.now()
const FALLBACK_TICK = { users: 0.022, images: 0.78 };
const FALLBACK_SEED = { users: 8200, images: 352000 };

function formatNumber(n) {
  return Math.floor(n).toLocaleString('zh-CN');
}

// 进入视口后做 count-up 动画
function useInViewport(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setInView(true);
          observer.disconnect();
          break;
        }
      }
    }, { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

export default function StatsBar() {
  const containerRef = useRef(null);
  const inView = useInViewport(containerRef);

  const baselineRef = useRef(null);   // { users, images, tickPerSecond, anchorMs }
  const [users, setUsers] = useState(0);
  const [images, setImages] = useState(0);
  const animatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      let baseline;
      try {
        const data = await api.getPublicStats();
        baseline = {
          users: Number(data?.userCount) || FALLBACK_SEED.users,
          images: Number(data?.imageCount) || FALLBACK_SEED.images,
          tickPerSecond: {
            users: Number(data?.tickPerSecond?.users) || FALLBACK_TICK.users,
            images: Number(data?.tickPerSecond?.images) || FALLBACK_TICK.images,
          },
          anchorMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        };
      } catch {
        // 接口失败也别让首页空着，给一个本地兜底
        baseline = {
          users: FALLBACK_SEED.users,
          images: FALLBACK_SEED.images,
          tickPerSecond: FALLBACK_TICK,
          anchorMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        };
      }
      if (cancelled) return;
      baselineRef.current = baseline;
      // 第一次拿到数据：在视口内才做 count-up，否则直接显示
      if (inView) {
        runCountUp(baseline.users, baseline.images);
      } else {
        setUsers(baseline.users);
        setImages(baseline.images);
      }
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当组件首次进入视口，从 0 滚到 baseline
  useEffect(() => {
    if (!inView) return;
    const b = baselineRef.current;
    if (!b) return;
    runCountUp(b.users, b.images);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  // baseline 跑完后开启慢速持续递增
  useEffect(() => {
    let raf;
    const tick = () => {
      const b = baselineRef.current;
      if (b && !animatingRef.current) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const elapsedSec = Math.max(0, (now - b.anchorMs) / 1000);
        const liveUsers = b.users + elapsedSec * b.tickPerSecond.users;
        const liveImages = b.images + elapsedSec * b.tickPerSecond.images;
        setUsers(liveUsers);
        setImages(liveImages);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const runCountUp = (targetUsers, targetImages) => {
    animatingRef.current = true;
    const duration = 1600; // ms
    const startTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const startUsers = 0;
    const startImages = 0;

    const step = (now) => {
      const elapsed = now - startTs;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - t, 3);
      setUsers(startUsers + (targetUsers - startUsers) * ease);
      setImages(startImages + (targetImages - startImages) * ease);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        animatingRef.current = false;
      }
    };
    requestAnimationFrame(step);
  };

  return (
    <div className="stats-bar" ref={containerRef}>
      <div className="stats-bar-inner">
        <div className="stats-bar-item">
          <div className="stats-bar-value">{formatNumber(users)}</div>
          <div className="stats-bar-label">注册用户</div>
        </div>
        <div className="stats-bar-divider" aria-hidden="true" />
        <div className="stats-bar-item">
          <div className="stats-bar-value">{formatNumber(images)}</div>
          <div className="stats-bar-label">已生成写真</div>
        </div>
        <div className="stats-bar-divider" aria-hidden="true" />
        <div className="stats-bar-item">
          <div className="stats-bar-value stats-bar-live">
            <span className="stats-bar-dot" />
            实时
          </div>
          <div className="stats-bar-label">数据每秒更新</div>
        </div>
      </div>
    </div>
  );
}
