import sys

filepath = 'web/entercom/src/features/portal/customer/requests/RequestDetail.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Move hooks to the top
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
else:
    new_text = text

# 2. Fix the wording for partially_paid
new_text = new_text.replace(
    '<h3 className="font-semibold text-lg mb-1">Pay in Full</h3>',
    '<h3 className="font-semibold text-lg mb-1">{activeQuote.status === \'partially_paid\' ? \'Pay Remaining Balance\' : \'Pay in Full\'}</h3>'
)

new_text = new_text.replace(
    '<p className="text-sm text-gray-500 mb-4">Settle the entire balance now.</p>',
    '<p className="text-sm text-gray-500 mb-4">{activeQuote.status === \'partially_paid\' ? \'Settle the final half of the quote.\' : \'Settle the entire balance now.\'}</p>'
)

new_text = new_text.replace(
    "{initPaymentMutation.isPending ? 'Processing...' : 'Pay in Full'}",
    "{initPaymentMutation.isPending ? 'Processing...' : (activeQuote.status === 'partially_paid' ? 'Pay Balance' : 'Pay in Full')}"
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_text)

print('SUCCESS')
