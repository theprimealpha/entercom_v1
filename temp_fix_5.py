import sys

file_path = "mobile/app/(screens)/quotes/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace("import { quoteApi, QuoteItem } from '../../../src/api/quotes';", "import { requestsApi } from '../../../src/api/requests';")
text = text.replace("quoteApi.list()", "requestsApi.quotes.list('')") # Wait, does quoteApi.list() take no args?
text = text.replace("r: any", "r: string | undefined")
with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
