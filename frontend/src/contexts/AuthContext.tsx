import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../services/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface RegisterResult {
  requiresEmailVerification: boolean;
  message: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<RegisterResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'auth_tokens';

interface StoredTokens {
  access_token: string;
  refresh_token: string;
}

function getStoredTokens(): StoredTokens | null {
  const tokens = localStorage.getItem(TOKEN_KEY);
  return tokens ? JSON.parse(tokens) : null;
}

function setStoredTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

function clearStoredTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const tokens = getStoredTokens();
      if (tokens) {
        try {
          const userData = await authApi.getMe(tokens.access_token);
          setUser(userData);
        } catch {
          try {
            const newTokens = await authApi.refresh(tokens.refresh_token);
            setStoredTokens(newTokens);
            const userData = await authApi.getMe(newTokens.access_token);
            setUser(userData);
          } catch {
            clearStoredTokens();
          }
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    setStoredTokens({
      access_token: response.access_token,
      refresh_token: response.refresh_token,
    });
    setUser(response.user);
  };

  const register = async (email: string, password: string, name: string): Promise<RegisterResult> => {
    const response = await authApi.register(email, password, name);

    // 이메일 인증이 필요하지 않은 경우에만 토큰 저장
    if (!response.requires_email_verification && response.access_token && response.refresh_token) {
      setStoredTokens({
        access_token: response.access_token,
        refresh_token: response.refresh_token,
      });
      setUser(response.user);
    }

    return {
      requiresEmailVerification: response.requires_email_verification,
      message: response.message,
    };
  };

  const logout = () => {
    clearStoredTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
