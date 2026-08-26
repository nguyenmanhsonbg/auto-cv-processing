import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { User } from '@interview-assistant/shared';
import { apiClient, ApiError } from '@/lib/api-client';

export type AuthState = 'loading' | 'ready' | 'unauthenticated' | 'error';

interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  authState: AuthState;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  authState: 'loading',
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const setUserCb = useCallback((u: User | null) => setUser(u), []);

  useEffect(() => {
    let isActive = true;
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!token && !refreshToken) {
      apiClient.clearTokens();
      setUser(null);
      setAuthState('unauthenticated');
      return () => {
        isActive = false;
      };
    }

    apiClient.setToken(token);
    apiClient.setRefreshToken(refreshToken);
    apiClient.get<User>('/auth/me')
      .then((resolvedUser) => {
        if (!isActive) return;
        setUser(resolvedUser);
        setAuthState('ready');
      })
      .catch((error) => {
        if (!isActive) return;

        if (error instanceof ApiError && error.status === 401) {
          apiClient.clearTokens();
          setUser(null);
          setAuthState('unauthenticated');
          return;
        }

        setAuthState('error');
      });

    return () => {
      isActive = false;
    };
  }, [setUserCb]);

  const contextValue = useMemo(
    () => ({ user, setUser: setUserCb, authState }),
    [authState, setUserCb, user],
  );
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
