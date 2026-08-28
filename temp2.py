import sys
import glob

files = [
    "web/entercom/src/features/portal/customer/requests/RequestDetail.tsx",
    "web/entercom/src/features/portal/manager/requests/ManagerRequestDetail.tsx",
    "web/entercom/src/features/portal/staff/requests/StaffRequestDetail.tsx"
]

for file_path in files:
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()

    text = text.replace("event.state_to || event.status", "event.to_state || event.new_state || event.status")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(text)

print("SUCCESS")
