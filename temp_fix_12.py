import sys

file_path = "web/entercom/src/features/portal/manager/requests/ManagerRequestDetail.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    """                  ensureArray(timeline).map((event: any) => ({
                    to_state: event.to_state || event.status,""",
    """                  ensureArray(timeline).map((event: any) => ({
                    type: event.type,
                    to_state: event.to_state || event.new_state || event.status,"""
)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
