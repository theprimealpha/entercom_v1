import { ensureArray } from '../../../../utils/arrays';
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsApi } from '../../../../api/requests';
import { useWebsocket } from '../../../../hooks/useWebsocket';
import { PageContainer } from '../../../../shared/components/PageContainer';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import { Input, TextArea, Select } from '../../../../shared/components/ui';
import { WorkflowBanner, WorkflowTimeline, WorkflowCard, resolveWorkflowState } from '../../../../shared/components/workflow';

export default function TechnicianRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { subscribeToRequest } = useWebsocket('requests');

  useEffect(() => {
    if (id) subscribeToRequest(id);
  }, [id, subscribeToRequest]);

  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const { data: request, isLoading } = useQuery({
    queryKey: ['requests', id],
    queryFn: () => requestsApi.get(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: timeline } = useQuery({
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['requests', id] });

  const pickupMutation = useMutation({
    mutationFn: () => requestsApi.pickup(id!),
    onSuccess: invalidate,
    onError: (err: any) => {
      if (err.response?.status === 409) window.showAppAlert('Request has already been claimed.', 'info');
      else window.showAppAlert(err.response?.data?.message || 'Failed to pick up request', 'error');
    },
  });

  const acceptMutation = useMutation({
    mutationFn: () => requestsApi.accept(id!),
    onSuccess: invalidate,
  });

  const declineMutation = useMutation({
    mutationFn: (reason: string) => requestsApi.decline(id!, reason),
    onSuccess: () => { invalidate(); setShowDecline(false); },
  });

  const completeMutation = useMutation({
    mutationFn: () => requestsApi.review_verification(id!, { action: 'approve' }),
    onSuccess: invalidate,
    onError: (err: any) => window.showAppAlert(err.response?.data?.message || 'Failed to complete request. QA may be required by staff.', 'error'),
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (!request) {
    return (
      <PageContainer>
        <div className="text-center py-12 text-gray-500">Request not found.</div>
      </PageContainer>
    );
  }

  const s = request.status;
  const resolution = resolveWorkflowState(request, 'STAFF');

  const handleWorkflowAction = (actionId: string) => {
    switch (actionId) {
      case 'pickup':
        pickupMutation.mutate();
        break;
      case 'open_quote':
        document.getElementById('quotes-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'verify':
        document.getElementById('verify-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
    }
  };

  return (
    <ErrorBoundary>
      <PageContainer>
        <div className="mb-6 flex items-center text-sm text-gray-500">
          <Link to="/portal/staff/technician/requests" className="hover:text-ess-purple transition-colors">Inbox</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">Job Workspace: {request.public_id || request.id.split('-')[0]}</span>
        </div>

        <WorkflowBanner 
          resolution={resolution} 
          onAction={handleWorkflowAction} 
          isProcessing={pickupMutation.isPending} 
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">

            <WorkflowCard
              title={request.public_id || request.id}
              status={request.status}
              ownerRole={resolution.ownerRole}
              priority={request.priority}
              summary={
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Category</h3>
                    <p className="text-sm text-gray-900 capitalize">{(request.category || '').replace(/_/g, ' ') || 'N/A'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Description</h3>
                    <p className="whitespace-pre-wrap">{request.description || 'No description provided.'}</p>
                  </div>
                  {request.address && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">Location</h3>
                      <p className="text-sm text-gray-900">{request.address}</p>
                    </div>
                  )}
                  {quotes && Array.isArray(quotes) && quotes.length > 0 && (
                    <div className="sm:col-span-2 pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Quote & Payment Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl">
                        <div>
                          <span className="block text-xs text-gray-500">Plan</span>
                          <span className="font-semibold">{quotes[0].payment_plan === 'fifty_fifty' ? '50/50 Deposit' : quotes[0].payment_plan === 'full' ? 'Full Payment' : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500">Total</span>
                          <span className="font-semibold">₦{parseFloat(quotes[0].amount || 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500">Paid</span>
                          <span className="font-semibold text-green-600">₦{parseFloat(quotes[0].amount_paid || 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-gray-500">Balance</span>
                          <span className="font-semibold text-red-600">₦{(parseFloat(quotes[0].amount || 0) - parseFloat(quotes[0].amount_paid || 0)).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              }
            />

            <div id="technician-actions" className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-2">
                Field Operations
              </h2>

              <div className="space-y-4">
                {s === 'assigned' && (
                  <div className="flex gap-4 pt-2">
                    <button
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending}
                      className="flex-1 py-3 px-4 bg-ess-purple text-white font-medium rounded-xl hover:bg-ess-darkPurple transition-colors shadow-sm disabled:opacity-50"
                    >
                      {acceptMutation.isPending ? 'Accepting…' : 'Accept Assignment'}
                    </button>
                    <button
                      onClick={() => setShowDecline(!showDecline)}
                      className="flex-1 py-3 px-4 bg-white border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                )}

                {showDecline && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                    <Select
                      label="Reason for declining"
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      options={[
                        { label: 'Select reason…', value: '' },
                        { label: 'Out of area', value: 'out_of_area' },
                        { label: 'Overloaded', value: 'overloaded' },
                        { label: 'Lack of skill', value: 'lack_of_skill' },
                        { label: 'Unavailable', value: 'unavailable' },
                        { label: 'Safety concern', value: 'safety_concern' },
                        { label: 'Other', value: 'other' },
                      ]}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowDecline(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
                      <button
                        onClick={() => declineMutation.mutate(declineReason)}
                        disabled={!declineReason || declineMutation.isPending}
                        className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Submit Decline
                      </button>
                    </div>
                  </div>
                )}

                {s === 'in_progress' && (
                  <div className="space-y-4">
                    <Link
                      to={`/portal/staff/technician/requests/${request.id}/verification`}
                      className="block w-full py-4 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors text-center shadow-sm"
                    >
                      📸 Submit Verification Evidence
                    </Link>
                  </div>
                )}

                {s === 'pending_verification' && (
                  <div id="verify-section" className="space-y-4">
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl mb-4">
                      <p className="text-sm font-medium text-blue-800">✅ Verification Evidence Submitted</p>
                      <p className="text-xs text-blue-700 mt-1">You have submitted the photos and checklist. If no staff QA is required, you can complete the request now.</p>
                    </div>
                    <button
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      className="w-full py-4 px-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {completeMutation.isPending ? 'Completing Job…' : '🏆 Complete Request'}
                    </button>
                  </div>
                )}

                {s === 'completed' && (
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                    <p className="text-sm font-medium text-green-800">✅ This job has been successfully completed.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quotes section */}
            {['awaiting_quote', 'awaiting_customer_approval', 'awaiting_assignment', 'assigned', 'in_progress'].includes(s) && (
              <TechnicianQuotesSection requestId={request.id} status={s} />
            )}

          </div>

          <div>
            <WorkflowTimeline 
              currentStatus={request.status}
              historyEvents={
                !timeline ? [] : 
                ensureArray(timeline).map((event: any) => ({
                  to_state: event.to_state || event.new_state || event.status,
                  created_at: event.created_at,
                  reason: event.reason
                }))
              }
            />
          </div>

        </div>
      </PageContainer>
    </ErrorBoundary>
  );
}

function TechnicianQuotesSection({ requestId, status }: { requestId: string; status: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['requests', requestId, 'quotes'],
    queryFn: () => requestsApi.quotes.list(requestId),
    refetchInterval: 10000,
  });

  const createQuoteMutation = useMutation({
    mutationFn: (payload: { amount: number; notes?: string }) =>
      requestsApi.quotes.create(requestId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', requestId] });
      queryClient.invalidateQueries({ queryKey: ['requests', requestId, 'quotes'] });
      setShowForm(false);
      setAmount('');
      setNotes('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    createQuoteMutation.mutate({ amount: parseFloat(amount), notes });
  };

  const canCreateQuote = status === 'awaiting_quote' || status === 'assigned' || status === 'in_progress';

  return (
    <div id="quotes-section" className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
      <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-2">
        <h2 className="text-xl font-bold text-gray-900">Quotes &amp; Estimates</h2>
        {canCreateQuote && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-medium bg-ess-purple text-white px-4 py-2 rounded-xl hover:bg-ess-darkPurple transition-colors"
          >
            Create Quote
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 bg-gray-50 p-6 rounded-2xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">New Quote</h3>
          <div className="space-y-4">
            <Input
              label="Amount (₦)"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <TextArea
              label="Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                type="submit"
                disabled={createQuoteMutation.isPending || !amount}
                className="px-4 py-2 text-sm font-medium bg-ess-purple text-white rounded-xl hover:bg-ess-darkPurple disabled:opacity-50 transition-colors"
              >
                {createQuoteMutation.isPending ? 'Submitting…' : 'Issue Quote'}
              </button>
            </div>
          </div>
        </form>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : quotes && quotes.length > 0 ? (
        <div className="space-y-4">
          {quotes.map((quote: any, idx: number) => (
            <div
              key={quote.id}
              className={`p-4 rounded-xl border ${idx === 0 ? 'bg-purple-50 border-purple-100' : 'bg-gray-50 border-gray-100'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-semibold text-gray-900">v{quote.version}</span>
                  <span className={`ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                    ${quote.status === 'issued' ? 'bg-blue-100 text-blue-800' :
                      quote.status === 'approved' ? 'bg-green-100 text-green-800' :
                      quote.status === 'partially_paid' ? 'bg-green-200 text-green-900' :
                      quote.status === 'paid' ? 'bg-green-200 text-green-900' :
                      quote.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      quote.status === 'superseded' ? 'bg-gray-200 text-gray-500' :
                      'bg-gray-200 text-gray-800'}`}>
                    {quote.status}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block font-bold text-gray-900">₦{parseFloat(quote.amount).toLocaleString()}</span>
                  {['approved', 'partially_paid', 'paid'].includes(quote.status) && quote.payment_plan && (
                    <span className="block text-xs text-gray-500">Plan: {quote.payment_plan === 'fifty_fifty' ? '50/50 Deposit' : 'Full Payment'}</span>
                  )}
                  {['partially_paid', 'paid'].includes(quote.status) && (
                    <span className="block text-xs text-green-600">Paid: ₦{parseFloat(quote.amount_paid).toLocaleString()}</span>
                  )}
                </div>
              </div>
              {idx === 0 && quote.status === 'issued' && (
                <p className="text-xs text-purple-700 mt-2">⏳ Waiting for customer approval.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No quotes have been issued for this request yet.</p>
      )}
    </div>
  );
}
