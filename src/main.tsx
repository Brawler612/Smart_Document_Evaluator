import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class RootErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }

  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('[root]', e, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>App failed to start</h1>
          <p style={{ color: '#666', fontSize: 14 }}>{this.state.err.message}</p>
          <p style={{ color: '#999', fontSize: 12, marginTop: 16 }}>Open DevTools (F12) → Console for the full stack trace.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
