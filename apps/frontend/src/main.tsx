import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './app/routes';
import './app/globals.css';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen p-6 text-foreground">
          <h1 className="text-xl font-semibold">Unable to load this page</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message || 'An unexpected application error occurred.'}
          </p>
          <button
            type="button"
            className="mt-4 rounded-md border px-3 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <AppRoutes />
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
