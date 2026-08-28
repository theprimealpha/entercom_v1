import React from 'react';
interface WorkflowTimelineProps {
  currentStatus: string;
  historyEvents: Array<{
    to_state: string;
    created_at: string;
    reason?: string;
  }>;
}


export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({ currentStatus, historyEvents }) => {
  // We can enrich the history with upcoming states based on a typical linear flow,
  // but showing actual history + current state prominently is usually best.
  
  const stateEvents = historyEvents.filter((e: any) => !e.type || e.type === 'state_change');
  const mappedEvents = stateEvents.map((evt, i) => ({
    id: `history-${i}`,
    title: evt.to_state ? evt.to_state.replace(/_/g, ' ') : 'Unknown State',
    date: evt.created_at,
    description: evt.reason,
    status: evt.to_state === currentStatus ? 'current' : 'completed'
  }));

  // If the current status isn't the last history event (shouldn't happen, but just in case)
  const isCurrentInHistory = stateEvents.some(e => e.to_state === currentStatus);
  if (!isCurrentInHistory && currentStatus) {
    mappedEvents.push({
      id: 'current',
      title: currentStatus ? currentStatus.replace(/_/g, ' ') : 'Unknown State',
      date: new Date().toISOString(),
      description: 'Current stage',
      status: 'current'
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-6 border-b border-gray-100 pb-2">Workflow Progress</h2>
      {mappedEvents.length > 0 ? (
        <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
          {mappedEvents.map((event) => (
            <div key={event.id} className={`relative pl-6 ${event.status === 'current' ? 'opacity-100' : 'opacity-70'}`}>
              <div className={`absolute w-4 h-4 rounded-full -left-[9px] top-1 border-4 border-white shadow-sm ${
                event.status === 'current' ? 'bg-ess-purple ring-4 ring-purple-100' : 'bg-green-500'
              }`} />
              <h4 className={`text-sm font-bold ${event.status === 'current' ? 'text-ess-purple' : 'text-gray-900'} capitalize`}>
                {event.title}
              </h4>
              <p className="text-xs text-gray-500 mt-1">{new Date(event.date).toLocaleString()}</p>
              {event.description && <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-3 rounded-lg">{event.description}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No events recorded yet.</p>
      )}
    </div>
  );
};
