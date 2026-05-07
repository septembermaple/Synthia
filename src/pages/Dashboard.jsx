import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import JSZip from 'jszip';

function Dashboard() {
  const { user, isAdmin, logout, updatePassword, addPoints, redeemCode, deleteAccount, getTransactions, getGenerationRecords, deleteGenerationRecord } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [message, setMessage] = useState('');
  const [generationRecords, setGenerationRecords] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [deleteForm, setDeleteForm] = useState({ password: '', confirm: '' });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [redeemInput, setRedeemInput] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState(null);
  const [redeemHistory, setRedeemHistory] = useState([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      const data = await getTransactions(50);
      setTransactions(data || []);
    };
    fetchTransactions();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'generations') {
      const fetchRecords = async () => {
        const data = await getGenerationRecords();
        setGenerationRecords(data || []);
      };
      fetchRecords();
    }
    if (activeTab === 'recharge') {
      loadRedeemHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadRedeemHistory = async () => {
    try {
      const data = await api.getRedeemHistory(20);
      setRedeemHistory(Array.isArray(data) ? data : []);
    } catch {
      setRedeemHistory([]);
    }
  };

  const handleRedeem = async () => {
    const code = (redeemInput || '').trim();
    if (!code) {
      setRedeemMessage({ type: 'error', text: '请输入兑换码' });
      return;
    }
    setRedeemLoading(true);
    setRedeemMessage(null);
    try {
      const result = await redeemCode(code);
      if (result?.success) {
        setRedeemMessage({ type: 'success', text: result.message || `兑换成功，已到账 ${result.points} 积分` });
        setRedeemInput('');
        loadRedeemHistory();
      } else {
        setRedeemMessage({ type: 'error', text: result?.message || '兑换失败' });
      }
    } catch (err) {
      setRedeemMessage({ type: 'error', text: err?.message || '兑换失败' });
    } finally {
      setRedeemLoading(false);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN');
  };

  const formatDate = (timeStr) => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('zh-CN');
  };

  const formatRemainingTime = (ms) => {
    if (!ms || ms <= 0) return '已过期';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    }
    return `${minutes}分钟`;
  };

  const downloadImage = async (url, index) => {
    try {
      const response = await fetch(url);
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
      window.open(url, '_blank');
    }
  };

  const downloadAllImages = async (record) => {
    if (record.images.length === 1) {
      await downloadImage(record.images[0], 0);
      return;
    }

    try {
      const zip = new JSZip();
      const folder = zip.folder(`synthia_${Date.now()}`);
      
      for (let i = 0; i < record.images.length; i++) {
        const response = await fetch(record.images[i]);
        const blob = await response.blob();
        folder.file(`image_${i + 1}.jpg`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const blobUrl = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `synthia_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      for (let i = 0; i < record.images.length; i++) {
        await downloadImage(record.images[i], i);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  };

  const handlePasswordUpdate = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('两次输入的密码不一致');
      return;
    }
    if (passwordForm.newPassword.length < 6 || passwordForm.newPassword.length > 128) {
      setMessage('密码长度需为 6~128 位');
      return;
    }
    if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword)) {
      setMessage('密码需同时包含字母和数字');
      return;
    }

    try {
      const result = await updatePassword(passwordForm.oldPassword, passwordForm.newPassword);
      if (result?.success) {
        setMessage('密码修改成功');
        setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setMessage(result?.message || '密码修改失败');
      }
    } catch (err) {
      setMessage(err?.message || '密码修改失败');
    }
  };

  const handleRecharge = async () => {
    const amount = Number(rechargeAmount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
      setMessage('请输入合法金额（1~100000）');
      return;
    }
    const result = await addPoints(amount, `充值${amount}积分`);
    if (result?.success) {
      setMessage(result.message || '充值成功');
      setRechargeAmount(100);
    } else {
      setMessage(result?.message || '充值失败');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteForm.confirm !== 'DELETE') {
      setMessage('请输入大写 DELETE 以确认');
      return;
    }
    setDeleteLoading(true);
    try {
      const result = await deleteAccount(deleteForm.password, deleteForm.confirm);
      if (result?.success) {
        await logout();
        navigate('/login');
      } else {
        setMessage(result?.message || '注销失败');
      }
    } catch (err) {
      setMessage(err?.message || '注销失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">用户中心</h1>
        <button className="back-btn" onClick={() => navigate('/')}>返回首页</button>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-sidebar">
          <div className="user-card">
            <div className="user-avatar">👤</div>
            <div className="user-info-detail">
              <div className="user-phone">{user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</div>
              <div className="user-points">
                <span className="points-label">积分余额</span>
                <span className="points-value">{user.points}</span>
              </div>
            </div>
          </div>

          <div className="sidebar-menu">
            <button
              className={`menu-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              📊 概览
            </button>
            <button
              className={`menu-item ${activeTab === 'password' ? 'active' : ''}`}
              onClick={() => setActiveTab('password')}
            >
              🔐 修改密码
            </button>
            <button
              className={`menu-item ${activeTab === 'recharge' ? 'active' : ''}`}
              onClick={() => setActiveTab('recharge')}
            >
              💳 积分中心
            </button>
            <button
              className={`menu-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              📝 消费记录
            </button>
            <button
              className={`menu-item ${activeTab === 'generations' ? 'active' : ''}`}
              onClick={() => setActiveTab('generations')}
            >
              🖼️ 生成历史
            </button>
            <button
              className={`menu-item ${activeTab === 'danger' ? 'active' : ''}`}
              onClick={() => setActiveTab('danger')}
            >
              ⚠️ 账号安全
            </button>
            <button className="menu-item logout" onClick={logout}>
              🚪 退出登录
            </button>
          </div>
        </div>

        <div className="dashboard-main">
          {activeTab === 'overview' && (
            <div className="overview-section">
              <h2>账户概览</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">💰</div>
                  <div className="stat-info">
                    <div className="stat-label">当前积分</div>
                    <div className="stat-value">{user.points}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📸</div>
                  <div className="stat-info">
                    <div className="stat-label">生成图片</div>
                    <div className="stat-value">{transactions.filter(t => t.type === '消费').length}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📅</div>
                  <div className="stat-info">
                    <div className="stat-label">注册时间</div>
                    <div className="stat-value">{formatDate(user.createdAt || user.created_at)}</div>
                  </div>
                </div>
              </div>

              <h3 style={{ marginTop: '2rem' }}>最近记录</h3>
              <div className="transaction-list">
                {transactions.slice(0, 5).map(transaction => (
                  <div key={transaction.id} className="transaction-item">
                    <div className="transaction-info">
                      <div className="transaction-desc">{transaction.description}</div>
                      <div className="transaction-time">{formatTime(transaction.created_at || transaction.createdAt)}</div>
                    </div>
                    <div className={`transaction-amount ${transaction.amount > 0 ? 'positive' : 'negative'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </div>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="empty-state">暂无记录</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="password-section">
              <h2>修改密码</h2>
              <div className="form-container">
                <div className="form-group">
                  <label>原密码</label>
                  <input
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                    placeholder="请输入原密码（首次设置可留空）"
                  />
                </div>
                <div className="form-group">
                  <label>新密码</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="请输入新密码（至少6位）"
                  />
                </div>
                <div className="form-group">
                  <label>确认密码</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="请再次输入新密码"
                  />
                </div>
                {message && <div className="message">{message}</div>}
                <button className="submit-btn" onClick={handlePasswordUpdate}>确认修改</button>
              </div>
            </div>
          )}

          {activeTab === 'recharge' && (
            <div className="recharge-section">
              <h2>积分中心</h2>
              <div className="current-points">
                当前积分：<span className="highlight">{user.points}</span>
              </div>

              <div className="redeem-card">
                <h3>🎁 使用兑换码</h3>
                <p className="redeem-hint">输入兑换码，可立即获得对应积分。每个兑换码每个账号仅能使用一次。</p>
                <div className="redeem-input-row">
                  <input
                    type="text"
                    className="redeem-input"
                    placeholder="例如 AAAA-BBBB-CCCC"
                    value={redeemInput}
                    onChange={(e) => setRedeemInput(e.target.value)}
                    maxLength={32}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !redeemLoading) handleRedeem(); }}
                  />
                  <button
                    type="button"
                    className="redeem-btn"
                    onClick={handleRedeem}
                    disabled={redeemLoading || !redeemInput.trim()}
                  >
                    {redeemLoading ? '兑换中...' : '立即兑换'}
                  </button>
                </div>
                {redeemMessage && (
                  <div className={`redeem-message ${redeemMessage.type}`}>
                    {redeemMessage.text}
                  </div>
                )}

                {redeemHistory.length > 0 && (
                  <div className="redeem-history">
                    <h4>最近兑换记录</h4>
                    <ul>
                      {redeemHistory.map(item => (
                        <li key={item.id}>
                          <span className="redeem-history-code">{item.code}</span>
                          <span className="redeem-history-points">+{item.points}</span>
                          <span className="redeem-history-time">{formatTime(item.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="recharge-options">
                  <h3>💼 管理员快速充值</h3>
                  <p className="recharge-note">仅管理员可见，用于内部测试 / 客服补偿。</p>
                  <div className="amount-grid">
                    {[100, 200, 500, 1000, 2000, 5000].map(amount => (
                      <button
                        key={amount}
                        className={`amount-option ${rechargeAmount === amount ? 'selected' : ''}`}
                        onClick={() => setRechargeAmount(amount)}
                      >
                        {amount} 积分
                      </button>
                    ))}
                  </div>

                  <div className="custom-amount">
                    <label>自定义金额</label>
                    <input
                      type="number"
                      value={rechargeAmount}
                      onChange={(e) => setRechargeAmount(Number(e.target.value))}
                      min="1"
                    />
                  </div>

                  <button className="recharge-btn" onClick={handleRecharge}>
                    立即充值 {rechargeAmount} 积分
                  </button>
                </div>
              )}

              {!isAdmin && (
                <div className="recharge-info">
                  <h3>💳 充值说明</h3>
                  <p>当前在线支付通道暂未开放，可使用兑换码快速到账。如需大额充值，请联系客服。</p>
                </div>
              )}

              {message && <div className="message">{message}</div>}
            </div>
          )}

          {activeTab === 'danger' && (
            <div className="danger-section">
              <h2>账号安全</h2>
              <div className="form-container" style={{ maxWidth: 520 }}>
                <p style={{ opacity: 0.8, marginBottom: '1rem' }}>
                  注销账号会永久删除该手机号下的所有积分、生成记录、消费记录与提示词使用记录，且不可恢复。
                </p>
                {!!user.points && (
                  <p style={{ color: '#ffb84d' }}>
                    您当前还剩 <strong>{user.points}</strong> 积分，注销后将一并清空。
                  </p>
                )}
                <div className="form-group">
                  <label>当前密码（如已设置）</label>
                  <input
                    type="password"
                    value={deleteForm.password}
                    onChange={(e) => setDeleteForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="未设置密码可留空"
                  />
                </div>
                <div className="form-group">
                  <label>请输入大写 <code>DELETE</code> 以确认</label>
                  <input
                    type="text"
                    value={deleteForm.confirm}
                    onChange={(e) => setDeleteForm(prev => ({ ...prev, confirm: e.target.value }))}
                    placeholder="DELETE"
                  />
                </div>
                {message && <div className="message">{message}</div>}
                <button
                  className="submit-btn"
                  style={{ background: '#d63031' }}
                  disabled={deleteLoading}
                  onClick={handleDeleteAccount}
                >
                  {deleteLoading ? '注销中...' : '永久注销账号'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-section">
              <h2>消费记录</h2>
              <div className="transaction-list full">
                <div className="transaction-header">
                  <span>类型</span>
                  <span>描述</span>
                  <span>金额</span>
                  <span>余额</span>
                  <span>时间</span>
                </div>
                {transactions.map(transaction => (
                  <div key={transaction.id} className="transaction-item full">
                    <span className="transaction-type">
                      {transaction.type === '充值' ? '💰 充值' : '📸 消费'}
                    </span>
                    <span className="transaction-desc">{transaction.description}</span>
                    <span className={`transaction-amount ${transaction.amount > 0 ? 'positive' : 'negative'}`}>
                      {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                    </span>
                    <span className="transaction-balance">{transaction.balance}</span>
                    <span className="transaction-time">{formatTime(transaction.created_at || transaction.createdAt)}</span>
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="empty-state">暂无记录</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'generations' && (
            <div className="generations-section">
              <h2>生成历史</h2>
              <div className="expiry-warning">
                ⏰ 生成结果保存24小时，过期后将自动删除，请及时下载
              </div>
              <div className="generations-list">
                {generationRecords.map(record => (
                  <div key={record.id} className="generation-record">
                    <div className="record-header">
                      <div className="record-info">
                        {record.scene && <span className="record-scene">{record.scene}</span>}
                        <span className="record-count">{record.image_count || record.imageCount}张图片</span>
                      </div>
                      <div className="record-time">
                        <div className="record-created">{formatTime(record.created_at || record.createdAt)}</div>
                        <div className="record-expires">
                          剩余时间: {formatRemainingTime(record.remainingTime)}
                        </div>
                      </div>
                    </div>
                    <div className="record-images">
                      {record.images.map((img, idx) => (
                        <div key={idx} className="record-image-wrapper">
                          <img src={img} alt={`生成图片 ${idx + 1}`} className="record-image" />
                          <button 
                            className="download-single-btn"
                            onClick={() => downloadImage(img, idx)}
                          >
                            下载
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="record-actions">
                      <button 
                        className="download-all-btn"
                        onClick={() => downloadAllImages(record)}
                      >
                        📦 {record.images.length > 1 ? '打包下载全部' : '下载图片'}
                      </button>
                      <button 
                        className="delete-record-btn"
                        onClick={async () => {
                          await deleteGenerationRecord(record.id);
                          const data = await getGenerationRecords();
                          setGenerationRecords(data || []);
                        }}
                      >
                        🗑️ 删除记录
                      </button>
                    </div>
                  </div>
                ))}
                {generationRecords.length === 0 && (
                  <div className="empty-state">暂无生成记录</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
