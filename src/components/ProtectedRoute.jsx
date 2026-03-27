import React from 'react';
import { useAuth } from '../contexts/AuthContext';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return React.cloneElement(children, { requireAuth: true });
  }

  return children;
}

export default ProtectedRoute;
