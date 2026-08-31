import sys

file_path = "web/entercom/src/api/axios.ts"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    """      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }""",
    """      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
      
      isRefreshing = true;"""
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
