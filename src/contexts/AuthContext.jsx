import React, { createContext, useContext, useState, useEffect } from 'react';
import config from '../config';
import api from '../services/api';

const AuthContext = createContext(null);

const initializeTestAccounts = () => {
  if (config.useAPI) return;
  
  const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
  
  const testAccounts = [
    { phone: '13111111111', password: 'Admin123456', id: 1001, createdAt: new Date().toISOString(), points: 100 },
    { phone: '13222222222', password: 'Admin123456', id: 1002, createdAt: new Date().toISOString(), points: 100 },
    { phone: '13333333333', password: 'Admin123456', id: 1003, createdAt: new Date().toISOString(), points: 100 }
  ];
  
  testAccounts.forEach(account => {
    if (!savedUsers.find(u => u.phone === account.phone)) {
      savedUsers.push(account);
    }
  });
  
  localStorage.setItem('synthia_users', JSON.stringify(savedUsers));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeTestAccounts();
    
    const savedUser = localStorage.getItem('synthia_user');
    if (savedUser) {
      let userData = JSON.parse(savedUser);
      
      if (!config.useAPI && userData.points === undefined) {
        const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
        const existingUser = savedUsers.find(u => u.id === userData.id);
        
        if (existingUser && existingUser.points !== undefined) {
          userData.points = existingUser.points;
        } else {
          userData.points = 100;
        }
        
        localStorage.setItem('synthia_user', JSON.stringify(userData));
      }
      
      setUser(userData);
    }
    setLoading(false);
  }, []);

  const sendVerificationCode = async (phone) => {
    if (config.useAPI) {
      return { success: true, message: '验证码已发送' };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true, message: '验证码已发送' };
  };

  const login = async (phone, code) => {
    if (config.useAPI) {
      const data = await api.login(phone, code);
      if (data.user) {
        setUser(data.user);
      }
      return data;
    }

    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    let existingUser = savedUsers.find(u => u.phone === phone);
    let isNewUser = false;
    
    if (!existingUser) {
      isNewUser = true;
      existingUser = {
        phone,
        id: Date.now(),
        createdAt: new Date().toISOString(),
        points: 100,
        password: ''
      };
      savedUsers.push(existingUser);
      localStorage.setItem('synthia_users', JSON.stringify(savedUsers));
    }
    
    const userData = {
      phone: existingUser.phone,
      id: existingUser.id,
      createdAt: existingUser.createdAt,
      points: existingUser.points,
      password: existingUser.password
    };
    
    setUser(userData);
    localStorage.setItem('synthia_user', JSON.stringify(userData));
    
    return {
      ...userData,
      isNewUser,
      hasPassword: !!existingUser.password
    };
  };

  const loginWithPassword = async (phone, password) => {
    if (config.useAPI) {
      const data = await api.loginWithPassword(phone, password);
      if (data.success && data.user) {
        setUser(data.user);
      }
      return data;
    }

    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    const existingUser = savedUsers.find(u => u.phone === phone);
    
    if (!existingUser) {
      return { success: false, message: '用户不存在' };
    }
    
    if (!existingUser.password) {
      return { success: false, message: '该用户未设置密码，请使用验证码登录' };
    }
    
    if (existingUser.password !== password) {
      return { success: false, message: '密码错误' };
    }
    
    const userData = {
      phone: existingUser.phone,
      id: existingUser.id,
      createdAt: existingUser.createdAt,
      points: existingUser.points,
      password: existingUser.password
    };
    
    setUser(userData);
    localStorage.setItem('synthia_user', JSON.stringify(userData));
    
    return { success: true, user: userData };
  };

  const checkUserExists = (phone) => {
    if (config.useAPI) {
      return { exists: false, hasPassword: false };
    }
    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    const existingUser = savedUsers.find(u => u.phone === phone);
    return {
      exists: !!existingUser,
      hasPassword: existingUser ? !!existingUser.password : false
    };
  };

  const register = async (phone, code) => {
    return login(phone, code);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('synthia_user');
    if (config.useAPI) {
      api.logout();
    }
  };

  const updatePassword = (oldPassword, newPassword) => {
    if (!user) return { success: false, message: '未登录' };
    
    if (user.password && user.password !== oldPassword) {
      return { success: false, message: '原密码错误' };
    }
    
    const updatedUser = { ...user, password: newPassword };
    setUser(updatedUser);
    localStorage.setItem('synthia_user', JSON.stringify(updatedUser));
    
    if (!config.useAPI) {
      const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
      const userIndex = savedUsers.findIndex(u => u.id === user.id);
      if (userIndex !== -1) {
        savedUsers[userIndex] = updatedUser;
        localStorage.setItem('synthia_users', JSON.stringify(savedUsers));
      }
    } else {
      api.updatePassword(oldPassword, newPassword);
    }
    
    return { success: true, message: '密码修改成功' };
  };

  const addPoints = async (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    
    if (config.useAPI) {
      const result = await api.addPoints(amount, description);
      if (result.success) {
        setUser({ ...user, points: result.points });
      }
      return result;
    }
    
    const newPoints = user.points + amount;
    const updatedUser = { ...user, points: newPoints };
    setUser(updatedUser);
    localStorage.setItem('synthia_user', JSON.stringify(updatedUser));
    
    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    const userIndex = savedUsers.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      savedUsers[userIndex] = updatedUser;
      localStorage.setItem('synthia_users', JSON.stringify(savedUsers));
    }
    addTransaction(amount, '充值', description);
    
    return { success: true, message: `充值成功，当前积分：${newPoints}` };
  };

  const consumePoints = async (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    
    if (user.points < amount) {
      return { success: false, message: '积分不足' };
    }
    
    if (config.useAPI) {
      const result = await api.consumePoints(amount, description);
      if (result.success) {
        setUser({ ...user, points: result.points });
      }
      return result;
    }
    
    const newPoints = user.points - amount;
    const updatedUser = { ...user, points: newPoints };
    setUser(updatedUser);
    localStorage.setItem('synthia_user', JSON.stringify(updatedUser));
    
    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    const userIndex = savedUsers.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      savedUsers[userIndex] = updatedUser;
      localStorage.setItem('synthia_users', JSON.stringify(savedUsers));
    }
    addTransaction(-amount, '消费', description);
    
    return { success: true, message: `消费成功，剩余积分：${newPoints}` };
  };

  const addTransaction = (amount, type, description) => {
    const transactions = JSON.parse(localStorage.getItem('synthia_transactions') || '[]');
    const transaction = {
      id: Date.now(),
      userId: user.id,
      amount,
      type,
      description,
      balance: user.points + amount,
      createdAt: new Date().toISOString()
    };
    transactions.unshift(transaction);
    localStorage.setItem('synthia_transactions', JSON.stringify(transactions));
  };

  const getTransactions = async (limit = 20) => {
    if (!user) return [];
    
    if (config.useAPI) {
      return await api.getTransactions(limit);
    }
    
    const transactions = JSON.parse(localStorage.getItem('synthia_transactions') || '[]');
    return transactions.filter(t => t.userId === user.id).slice(0, limit);
  };

  const saveGenerationRecord = async (images, prompt, scene, imageCount) => {
    if (!user) return;
    
    if (config.useAPI) {
      return await api.saveGeneration(images, prompt, scene, imageCount);
    }
    
    const records = JSON.parse(localStorage.getItem('synthia_generations') || '[]');
    const record = {
      id: Date.now(),
      userId: user.id,
      images,
      prompt,
      scene,
      imageCount,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    records.unshift(record);
    
    const validRecords = records.filter(r => new Date(r.expiresAt) > new Date());
    localStorage.setItem('synthia_generations', JSON.stringify(validRecords));
    
    return record;
  };

  const getGenerationRecords = async () => {
    if (!user) return [];
    
    if (config.useAPI) {
      return await api.getGenerations();
    }
    
    const records = JSON.parse(localStorage.getItem('synthia_generations') || '[]');
    const validRecords = records
      .filter(r => r.userId === user.id && new Date(r.expiresAt) > new Date())
      .map(r => ({
        ...r,
        remainingTime: Math.max(0, new Date(r.expiresAt) - new Date())
      }));
    
    if (validRecords.length !== records.filter(r => r.userId === user.id).length) {
      const allRecords = records.filter(r => new Date(r.expiresAt) > new Date());
      localStorage.setItem('synthia_generations', JSON.stringify(allRecords));
    }
    
    return validRecords;
  };

  const deleteGenerationRecord = (recordId) => {
    if (!user) return;
    
    if (config.useAPI) {
      return;
    }
    
    const records = JSON.parse(localStorage.getItem('synthia_generations') || '[]');
    const filteredRecords = records.filter(r => r.id !== recordId);
    localStorage.setItem('synthia_generations', JSON.stringify(filteredRecords));
  };

  const markPromptAsUsed = async (promptId) => {
    if (!user) return;
    
    if (config.useAPI) {
      return await api.markPromptUsed(promptId);
    }
    
    const usedPrompts = JSON.parse(localStorage.getItem('synthia_used_prompts') || '{}');
    if (!usedPrompts[user.id]) {
      usedPrompts[user.id] = [];
    }
    if (!usedPrompts[user.id].includes(promptId)) {
      usedPrompts[user.id].push(promptId);
      localStorage.setItem('synthia_used_prompts', JSON.stringify(usedPrompts));
    }
  };

  const getUsedPromptIds = async () => {
    if (!user) return [];
    
    if (config.useAPI) {
      return await api.getUsedPrompts();
    }
    
    const usedPrompts = JSON.parse(localStorage.getItem('synthia_used_prompts') || '{}');
    return usedPrompts[user.id] || [];
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
      deleteGenerationRecord,
      markPromptAsUsed,
      getUsedPromptIds
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
