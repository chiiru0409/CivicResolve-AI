import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface ToastProps {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onDismiss: (id: string) => void;
}

const typeConfig = {
  success: {
    bg: 'bg-civic-surface border-civic-success/30',
    text: 'text-civic-success',
    icon: <CheckCircle className="w-4 h-4 text-civic-success" />,
  },
  error: {
    bg: 'bg-civic-surface border-civic-red/30',
    text: 'text-civic-red',
    icon: <AlertCircle className="w-4 h-4 text-civic-red" />,
  },
  info: {
    bg: 'bg-civic-surface border-civic-border',
    text: 'text-civic-text',
    icon: <Info className="w-4 h-4 text-blue-400" />,
  },
  warning: {
    bg: 'bg-civic-surface border-civic-yellow/30',
    text: 'text-civic-yellow',
    icon: <AlertTriangle className="w-4 h-4 text-civic-yellow" />,
  },
};

export const Toast: React.FC<ToastProps> = ({ id, message, type, onDismiss }) => {
  const cfg = typeConfig[type];
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-dark-lg animate-slide-up ${cfg.bg} max-w-sm`}
    >
      <span className="flex-shrink-0">{cfg.icon}</span>
      <p className={`text-sm font-medium flex-1 ${cfg.text}`}>{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="p-1 rounded-lg text-civic-muted hover:text-civic-text hover:bg-civic-elevated transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center">
    {toasts.map((t) => <Toast key={t.id} {...t} onDismiss={onDismiss} />)}
  </div>
);

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const dismissToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return { toasts, addToast, dismissToast };
}
