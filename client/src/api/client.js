import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '';

// In-memory token store — set by AuthProvider, read by Axios interceptor
let _accessToken = null;
export function setAccessToken(token) { _accessToken = token; }
export function getAccessToken() { return _accessToken; }

const client = axios.create({
  baseURL,
  withCredentials: true,
});

// Single in-flight refresh (Strict Mode, mount + 401 interceptor, multiple tabs)
let refreshPromise = null;

// Flag to prevent infinite refresh loops on retried API calls
let isRefreshing = false;
let failedQueue = [];

export function refreshSession() {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    return Promise.reject(new Error('No refresh token'));
  }

  refreshPromise = client
    .post('/auth/refresh', { refreshToken })
    .then((res) => {
      const { accessToken, refreshToken: newRefreshToken } = res.data;
      localStorage.setItem('accessToken', accessToken);
      if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken);
      }
      return res.data;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor: attach access token
client.interceptors.request.use(
  (config) => {
    const token = _accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 with refresh
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const { config, response } = error;

    if (response?.status === 401 && !config._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            config.headers.Authorization = `Bearer ${token}`;
            return client(config);
          })
          .catch((err) => {
            // Redirect to login
            window.location.href = '/login';
            return Promise.reject(err);
          });
      }

      config._retry = true;
      isRefreshing = true;

      return refreshSession()
        .then(({ accessToken: newAccessToken }) => {
          config.headers.Authorization = `Bearer ${newAccessToken}`;
          processQueue(null, newAccessToken);
          return client(config);
        })
        .catch((err) => {
          processQueue(err, null);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(err);
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    return Promise.reject(error);
  }
);

export default client;
