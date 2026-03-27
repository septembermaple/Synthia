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
    console.log('发送验证码到手机:', phone);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { success: true, message: '验证码已发送' };
  };

  const login = async (phone, code) => {
    const userData = {
      phone,
      id: Date.now(),
      createdAt: new Date().toISOString()
    };
    setUser(userData);
    localStorage.setItem('synthia_user', JSON.stringify(userData));
    return userData;
  };

  const register = async (phone, code) => {
    const userData = {
      phone,
      id: Date.now(),
      createdAt: new Date().toISOString()
    };
    setUser(userData);
    localStorage.setItem('synthia_user', JSON.stringify(userData));
    return userData;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('synthia_user');
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      register,
      logout,
      sendVerificationCode,
      loading
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
