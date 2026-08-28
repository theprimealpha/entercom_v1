import sys

with open('web/entercom/src/features/portal/customer/requests/RequestDetail.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

block_to_move = """  const activeQuote = (Array.isArray(quotes) ? quotes : quotes?.data || [])?.find(
    (q: any) => ['issued', 'approved', 'partially_paid'].includes(q.status)
  );

  const initPaymentMutation = useMutation({
    mutationFn: (plan: string) => paymentsApi.initializeQuotePayment({ quote_id: activeQuote?.id, payment_plan: plan }),
    onSuccess: (data: any) => {
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    },
    onError: (err: any) => window.showAppAlert(err.response?.data?.message || 'Payment failed to initialize', 'error'),
  });"""

insert_marker = "  if (isLoading) {"
replacement_text = block_to_move + "\n\n" + insert_marker

if block_to_move in text:
    new_text = text.replace(block_to_move, '')
    new_text = new_text.replace(insert_marker, replacement_text)
    
    with open('web/entercom/src/features/portal/customer/requests/RequestDetail.tsx', 'w', encoding='utf-8') as f:
        f.write(new_text)
    print('SUCCESS')
else:
    print('BLOCK NOT FOUND')
