import sys

# 1. explore.tsx
file_path = "mobile/app/(drawer)/(tabs)/explore.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("item.image_url", "(item as any).image_url")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 2. chat/index.tsx
file_path = "mobile/app/(screens)/chat/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("data?.results", "(data as any)?.results")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 3. quotes/index.tsx
file_path = "mobile/app/(screens)/quotes/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace(".filter((r) =>", ".filter((r: any) =>")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 4. _layout.tsx
file_path = "mobile/app/_layout.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace(
    "shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true", 
    "shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true"
)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
