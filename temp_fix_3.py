import sys

file_path = "mobile/src/api/requests.ts"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

if "requires_technician" not in text:
    text = text.replace(
        "created_at?: string;", 
        "created_at?: string;\n  requires_technician?: boolean;"
    )
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(text)

print("SUCCESS")
