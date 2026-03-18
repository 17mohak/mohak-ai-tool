"use client";

import DashboardOverview from "@/components/charts/DashboardOverview";
import { useTelemetry } from "@/lib/hooks/useTelemetry";

export default function DashboardPage() {
  const { agentStatus, isConnected, error } = useTelemetry();

  const getStatusStyles = (status: string | undefined) => {
    switch (status) {
      case "Running":
        return "bg-amber-100 text-amber-700 animate-pulse";
      case "Success":
        return "bg-emerald-100 text-emerald-700";
      case "Failed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const getConnectionDot = () => {
    if (error) return "bg-red-500";
    if (isConnected) return "bg-emerald-500 animate-pulse";
    return "bg-slate-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Atlas Smart Class Scheduler</h1>
          <p className="text-slate-600 mt-0.5">
            Real-time status of Atlas University&apos;s Smart Class Scheduler ecosystem.
          </p>
        </div>
        <button
          type="button"
          className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          + New Agent
        </button>
      </div>

      <DashboardOverview />

      {/* Live Agent Activity Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-900">Live Agent Activity</h2>
            <span
              className={`w-2 h-2 rounded-full ${getConnectionDot()}`}
              title={error ? "Connection error" : isConnected ? "Connected" : "Connecting..."}
            />
          </div>
          <a href="#" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            View All
          </a>
        </div>
        <div className="divide-y divide-slate-100">
          {/* Timetable AI - Live from WebSocket */}
          <div className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
            <span className="w-2 h-2 rounded-full shrink-0 bg-indigo-500" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900">Timetable AI</p>
                {agentStatus?.agentName === "Timetable AI" && (
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${getStatusStyles(
                      agentStatus.taskStatus
                    )}`}
                  >
                    {agentStatus.taskStatus}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 truncate mt-0.5">
                {agentStatus?.agentName === "Timetable AI"
                  ? agentStatus.taskDescription
                  : "Waiting for activity..."}
              </p>
            </div>
            <span className="text-xs text-slate-400 shrink-0">
              {agentStatus?.agentName === "Timetable AI"
                ? agentStatus.lastUpdated.toLocaleTimeString()
                : "--:--:--"}
            </span>
          </div>

          {/* Static placeholder agents for context */}
          <div className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
            <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-500">HR Automation</p>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 shrink-0">
                  Idle
                </span>
              </div>
              <p className="text-sm text-slate-400 truncate mt-0.5">No active tasks</p>
            </div>
          </div>

          <div className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
            <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-500">Doc Intelligence</p>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 shrink-0">
                  Idle
                </span>
              </div>
              <p className="text-sm text-slate-400 truncate mt-0.5">No active tasks</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
