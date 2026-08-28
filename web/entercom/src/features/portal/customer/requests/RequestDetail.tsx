import { ensureArray } from '../../../../utils/arrays';
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsApi } from '../../../../api/requests';
import { paymentsApi } from '../../../../api/payments';
import { useWebsocket } from '../../../../hooks/useWebsocket';
import { PageContainer } from '../../../../shared/components/PageContainer';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import { Card, CardContent, ConfirmationDialog } from '../../../../shared/components/ui';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { StatusBadge } from '../../../../shared/components/ui/StatusBadge';
import { WorkflowBanner, WorkflowTimeline, WorkflowCard, resolveWorkflowState } from '../../../../shared/components/workflow';
import { useEffect } from 'react';

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCancelling, setIsCancelling] = useState(false);
  const [showReviseReason, setShowReviseReason] = useState(false);
  const [reviseReason, setReviseReason] = useState('');
  const { subscribeToRequest } = useWebsocket('requests');

  useEffect(() => {
    if (id) {
      subscribeToRequest(id);
    }
  }, [id, subscribeToRequest]);

  const { data: request, isLoading } = useQuery({
    queryKey: ['requests', id],
    queryFn: () => requestsApi.get(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ['requests', id, 'timeline'],
    queryFn: () => requestsApi.timeline(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: quotes } = useQuery({
    queryKey: ['requests', id, 'quotes'],
    queryFn: () => requestsApi.quotes.list(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const submitMutation = useMutation({
    mutationFn: () => requestsApi.submit(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    }
  });

  const cancelMutation = useMutation({
    mutationFn: () => requestsApi.cancel(id!, 'Cancelled by customer'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['requests', id] });
      const previousRequest = queryClient.getQueryData(['requests', id]);
      queryClient.setQueryData(['requests', id], (old: any) => {
        if (!old) return old;
        return { ...old, status: 'cancelled' };
      });
      return { previousRequest };
    },
    onError: (_err, _newTodo, context) => {
      queryClient.setQueryData(['requests', id], context?.previousRequest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      setIsCancelling(false);
      navigate(-1);
    }
  });

  const quoteActionMutation = useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject' | 'revise'; reason?: string }) =>
      requestsApi.quotes.action(id!, payload.action, payload.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] });
      queryClient.invalidateQueries({ queryKey: ['requests', id, 'quotes'] });
      setShowReviseReason(false);
      setReviseReason('');
    },
    onError: (err: any) => window.showAppAlert(err.response?.data?.message || 'Quote action failed', 'error'),
  });

  const activeQuote = (Array.isArray(quotes) ? quotes : quotes?.data || [])?.find(
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
  });

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-32 w-full rounded-xl mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6"><Skeleton className="h-64 w-full rounded-xl" /></div>
          <div><Skeleton className="h-96 w-full rounded-xl" /></div>
        </div>
      </PageContainer>
    );
  }

  if (!request) {
    return (
      <PageContainer>
        <div className="text-center py-12"><p>Request not found.</p></div>
      </PageContainer>
    );
  }



  const resolution = resolveWorkflowState(request, 'CUSTOMER');

  const handleWorkflowAction = (actionId: string) => {
    switch (actionId) {
      case 'submit':
        submitMutation.mutate();
        break;
      case 'pay_now':
        if (activeQuote) {
          document.getElementById('quote-payment')?.scrollIntoView({ behavior: 'smooth' });
        } else if (request.order_id && request.order_id !== 'null') {
          navigate(`/portal/customer/orders/${request.order_id}`);
        } else {
          window.showAppAlert('No order or quote has been generated for this payment yet.', 'info');
        }
        break;
      case 'review_quote':
        document.getElementById('quote-approval')?.scrollIntoView({ behavior: 'smooth' });
        break;
      default:
        console.log('Unhandled action:', actionId);
    }
  };

  return (
    <ErrorBoundary>
      <PageContainer>
        <div className="mb-6 flex items-center text-sm text-gray-500">
          <Link to="/portal/customer/requests" className="hover:text-ess-purple transition-colors">Requests</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{request.public_id || request.id.split('-')[0]}</span>
        </div>

        <WorkflowBanner 
          resolution={resolution} 
          onAction={handleWorkflowAction} 
          isProcessing={submitMutation.isPending || cancelMutation.isPending} 
        />

        <div className="flex justify-end mb-6">
          {request.status === 'cancelled' && (
            <button
              onClick={() => navigate('/portal/customer/requests/new')}
              className="px-4 py-2 text-sm font-medium text-white bg-ess-purple hover:bg-ess-darkPurple rounded-lg transition-colors shadow-sm"
            >
              Retry Request
            </button>
          )}

          {request.status !== 'completed' && request.status !== 'cancelled' && request.status !== 'draft' && (
            <button 
              onClick={() => setIsCancelling(true)}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              Cancel Request
            </button>
          )}
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            {/* Quote Action */}
            {request.status === 'awaiting_customer_approval' && activeQuote && (
              <div id="quote-approval" className="bg-ess-purple rounded-2xl shadow-sm border border-ess-darkPurple p-6 sm:p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                </div>
                <div className="relative z-10">
                  <h2 className="text-xl font-semibold mb-1">Quote Ready for Review</h2>
                  <p className="text-purple-100 mb-4 text-sm">Please review and respond to the quote below.</p>
                  <div className="bg-white/20 inline-block px-4 py-2 rounded-lg font-mono text-2xl font-bold mb-6">
                    ₦{parseFloat(activeQuote.amount).toLocaleString()}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => quoteActionMutation.mutate({ action: 'approve' })}
                      disabled={quoteActionMutation.isPending}
                      className="px-6 py-2 bg-white text-ess-purple font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {quoteActionMutation.isPending ? 'Processing…' : '✅ Approve Quote'}
                    </button>
                    <button
                      onClick={() => setShowReviseReason(!showReviseReason)}
                      className="px-6 py-2 bg-white/20 text-white font-medium rounded-lg hover:bg-white/30 transition-colors"
                    >
                      🔄 Request Revision
                    </button>
                    <button
                      onClick={() => quoteActionMutation.mutate({ action: 'reject', reason: 'Customer rejected' })}
                      disabled={quoteActionMutation.isPending}
                      className="px-6 py-2 bg-red-500/80 text-white font-medium rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                      ❌ Reject Quote
                    </button>
                  </div>
                  {showReviseReason && (
                    <div className="mt-4 bg-white/10 rounded-xl p-4 space-y-3">
                      <textarea
                        value={reviseReason}
                        onChange={(e) => setReviseReason(e.target.value)}
                        rows={2}
                        placeholder="Describe what you'd like changed…"
                        className="w-full bg-white/20 text-white placeholder-purple-200 rounded-lg p-3 text-sm border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowReviseReason(false)} className="text-sm text-purple-200 hover:text-white">Cancel</button>
                        <button
                          onClick={() => quoteActionMutation.mutate({ action: 'revise', reason: reviseReason })}
                          disabled={!reviseReason || quoteActionMutation.isPending}
                          className="px-4 py-1.5 bg-white text-ess-purple text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                        >
                          Submit Revision Request
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quote Payment Section */}
            {activeQuote && ['approved', 'partially_paid'].includes(activeQuote.status) && request.status !== 'completed' && request.status !== 'verified' && (
              <div id="quote-payment" className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 relative overflow-hidden">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">Payment Options</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Full Payment */}
                  <div className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-lg mb-1">Pay in Full</h3>
                      <p className="text-sm text-gray-500 mb-4">Settle the entire balance now.</p>
                      <div className="text-2xl font-bold mb-4">₦{(parseFloat(activeQuote.amount) - (parseFloat(activeQuote.amount_paid) || 0)).toLocaleString()}</div>
                    </div>
                    <button
                      onClick={() => initPaymentMutation.mutate('full')}
                      disabled={initPaymentMutation.isPending}
                      className="w-full py-2 bg-ess-purple text-white font-semibold rounded-lg hover:bg-ess-darkPurple transition-colors disabled:opacity-50"
                    >
                      {initPaymentMutation.isPending ? 'Processing...' : 'Pay in Full'}
                    </button>
                  </div>
                  
                  {/* 50/50 Deposit */}
                  {activeQuote.status === 'approved' && (!activeQuote.amount_paid || parseFloat(activeQuote.amount_paid) === 0) && (
                    <div className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <h3 className="font-semibold text-lg mb-1">Pay 50% Deposit</h3>
                        <p className="text-sm text-gray-500 mb-4">Pay half now, balance on completion.</p>
                        <div className="text-2xl font-bold mb-4">₦{(parseFloat(activeQuote.amount) / 2).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => initPaymentMutation.mutate('fifty_fifty')}
                        disabled={initPaymentMutation.isPending}
                        className="w-full py-2 border border-ess-purple text-ess-purple font-semibold rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                      >
                        {initPaymentMutation.isPending ? 'Processing...' : 'Pay Deposit'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Pay Balance Section for Completed Requests */}
            {activeQuote && activeQuote.status === 'partially_paid' && ['completed', 'verified'].includes(request.status) && (
              <div id="quote-payment" className="bg-ess-purple rounded-2xl shadow-sm border border-ess-darkPurple p-6 sm:p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-xl font-semibold mb-1">Final Balance Due</h2>
                  <p className="text-purple-100 mb-4 text-sm">The request has been completed. Please pay the remaining balance.</p>
                  <div className="bg-white/20 inline-block px-4 py-2 rounded-lg font-mono text-2xl font-bold mb-6">
                    ₦{(parseFloat(activeQuote.amount) - (parseFloat(activeQuote.amount_paid) || 0)).toLocaleString()}
                  </div>
                  <div>
                    <button
                      onClick={() => initPaymentMutation.mutate('full')}
                      disabled={initPaymentMutation.isPending}
                      className="px-6 py-2 bg-white text-ess-purple font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {initPaymentMutation.isPending ? 'Processing...' : 'Pay Balance'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <WorkflowCard
              title={request.title || request.service_type || 'Service Request'}
              status={request.status}
              ownerRole={resolution.ownerRole}
              priority={request.priority}
              summary={
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Category</h3>
                    <p className="text-sm text-gray-900 capitalize">{request.category?.replace('_', ' ') || 'N/A'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Location</h3>
                    <p className="text-sm text-gray-900">{request.location?.address || request.address || 'No location provided'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Technician Required</h3>
                    <p className="text-sm text-gray-900">{(request as any).requires_technician ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                    <p className="whitespace-pre-wrap">{request.description || 'No description provided.'}</p>
                  </div>
                </div>
              }
            />

            {/* Associated Order / Payment */}
            {(request.order_id || request.payment_id) && (
              <Card>
                <CardContent>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Associated Order & Payment</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {request.order_id && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Order Status</h3>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={(request as any).order_status || 'unknown'} />
                          <Link 
                            to={`/portal/customer/orders/${request.order_id}`}
                            className="text-sm font-medium text-ess-purple hover:underline"
                          >
                            View Order
                          </Link>
                        </div>
                      </div>
                    )}
                    {request.payment_id && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-1">Payment Status</h3>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={(request as any).payment_status || 'unknown'} />
                          <Link 
                            to={`/portal/customer/payments/${request.payment_id}`}
                            className="text-sm font-medium text-ess-purple hover:underline"
                          >
                            View Payment
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-8">
            <WorkflowTimeline 
              currentStatus={request.status}
              historyEvents={
                loadingTimeline ? [] : 
                ensureArray(timeline).map((event: any) => ({
                  to_state: event.state_to || event.status,
                  created_at: event.created_at,
                  reason: event.reason
                }))
              }
            />
          </div>

        </div>

        <ConfirmationDialog
          isOpen={isCancelling}
          title="Cancel Request"
          message="Are you sure you want to cancel this request? This action cannot be undone."
          confirmText={cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel'}
          cancelText="No"
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => setIsCancelling(false)}
          isDestructive={true}
        />
      </PageContainer>
    </ErrorBoundary>
  );
}
