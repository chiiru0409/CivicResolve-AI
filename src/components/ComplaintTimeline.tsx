import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';
import type { TimelineEvent } from '../types';
import { formatDateTime } from '../utils/helpers';
import { staggerContainer, staggerItem } from '../utils/motion';

interface ComplaintTimelineProps {
  events: TimelineEvent[];
}

const ComplaintTimeline: React.FC<ComplaintTimelineProps> = ({ events }) => {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="relative"
    >
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;

        return (
          <motion.div
            key={event.id}
            variants={staggerItem}
            className="relative flex gap-4"
          >
            {/* Connector line */}
            {!isLast && (
              <div
                className={`absolute left-[18px] top-10 w-0.5 h-full -translate-x-1/2 transition-colors duration-300 ${
                  event.status === 'completed' ? 'bg-[#E10600]/40' : 'bg-white/10'
                }`}
              />
            )}

            {/* Icon Node */}
            <div className="flex-shrink-0 mt-1">
              {event.status === 'completed' ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-9 h-9 rounded-full bg-[#E10600]/15 border-2 border-[#E10600] flex items-center justify-center shadow-[0_0_10px_rgba(225,6,0,0.3)]"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#E10600]" />
                </motion.div>
              ) : event.status === 'current' ? (
                <div className="w-9 h-9 rounded-full bg-[#FFC400]/15 border-2 border-[#FFC400] flex items-center justify-center shadow-[0_0_12px_rgba(255,196,0,0.4)]">
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-3 h-3 rounded-full bg-[#FFC400]"
                  />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-white/5 border-2 border-white/15 flex items-center justify-center">
                  <Circle className="w-4 h-4 text-white/20" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="pb-7 flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`font-bold text-sm truncate font-display ${
                      event.status === 'completed'
                        ? 'text-[#E10600]'
                        : event.status === 'current'
                        ? 'text-[#FFC400]'
                        : 'text-white/30'
                    }`}
                  >
                    {event.label}
                    {event.status === 'current' && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] bg-[#FFC400]/10 text-[#FFC400] px-2 py-0.5 rounded-full border border-[#FFC400]/30 font-mono">
                        <Clock className="w-2.5 h-2.5" />
                        Active
                      </span>
                    )}
                  </p>
                  {event.note && (
                    <p className="text-xs text-white/50 mt-0.5 truncate font-sans">{event.note}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  {event.timestamp ? (
                    <p className="text-[11px] text-white/40 whitespace-nowrap font-mono">{formatDateTime(event.timestamp)}</p>
                  ) : (
                    <p className="text-[11px] text-white/20 font-mono">Pending</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

export default ComplaintTimeline;
