import { createContext, useContext, useState, useCallback } from 'react';
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
  return (
    <AuthContext.Provider value={{ user, setUser: setUserCb }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
