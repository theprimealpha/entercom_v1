import sys

file_path = "web/entercom/src/api/requests.ts"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# We need to change submit_verification to accept a FormData object OR we can build the FormData here.
# Let's change the parameter to accept `payload: any` and if it has files, we'll build FormData.
new_func = """  submit_verification: async (id: string, payload: { photos: File[], notes?: string, checklist?: any, customer_ack?: boolean }) => {
    const formData = new FormData();
    if (payload.notes) formData.append('notes', payload.notes);
    if (payload.checklist) formData.append('checklist', JSON.stringify(payload.checklist));
    if (payload.customer_ack !== undefined) formData.append('customer_ack', String(payload.customer_ack));
    if (payload.photos && payload.photos.length > 0) {
      payload.photos.forEach(photo => formData.append('photos', photo));
    }
    
    const { data } = await apiClient.post(`/requests/${id}/verify/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return normalizeData(data);
  },"""

text = text.replace(
    """  submit_verification: async (id: string, payload: { photos: string[], notes?: string, checklist?: any, customer_ack?: boolean }) => {
    const { data } = await apiClient.post(`/requests/${id}/verify/`, payload);
    return normalizeData(data);
  },""",
    new_func
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS")
