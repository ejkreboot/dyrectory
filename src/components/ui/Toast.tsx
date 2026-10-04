import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { cx } from "./controls";

type Tone = "success" | "error";
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (tone: Tone, message: string) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-lg border bg-surface px-3.5 py-3 text-sm shadow-lg",
              t.tone === "error" ? "border-danger/25" : "border-line",
            )}
          >
            {t.tone === "error" ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />
            )}
            <p className="flex-1 text-ink">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
