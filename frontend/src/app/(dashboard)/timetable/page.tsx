"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

/* ──────────────────────────────────────────── */
/*  Types                                       */
/* ──────────────────────────────────────────── */
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

/* ──────────────────────────────────────────── */
/*  Constants matching backend solver           */
/* ──────────────────────────────────────────── */
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const TIME_SLOTS = [
  { index: 0, label: "09:00 – 10:30" },
  { index: 1, label: "11:00 – 12:30" },
  { index: 2, label: "14:00 – 15:30" },
  { index: 3, label: "16:00 – 17:30" },
];

/* ──────────────────────────────────────────── */
/*  Color palette for batches                   */
/* ──────────────────────────────────────────── */
const BATCH_COLORS = [
  { bg: "bg-indigo-50", border: "border-indigo-200", title: "text-indigo-900", sub: "text-indigo-600", icon: "text-indigo-500", time: "text-indigo-400" },
  { bg: "bg-emerald-50", border: "border-emerald-200", title: "text-emerald-900", sub: "text-emerald-600", icon: "text-emerald-500", time: "text-emerald-400" },
  { bg: "bg-amber-50", border: "border-amber-200", title: "text-amber-900", sub: "text-amber-600", icon: "text-amber-500", time: "text-amber-400" },
  { bg: "bg-rose-50", border: "border-rose-200", title: "text-rose-900", sub: "text-rose-600", icon: "text-rose-500", time: "text-rose-400" },
  { bg: "bg-cyan-50", border: "border-cyan-200", title: "text-cyan-900", sub: "text-cyan-600", icon: "text-cyan-500", time: "text-cyan-400" },
  { bg: "bg-purple-50", border: "border-purple-200", title: "text-purple-900", sub: "text-purple-600", icon: "text-purple-500", time: "text-purple-400" },
];

export default function TimetablePage() {
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch departments on mount
  useEffect(() => {
    (async () => {
      try {
        const depts = await api<DepartmentSummary[]>("/api/timetable/departments");
        setDepartments(depts);
        if (depts.length > 0) {
          setSelectedDept(depts[0].name);
        }
      } catch (err) {
        setError("Failed to load departments");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Fetch timetable when department changes
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

  // Derived: unique batch names
  const batchNames: string[] = schedule
    ? Array.from(new Set<string>(schedule.slots.map((s: ScheduleSlot) => s.batch))).sort()
    : [];

  // Color map for batches
  const batchColorMap: Record<string, (typeof BATCH_COLORS)[number]> = {};
  batchNames.forEach((name: string, idx: number) => {
    batchColorMap[name] = BATCH_COLORS[idx % BATCH_COLORS.length];
  });

  // Filtered slots
  const filteredSlots: ScheduleSlot[] =
    schedule && selectedBatch !== "ALL"
      ? schedule.slots.filter((s: ScheduleSlot) => s.batch === selectedBatch)
      : schedule?.slots ?? [];

  // Grid lookup
  const getEntriesForCell = (day: string, slotIndex: number): ScheduleSlot[] => {
    return filteredSlots.filter(
      (s) => s.day === day && s.slot_index === slotIndex
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timetable Schedule</h1>
          <p className="text-slate-600 mt-0.5">
            View generated class schedules across departments.
          </p>
        </div>
        <button
          type="button"
          className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          onClick={() => {
            const event = new CustomEvent("open-ai-manager");
            window.dispatchEvent(event);
          }}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate with AI Manager
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="department" className="text-sm font-medium text-slate-700">
              Department:
            </label>
            <select
              id="department"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {departments.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.batch_count} batches)
                </option>
              ))}
            </select>
          </div>

          {batchNames.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="batch" className="text-sm font-medium text-slate-700">
                Batch:
              </label>
              <select
                id="batch"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="ALL">All Batches</option>
                {batchNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={fetchSchedule}
            disabled={isLoading}
            className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 transition-colors"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>

          {schedule?.run && (
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <span
                className={`px-2 py-0.5 rounded font-medium ${
                  schedule.run.status === "PUBLISHED"
                    ? "bg-emerald-100 text-emerald-700"
                    : schedule.run.status === "DRAFT"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {schedule.run.status}
              </span>
              {schedule.run.created_at && (
                <span>
                  Generated{" "}
                  {new Date(schedule.run.created_at).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {schedule && !schedule.run && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <span className="text-5xl mb-4 block">📅</span>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No Timetable Generated Yet
          </h3>
          <p className="text-slate-600 max-w-md mx-auto">
            {schedule.message ||
              `Use the AI Manager to generate a timetable for ${selectedDept}.`}
          </p>
        </div>
      )}

      {/* Timetable Grid */}
      {schedule?.slots && schedule.slots.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">
                    Time
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider"
                    >
                      {day.charAt(0) + day.slice(1).toLowerCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TIME_SLOTS.map((ts) => (
                  <tr key={ts.index} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-600 border-r border-slate-100 whitespace-nowrap">
                      {ts.label}
                    </td>
                    {DAYS.map((day) => {
                      const entries = getEntriesForCell(day, ts.index);
                      return (
                        <td
                          key={`${day}-${ts.index}`}
                          className="px-2 py-2 border-r border-slate-100 last:border-r-0 align-top"
                        >
                          {entries.length > 0 ? (
                            <div className="space-y-1">
                              {entries.map((entry) => {
                                const c = batchColorMap[entry.batch] || BATCH_COLORS[0];
                                return (
                                  <div
                                    key={entry.id}
                                    className={`${c.bg} border ${c.border} rounded-lg p-2 text-xs`}
                                  >
                                    <p className={`font-semibold ${c.title} truncate`}>
                                      {entry.subject}
                                    </p>
                                    <p className={`${c.sub} mt-0.5 truncate`}>
                                      {entry.teacher}
                                    </p>
                                    <div className={`flex items-center gap-1 mt-1 ${c.icon}`}>
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                      <span className="truncate">{entry.room}</span>
                                    </div>
                                    {selectedBatch === "ALL" && batchNames.length > 1 && (
                                      <p className={`${c.time} mt-1 truncate text-[10px]`}>
                                        {entry.batch}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="h-16 flex items-center justify-center">
                              <span className="text-slate-300 text-xs">—</span>
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
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          {batchNames.map((name) => {
            const c = batchColorMap[name];
            return (
              <div key={name} className="flex items-center gap-2">
                <div className={`w-4 h-4 ${c.bg} border ${c.border} rounded`} />
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
