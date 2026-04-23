import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const MODEL_TYPES = [
  { value: 'image', label: '图片模型' },
  { value: 'text', label: '文本模型' },
  { value: 'video', label: '视频模型' },
];

const UNITS = [
  { value: 'image', label: '次（按张）' },
  { value: 'token_1k', label: '千 token' },
  { value: 'second', label: '秒（视频）' },
];

function emptyModelForm() {
  return {
    id: null,
    provider: 'volcengine',
    model_type: 'image',
    model_id: '',
    display_name: '',
    api_url: '',
    enabled: 1,
    is_default: 0,
    price_per_unit: 10,
    unit: 'image',
    quota_daily: 0,
    info: '',
  };
}

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState('models');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    api.adminMe()
      .then(data => setIsAdmin(!!data?.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [user, authLoading, navigate]);

  if (authLoading || isAdmin === null) {
    return <div className="admin-loading">加载中...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="admin-container">
        <div className="admin-forbidden">
          <h2>无管理员权限</h2>
          <p>当前账号不在管理员白名单，请联系系统管理员。</p>
          <button className="admin-btn" onClick={() => navigate('/')}>返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <aside className="admin-sidebar">
        <div className="admin-brand">Synthia 管理后台</div>
        <nav>
          <button
            className={`admin-nav-item ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => setActiveTab('models')}
          >📦 模型管理</button>
          <button
            className={`admin-nav-item ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >📊 报表统计</button>
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-btn-ghost" onClick={() => navigate('/')}>← 返回首页</button>
        </div>
      </aside>

      <main className="admin-main">
        {activeTab === 'models' && <ModelManagement />}
        {activeTab === 'stats' && <Reports />}
      </main>
    </div>
  );
}

function ModelManagement() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.adminListModels();
      setModels(Array.isArray(data) ? data : []);
    } catch (e) {
      setMessage('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    try {
      if (form.id) {
        await api.adminUpdateModel(form.id, form);
      } else {
        await api.adminCreateModel(form);
      }
      setEditing(null);
      setMessage('保存成功');
      await load();
    } catch (e) {
      setMessage('保存失败：' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除该模型配置？此操作不可撤销')) return;
    try {
      await api.adminDeleteModel(id);
      setMessage('删除成功');
      await load();
    } catch (e) {
      setMessage('删除失败：' + e.message);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await api.adminSetDefaultModel(id);
      setMessage('已设为默认');
      await load();
    } catch (e) {
      setMessage('操作失败：' + e.message);
    }
  };

  const grouped = models.reduce((acc, m) => {
    (acc[m.model_type] = acc[m.model_type] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>模型管理</h2>
        <button className="admin-btn-primary" onClick={() => setEditing(emptyModelForm())}>+ 新增模型</button>
      </div>

      {message && <div className="admin-message" onClick={() => setMessage('')}>{message}</div>}
      {loading && <div className="admin-loading">加载中...</div>}

      {MODEL_TYPES.map(t => (
        <div key={t.value} className="admin-model-group">
          <h3>{t.label}</h3>
          {grouped[t.value]?.length ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>模型ID</th>
                  <th>单价（积分）</th>
                  <th>计量单位</th>
                  <th>每日额度</th>
                  <th>状态</th>
                  <th>默认</th>
                  <th style={{ minWidth: 220 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {grouped[t.value].map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="admin-cell-title">{m.display_name}</div>
                      <div className="admin-cell-subtitle">{m.provider}</div>
                    </td>
                    <td><code className="admin-code">{m.model_id}</code></td>
                    <td>{m.price_per_unit}</td>
                    <td>{m.unit}</td>
                    <td>{m.quota_daily || '∞'}</td>
                    <td>
                      <span className={`admin-badge ${m.enabled ? 'ok' : 'off'}`}>
                        {m.enabled ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td>
                      {m.is_default ? <span className="admin-badge ok">默认</span> : '-'}
                    </td>
                    <td>
                      <button className="admin-btn-link" onClick={() => setEditing({ ...m })}>编辑</button>
                      {!m.is_default && (
                        <button className="admin-btn-link" onClick={() => handleSetDefault(m.id)}>设为默认</button>
                      )}
                      <button className="admin-btn-link danger" onClick={() => handleDelete(m.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="admin-empty">暂无{t.label}</div>
          )}
        </div>
      ))}

      {editing && (
        <ModelFormModal
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ModelFormModal({ initial, onCancel, onSave }) {
  const [form, setForm] = useState(initial);

  const upd = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      price_per_unit: Number(form.price_per_unit) || 0,
      quota_daily: Number(form.quota_daily) || 0,
      enabled: form.enabled ? 1 : 0,
      is_default: form.is_default ? 1 : 0,
    });
  };

  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h3>{form.id ? '编辑模型' : '新增模型'}</h3>

        <div className="admin-form-row">
          <label>类型 *</label>
          <select value={form.model_type} onChange={e => upd('model_type', e.target.value)}>
            {MODEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="admin-form-row">
          <label>厂商 *</label>
          <input value={form.provider} onChange={e => upd('provider', e.target.value)} placeholder="volcengine" required />
        </div>

        <div className="admin-form-row">
          <label>显示名称 *</label>
          <input value={form.display_name} onChange={e => upd('display_name', e.target.value)} required />
        </div>

        <div className="admin-form-row">
          <label>模型 ID *</label>
          <input value={form.model_id} onChange={e => upd('model_id', e.target.value)} placeholder="doubao-seedream-4-0-250828" required />
          <div className="admin-hint">调接口用的真实模型标识</div>
        </div>

        <div className="admin-form-row">
          <label>接口地址</label>
          <input value={form.api_url} onChange={e => upd('api_url', e.target.value)} placeholder="留空使用默认" />
        </div>

        <div className="admin-form-row-2">
          <div>
            <label>单价（积分）</label>
            <input type="number" min="0" value={form.price_per_unit} onChange={e => upd('price_per_unit', e.target.value)} />
          </div>
          <div>
            <label>计量单位</label>
            <select value={form.unit} onChange={e => upd('unit', e.target.value)}>
              {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
        </div>

        <div className="admin-form-row">
          <label>每日额度（0 = 不限）</label>
          <input type="number" min="0" value={form.quota_daily} onChange={e => upd('quota_daily', e.target.value)} />
        </div>

        <div className="admin-form-row">
          <label>扩展信息（JSON，可选）</label>
          <textarea rows={3} value={form.info} onChange={e => upd('info', e.target.value)} placeholder='{"description":"..."}' />
        </div>

        <div className="admin-form-row-inline">
          <label>
            <input type="checkbox" checked={!!form.enabled} onChange={e => upd('enabled', e.target.checked ? 1 : 0)} />
            启用
          </label>
          <label>
            <input type="checkbox" checked={!!form.is_default} onChange={e => upd('is_default', e.target.checked ? 1 : 0)} />
            设为该类型的默认模型
          </label>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn-ghost" onClick={onCancel}>取消</button>
          <button type="submit" className="admin-btn-primary">保存</button>
        </div>
      </form>
    </div>
  );
}

function Reports() {
  const [overview, setOverview] = useState(null);
  const [usage, setUsage] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [modelStats, setModelStats] = useState([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [o, u, t, m] = await Promise.all([
        api.adminStatsOverview(),
        api.adminStatsUsage(days),
        api.adminStatsTopUsers(10),
        api.adminStatsModels(),
      ]);
      setOverview(o);
      setUsage(u || []);
      setTopUsers(t || []);
      setModelStats(m || []);
    } catch (e) {
      setError('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  if (loading) return <div className="admin-loading">加载中...</div>;
  if (error) return <div className="admin-error">{error}</div>;

  const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');

  const maxCost = Math.max(1, ...usage.map(r => Number(r.cost) || 0));
  const byDay = usage.reduce((acc, r) => {
    const d = r.day;
    acc[d] = acc[d] || { day: d, cost: 0, calls: 0, image: 0, text: 0, video: 0 };
    acc[d].cost += Number(r.cost) || 0;
    acc[d].calls += Number(r.calls) || 0;
    acc[d][r.model_type] = (acc[d][r.model_type] || 0) + (Number(r.units) || 0);
    return acc;
  }, {});
  const days30 = Object.values(byDay).sort((a, b) => a.day < b.day ? -1 : 1);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>报表统计</h2>
        <div className="admin-range-picker">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              className={`admin-btn-ghost ${days === d ? 'active' : ''}`}
              onClick={() => setDays(d)}
            >近 {d} 天</button>
          ))}
          <button className="admin-btn-ghost" onClick={load}>刷新</button>
        </div>
      </div>

      <div className="admin-stats-grid">
        <StatCard title="用户总数" value={fmt(overview?.userCount)} />
        <StatCard title="用户积分余量" value={fmt(overview?.totalUserPoints)} />
        <StatCard title="累计调用" value={fmt(overview?.total?.calls)} subtitle={`消耗 ${fmt(overview?.total?.cost)} 积分`} />
        <StatCard title="今日调用" value={fmt(overview?.today?.calls)} subtitle={`消耗 ${fmt(overview?.today?.cost)} 积分`} />
        <StatCard title="近 7 天调用" value={fmt(overview?.last7days?.calls)} subtitle={`消耗 ${fmt(overview?.last7days?.cost)} 积分`} />
        <StatCard title="近 30 天调用" value={fmt(overview?.last30days?.calls)} subtitle={`消耗 ${fmt(overview?.last30days?.cost)} 积分`} />
      </div>

      <div className="admin-card">
        <div className="admin-card-header">按类型汇总（累计）</div>
        <table className="admin-table">
          <thead>
            <tr><th>类型</th><th>调用次数</th><th>生成单位数</th><th>消耗积分</th></tr>
          </thead>
          <tbody>
            {(overview?.byType || []).map(r => (
              <tr key={r.model_type}>
                <td>{MODEL_TYPES.find(t => t.value === r.model_type)?.label || r.model_type}</td>
                <td>{fmt(r.calls)}</td>
                <td>{fmt(r.units)}</td>
                <td>{fmt(r.cost)}</td>
              </tr>
            ))}
            {(overview?.byType?.length ?? 0) === 0 && (
              <tr><td colSpan={4} className="admin-empty-cell">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">每日积分消耗（近 {days} 天）</div>
        <div className="admin-chart">
          {days30.length === 0 && <div className="admin-empty">暂无数据</div>}
          {days30.map(d => (
            <div key={d.day} className="admin-chart-row">
              <div className="admin-chart-label">{d.day.slice(5)}</div>
              <div className="admin-chart-bar-bg">
                <div
                  className="admin-chart-bar"
                  style={{ width: `${(d.cost / maxCost) * 100}%` }}
                  title={`${d.day} · ${fmt(d.cost)} 积分`}
                />
              </div>
              <div className="admin-chart-value">{fmt(d.cost)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">模型维度统计</div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>模型</th><th>类型</th><th>调用</th><th>成功</th><th>失败</th>
              <th>单位数</th><th>消耗积分</th><th>平均耗时</th>
            </tr>
          </thead>
          <tbody>
            {modelStats.map(r => (
              <tr key={`${r.model_id}-${r.model_name}-${r.model_type}`}>
                <td>{r.model_name || '-'}</td>
                <td>{MODEL_TYPES.find(t => t.value === r.model_type)?.label || r.model_type}</td>
                <td>{fmt(r.calls)}</td>
                <td>{fmt(r.ok)}</td>
                <td>{fmt(r.failed)}</td>
                <td>{fmt(r.units)}</td>
                <td>{fmt(r.cost)}</td>
                <td>{Math.round(r.avg_ms || 0)} ms</td>
              </tr>
            ))}
            {modelStats.length === 0 && <tr><td colSpan={8} className="admin-empty-cell">暂无数据</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">消费排行（按积分）</div>
        <table className="admin-table">
          <thead>
            <tr><th>#</th><th>手机号</th><th>调用次数</th><th>单位数</th><th>消耗积分</th></tr>
          </thead>
          <tbody>
            {topUsers.map((r, i) => (
              <tr key={r.user_id}>
                <td>{i + 1}</td>
                <td>{r.phone}</td>
                <td>{fmt(r.calls)}</td>
                <td>{fmt(r.units)}</td>
                <td>{fmt(r.cost)}</td>
              </tr>
            ))}
            {topUsers.length === 0 && <tr><td colSpan={5} className="admin-empty-cell">暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-title">{title}</div>
      <div className="admin-stat-value">{value}</div>
      {subtitle && <div className="admin-stat-sub">{subtitle}</div>}
    </div>
  );
}
