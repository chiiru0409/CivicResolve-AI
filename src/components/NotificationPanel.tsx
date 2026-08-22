import React from 'react';
import { Bell, X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { mockNotifications } from '../data/mockNotifications';
import { getRelativeTime } from '../utils/helpers';
import type { Notification } from '../types';

interface NotificationPanelProps {
  onClose: () => void;
  notifications?: Notification[];
}

const typeIcons = {
  success: <CheckCircle className="w-4 h-4 text-[#22C55E]" />,
  warning: <AlertTriangle className="w-4 h-4 text-[#FFC400]" />,
  info:    <Info className="w-4 h-4 text-blue-400" />,
  error:   <AlertCircle className="w-4 h-4 text-[#E10600]" />,
};

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose, notifications = mockNotifications }) => {
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#111] border border-white/10 rounded-2xl shadow-2xl z-50 animate-slide-up overflow-hidden">
      {/* Top accent */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#151515]">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#E10600]" />
          <span className="font-bold text-white text-sm">Notifications</span>
          {unread > 0 && (
            <span className="bg-[#E10600] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {unread} new
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
        {notifications.length === 0 ? (
          <div className="py-10 text-center space-y-2 px-4">
            <Bell className="w-6 h-6 text-white/20 mx-auto" />
            <p className="text-sm font-semibold text-white/60">All caught up</p>
            <p className="text-xs text-white/30">No new alerts or status changes</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex gap-3 px-4 py-3 hover:bg-white/4 transition-colors cursor-pointer ${
                !notif.read ? 'bg-[#E10600]/5' : ''
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">{typeIcons[notif.type]}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${!notif.read ? 'text-white font-medium' : 'text-white/60'}`}>
                  {notif.message}
                </p>
                <p className="text-xs text-white/30 mt-1">{getRelativeTime(notif.timestamp)}</p>
              </div>
              {!notif.read && (
                <div className="w-2 h-2 bg-[#E10600] rounded-full flex-shrink-0 mt-2 animate-pulse" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-3 border-t border-white/8 bg-[#151515]">
          <button className="text-xs text-[#E10600] hover:text-[#FF1A14] font-semibold w-full text-center transition-colors">
            Mark all as read
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
