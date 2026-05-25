import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import client, { refreshSession, setAccessToken as setAxiosToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const restoreStarted = useRef(false);

  // Keep Axios token in sync with React state
  const storeToken = useCallback((token) => {
    setAxiosToken(token);
    setAccessToken(token);
  }, []);

  // Restore session on mount
  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;

    (async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) { setIsLoading(false); return; }
      try {
        const { accessToken: newToken } = await refreshSession();
        storeToken(newToken);
        const { data } = await client.get('/api/me');
        setUser(data);
      } catch {
        localStorage.removeItem('refreshToken');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [storeToken]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await client.post('/auth/login', { email, password });
      localStorage.setItem('refreshToken', data.refreshToken);
      storeToken(data.accessToken);
      const { data: userData } = await client.get('/api/me');
      setUser(userData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  }, [storeToken]);

  const register = useCallback(async (email, username, password) => {
    try {
      const { data } = await client.post('/auth/register', { email, username, password });
      localStorage.setItem('refreshToken', data.refreshToken);
      storeToken(data.accessToken);
      const { data: userData } = await client.get('/api/me');
      setUser(userData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  }, [storeToken]);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) await client.post('/auth/logout', { refreshToken });
    } catch { /* swallow */ } finally {
      localStorage.removeItem('refreshToken');
      storeToken(null);
      setUser(null);
    }
  }, [storeToken]);

  return (
    <AuthContext.Provider value={{
      user,
      accessToken,
      isAuthenticated: !!user && !!accessToken,
      isLoading,
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
