import sys

file_path = "web/entercom/src/api/axios.ts"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    "if (error.response?.status === 401 && !originalRequest._retry) {",
    "if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/login/') {"
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
