import sys

file_path = "mobile/app/(screens)/request/[id].tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

target = "requestsApi.timeline(id).catch(() => []), // timeline may not exist for all requests\n      ]);"
replacement = "requestsApi.timeline(id).catch(() => []), // timeline may not exist for all requests\n        requestsApi.quotes.list(id as string).catch(() => []),\n      ]);"
if target in text:
    text = text.replace(target, replacement)
else:
    print("TARGET 1 NOT FOUND")
    target2 = "requestsApi.timeline(id).catch(() => []),\n      ]);"
    if target2 in text:
        text = text.replace(target2, replacement)
    else:
        print("TARGET 2 NOT FOUND")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)
print("SUCCESS")
