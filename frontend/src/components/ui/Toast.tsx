"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (props: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback(
    ({ title, description, type }: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts((prev) => [...prev, { id, title, description, type }]);

      // Auto dismiss after 3s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    []
  );

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="pointer-events-auto flex w-[320px] items-start gap-3 rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-100 shadow-xl"
          >
            {t.type === "success" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />}
            {t.type === "error" && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />}
            {t.type === "info" && <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">i</div>}
            
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium leading-none">{t.title}</p>
              {t.description && (
                <p className="text-sm opacity-80 mt-1">{t.description}</p>
              )}
            </div>
            
            <button
              onClick={() => dismiss(t.id)}
              className="mt-0.5 shrink-0 rounded-full p-1 text-slate-400 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
