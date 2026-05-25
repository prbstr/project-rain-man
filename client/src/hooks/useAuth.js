import { useState, useEffect, useCallback } from 'react';
import client from '../api/client.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore session from refreshToken on mount
  useEffect(() => {
    const restoreSession = async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await client.post('/auth/refresh', { refreshToken });
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data;
        localStorage.setItem('accessToken', newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem('refreshToken', newRefreshToken);
        }
        setAccessToken(newAccessToken);

        // Fetch user info
        const userRes = await client.get('/api/me');
        setUser(userRes.data);
      } catch (err) {
        console.error('Session restore failed:', err.message);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const res = await client.post('/auth/login', { email, password });
      const { accessToken: newAccessToken, refreshToken } = res.data;
      
      localStorage.setItem('accessToken', newAccessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setAccessToken(newAccessToken);

      // Fetch user info
      const userRes = await client.get('/api/me');
      setUser(userRes.data);

      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const register = useCallback(async (email, username, password) => {
    setError(null);
    try {
      const res = await client.post('/auth/register', {
        email,
        username,
        password,
      });
      const { accessToken: newAccessToken, refreshToken } = res.data;
      
      localStorage.setItem('accessToken', newAccessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setAccessToken(newAccessToken);

      // Fetch user info
      const userRes = await client.get('/api/me');
      setUser(userRes.data);

      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) {
        await client.post('/auth/logout', { refreshToken });
      }
    } catch (err) {
      console.error('Logout error:', err.message);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return {
    user,
    accessToken,
    isAuthenticated: !!user && !!accessToken,
    isLoading,
    error,
    login,
    register,
    logout,
  };
}
