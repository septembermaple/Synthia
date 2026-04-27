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
            className={`admin-nav-item ${activeTab === 'redeem' ? 'active' : ''}`}
            onClick={() => setActiveTab('redeem')}
          >🎁 兑换码</button>
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
        {activeTab === 'redeem' && <RedeemCodeManagement />}
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
  const [redeemStats, setRedeemStats] = useState(null);
  const [redeemError, setRedeemError] = useState('');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    setRedeemError('');
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
      try {
        const r = await api.adminStatsRedeem(days);
        setRedeemStats(r || null);
      } catch (e) {
        setRedeemStats(null);
        setRedeemError(e?.message || '兑换码统计加载失败');
      }
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

  const rs = redeemStats;
  const sum = rs?.summary;
  const byBatch = rs?.by_batch || [];
  const redeemDaily = rs?.daily_redemptions || [];
  const maxRedeemPts = Math.max(1, ...redeemDaily.map(r => Number(r.points) || 0));

  const pctStr = (v) => (typeof v === 'number' && !Number.isNaN(v) ? `${v.toFixed(2)}%` : '—');

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

      {redeemError && (
        <div className="admin-message" style={{ background: '#3a2f1f', borderColor: '#5a4a2d', color: '#eec8a8' }}>
          {redeemError}
        </div>
      )}

      {sum && (
        <>
          <h3 className="admin-report-subtitle">兑换码</h3>
          <div className="admin-stats-grid">
            <StatCard title="兑换码张数" value={fmt(sum.code_count)} subtitle={`仍可领取 ${fmt(sum.active_available)} 张`} />
            <StatCard title="累计兑换次数" value={fmt(sum.redeem_events_total)} subtitle={`发放积分 ${fmt(sum.redeem_points_total)}`} />
            <StatCard title="名额核销率" value={pctStr(sum.slot_redemption_rate)} subtitle={`已用 ${fmt(sum.used_slots)} / 上限 ${fmt(sum.total_slots)} 次`} />
            <StatCard title="积分核销率" value={pctStr(sum.points_redemption_rate)} subtitle={`已兑 ${fmt(sum.points_redeemed)} / 容量 ${fmt(sum.points_capacity)}`} />
            <StatCard title="近 7 天兑换" value={fmt(sum.redeem_events_7d)} subtitle={`发放 ${fmt(sum.redeem_points_7d)} 积分`} />
            <StatCard title="已停用码" value={fmt(sum.disabled_count)} subtitle="状态为停用的兑换码" />
          </div>

          <div className="admin-card">
            <div className="admin-card-header">按批次核销（最近 100 个批次）</div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>批次</th>
                  <th>备注</th>
                  <th>张数</th>
                  <th>名额上限</th>
                  <th>已用名额</th>
                  <th>名额核销率</th>
                  <th>积分容量</th>
                  <th>已兑积分</th>
                  <th>积分核销率</th>
                  <th>最近生成</th>
                </tr>
              </thead>
              <tbody>
                {byBatch.map((b) => (
                  <tr key={b.batch_id}>
                    <td><span className="admin-code">{b.batch_id}</span></td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.note}>{b.note || '—'}</td>
                    <td>{fmt(b.codes_count)}</td>
                    <td>{fmt(b.total_slots)}</td>
                    <td>{fmt(b.used_slots)}</td>
                    <td>{pctStr(b.slot_redemption_rate)}</td>
                    <td>{fmt(b.points_capacity)}</td>
                    <td>{fmt(b.points_redeemed)}</td>
                    <td>{pctStr(b.points_redemption_rate)}</td>
                    <td>{b.last_created ? new Date(b.last_created).toLocaleString('zh-CN') : '—'}</td>
                  </tr>
                ))}
                {byBatch.length === 0 && (
                  <tr><td colSpan={10} className="admin-empty-cell">暂无批次数据</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">每日兑换积分（近 {days} 天）</div>
            <div className="admin-chart">
              {redeemDaily.length === 0 && <div className="admin-empty">暂无兑换记录</div>}
              {redeemDaily.map((d) => (
                <div key={d.day} className="admin-chart-row">
                  <div className="admin-chart-label">{String(d.day).slice(5)}</div>
                  <div className="admin-chart-bar-bg">
                    <div
                      className="admin-chart-bar"
                      style={{ width: `${(Number(d.points) / maxRedeemPts) * 100}%` }}
                      title={`${d.day} · ${fmt(d.points)} 积分 · ${fmt(d.redemptions)} 次`}
                    />
                  </div>
                  <div className="admin-chart-value">{fmt(d.points)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

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

function RedeemCodeManagement() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState({ status: '', q: '', batch_id: '' });
  const [showGenerator, setShowGenerator] = useState(false);
  const [lastBatch, setLastBatch] = useState(null); // { batch_id, codes, count, points }
  const [logsFor, setLogsFor] = useState(null);     // 当前查看使用记录的 code 行

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.adminListRedeemCodes({
        limit: 200,
        status: filter.status || undefined,
        q: filter.q || undefined,
        batch_id: filter.batch_id || undefined,
      });
      setCodes(Array.isArray(data) ? data : []);
    } catch (e) {
      setMessage('加载失败：' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const handleDisable = async (id) => {
    if (!confirm('确认停用该兑换码？停用后无法恢复，但已兑换的不受影响。')) return;
    try {
      await api.adminDisableRedeemCode(id);
      setMessage('已停用');
      await load();
    } catch (e) {
      setMessage('停用失败：' + e.message);
    }
  };

  const fmt = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('zh-CN');
  };

  const computeStatus = (row) => {
    if (row.status === 'disabled') return { label: '已停用', cls: 'off' };
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { label: '已过期', cls: 'off' };
    }
    if (row.used_count >= row.max_uses) return { label: '已用完', cls: 'off' };
    return { label: '可用', cls: 'ok' };
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>兑换码管理</h2>
        <button className="admin-btn-primary" onClick={() => setShowGenerator(true)}>+ 生成兑换码</button>
      </div>

      {message && <div className="admin-message" onClick={() => setMessage('')}>{message}</div>}

      {lastBatch && (
        <div className="admin-card">
          <div className="admin-card-header">
            ✅ 上次生成结果（批次 {lastBatch.batch_id}，共 {lastBatch.count} 张，单张面值 {lastBatch.points} 积分）
            <button className="admin-btn-link" style={{ float: 'right' }} onClick={() => setLastBatch(null)}>关闭</button>
          </div>
          <div style={{ padding: '0.75rem 1rem' }}>
            <div className="admin-redeem-codelist">
              {lastBatch.codes.map(c => <code key={c}>{c}</code>)}
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button
                className="admin-btn-ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(lastBatch.codes.join('\n'))
                    .then(() => setMessage('已复制到剪贴板'))
                    .catch(() => setMessage('复制失败，请手动选择'));
                }}
              >📋 复制全部</button>
              <button
                className="admin-btn-ghost"
                onClick={() => {
                  const blob = new Blob([lastBatch.codes.join('\r\n')], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `redeem-codes-${lastBatch.batch_id}.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >⬇️ 下载 TXT</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">筛选</div>
        <div style={{ padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label className="admin-hint">状态</label>
            <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
              style={{ width: '100%', padding: '0.4rem', background: '#0f1218', color: '#e6e8eb', border: '1px solid #2a2f38', borderRadius: 6 }}>
              <option value="">全部</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </div>
          <div>
            <label className="admin-hint">关键词（兑换码 / 备注）</label>
            <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
              style={{ width: '100%', padding: '0.4rem', background: '#0f1218', color: '#e6e8eb', border: '1px solid #2a2f38', borderRadius: 6 }} />
          </div>
          <div>
            <label className="admin-hint">批次号</label>
            <input value={filter.batch_id} onChange={e => setFilter(f => ({ ...f, batch_id: e.target.value }))}
              style={{ width: '100%', padding: '0.4rem', background: '#0f1218', color: '#e6e8eb', border: '1px solid #2a2f38', borderRadius: 6 }} />
          </div>
          <div>
            <button className="admin-btn-ghost" onClick={load}>🔍 查询</button>
          </div>
        </div>
      </div>

      {loading && <div className="admin-loading">加载中...</div>}

      <div className="admin-card">
        <div className="admin-card-header">兑换码列表（最近 200 条）</div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>兑换码</th>
              <th>面值</th>
              <th>使用 / 上限</th>
              <th>状态</th>
              <th>过期时间</th>
              <th>批次</th>
              <th>备注</th>
              <th>创建时间</th>
              <th style={{ minWidth: 160 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {codes.map(c => {
              const st = computeStatus(c);
              return (
                <tr key={c.id}>
                  <td><code className="admin-code">{c.code}</code></td>
                  <td>{c.points}</td>
                  <td>{c.used_count} / {c.max_uses}</td>
                  <td><span className={`admin-badge ${st.cls}`}>{st.label}</span></td>
                  <td>{c.expires_at ? fmt(c.expires_at) : '永久'}</td>
                  <td><span style={{ fontSize: '0.75rem', color: '#858c97' }}>{c.batch_id || '-'}</span></td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.note}>{c.note || '-'}</td>
                  <td>{fmt(c.created_at)}</td>
                  <td>
                    <button className="admin-btn-link" onClick={() => setLogsFor(c)}>使用记录</button>
                    {c.status === 'active' && (
                      <button className="admin-btn-link danger" onClick={() => handleDisable(c.id)}>停用</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {codes.length === 0 && !loading && (
              <tr><td colSpan={9} className="admin-empty-cell">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showGenerator && (
        <RedeemGeneratorModal
          onCancel={() => setShowGenerator(false)}
          onSuccess={(result) => {
            setShowGenerator(false);
            setLastBatch(result);
            load();
          }}
        />
      )}

      {logsFor && (
        <RedeemLogsModal
          code={logsFor}
          onClose={() => setLogsFor(null)}
        />
      )}
    </div>
  );
}

function RedeemGeneratorModal({ onCancel, onSuccess }) {
  const [form, setForm] = useState({
    points: 100,
    count: 10,
    max_uses: 1,
    expires_at: '',
    note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const upd = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const points = Number(form.points);
    const count = Number(form.count);
    const maxUses = Number(form.max_uses) || 1;
    if (!Number.isInteger(points) || points <= 0) return setError('面值积分需为正整数');
    if (!Number.isInteger(count) || count <= 0 || count > 200) return setError('生成数量需为 1~200');
    if (!Number.isInteger(maxUses) || maxUses <= 0) return setError('使用次数上限需为正整数');

    setLoading(true);
    try {
      const result = await api.adminGenerateRedeemCodes({
        points,
        count,
        max_uses: maxUses,
        expires_at: form.expires_at || null,
        note: form.note || '',
      });
      if (result?.success) {
        onSuccess({
          batch_id: result.batch_id,
          codes: result.codes || [],
          count: result.count || 0,
          points,
        });
      } else {
        setError('生成失败');
      }
    } catch (err) {
      setError('生成失败：' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h3>生成兑换码</h3>

        <div className="admin-form-row-2">
          <div>
            <label>单张面值（积分） *</label>
            <input type="number" min="1" value={form.points} onChange={e => upd('points', e.target.value)} required />
          </div>
          <div>
            <label>生成数量 * (1~200)</label>
            <input type="number" min="1" max="200" value={form.count} onChange={e => upd('count', e.target.value)} required />
          </div>
        </div>

        <div className="admin-form-row">
          <label>每张可使用次数</label>
          <input type="number" min="1" value={form.max_uses} onChange={e => upd('max_uses', e.target.value)} />
          <div className="admin-hint">默认 1（一码一用）；设为更大值可作为多人共用码</div>
        </div>

        <div className="admin-form-row">
          <label>过期时间（可选）</label>
          <input type="datetime-local" value={form.expires_at} onChange={e => upd('expires_at', e.target.value)} />
          <div className="admin-hint">留空表示永不过期</div>
        </div>

        <div className="admin-form-row">
          <label>备注</label>
          <input value={form.note} onChange={e => upd('note', e.target.value)} placeholder="例如：双十一活动 / 客服补偿" maxLength={200} />
        </div>

        {error && <div className="admin-message" style={{ background: '#3a1f1f', borderColor: '#5a2d2d', color: '#eea8a8' }}>{error}</div>}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn-ghost" onClick={onCancel} disabled={loading}>取消</button>
          <button type="submit" className="admin-btn-primary" disabled={loading}>{loading ? '生成中...' : '确认生成'}</button>
        </div>
      </form>
    </div>
  );
}

function RedeemLogsModal({ code, onClose }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.adminRedeemCodeLogs(code.id)
      .then(data => { if (mounted) setLogs(Array.isArray(data) ? data : []); })
      .catch(e => { if (mounted) setError(e?.message || '加载失败'); });
    return () => { mounted = false; };
  }, [code.id]);

  const fmt = (s) => {
    if (!s) return '-';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('zh-CN');
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ width: 640 }}>
        <h3>使用记录 — {code.code}</h3>
        <div className="admin-hint" style={{ marginBottom: '0.75rem' }}>
          已使用 {code.used_count} / {code.max_uses} 次
        </div>

        {error && <div className="admin-message" style={{ background: '#3a1f1f', borderColor: '#5a2d2d', color: '#eea8a8' }}>{error}</div>}

        {!logs && !error && <div className="admin-loading">加载中...</div>}

        {logs && (
          <table className="admin-table">
            <thead>
              <tr><th>#</th><th>用户手机号</th><th>到账积分</th><th>兑换时间</th></tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id}>
                  <td>{i + 1}</td>
                  <td>{l.phone}</td>
                  <td>+{l.points}</td>
                  <td>{fmt(l.created_at)}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} className="admin-empty-cell">尚未被使用</td></tr>}
            </tbody>
          </table>
        )}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn-primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
