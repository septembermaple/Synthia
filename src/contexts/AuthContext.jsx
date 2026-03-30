import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('synthia_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const sendVerificationCode = async (phone) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true, message: '验证码已发送' };
  };

  const login = async (phone, code) => {
    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    let existingUser = savedUsers.find(u => u.phone === phone);
    
    if (!existingUser) {
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
    return userData;
  };

  const register = async (phone, code) => {
    return login(phone, code);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('synthia_user');
  };

  const updatePassword = (oldPassword, newPassword) => {
    if (!user) return { success: false, message: '未登录' };
    
    if (user.password && user.password !== oldPassword) {
      return { success: false, message: '原密码错误' };
    }
    
    const updatedUser = { ...user, password: newPassword };
    setUser(updatedUser);
    localStorage.setItem('synthia_user', JSON.stringify(updatedUser));
    
    const savedUsers = JSON.parse(localStorage.getItem('synthia_users') || '[]');
    const userIndex = savedUsers.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      savedUsers[userIndex] = updatedUser;
      localStorage.setItem('synthia_users', JSON.stringify(savedUsers));
    }
    
    return { success: true, message: '密码修改成功' };
  };

  const addPoints = (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    
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

  const consumePoints = (amount, description) => {
    if (!user) return { success: false, message: '未登录' };
    
    if (user.points < amount) {
      return { success: false, message: '积分不足' };
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

  const getTransactions = (limit = 20) => {
    if (!user) return [];
    const transactions = JSON.parse(localStorage.getItem('synthia_transactions') || '[]');
    return transactions.filter(t => t.userId === user.id).slice(0, limit);
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      register,
      logout,
      sendVerificationCode,
      loading,
      updatePassword,
      addPoints,
      consumePoints,
      getTransactions
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
