"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Search, Bell, Settings, Sparkles } from "lucide-react";
import AIManager from "@/components/ai/AIManager";

export default function Header() {
  const { user, logout } = useAuth();
  const [showAIManager, setShowAIManager] = useState(false);
  
  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const getInitials = (email: string) => {
    return email?.charAt(0).toUpperCase() || "A";
  };

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 bg-slate-900/40 backdrop-blur-md border-b border-slate-800/50 sticky top-0 z-40 shrink-0">
        <div className="flex-1 flex items-center">
          {/* Search Bar */}
          <div className="relative w-full max-w-md group cursor-pointer" onClick={() => {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
            </div>
            <div className="block w-full pl-10 pr-3 py-2 border border-slate-700/50 rounded-xl leading-5 bg-slate-800/40 text-slate-400 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 sm:text-sm transition-all hover:bg-slate-800 hover:border-slate-700">
              Search entities or actions...
              <span className="absolute right-2 top-2 hidden sm:block">
                <kbd className="inline-flex items-center rounded border border-slate-700 px-1.5 font-sans text-xs font-medium text-slate-500 bg-slate-800">
                  <abbr title="Command" className="no-underline">⌘</abbr> K
                </kbd>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* AI Manager Trigger */}
          {user && (
            <button 
              onClick={() => setShowAIManager(true)}
              className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <Sparkles className="h-4 w-4 text-indigo-400 group-hover:text-indigo-300" />
              <span className="text-sm font-medium text-indigo-300 group-hover:text-indigo-200">AI Assistant</span>
            </button>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-full transition-colors relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-slate-900" />
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-full transition-colors">
              <Settings className="h-5 w-5" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-700/50" />

          {/* User Profile */}
          <div className="group relative flex items-center justify-center p-0.5 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 transition-all hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200 border border-slate-700 group-hover:border-indigo-500/50 transition-colors">
              {user ? getInitials(user.email) : "A"}
            </div>
            
            <div className="absolute right-0 top-[calc(100%+0.5rem)] invisible opacity-0 translate-y-2 group-hover:visible group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 z-50">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <p className="text-sm font-medium text-slate-200 truncate">{user?.email || "user@example.com"}</p>
                <p className="text-xs text-slate-400 capitalize mt-0.5">{(user?.role || "Admin").toLowerCase()}</p>
              </div>
              <div className="p-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Expose AI Manager to UI */}
      {user && (
        <AIManager isOpen={showAIManager} onClose={() => setShowAIManager(false)} />
      )}
    </>
  );
}
