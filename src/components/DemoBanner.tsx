import React, { useState } from 'react';
import { X, Zap } from 'lucide-react';

const DemoBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[60] bg-civic-yellow/10 border-b border-civic-yellow/20 py-2 px-4 flex items-center justify-center gap-2"
    >
      <Zap className="w-3.5 h-3.5 flex-shrink-0 text-civic-yellow" aria-hidden="true" />
      <span className="text-center text-xs text-civic-yellow font-medium">
        <strong>Demo Mode</strong> — Simulated AI &amp; mock data. No real government systems are contacted.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 p-1 rounded hover:bg-civic-yellow/20 transition-colors flex-shrink-0"
        aria-label="Dismiss demo notice"
      >
        <X className="w-3 h-3 text-civic-yellow" />
      </button>
    </div>
  );
};

export default DemoBanner;
