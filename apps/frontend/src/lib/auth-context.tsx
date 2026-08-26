import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { User } from '@interview-assistant/shared';
import { apiClient, ApiError } from '@/lib/api-client';

export type AuthState = 'loading' | 'ready' | 'unauthenticated' | 'error';

interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  authState: AuthState;
}

interface EvaluationHandoffRequest {
  handoffToken: string;
  applicationId: string;
}

interface EvaluationHandoffSession {
  key: string;
  promise: Promise<User>;
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
  const evaluationHandoffRef = useRef<EvaluationHandoffSession | null>(null);

  useEffect(() => {
    let isActive = true;
    const handoff = readEvaluationHandoffRequest();

    const resolveHandoff = (handoffPromise: Promise<User>) => {
      handoffPromise
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
    };

    if (handoff) {
      const handoffKey = `${handoff.applicationId}:${handoff.handoffToken}`;
      removeEvaluationHandoffFromUrl();
      if (!evaluationHandoffRef.current || evaluationHandoffRef.current.key !== handoffKey) {
        apiClient.clearTokens();
        evaluationHandoffRef.current = {
          key: handoffKey,
          promise: apiClient.exchangeEvaluationHandoff(handoff.handoffToken, handoff.applicationId)
            .then((auth) => {
              apiClient.setTokens(auth);
              return apiClient.get<User>('/auth/me');
            }),
        };
      }
      resolveHandoff(evaluationHandoffRef.current.promise);

      return () => {
        isActive = false;
      };
    }

    if (evaluationHandoffRef.current) {
      resolveHandoff(evaluationHandoffRef.current.promise);

      return () => {
        isActive = false;
      };
    }

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

function readEvaluationHandoffRequest(): EvaluationHandoffRequest | null {
  const params = new URLSearchParams(window.location.search);
  const handoffToken = params.get('handoff');
  if (!handoffToken) return null;

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  if (pathSegments.length !== 2 || pathSegments[0] !== 'interview-evaluations') return null;

  try {
    return {
      handoffToken,
      applicationId: decodeURIComponent(pathSegments[1]),
    };
  } catch {
    return null;
  }
}

function removeEvaluationHandoffFromUrl() {
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.hash}`);
}

export function useAuthContext() {
  return useContext(AuthContext);
}
