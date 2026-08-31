import sys

files = ["mobile/app/(screens)/quotes/[id].tsx", "mobile/app/(screens)/request/[id].tsx"]
for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()
    
    text = text.replace("onPress: async (reason) => {", "onPress: async (reason: string | undefined) => {")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(text)

print("SUCCESS")
