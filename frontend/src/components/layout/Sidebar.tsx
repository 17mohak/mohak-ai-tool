"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Users,
  BookOpen,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const mainNavItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/scheduler", label: "Scheduler", icon: CalendarDays },
];

const adminNavItems = [
  { href: "/admin/departments", label: "Departments", icon: Building2 },
  { href: "/admin/batches", label: "Batches", icon: Users },
  { href: "/admin/subjects", label: "Subjects", icon: BookOpen },
  { href: "/admin/faculty", label: "Faculty", icon: GraduationCap },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <motion.aside
      animate={{ width: collapsed ? 80 : 256 }}
      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
      className="relative flex flex-col bg-slate-950 border-r border-slate-800 text-slate-300 z-30"
    >
      <div className="flex h-16 items-center justify-between px-4 shrink-0 border-b border-slate-800/50">
        <AnimatePresence mode="popLayout">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-3 overflow-hidden"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 shadow-sm shadow-indigo-500/20 text-white font-bold">
                A
              </div>
              <span className="font-semibold text-slate-100 tracking-tight whitespace-nowrap">Atlas Scheduler</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        {collapsed && (
          <div className="w-full flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 shadow-sm text-white font-bold">
              A
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors z-40"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-6 custom-scrollbar">
        <div className="px-3 space-y-1">
          {mainNavItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link key={href} href={href}>
                <div
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                    isActive
                      ? "bg-slate-800/80 text-white"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-1/2 -mt-3 h-6 w-1 rounded-r-full bg-indigo-500"
                    />
                  )}
                  <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-indigo-400" : ""}`} />
                  <AnimatePresence mode="popLayout">
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="font-medium text-sm whitespace-nowrap"
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Link>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mt-8 px-3">
            <AnimatePresence mode="popLayout">
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mb-2 px-3 text-xs font-semibold tracking-wider text-slate-500 uppercase"
                >
                  Admin
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-1">
              {adminNavItems.map(({ href, label, icon: Icon }) => {
                const isActive = pathname.startsWith(href);
                return (
                  <Link key={href} href={href}>
                    <div
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                        isActive
                          ? "bg-slate-800/80 text-white"
                          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="active-indicator"
                          className="absolute left-0 top-1/2 -mt-3 h-6 w-1 rounded-r-full bg-indigo-500"
                        />
                      )}
                      <Icon className={`h-5 w-5 shrink-0 ${isActive ? "text-indigo-400" : ""}`} />
                      <AnimatePresence mode="popLayout">
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            className="font-medium text-sm whitespace-nowrap"
                          >
                            {label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
