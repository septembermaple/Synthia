import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      console.error('ErrorBoundary captured:', error, info);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          color: 'inherit',
        }}
      >
        <h2>页面出现异常</h2>
        <p style={{ opacity: 0.7, maxWidth: 480 }}>
          抱歉，页面渲染出错。您可以尝试刷新；如反复出现，请联系平台支持。
        </p>
        <button
          onClick={this.handleReload}
          style={{
            padding: '10px 20px',
            background: '#6c5ce7',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          刷新页面
        </button>
      </div>
    );
  }
}
