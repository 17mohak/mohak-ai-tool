import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className={cn(
              "relative z-50 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-xl m-4",
              className
            )}
          >
            <div className="flex flex-col space-y-1.5 p-6 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold leading-none tracking-tight text-slate-100">
                    {title}
                  </h2>
                  {description && (
                    <p className="mt-2 text-sm text-slate-400">{description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-4 h-8 w-8 rounded-full text-slate-400 hover:text-slate-100"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>
            <div className="px-6 py-2 overflow-y-auto max-h-[60vh]">
              {children}
            </div>
            {footer && (
              <div className="flex items-center justify-end space-x-2 p-6 pt-4 border-t border-slate-700/50 mt-2 bg-slate-800/50">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
