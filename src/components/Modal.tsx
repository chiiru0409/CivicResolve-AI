import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className={`relative bg-civic-surface border border-civic-border rounded-2xl shadow-dark-lg w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto animate-slide-up`}>
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-civic-red to-transparent rounded-t-2xl" />

        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-civic-border">
            <h2 id="modal-title" className="text-lg font-black text-civic-text">{title}</h2>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-civic-elevated text-civic-muted hover:text-civic-text transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}
        {!title && (
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-civic-elevated text-civic-muted hover:text-civic-text transition-colors z-10"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
