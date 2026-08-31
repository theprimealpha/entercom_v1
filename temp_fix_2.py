import sys

file_path = "mobile/app/(screens)/request/[id].tsx"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# find where fetchRequest starts and ends
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "const fetchRequest = useCallback(async () => {" in line:
        start_idx = i
    if start_idx != -1 and i > start_idx and "}, [id]);" in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    fetch_block = lines[start_idx:end_idx+1]
    # remove it
    del lines[start_idx:end_idx+1]
    
    # find where to insert it (after state declarations)
    insert_idx = -1
    for i, line in enumerate(lines):
        if "const [verifying, setVerifying]" in line:
            insert_idx = i - 1
            break
            
    if insert_idx != -1:
        lines.insert(insert_idx, "".join(fetch_block) + "\n")
        
with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(lines)
print("SUCCESS")
