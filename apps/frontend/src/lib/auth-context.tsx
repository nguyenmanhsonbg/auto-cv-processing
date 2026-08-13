import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { User } from '@interview-assistant/shared';

interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const setUserCb = useCallback((u: User | null) => setUser(u), []);
  const contextValue = useMemo(() => ({ user, setUser: setUserCb }), [user, setUserCb]);
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
