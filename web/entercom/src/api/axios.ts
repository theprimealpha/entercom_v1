import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

const ENV_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const BASE_URL = ENV_URL.replace(/\/+$/, '');

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login/') {
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = 'Bearer ' + token;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
      
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });

        localStorage.setItem('access_token', data.access);
        if (data.refresh) {
          localStorage.setItem('refresh_token', data.refresh);
        }

        apiClient.defaults.headers.common.Authorization = `Bearer ${data.access}`;
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        
        window.dispatchEvent(new CustomEvent('token_refreshed', { detail: data.access }));

        processQueue(null, data.access);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.data) {
      const data = error.response.data as any;
      if (data.errors && typeof data.errors === 'object') {
        const formattedErrors = Object.entries(data.errors)
          .map(([key, value]) => {
            if (Array.isArray(value)) return `${key}: ${value.join(', ')}`;
            return `${key}: ${value}`;
          })
          .join(' | ');
        error.message = formattedErrors || data.message || error.message;
      } else if (data.message) {
        error.message = data.message;
      } else if (data.detail) {
        error.message = data.detail;
      } else if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
          // generic fallback for nested errors without an explicit 'errors' key
          const genericErrors = Object.entries(data)
              .filter(([k]) => k !== 'success')
              .map(([k, v]) => {
                 if (Array.isArray(v)) return `${k}: ${v.join(', ')}`;
                 return `${k}: ${v}`;
              }).join(' | ');
          if (genericErrors) {
              error.message = genericErrors;
          }
      }
    }

    return Promise.reject(error);
  }
);
