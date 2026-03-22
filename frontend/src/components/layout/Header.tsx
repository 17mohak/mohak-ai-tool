"use client";

import { useState } from "react";
import AIManager from "@/components/ai/AIManager";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const [showAIManager, setShowAIManager] = useState(false);
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  // Get user initials
  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  return (
    <>
      <header className="h-14 border-b border-slate-700/50 bg-slate-800 px-6 flex items-center gap-4 shrink-0">
        <div className="flex-1 flex items-center">
          <div className="relative w-full max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 border border-slate-600 rounded-lg bg-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAIManager(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-medium"
            title="Open AI Manager"
          >
            <span className="text-lg">🤖</span>
            <span className="hidden sm:inline">AI Manager</span>
          </button>
        )}

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Online
          </span>
        </div>

        <div className="relative flex items-center gap-3 pl-2 border-l border-slate-700">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:bg-slate-700/50 rounded-lg px-2 py-1 transition-colors"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm ${
              isAdmin ? "bg-red-600" : "bg-indigo-600"
            }`}>
              {user ? getInitials(user.email) : "A"}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-200">{user?.email}</p>
               <p className="text-xs text-slate-400 capitalize">{(user?.role || "Unknown").toLowerCase()}</p>
            </div>
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 py-1">
                <div className="px-4 py-2 border-b border-slate-700">
                  <p className="text-sm font-medium text-slate-200 truncate">{user?.email}</p>
<p className="text-xs text-slate-400 capitalize">{(user?.role || "Unknown").toLowerCase()}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {isAdmin && (
        <AIManager isOpen={showAIManager} onClose={() => setShowAIManager(false)} />
      )}
    </>
  );
}
