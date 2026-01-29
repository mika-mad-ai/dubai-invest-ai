
import React, { Component, ReactNode, ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Fix: Explicitly extending Component and declaring the state property 
 * ensures that TypeScript correctly inherits and recognizes members like 'state' and 'props'.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Fix: Explicit property declaration for state ensures it's found on the type in all contexts
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Application Error:", error, errorInfo);
  }

  public render() {
    // Fix: 'state' is now correctly recognized as an inherited member of the class
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'serif', color: '#e2e8f0', backgroundColor: '#020617', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{color: '#d4af37', marginBottom: '1rem'}}>Une erreur est survenue.</h1>
          <p style={{marginBottom: '2rem'}}>Veuillez rafraîchir la page.</p>
          <pre style={{ background: '#0f172a', padding: '1rem', borderRadius: '4px', border: '1px solid #334155', color: '#94a3b8' }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    // Fix: 'props' is now correctly recognized as an inherited member of the class
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
