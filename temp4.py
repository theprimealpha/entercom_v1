import sys

file_path = "mobile/app/(screens)/request/[id].tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Add quotes state
text = text.replace(
    "const [timeline, setTimeline] = useState<any[]>([]);",
    "const [timeline, setTimeline] = useState<any[]>([]);\n  const [quotes, setQuotes] = useState<any[]>([]);"
)

# 2. Fetch quotes in fetchRequest
text = text.replace(
    "requestsApi.timeline(id).catch(() => []), // timeline may not exist for all requests\n        ]);",
    "requestsApi.timeline(id).catch(() => []),\n          requestsApi.quotes.list(id).catch(() => []),\n        ]);"
)
text = text.replace(
    "const [requestData, timelineData] = await Promise.all([",
    "const [requestData, timelineData, quotesData] = await Promise.all(["
)
text = text.replace(
    "setTimeline(Array.isArray(timelineData) ? timelineData : []);",
    "setTimeline(Array.isArray(timelineData) ? timelineData : []);\n      setQuotes(Array.isArray(quotesData) ? quotesData : quotesData?.data || []);"
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)
print("SUCCESS")
