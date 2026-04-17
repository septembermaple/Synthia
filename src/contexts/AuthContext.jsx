import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCurrentUser()
      .then(userData => {
        setUser(userData);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const sendVerificationCode = async (phone) => {
    return { success: true, message: '验证码已发送' };
  };

  const login = async (phone, code) => {
    const data = await api.login(phone, code);
    if (data.user) {
      setUser(data.user);
    }
    return data;
  };

  const loginWithPassword = async (phone, password) => {
    const data = await api.loginWithPassword(phone, password);
    if (data.success && data.user) {
      setUser(data.user);
    }
    return data;
  };

  const checkUserExists = (phone) => {
    return { exists: false, hasPassword: false };
  };

  const register = async (phone, code) => {
    return login(phone, code);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  const updatePassword = async (oldPassword, newPassword) => {
    if (!user) return { success: false, message: '未登录' };
    
    try {
      return await api.updatePassword(oldPassword, newPassword);
    } catch (error) {
      return { success: false, message: error.message || '密码修改失败' };
    }
  };

  const addPoints = async (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    
    try {
      const result = await api.addPoints(amount, description);
      if (result.success) {
        setUser({ ...user, points: result.points });
      }
      return result;
    } catch (error) {
      return { success: false, message: error.message || '充值失败' };
    }
  };

  const consumePoints = async (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    
    if (user.points < amount) {
      return { success: false, message: '积分不足' };
    }
    
    try {
      const result = await api.consumePoints(amount, description);
      if (result.success) {
        setUser({ ...user, points: result.points });
      }
      return result;
    } catch (error) {
      return { success: false, message: error.message || '消费失败' };
    }
  };

  const getTransactions = async (limit = 20) => {
    if (!user) return [];
    return await api.getTransactions(limit);
  };

  const saveGenerationRecord = async (images, prompt, scene, imageCount) => {
    if (!user) return;
    return await api.saveGeneration(images, prompt, scene, imageCount);
  };

  const getGenerationRecords = async () => {
    if (!user) return [];
    return await api.getGenerations();
  };

  const deleteGenerationRecord = async (recordId) => {
    if (!user) return;
    return await api.deleteGeneration(recordId);
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      loginWithPassword,
      checkUserExists,
      register,
      logout,
      sendVerificationCode,
      loading,
      updatePassword,
      addPoints,
      consumePoints,
      getTransactions,
      saveGenerationRecord,
      getGenerationRecords,
      deleteGenerationRecord
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
