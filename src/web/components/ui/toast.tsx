import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastInput {
  type?: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_LIMIT = 3;
const TOAST_TTL = 5000;

function createToastId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
      timeoutsRef.current.clear();
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = createToastId();
      const nextToast: ToastItem = {
        id,
        type: input.type ?? 'info',
        message: input.message,
      };

      setToasts((prev) => [...prev, nextToast].slice(-TOAST_LIMIT));

      const timeout = setTimeout(() => removeToast(id), TOAST_TTL);
      timeoutsRef.current.set(id, timeout);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <output
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-xs shadow-lg transition-opacity',
              item.type === 'success' && 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400',
              item.type === 'error' && 'border-red-500/40 bg-red-500/10 text-red-500',
              item.type === 'info' && 'border-blue-500/40 bg-blue-500/10 text-blue-500',
            )}
          >
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current" />
            <div className="flex-1 text-[11px] leading-snug">
              {item.message}
            </div>
            <button
              type="button"
              onClick={() => removeToast(item.id)}
              className="ml-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </output>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
