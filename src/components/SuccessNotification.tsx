import React, { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';

interface SuccessNotificationProps {
  message: string;
  onClose: () => void;
  autoCloseDelay?: number;
}

export function SuccessNotification({ message, onClose, autoCloseDelay = 5000 }: SuccessNotificationProps) {
  useEffect(() => {
    if (autoCloseDelay > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [autoCloseDelay, onClose]);

  return (
    <div className="mb-6 bg-green-50 border-l-4 border-green-400 p-4 rounded-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <CheckCircle className="h-6 w-6 text-green-400 mr-3" />
          <p className="text-green-700">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="text-green-500 hover:text-green-700 transition-colors"
          aria-label="Close notification"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
