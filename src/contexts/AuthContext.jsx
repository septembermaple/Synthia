import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAdmin = async () => {
    try {
      const r = await api.adminMe();
      setIsAdmin(!!r?.isAdmin);
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    api.getCurrentUser()
      .then(userData => {
        setUser(userData);
        if (userData) checkAdmin();
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const refreshUser = async () => {
    try {
      const userData = await api.getCurrentUser();
      setUser(userData);
      return userData;
    } catch {
      return null;
    }
  };

  const sendVerificationCode = async () => {
    return { success: true, message: '验证码已发送（占位，未接短信服务）' };
  };

  const persistTokens = (data) => {
    if (data?.token) api.setToken(data.token);
    if (data?.refreshToken) api.setRefreshToken(data.refreshToken);
  };

  const login = async (phone, code) => {
    const data = await api.login(phone, code);
    persistTokens(data);
    if (data?.user) {
      setUser(data.user);
      checkAdmin();
    }
    return data;
  };

  const loginWithPassword = async (phone, password) => {
    const data = await api.loginWithPassword(phone, password);
    persistTokens(data);
    if (data?.success && data.user) {
      setUser(data.user);
      checkAdmin();
    }
    return data;
  };

  const checkUserExists = () => {
    return { exists: false, hasPassword: false };
  };

  const register = async (phone, code) => {
    return login(phone, code);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    setUser(null);
    setIsAdmin(false);
  };

  const updatePassword = async (oldPassword, newPassword) => {
    if (!user) return { success: false, message: '未登录' };
    try {
      const result = await api.updatePassword(oldPassword, newPassword);
      if (result?.token) api.setToken(result.token);
      if (result?.refreshToken) api.setRefreshToken(result.refreshToken);
      return result;
    } catch (error) {
      return { success: false, message: error.message || '密码修改失败' };
    }
  };

  const addPoints = async (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    try {
      const result = await api.addPoints(amount, description);
      if (result?.success) {
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
      if (result?.success) {
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

  const deleteAccount = async (password, confirm) => {
    if (!user) return { success: false, message: '未登录' };
    try {
      const result = await api.deleteAccount(password, confirm);
      if (result?.success) {
        api.setToken(null);
        api.setRefreshToken(null);
        setUser(null);
        setIsAdmin(false);
      }
      return result;
    } catch (error) {
      return { success: false, message: error.message || '注销失败' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin,
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
      deleteGenerationRecord,
      deleteAccount,
      refreshUser
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
