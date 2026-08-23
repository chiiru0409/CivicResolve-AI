import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { toastVariants } from '../utils/motion';

interface ToastProps {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onDismiss: (id: string) => void;
}

const typeConfig = {
  success: {
    bg: 'bg-[#101912] border-[#22C55E]/40 text-[#22C55E]',
    icon: <CheckCircle className="w-4 h-4 text-[#22C55E]" />,
  },
  error: {
    bg: 'bg-[#1c1010] border-[#E10600]/40 text-[#FF4D4D]',
    icon: <AlertCircle className="w-4 h-4 text-[#E10600]" />,
  },
  info: {
    bg: 'bg-[#12141c] border-blue-500/40 text-blue-300',
    icon: <Info className="w-4 h-4 text-blue-400" />,
  },
  warning: {
    bg: 'bg-[#1c1810] border-[#FFC400]/40 text-[#FFC400]',
    icon: <AlertTriangle className="w-4 h-4 text-[#FFC400]" />,
  },
};

export const Toast: React.FC<ToastProps> = ({ id, message, type, onDismiss }) => {
  const cfg = typeConfig[type];
  return (
    <motion.div
      layout
      variants={toastVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md ${cfg.bg} max-w-sm w-full`}
    >
      <span className="flex-shrink-0">{cfg.icon}</span>
      <p className="text-xs font-semibold flex-1 leading-snug">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
};

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => (
  <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 items-end pointer-events-none max-w-sm w-full px-4">
    <AnimatePresence mode="popLayout">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full flex justify-end">
          <Toast {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </AnimatePresence>
  </div>
);

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
