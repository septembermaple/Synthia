import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Dashboard() {
  const { user, logout, updatePassword, addPoints, getTransactions, getGenerationRecords, deleteGenerationRecord } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [message, setMessage] = useState('');
  const [generationRecords, setGenerationRecords] = useState([]);
  const [transactions, setTransactions] = useState([]);

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
  }, [activeTab]);

  const formatRemainingTime = (ms) => {
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
      console.error('下载失败:', error);
      window.open(url, '_blank');
    }
  };

  const downloadAllImages = async (record) => {
    for (let i = 0; i < record.images.length; i++) {
      await downloadImage(record.images[i], i);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const handlePasswordUpdate = () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('两次输入的密码不一致');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setMessage('密码长度至少6位');
      return;
    }

    const result = updatePassword(passwordForm.oldPassword, passwordForm.newPassword);
    if (result.success) {
      setMessage('密码修改成功');
      setShowPasswordModal(false);
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } else {
      setMessage(result.message);
    }
  };

  const handleRecharge = async () => {
    const result = await addPoints(rechargeAmount, `充值${rechargeAmount}积分`);
    if (result.success) {
      setMessage(result.message);
      setShowRechargeModal(false);
      setRechargeAmount(100);
    } else {
      setMessage(result.message || '充值失败');
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
              💳 积分充值
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
                    <div className="stat-value">{new Date(user.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>

              <h3 style={{ marginTop: '2rem' }}>最近记录</h3>
              <div className="transaction-list">
                {transactions.slice(0, 5).map(transaction => (
                  <div key={transaction.id} className="transaction-item">
                    <div className="transaction-info">
                      <div className="transaction-desc">{transaction.description}</div>
                      <div className="transaction-time">{new Date(transaction.createdAt).toLocaleString()}</div>
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
              <h2>积分充值</h2>
              <div className="current-points">
                当前积分：<span className="highlight">{user.points}</span>
              </div>
              
              <div className="recharge-options">
                <h3>选择充值金额</h3>
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
                
                <p className="recharge-note">
                  注：当前为演示模式，充值将直接到账。正式环境需对接支付接口。
                </p>
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
                    <span className="transaction-time">{new Date(transaction.createdAt).toLocaleString()}</span>
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
                        <span className="record-prompt">{record.prompt}</span>
                        {record.scene && <span className="record-scene">{record.scene}</span>}
                        <span className="record-count">{record.imageCount}张图片</span>
                      </div>
                      <div className="record-time">
                        <div className="record-created">{new Date(record.createdAt).toLocaleString()}</div>
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
                        📦 打包下载全部
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
