"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Building2, Users, BookOpen, GraduationCap } from "lucide-react";
// Import modals later when built, for now just ui overlay

interface FABProps {
  onAddDept: () => void;
  onAddBatch: () => void;
  onAddSubject: () => void;
  onAddFaculty: () => void;
}

export function FloatingActionButton({ onAddDept, onAddBatch, onAddSubject, onAddFaculty }: FABProps) {
  const [open, setOpen] = useState(false);

  const actions = [
    { name: "Add Department", icon: Building2, color: "text-indigo-400", bg: "bg-indigo-500/20", onClick: onAddDept },
    { name: "Add Batch", icon: Users, color: "text-blue-400", bg: "bg-blue-500/20", onClick: onAddBatch },
    { name: "Add Subject", icon: BookOpen, color: "text-emerald-400", bg: "bg-emerald-500/20", onClick: onAddSubject },
    { name: "Add Faculty", icon: GraduationCap, color: "text-purple-400", bg: "bg-purple-500/20", onClick: onAddFaculty },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {open && (
           <motion.div
           initial={{ opacity: 0, scale: 0.8, y: 20 }}
           animate={{ opacity: 1, scale: 1, y: 0 }}
           exit={{ opacity: 0, scale: 0.8, y: 20 }}
           className="absolute bottom-16 right-0 flex flex-col items-end gap-3 mb-2"
         >
           {actions.map((action, i) => (
             <motion.button
               key={action.name}
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={() => {
                 action.onClick();
                 setOpen(false);
               }}
               className="flex items-center gap-3 rounded-full bg-slate-800 p-2 pr-4 shadow-lg border border-slate-700 hover:bg-slate-700 transition-colors"
             >
               <div className={`flex h-8 w-8 items-center justify-center rounded-full ${action.bg}`}>
                 <action.icon className={`h-4 w-4 ${action.color}`} />
               </div>
               <span className="text-sm font-medium text-slate-200">{action.name}</span>
             </motion.button>
           ))}
         </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/40"
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", bounce: 0.3 }}>
          <Plus className="h-6 w-6" />
        </motion.div>
      </motion.button>
    </div>
  );
}
