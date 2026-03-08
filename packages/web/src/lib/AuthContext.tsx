import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, fetchCurrentUser } from '@web/lib/apiClient';
import type { RegisterInput } from '@scythe/shared';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  cemeteryId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterInput) => Promise<{ cemeterySlug: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('scythe_token');
    if (!token) {
      setLoading(false);
      return;
    }

    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('scythe_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    localStorage.setItem('scythe_token', response.token);
    setUser(response.user);
  }, []);

  const registerUser = useCallback(async (data: RegisterInput) => {
    const response = await apiRegister(data);
    localStorage.setItem('scythe_token', response.token);
    setUser(response.user);
    return { cemeterySlug: response.cemetery.slug };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('scythe_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register: registerUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
