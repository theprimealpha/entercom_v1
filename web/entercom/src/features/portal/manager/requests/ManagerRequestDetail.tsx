import { ensureArray } from '../../../../utils/arrays';
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requestsApi } from '../../../../api/requests';
import { usersApi } from '../../../../api/users';
import { PageContainer } from '../../../../shared/components/PageContainer';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { ErrorBoundary } from '../../../../shared/components/ErrorBoundary';
import { Input } from '../../../../shared/components/ui/Input';
import { WorkflowBanner, WorkflowTimeline, WorkflowCard, resolveWorkflowState } from '../../../../shared/components/workflow';


export default function ManagerRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  
  const [showAssign, setShowAssign] = useState(false);
  const [technicianId, setTechnicianId] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<'awaiting_assignment' | 'in_progress' | 'cancelled'>('awaiting_assignment');

  const { data: request, isLoading } = useQuery({
    queryKey: ['requests', id],
    queryFn: () => requestsApi.get(id!),
    enabled: !!id,
  });

  const { data: timeline } = useQuery({
    queryKey: ['requests', id, 'timeline'],
    queryFn: () => requestsApi.timeline(id!),
    enabled: !!id,
  });

  const { data: quotes } = useQuery({
    queryKey: ['requests', id, 'quotes'],
    queryFn: () => requestsApi.quotes.list(id!),
    enabled: !!id,
  });

  const { data: technicians } = useQuery({
    queryKey: ['users', 'technician'],
    queryFn: () => usersApi.list('technician'),
    enabled: showAssign,
  });

  const assignMutation = useMutation({
    mutationFn: (techId: string) => requestsApi.assign(id!, techId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] });
      setShowAssign(false);
      setTechnicianId('');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => requestsApi.cancel(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] });
      setShowCancel(false);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (target: string) =>
      requestsApi.resolveEscalation(id!, target, 'MANUAL'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] });
      setShowResolve(false);
    },
    onError: (err: any) => window.showAppAlert(err.response?.data?.message || 'Failed to resolve escalation', 'error'),
  });

  if (isLoading) {
    return (
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6"><Skeleton className="h-64 w-full rounded-2xl" /></div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (!request) {
    return <PageContainer><div className="text-center py-12">Request not found.</div></PageContainer>;
  }

  const resolution = resolveWorkflowState(request, 'MANAGER');

  const handleWorkflowAction = (actionId: string) => {
    switch (actionId) {
      case 'resolve':
        document.getElementById('manager-actions')?.scrollIntoView({ behavior: 'smooth' });
        setShowResolve(true);
        break;
      case 'assign':
        document.getElementById('manager-actions')?.scrollIntoView({ behavior: 'smooth' });
        setShowAssign(true);
        break;
      default:
        console.log('Unhandled action:', actionId);
    }
  };

  return (
    <ErrorBoundary>
      <PageContainer>
        <div className="mb-6 flex items-center text-sm text-gray-500">
          <Link to="/portal/manager" className="hover:text-ess-purple transition-colors">Dashboard</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{request.public_id || request.id.split('-')[0].toUpperCase()}</span>
        </div>

        <WorkflowBanner 
          resolution={resolution} 
          onAction={handleWorkflowAction} 
          isProcessing={cancelMutation.isPending || resolveMutation.isPending} 
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <WorkflowCard
              title={request.public_id || request.id.split('-')[0].toUpperCase()}
              status={request.status}
              ownerRole={resolution.ownerRole}
              priority={request.priority}
              summary={
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-1">Category</h3>
                    <p className="text-sm text-gray-900 capitalize">{request.service_type?.replace('_', ' ') || request.category?.replace('_', ' ')}</p>
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


            <div id="manager-actions" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-2">Manager Actions</h2>
              
              <div className="space-y-4">

                {/* ESCALATED: Resolve panel */}
                {request.status === 'escalated' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-sm font-semibold text-red-800 mb-1">⚠️ This request is escalated.</p>
                      <p className="text-xs text-red-600">You must resolve the escalation to allow the workflow to continue.</p>
                    </div>
                    {!showResolve ? (
                      <button
                        onClick={() => setShowResolve(true)}
                        className="w-full py-3 px-4 bg-ess-purple text-white font-medium rounded-xl hover:bg-ess-darkPurple transition-colors shadow-sm"
                      >
                        🔓 Resolve Escalation
                      </button>
                    ) : (
                      <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl space-y-4">
                        <p className="text-sm font-medium text-purple-900">Route this request back to:</p>
                        <div className="grid grid-cols-1 gap-2">
                          {(['awaiting_assignment', 'in_progress', 'cancelled'] as const).map((target) => (
                            <button
                              key={target}
                              onClick={() => setResolveTarget(target)}
                              className={`py-2 px-4 rounded-lg text-sm font-medium border transition-colors capitalize ${
                                resolveTarget === target
                                  ? 'bg-ess-purple text-white border-ess-purple'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-ess-purple'
                              }`}
                            >
                              {target.replace(/_/g, ' ')}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setShowResolve(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
                          <button
                            onClick={() => resolveMutation.mutate(resolveTarget)}
                            disabled={resolveMutation.isPending}
                            className="px-4 py-2 text-sm font-semibold bg-ess-purple text-white rounded-lg hover:bg-ess-darkPurple disabled:opacity-50"
                          >
                            {resolveMutation.isPending ? 'Resolving…' : 'Confirm Resolution'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Non-terminal, non-escalated: Assign + Cancel */}
                {request.status !== 'completed' && request.status !== 'cancelled' && request.status !== 'escalated' && (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setShowAssign(!showAssign)}
                      className="flex-1 py-3 px-4 bg-ess-purple text-white font-medium rounded-xl hover:bg-ess-darkPurple transition-colors shadow-sm"
                    >
                      👷 Assign Technician
                    </button>
                    <button 
                      onClick={() => setShowCancel(!showCancel)}
                      className="flex-1 py-3 px-4 bg-white border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors"
                    >
                      Cancel Request
                    </button>
                  </div>
                )}

                {showAssign && (
                  <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Select Technician</label>
                      <select 
                        value={technicianId} 
                        onChange={e => setTechnicianId(e.target.value)}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-ess-purple focus:ring-ess-purple sm:text-sm p-2 border"
                      >
                        <option value="">-- Choose a technician --</option>
                        {ensureArray(technicians).map((tech: any) => (
                          <option key={tech.id} value={tech.id}>
                            {tech.first_name} {tech.last_name} ({tech.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAssign(false)} className="px-3 py-1.5 text-sm font-medium text-gray-600">Cancel</button>
                      <button 
                        onClick={() => assignMutation.mutate(technicianId)}
                        disabled={!technicianId || assignMutation.isPending}
                        className="px-3 py-1.5 text-sm font-medium bg-ess-purple text-white rounded-lg hover:bg-ess-darkPurple disabled:opacity-50"
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                )}

                {showCancel && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                    <Input 
                      label="Cancellation Reason"
                      type="text"
                      placeholder="Reason for cancellation..."
                      value={cancelReason} 
                      onChange={e => setCancelReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowCancel(false)} className="px-3 py-1.5 text-sm font-medium text-gray-600">Cancel</button>
                      <button 
                        onClick={() => cancelMutation.mutate(cancelReason)}
                        disabled={!cancelReason || cancelMutation.isPending}
                        className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Cancel Request
                      </button>
                    </div>
                  </div>
                )}

                {/* Completed / Cancelled terminal */}
                {request.status === 'completed' && (
                  <div className="p-4 bg-green-50 border border-green-100 rounded-xl">
                    <p className="text-sm font-medium text-green-800">✅ Request completed successfully.</p>
                  </div>
                )}
                {request.status === 'cancelled' && (
                  <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                    <p className="text-sm font-medium text-gray-600">🚫 Request has been cancelled.</p>
                  </div>
                )}

              </div>
            </div>
          </div>

          <div className="space-y-8">
            <WorkflowTimeline 
              currentStatus={request.status}
              historyEvents={
                !timeline ? [] : 
                ensureArray(timeline).map((event: any) => ({
                  to_state: event.to_state || event.status,
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
