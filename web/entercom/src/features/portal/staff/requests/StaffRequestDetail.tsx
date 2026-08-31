import { ensureArray } from '../../../../utils/arrays';
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsApi } from '../../../../api/requests';
import { usersApi } from '../../../../api/users';
import { useWebsocket } from '../../../../hooks/useWebsocket';
import { PageContainer } from '../../../../shared/components/PageContainer';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import { Input, TextArea, Select } from '../../../../shared/components/ui';
import { WorkflowBanner, WorkflowTimeline, WorkflowCard, resolveWorkflowState } from '../../../../shared/components/workflow';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Removed old StatusBadge in favor of WorkflowCard

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function StaffRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { subscribeToRequest } = useWebsocket('requests');

  useEffect(() => {
    if (id) subscribeToRequest(id);
  }, [id, subscribeToRequest]);

  // UI state

  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [showReviewReject, setShowReviewReject] = useState(false);
  const [reviewRejectReason, setReviewRejectReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedTechId, setSelectedTechId] = useState('');

  // Data
  const { data: request, isLoading } = useQuery({
    queryKey: ['requests', id],
    queryFn: () => requestsApi.get(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: technicians } = useQuery({
    queryKey: ['users', 'technician'],
    queryFn: () => usersApi.list('technician'),
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


  // Mutations
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['requests', id] });

  const pickupMutation = useMutation({
    mutationFn: () => requestsApi.pickup(id!),
    onSuccess: invalidate,
    onError: (err: any) => {
      if (err.response?.status === 409) {
        window.showAppAlert('Request has already been claimed.', 'info');
      } else {
        window.showAppAlert(err.response?.data?.message || 'Failed to pick up request', 'error');
      }
    },
  });



  const triageMutation = useMutation({
    mutationFn: (action: 'needs_quote' | 'require_payment' | 'assign_directly' | 'close_direct') =>
      requestsApi.triage(id!, action),
    onSuccess: invalidate,
    onError: (err: any) => window.showAppAlert(err.response?.data?.message || 'Triage action failed', 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: (technician_id: string) => requestsApi.assign(id!, technician_id),
    onSuccess: () => { invalidate(); setSelectedTechId(''); },
    onError: (err: any) => window.showAppAlert(err.response?.data?.message || 'Failed to assign technician', 'error'),
  });



  const escalateMutation = useMutation({
    mutationFn: (reason: string) => requestsApi.escalate(id!, reason),
    onSuccess: () => { invalidate(); setShowEscalate(false); },
  });

  const reviewVerificationMutation = useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject' | 'override'; notes?: string }) =>
      requestsApi.review_verification(id!, payload),
    onSuccess: () => { invalidate(); setShowReviewReject(false); },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => requestsApi.cancel(id!, reason),
    onSuccess: () => { invalidate(); setShowCancel(false); },
  });

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
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
  const isTerminal = s === 'completed' || s === 'cancelled';
  const category = request.category || '';
  const isDirectCloseable = ['information', 'support'].includes(category);

  const resolution = resolveWorkflowState(request, 'STAFF');

  const handleWorkflowAction = (actionId: string) => {
    switch (actionId) {
      case 'pickup':
        pickupMutation.mutate();
        break;
      case 'triage_panel':
        document.getElementById('triage-actions')?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'open_quote':
        document.getElementById('quotes-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'assign':
        document.getElementById('assign-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'verify':
        document.getElementById('verify-section')?.scrollIntoView({ behavior: 'smooth' });
        break;
      default:
        console.log('Unhandled action:', actionId);
    }
  };

  return (
    <ErrorBoundary>
      <PageContainer>
        <div className="mb-6 flex items-center text-sm text-gray-500">
          <Link to="/portal/staff/requests" className="hover:text-ess-purple transition-colors">Requests</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{request.public_id || request.id.split('-')[0]}</span>
        </div>

        <WorkflowBanner 
          resolution={resolution} 
          onAction={handleWorkflowAction} 
          isProcessing={pickupMutation.isPending || cancelMutation.isPending} 
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
                    <p className="text-sm text-gray-900 capitalize">{category.replace(/_/g, ' ') || 'N/A'}</p>
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


            {/* Actions panel */}
            <div id="triage-actions" className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-2">
                Workflow Actions
              </h2>

              <div className="space-y-4">


                {/* STAFF_REVIEW: Triage decisions */}
                {s === 'staff_review' && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                      Triage Decision
                    </p>

                    <button
                      onClick={() => triageMutation.mutate('needs_quote')}
                      disabled={triageMutation.isPending}
                      className="w-full py-3 px-4 bg-yellow-500 text-white font-medium rounded-xl hover:bg-yellow-600 transition-colors disabled:opacity-50 flex items-center gap-3 text-left"
                    >
                      <span className="text-xl">📋</span>
                      <div>
                        <div className="font-semibold">Needs Quote</div>
                        <div className="text-xs text-yellow-100">Route to quote generation (installation, maintenance)</div>
                      </div>
                    </button>

                    <button
                      onClick={() => triageMutation.mutate('require_payment')}
                      disabled={triageMutation.isPending}
                      className="w-full py-3 px-4 bg-orange-500 text-white font-medium rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-3 text-left"
                    >
                      <span className="text-xl">💳</span>
                      <div>
                        <div className="font-semibold">Require Payment</div>
                        <div className="text-xs text-orange-100">Send to payment gate (consultation, product order)</div>
                      </div>
                    </button>

                    <button
                      onClick={() => triageMutation.mutate('assign_directly')}
                      disabled={triageMutation.isPending}
                      className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-3 text-left"
                    >
                      <span className="text-xl">👷</span>
                      <div>
                        <div className="font-semibold">Assign Directly</div>
                        <div className="text-xs text-blue-100">Skip quote &amp; payment — go straight to assignment (inspection, booking)</div>
                      </div>
                    </button>

                    {isDirectCloseable && (
                      <button
                        onClick={() => triageMutation.mutate('close_direct')}
                        disabled={triageMutation.isPending}
                        className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-3 text-left"
                      >
                        <span className="text-xl">✅</span>
                        <div>
                          <div className="font-semibold">Close Directly</div>
                          <div className="text-xs text-green-100">Resolve information/support without technician assignment</div>
                        </div>
                      </button>
                    )}

                    {triageMutation.isPending && (
                      <p className="text-sm text-center text-gray-400 pt-2">Applying triage decision…</p>
                    )}
                  </div>
                )}

                {/* AWAITING_QUOTE: prompt */}
                {s === 'awaiting_quote' && (
                  <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                    <p className="text-sm font-medium text-yellow-800 mb-1">
                      📋 Waiting for a quote to be issued.
                    </p>
                    <p className="text-xs text-yellow-700">Use the Quotes &amp; Estimates section below to create and issue a quote.</p>
                  </div>
                )}

                {/* AWAITING_CUSTOMER_APPROVAL: waiting */}
                {s === 'awaiting_customer_approval' && (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-sm font-medium text-amber-800">
                      ⏳ Waiting for the customer to approve or revise the quote.
                    </p>
                    <p className="text-xs text-amber-700 mt-1">No staff action required at this stage.</p>
                  </div>
                )}

                {/* AWAITING_PAYMENT */}
                {s === 'awaiting_payment' && (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                    <p className="text-sm text-blue-800 font-medium">💳 Waiting for customer payment.</p>
                    {request.payment_id ? (
                      <Link
                        to={`/portal/staff/payments/${request.payment_id}`}
                        className="inline-block py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        View Payment Details
                      </Link>
                    ) : request.order_id ? (
                      <Link
                        to={`/portal/staff/orders/${request.order_id}`}
                        className="inline-block py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        View Order Details
                      </Link>
                    ) : (
                      <p className="text-xs text-blue-600 italic">Order/payment record is still being generated.</p>
                    )}
                  </div>
                )}

                {/* AWAITING_ASSIGNMENT or ASSIGNED: assign technician */}
                {(s === 'awaiting_assignment' || s === 'assigned') && (
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-900">
                      {s === 'assigned' ? '🔄 Change Technician' : '👷 Assign Technician'}
                    </h3>
                    <div className="flex gap-2">
                      <Select
                        className="flex-1"
                        value={selectedTechId}
                        onChange={(e) => setSelectedTechId(e.target.value)}
                        options={[
                          { label: 'Select a technician…', value: '' },
                          ...ensureArray(technicians).map((t: any) => ({
                            label: `${t.first_name} ${t.last_name} (${t.email})`,
                            value: t.id,
                          })),
                        ]}
                      />
                      <button
                        onClick={() => assignMutation.mutate(selectedTechId)}
                        disabled={!selectedTechId || assignMutation.isPending}
                        className="px-4 py-2 bg-ess-purple text-white rounded-lg hover:bg-ess-darkPurple disabled:opacity-50 font-medium"
                      >
                        {assignMutation.isPending ? 'Assigning…' : 'Assign'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ASSIGNED: wait for technician */}
                {s === 'assigned' && (
                  <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl mt-4">
                    <p className="text-sm font-medium text-purple-800">
                      ⏳ Waiting for the assigned technician to accept or decline the job.
                    </p>
                  </div>
                )}

                {/* IN_PROGRESS */}
                {s === 'in_progress' && (
                  <div className="space-y-4">
                    <Link
                      to={`/portal/staff/requests/${request.id}/verification`}
                      className="block w-full py-3 px-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors text-center shadow-sm"
                    >
                      ✅ Complete &amp; Submit Verification
                    </Link>
                    <button
                      onClick={() => setShowEscalate(!showEscalate)}
                      className="w-full py-3 px-4 bg-white border border-orange-300 text-orange-700 font-medium rounded-xl hover:bg-orange-50 transition-colors"
                    >
                      ⚠️ Escalate Request
                    </button>
                  </div>
                )}

                {showEscalate && (
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl space-y-3">
                    <TextArea
                      label="Escalation Reason"
                      value={escalateReason}
                      onChange={(e) => setEscalateReason(e.target.value)}
                      rows={3}
                      placeholder="Explain why this needs escalation…"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowEscalate(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
                      <button
                        onClick={() => escalateMutation.mutate(escalateReason)}
                        disabled={!escalateReason || escalateMutation.isPending}
                        className="px-3 py-1.5 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                      >
                        Escalate
                      </button>
                    </div>
                  </div>
                )}

                {/* PENDING_VERIFICATION */}
                {s === 'pending_verification' && (
                  <div id="verify-section" className="space-y-4">
                    <div className="flex gap-4">
                      <button
                        onClick={() => reviewVerificationMutation.mutate({ action: 'approve' })}
                        disabled={reviewVerificationMutation.isPending}
                        className="flex-1 py-3 px-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50"
                      >
                        {reviewVerificationMutation.isPending ? 'Processing…' : '✅ Approve Work'}
                      </button>
                      <button
                        onClick={() => setShowReviewReject(!showReviewReject)}
                        className="flex-1 py-3 px-4 bg-white border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors"
                      >
                        ❌ Reject Work
                      </button>
                    </div>
                    {showReviewReject && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                        <TextArea
                          label="Rejection / Rework Instructions"
                          value={reviewRejectReason}
                          onChange={(e) => setReviewRejectReason(e.target.value)}
                          rows={3}
                          placeholder="Describe what needs to be corrected…"
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setShowReviewReject(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
                          <button
                            onClick={() => reviewVerificationMutation.mutate({ action: 'reject', notes: reviewRejectReason })}
                            disabled={!reviewRejectReason || reviewVerificationMutation.isPending}
                            className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ESCALATED */}
                {s === 'escalated' && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-sm font-medium text-red-800">⚠️ This request has been escalated to a Manager.</p>
                    <p className="text-xs text-red-600 mt-1">A manager must resolve the escalation before this request can continue.</p>
                  </div>
                )}

                {/* COMPLETED */}
                {s === 'completed' && (
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                    <p className="text-sm font-medium text-green-800">✅ This request has been completed successfully.</p>
                  </div>
                )}

                {/* CANCELLED */}
                {s === 'cancelled' && (
                  <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-sm font-medium text-gray-600">🚫 This request has been cancelled.</p>
                  </div>
                )}

                {/* Cancel button — all non-terminal states */}
                {!isTerminal && (
                  <div className="pt-4 border-t border-gray-100 mt-4">
                    <button
                      onClick={() => setShowCancel(!showCancel)}
                      className="w-full py-2.5 px-4 bg-white border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors text-sm"
                    >
                      Cancel Request
                    </button>
                  </div>
                )}

                {showCancel && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                    <Select
                      label="Reason for cancellation"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      options={[
                        { label: 'Select reason…', value: '' },
                        { label: 'Customer requested', value: 'customer_requested' },
                        { label: 'Duplicate request', value: 'duplicate' },
                        { label: 'Unserviceable', value: 'unserviceable' },
                        { label: 'Other', value: 'other' },
                      ]}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowCancel(false)} className="px-3 py-1.5 text-sm text-gray-600">Nevermind</button>
                      <button
                        onClick={() => cancelMutation.mutate(cancelReason)}
                        disabled={!cancelReason || cancelMutation.isPending}
                        className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm Cancel
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Quotes section — only when quote workflow is active */}
            {['awaiting_quote', 'awaiting_customer_approval', 'awaiting_assignment', 'assigned', 'in_progress'].includes(s) && (
              <StaffQuotesSection requestId={request.id} status={s} />
            )}

          </div>

          {/* Sidebar: Timeline */}
          <div>
            <WorkflowTimeline 
              currentStatus={request.status}
              historyEvents={
                !timeline ? [] : 
                ensureArray(timeline).map((event: any) => ({
                  type: event.type,
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

// ---------------------------------------------------------------------------
// Quotes sub-section
// ---------------------------------------------------------------------------
function StaffQuotesSection({ requestId, status }: { requestId: string; status: string }) {
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

  // Staff can only issue a new quote when state is awaiting_quote
  const canCreateQuote = status === 'awaiting_quote';

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
                  <span className="block font-bold text-gray-900">₦{parseFloat(quote.amount || 0).toLocaleString()}</span>
                  {['approved', 'partially_paid', 'paid'].includes(quote.status) && quote.payment_plan && (
                    <span className="block text-xs text-gray-500">Plan: {quote.payment_plan === 'fifty_fifty' ? '50/50 Deposit' : 'Full Payment'}</span>
                  )}
                  {['partially_paid', 'paid'].includes(quote.status) && (
                    <span className="block text-xs text-green-600">Paid: ₦{parseFloat(quote.amount_paid || 0).toLocaleString()}</span>
                  )}
                </div>
              </div>
              {idx === 0 && quote.status === 'issued' && (
                <p className="text-xs text-purple-700 mt-2">⏳ Waiting for customer approval.</p>
              )}
              {idx === 0 && quote.status === 'approved' && (
                <p className="text-xs text-green-700 mt-2">✅ Customer approved this quote.</p>
              )}
              {idx === 0 && quote.status === 'rejected' && (
                <p className="text-xs text-red-700 mt-2">❌ Customer rejected this quote. Transition back to awaiting_quote to issue a revision.</p>
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
