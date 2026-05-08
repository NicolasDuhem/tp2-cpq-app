'use client';

import { useEffect } from 'react';

type ToastProps = {
  message: string;
  visible: boolean;
  onDismiss?: () => void;
};

export default function Toast({ message, visible, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timeout = window.setTimeout(() => onDismiss?.(), 3000);
    return () => window.clearTimeout(timeout);
  }, [visible, onDismiss]);

  return <div className={`toast ${visible ? 'toastVisible' : ''}`}>{message}</div>;
}
