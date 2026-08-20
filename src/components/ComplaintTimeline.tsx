import React from 'react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';
import type { TimelineEvent } from '../types';
import { formatDateTime } from '../utils/helpers';

interface ComplaintTimelineProps {
  events: TimelineEvent[];
}

const ComplaintTimeline: React.FC<ComplaintTimelineProps> = ({ events }) => {
  return (
    <div className="relative">
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;

        return (
          <div key={event.id} className="relative flex gap-4">
            {/* Connector line */}
            {!isLast && (
              <div
                className={`absolute left-[18px] top-10 w-0.5 h-full -translate-x-1/2 ${
                  event.status === 'completed' ? 'bg-civic-red/40' : 'bg-civic-border'
                }`}
              />
            )}

            {/* Icon */}
            <div className="flex-shrink-0 mt-1">
              {event.status === 'completed' ? (
                <div className="w-9 h-9 rounded-full bg-civic-red/10 border-2 border-civic-red/50 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-civic-red" />
                </div>
              ) : event.status === 'current' ? (
                <div className="w-9 h-9 rounded-full bg-civic-yellow/10 border-2 border-civic-yellow flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-civic-yellow animate-pulse" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-civic-elevated border-2 border-civic-border flex items-center justify-center">
                  <Circle className="w-4 h-4 text-civic-border" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="pb-7 flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`font-semibold text-sm truncate ${
                      event.status === 'completed'
                        ? 'text-civic-red'
                        : event.status === 'current'
                        ? 'text-civic-yellow'
                        : 'text-civic-border'
                    }`}
                  >
                    {event.label}
                    {event.status === 'current' && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-civic-yellow/10 text-civic-yellow px-2 py-0.5 rounded-full border border-civic-yellow/30">
                        <Clock className="w-2.5 h-2.5" />
                        Active
                      </span>
                    )}
                  </p>
                  {event.note && (
                    <p className="text-xs text-civic-muted mt-0.5 truncate">{event.note}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  {event.timestamp ? (
                    <p className="text-[11px] text-civic-muted whitespace-nowrap">{formatDateTime(event.timestamp)}</p>
                  ) : (
                    <p className="text-[11px] text-civic-border">Pending</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ComplaintTimeline;
