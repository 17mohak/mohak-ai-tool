"use client";

import DashboardOverview from "@/components/charts/DashboardOverview";
import { useTelemetry } from "@/lib/hooks/useTelemetry";

export default function DashboardPage() {
  const { agentStatus, isConnected, error } = useTelemetry();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Atlas Smart Class Scheduler</h1>
        <p className="text-slate-400 mt-0.5">
          Scheduler overview and real-time status.
        </p>
      </div>

      <DashboardOverview />

      {/* Live Agent Activity — real telemetry only */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-100">Timetable AI</h2>
            <span
              className={`w-2 h-2 rounded-full ${
                error ? "bg-red-500" : isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
              }`}
              title={error ? "Connection error" : isConnected ? "Connected" : "Connecting..."}
            />
          </div>
        </div>
        <div className="px-5 py-4 flex items-center gap-4">
          <span className="w-2 h-2 rounded-full shrink-0 bg-indigo-500" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-200">Timetable AI</p>
              {agentStatus?.agentName === "Timetable AI" && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    agentStatus.taskStatus === "Running"
                      ? "bg-amber-500/20 text-amber-400"
                      : agentStatus.taskStatus === "Success"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : agentStatus.taskStatus === "Failed"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {agentStatus.taskStatus}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 truncate mt-0.5">
              {agentStatus?.agentName === "Timetable AI"
                ? agentStatus.taskDescription
                : "Waiting for activity..."}
            </p>
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            {agentStatus?.agentName === "Timetable AI"
              ? agentStatus.lastUpdated.toLocaleTimeString()
              : "--:--:--"}
          </span>
        </div>
      </div>
    </div>
  );
}
