import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Login() {
  const [loginType, setLoginType] = useState('code');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  
  const { login, loginWithPassword, sendVerificationCode, updatePassword, checkUserExists } = useAuth();
  const navigate = useNavigate();

  const handleSendCode = async () => {
    if (!phone || phone.length !== 11) {
      setError('请输入正确的手机号');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await sendVerificationCode(phone);
      setCodeSent(true);
      setCountdown(60);
      
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError('发送验证码失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeLogin = async (e) => {
    e.preventDefault();
    
    console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
    
    if (!phone || phone.length !== 11) {
      setError('请输入正确的手机号');
      return;
    }

    if (!code || code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await login(phone, code);
      
      if (result.isNewUser || !result.hasPassword) {
        setCurrentUser(result);
        setShowPasswordModal(true);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    
    console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
    
    if (!phone || phone.length !== 11) {
      setError('请输入正确的手机号');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await loginWithPassword(phone, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = () => {
    if (newPassword.length < 6) {
      setPasswordError('密码长度至少6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    const result = updatePassword('', newPassword);
    if (result.success) {
      setShowPasswordModal(false);
      navigate('/');
    } else {
      setPasswordError(result.message);
    }
  };

  const handleSkipPassword = () => {
    setShowPasswordModal(false);
    navigate('/');
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-title">Synthia</h1>
        <p className="login-subtitle">AI写真生成平台</p>

        <div className="login-type-tabs">
          <button
            className={`login-type-tab ${loginType === 'code' ? 'active' : ''}`}
            onClick={() => {
              setLoginType('code');
              setError('');
              setPassword('');
            }}
          >
            验证码登录
          </button>
          <button
            className={`login-type-tab ${loginType === 'password' ? 'active' : ''}`}
            onClick={() => {
              setLoginType('password');
              setError('');
              setCode('');
            }}
          >
            密码登录
          </button>
        </div>

        {loginType === 'code' ? (
          <form onSubmit={handleCodeLogin} className="login-form">
            <div className="form-group">
              <label>手机号</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入手机号"
                maxLength="11"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>验证码</label>
              <div className="code-input-group">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="请输入验证码"
                  maxLength="6"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={countdown > 0 || loading || phone.length !== 11}
                  className="send-code-btn"
                >
                  {countdown > 0 ? `${countdown}s` : '发送验证码'}
                </button>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? '登录中...' : '登录 / 注册'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordLogin} className="login-form">
            <div className="form-group">
              <label>手机号</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入手机号"
                maxLength="11"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                disabled={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        )}

        <p className="login-hint">
          {loginType === 'code' ? '首次登录将自动注册账号' : '仅限已设置密码的用户'}
        </p>
      </div>

      {showPasswordModal && (
        <div className="password-modal-overlay">
          <div className="password-modal">
            <h2>设置密码</h2>
            <p className="password-modal-hint">
              为了您的账户安全，建议设置登录密码
            </p>
            
            <div className="form-group">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入密码（至少6位）"
              />
            </div>
            
            <div className="form-group">
              <label>确认密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
              />
            </div>

            {passwordError && <div className="error-message">{passwordError}</div>}

            <div className="password-modal-actions">
              <button className="skip-btn" onClick={handleSkipPassword}>
                跳过
              </button>
              <button className="confirm-btn" onClick={handleSetPassword}>
                确认设置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
