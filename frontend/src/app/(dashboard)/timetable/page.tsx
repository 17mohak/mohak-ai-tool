"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface TimetableEntry {
  id: number;
  subject: string;
  teacher: string;
  room: string;
  day: string;
  start_time: string;
  end_time: string;
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

const TIME_SLOTS = [
  "08:00:00",
  "09:00:00",
  "10:00:00",
  "11:00:00",
  "12:00:00",
  "13:00:00",
  "14:00:00",
  "15:00:00",
  "16:00:00",
  "17:00:00",
];

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const date = new Date();
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getTimeSlotIndex(timeStr: string): number {
  return TIME_SLOTS.findIndex((slot) => timeStr >= slot && timeStr < getNextHour(slot));
}

function getNextHour(timeStr: string): string {
  const [hours] = timeStr.split(":");
  const nextHour = parseInt(hours, 10) + 1;
  return `${nextHour.toString().padStart(2, "0")}:00:00`;
}

function getDurationSlots(startTime: string, endTime: string): number {
  const startIndex = TIME_SLOTS.findIndex((slot) => startTime >= slot);
  const endIndex = TIME_SLOTS.findIndex((slot) => endTime <= slot);
  return Math.max(1, endIndex - startIndex);
}

export default function TimetablePage() {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string>("1");

  const fetchTimetable = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api<TimetableEntry[]>(`/api/timetable/${departmentId}`);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch timetable");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetable();
  }, [departmentId]);

  const getEntryForSlot = (day: string, timeSlot: string): TimetableEntry | null => {
    return (
      entries.find(
        (entry) =>
          entry.day === day &&
          entry.start_time >= timeSlot &&
          entry.start_time < getNextHour(timeSlot)
      ) || null
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timetable Schedule</h1>
          <p className="text-slate-600 mt-0.5">
            View and manage class schedules across departments.
          </p>
        </div>
        <button
          type="button"
          className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          onClick={() => {
            // Open AI Manager modal - handled by global layout
            const event = new CustomEvent("open-ai-manager");
            window.dispatchEvent(event);
          }}
        >
          <span className="flex items-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Open AI Manager to Reschedule
          </span>
        </button>
      </div>

      {/* Department Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <label htmlFor="department" className="text-sm font-medium text-slate-700">
            Department:
          </label>
          <select
            id="department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="1">Computer Science</option>
            <option value="2">Electrical Engineering</option>
            <option value="3">Mechanical Engineering</option>
            <option value="4">Business Administration</option>
          </select>
          <button
            onClick={fetchTimetable}
            disabled={isLoading}
            className="px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 transition-colors"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error Message */}
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

      {/* Timetable Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
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
              {TIME_SLOTS.map((timeSlot, timeIndex) => (
                <tr key={timeSlot} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-600 border-r border-slate-100">
                    {formatTime(timeSlot)}
                  </td>
                  {DAYS.map((day) => {
                    const entry = getEntryForSlot(day, timeSlot);
                    return (
                      <td
                        key={`${day}-${timeSlot}`}
                        className="px-2 py-2 border-r border-slate-100 last:border-r-0"
                      >
                        {entry ? (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-xs">
                            <p className="font-semibold text-indigo-900 truncate">
                              {entry.subject}
                            </p>
                            <p className="text-indigo-600 mt-0.5 truncate">
                              {entry.teacher}
                            </p>
                            <div className="flex items-center gap-1 mt-1 text-indigo-500">
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              <span className="truncate">{entry.room}</span>
                            </div>
                            <p className="text-indigo-400 mt-1">
                              {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                            </p>
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

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-indigo-50 border border-indigo-200 rounded" />
          <span>Scheduled Class</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-50 border border-slate-200 rounded" />
          <span>Available Slot</span>
        </div>
      </div>
    </div>
  );
}
