import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastItem {
  id: number;
  msg: string;
  ok: boolean;
}

const ToastCtx = createContext<(msg: string, ok?: boolean) => void>(() => undefined);

export function useToast() {
  return useContext(ToastCtx);
}

type P = { children: ReactNode };

export function ToastProvider({ children }: P) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((msg: string, ok = true) => {
    const id = ++seq.current;
    setToasts(t => [...t, { id, msg, ok }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ok ? 3500 : 8000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={'toast ' + (t.ok ? 'ok' : 'err')}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}