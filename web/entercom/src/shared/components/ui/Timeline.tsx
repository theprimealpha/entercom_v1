interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  status?: string;
  type?: 'state_change' | 'audit_action';
  actor?: string;
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative border-l-2 border-gray-100 ml-3 space-y-8">
      {events.map((event) => {
        const isState = event.type === 'state_change';
        return (
          <div key={event.id} className="relative pl-6">
            <div className={`absolute w-4 h-4 rounded-full -left-[9px] top-1 border-4 border-white shadow-sm ${isState ? 'bg-ess-purple' : 'bg-gray-400'}`} />
            <h4 className="text-sm font-bold text-gray-900">
              {isState ? <span className="uppercase text-xs font-bold text-ess-purple mr-2">Status Change</span> : <span className="uppercase text-xs font-bold text-gray-500 mr-2">Action</span>}
              {event.title}
            </h4>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(event.date).toLocaleString()} {event.actor && `• by ${event.actor}`}
            </p>
            {event.description && <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-3 rounded-lg">{event.description}</p>}
          </div>
        );
      })}
    </div>
  );
}
