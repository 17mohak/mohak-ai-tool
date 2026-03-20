"use client";

import { useState } from "react";
import AIManager from "@/components/ai/AIManager";

export default function Header() {
  const [showAIManager, setShowAIManager] = useState(false);

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

        <button
          type="button"
          onClick={() => setShowAIManager(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-medium"
          title="Open AI Manager"
        >
          <span className="text-lg">🤖</span>
          <span className="hidden sm:inline">AI Manager</span>
        </button>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Online
          </span>
        </div>

        <div className="flex items-center gap-3 pl-2 border-l border-slate-700">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
            A
          </div>
        </div>
      </header>

      <AIManager isOpen={showAIManager} onClose={() => setShowAIManager(false)} />
    </>
  );
}
