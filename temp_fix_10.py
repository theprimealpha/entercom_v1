import sys

# 1. explore.tsx -> use (item as any).image_url
file_path = "mobile/app/(drawer)/(tabs)/explore.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("item.image_url", "(item as any).image_url")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 2. index.tsx -> use (user as any).profile_image
file_path = "mobile/app/(drawer)/(tabs)/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("user?.profile_image", "(user as any)?.profile_image")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 3. profile.tsx -> use (user as any).profile_image
file_path = "mobile/app/(drawer)/(tabs)/profile.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("user?.profile_image", "(user as any)?.profile_image")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 4. requests.tsx -> leftIcon in InputProps
file_path = "mobile/src/components/ui/Input.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
if "leftIcon" not in text:
    text = text.replace("error?: string;", "error?: string;\n  leftIcon?: React.ReactNode;")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 5. chat/index.tsx -> results on never
file_path = "mobile/app/(screens)/chat/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()
text = text.replace("data?.results", "(data as any)?.results")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

# 6. _layout.tsx -> shouldShowBanner, shouldShowList
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
