'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  durationMs?: number;
}

export function Toast({ message, onClose, durationMs = 2600 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      onClose();
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [message, durationMs, onClose]);

  if (!message || !visible) return null;

  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[var(--ink)] px-4 py-3 text-sm text-white shadow-lg',
      )}
    >
      {message}
    </div>
  );
}
