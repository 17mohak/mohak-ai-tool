"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface DepartmentSummary {
  id: number;
  name: string;
  batch_count: number;
}

interface ScheduleSlot {
  id: number;
  batch: string;
  subject: string;
  teacher: string;
  room: string;
  day: string;
  slot_index: number;
  start_time: string;
  end_time: string;
  time_label: string;
}

interface RunInfo {
  id: number;
  status: string;
  solver_status: string;
  created_at: string | null;
}

interface ScheduleResponse {
  department: string;
  run: RunInfo | null;
  slots: ScheduleSlot[];
  message?: string;
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri",
};

const TIME_SLOTS = [
  { index: 0, label: "09:00 – 10:30" },
  { index: 1, label: "11:00 – 12:30" },
  { index: 2, label: "14:00 – 15:30" },
  { index: 3, label: "16:00 – 17:30" },
];

const BATCH_COLORS = [
  { bg: "bg-indigo-500/15", border: "border-indigo-500/30", title: "text-indigo-300", sub: "text-indigo-400", dot: "bg-indigo-400" },
  { bg: "bg-emerald-500/15", border: "border-emerald-500/30", title: "text-emerald-300", sub: "text-emerald-400", dot: "bg-emerald-400" },
  { bg: "bg-amber-500/15", border: "border-amber-500/30", title: "text-amber-300", sub: "text-amber-400", dot: "bg-amber-400" },
  { bg: "bg-rose-500/15", border: "border-rose-500/30", title: "text-rose-300", sub: "text-rose-400", dot: "bg-rose-400" },
  { bg: "bg-cyan-500/15", border: "border-cyan-500/30", title: "text-cyan-300", sub: "text-cyan-400", dot: "bg-cyan-400" },
  { bg: "bg-purple-500/15", border: "border-purple-500/30", title: "text-purple-300", sub: "text-purple-400", dot: "bg-purple-400" },
];

export default function TimetablePage() {
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const depts = await api<DepartmentSummary[]>("/api/timetable/departments");
        setDepartments(depts);
        if (depts.length > 0) {
          setSelectedDept(depts[0].name);
        }
      } catch {
        setError("Failed to load departments");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const fetchSchedule = useCallback(async () => {
    if (!selectedDept) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api<ScheduleResponse>(
        `/api/timetable/schedule/${encodeURIComponent(selectedDept)}`
      );
      setSchedule(data);
      setSelectedBatch("ALL");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timetable");
      setSchedule(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDept]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const batchNames: string[] = schedule
    ? Array.from(new Set<string>(schedule.slots.map((s: ScheduleSlot) => s.batch))).sort()
    : [];

  const batchColorMap: Record<string, (typeof BATCH_COLORS)[number]> = {};
  batchNames.forEach((name: string, idx: number) => {
    batchColorMap[name] = BATCH_COLORS[idx % BATCH_COLORS.length];
  });

  const filteredSlots: ScheduleSlot[] =
    schedule && selectedBatch !== "ALL"
      ? schedule.slots.filter((s: ScheduleSlot) => s.batch === selectedBatch)
      : schedule?.slots ?? [];

  const getEntriesForCell = (day: string, slotIndex: number): ScheduleSlot[] => {
    return filteredSlots.filter((s) => s.day === day && s.slot_index === slotIndex);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Timetable Schedule</h1>
          <p className="text-slate-400 mt-0.5">View generated class schedules across departments.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="department" className="text-sm font-medium text-slate-400">Department:</label>
            <select
              id="department"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            >
              {departments.map((d) => (
                <option key={d.name} value={d.name}>{d.name} ({d.batch_count} batches)</option>
              ))}
            </select>
          </div>

          {batchNames.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="batch" className="text-sm font-medium text-slate-400">Batch:</label>
              <select
                id="batch"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              >
                <option value="ALL">All Batches</option>
                {batchNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={fetchSchedule}
            disabled={isLoading}
            className="px-3 py-2 text-sm font-medium text-indigo-400 hover:text-indigo-300 disabled:text-slate-500 transition-colors"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>

          {schedule?.run && (
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <span className={`px-2 py-0.5 rounded font-medium ${
                schedule.run.status === "PUBLISHED" ? "bg-emerald-500/20 text-emerald-400"
                : schedule.run.status === "DRAFT" ? "bg-amber-500/20 text-amber-400"
                : "bg-red-500/20 text-red-400"
              }`}>
                {schedule.run.status}
              </span>
              {schedule.run.created_at && (
                <span>Generated {new Date(schedule.run.created_at).toLocaleString()}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {schedule && !schedule.run && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <h3 className="text-lg font-semibold text-slate-200 mb-2">No Timetable Generated Yet</h3>
          <p className="text-slate-400 max-w-md mx-auto">
            {schedule.message || `Use the Scheduler page to generate a timetable for ${selectedDept}.`}
          </p>
        </div>
      )}

      {/* Timetable Grid */}
      {schedule?.slots && schedule.slots.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-slate-700/50 border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">Time</th>
                  {DAYS.map((day) => (
                    <th key={day} className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {DAY_SHORT[day] || day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {TIME_SLOTS.map((ts) => (
                  <tr key={ts.index} className="hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-sm font-medium text-slate-400 border-r border-slate-700/50 whitespace-nowrap">{ts.label}</td>
                    {DAYS.map((day) => {
                      const entries = getEntriesForCell(day, ts.index);
                      return (
                        <td key={`${day}-${ts.index}`} className="px-2 py-2 border-r border-slate-700/50 last:border-r-0 align-top">
                          {entries.length > 0 ? (
                            <div className="space-y-1">
                              {entries.map((entry) => {
                                const c = batchColorMap[entry.batch] || BATCH_COLORS[0];
                                return (
                                  <div key={entry.id} className={`${c.bg} border ${c.border} rounded-lg p-2 text-xs`}>
                                    <p className={`font-semibold ${c.title} truncate`}>{entry.subject}</p>
                                    <p className={`${c.sub} mt-0.5 truncate`}>{entry.teacher}</p>
                                    <p className="text-slate-500 mt-0.5 truncate">{entry.room}</p>
                                    {selectedBatch === "ALL" && batchNames.length > 1 && (
                                      <p className="text-slate-500 mt-1 truncate text-[10px]">{entry.batch}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="h-16 flex items-center justify-center">
                              <span className="text-slate-600 text-xs">—</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      {batchNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
          {batchNames.map((name) => {
            const c = batchColorMap[name];
            return (
              <div key={name} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${c.dot}`} />
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
