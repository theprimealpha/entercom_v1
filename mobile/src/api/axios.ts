import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://entercomv1-production.up.railway.app';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
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
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
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
            return apiClient({ ...originalRequest, baseURL: undefined });
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;

      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
      
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, {
          refresh: refreshToken,
        });

        await AsyncStorage.setItem('access_token', data.access);
        if (data.refresh) {
          await AsyncStorage.setItem('refresh_token', data.refresh);
        }

        apiClient.defaults.headers.common.Authorization = `Bearer ${data.access}`;
        originalRequest.headers.Authorization = `Bearer ${data.access}`;

        processQueue(null, data.access);
        return apiClient({ ...originalRequest, baseURL: undefined });
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        await AsyncStorage.removeItem('access_token');
        await AsyncStorage.removeItem('refresh_token');
        router.replace('/login');
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
