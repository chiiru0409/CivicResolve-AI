import React from 'react';
import { Bell, X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { mockNotifications } from '../data/mockNotifications';
import { getRelativeTime } from '../utils/helpers';

interface NotificationPanelProps {
  onClose: () => void;
}

const typeIcons = {
  success: <CheckCircle className="w-4 h-4 text-civic-success" />,
  warning: <AlertTriangle className="w-4 h-4 text-civic-yellow" />,
  info:    <Info className="w-4 h-4 text-blue-400" />,
  error:   <AlertCircle className="w-4 h-4 text-civic-red" />,
};

const NotificationPanel: React.FC<NotificationPanelProps> = ({ onClose }) => {
  const unread = mockNotifications.filter((n) => !n.read).length;

  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-civic-surface border border-civic-border rounded-2xl shadow-dark-lg z-50 animate-slide-up overflow-hidden">
      {/* Top accent */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-civic-red to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-civic-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-civic-red" />
          <span className="font-bold text-civic-text text-sm">Notifications</span>
          {unread > 0 && (
            <span className="bg-civic-red text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {unread} new
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-civic-muted hover:text-civic-text hover:bg-civic-elevated transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-civic-border">
        {mockNotifications.map((notif) => (
          <div
            key={notif.id}
            className={`flex gap-3 px-4 py-3 hover:bg-civic-elevated/50 transition-colors cursor-pointer ${
              !notif.read ? 'bg-civic-red/5' : ''
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">{typeIcons[notif.type]}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm leading-snug ${!notif.read ? 'text-civic-text font-medium' : 'text-civic-muted'}`}>
                {notif.message}
              </p>
              <p className="text-xs text-civic-border mt-1">{getRelativeTime(notif.timestamp)}</p>
            </div>
            {!notif.read && (
              <div className="w-2 h-2 bg-civic-red rounded-full flex-shrink-0 mt-2 animate-pulse" />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-civic-border">
        <button className="text-sm text-civic-red hover:text-civic-red-light font-semibold w-full text-center transition-colors">
          Mark all as read
        </button>
      </div>
    </div>
  );
};

export default NotificationPanel;
