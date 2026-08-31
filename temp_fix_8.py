import sys

file_path = "mobile/app/(screens)/quotes/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(".filter((r) =>", ".filter((r: any) =>")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
