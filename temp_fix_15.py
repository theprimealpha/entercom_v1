import sys

file_path = "mobile/src/api/axios.ts"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# Fix 1: Exclude /auth/login/
text = text.replace(
    "if (error.response?.status === 401 && !originalRequest._retry) {",
    "if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login/') {"
)

# Fix 2: Move isRefreshing = true
text = text.replace(
    """      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }""",
    """      originalRequest._retry = true;

      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
      
      isRefreshing = true;"""
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
