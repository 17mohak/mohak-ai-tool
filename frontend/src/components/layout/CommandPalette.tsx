"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Building2, Users, BookOpen, GraduationCap, Command } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

// Mock actions - later can be wired up to actual modals or navigation
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const actions = [
    { id: "dept", name: "Go to Departments", icon: Building2, action: () => router.push("/admin/departments") },
    { id: "batch", name: "Go to Batches", icon: Users, action: () => router.push("/admin/batches") },
    { id: "subj", name: "Go to Subjects", icon: BookOpen, action: () => router.push("/admin/subjects") },
    { id: "fac", name: "Go to Faculty", icon: GraduationCap, action: () => router.push("/admin/faculty") },
    { id: "dashboard", name: "Go to Dashboard", icon: Command, action: () => router.push("/") },
  ];

  const filteredActions = actions.filter((action) =>
    action.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl"
          >
            <div className="flex items-center border-b border-slate-700 px-4">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                autoFocus
                className="flex h-14 w-full bg-transparent px-4 text-slate-100 placeholder:text-slate-500 focus:outline-none"
                placeholder="Type a command or search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd className="hidden rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400 sm:block">
                ESC
              </kbd>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-2">
              {filteredActions.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">
                  No results found.
                </p>
              ) : (
                <ul className="text-sm text-slate-200">
                  {filteredActions.map((action) => (
                    <li
                      key={action.id}
                      className="flex cursor-pointer text-slate-300 hover:text-white items-center gap-3 px-4 py-3 hover:bg-slate-700/50"
                      onClick={() => {
                        action.action();
                        setOpen(false);
                      }}
                    >
                      <action.icon className="h-4 w-4 text-slate-400" />
                      {action.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
