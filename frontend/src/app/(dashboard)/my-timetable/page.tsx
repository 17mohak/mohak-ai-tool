"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchWithAuth } from "@/lib/api";

interface ScheduleSlot {
  id: number;
  batch: string;
  subject: string;
  room: string;
  day: string;
  slot_index: number;
  start_time: string;
  end_time: string;
  time_label: string;
}

interface TimetableData {
  teacher: string;
  department: string | null;
  run: {
    id: number;
    status: string;
    created_at: string;
  } | null;
  slots: ScheduleSlot[];
  message?: string;
}

const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const timeSlots = [
  { index: 0, label: "09:00 – 10:30" },
  { index: 1, label: "11:00 – 12:30" },
  { index: 2, label: "14:00 – 15:30" },
  { index: 3, label: "16:00 – 17:30" },
];

export default function MyTimetablePage() {
  const { user } = useAuth();
  const [timetable, setTimetable] = useState<TimetableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMyTimetable();
  }, []);

  const fetchMyTimetable = async () => {
    try {
      const response = await fetchWithAuth("/api/staff/my-timetable");
      if (!response.ok) {
        throw new Error("Failed to fetch timetable");
      }
      const data = await response.json();
      setTimetable(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timetable");
    } finally {
      setIsLoading(false);
    }
  };

  const getSlotForDayAndTime = (day: string, slotIndex: number) => {
    if (!timetable) return null;
    return timetable.slots.find(
      (slot) => slot.day === day && slot.slot_index === slotIndex
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-900/50 p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-200">{error}</h3>
          </div>
        </div>
      </div>
    );
  }

  if (!timetable?.run) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My Timetable</h1>
          <p className="text-slate-400">{timetable?.teacher}</p>
        </div>

        <div className="rounded-lg bg-slate-800 p-8 text-center">
          <div className="text-6xl mb-4">📅</div>
          <h2 className="text-xl font-semibold text-white mb-2">No Published Timetable</h2>
          <p className="text-slate-400">{timetable?.message || "Your timetable has not been published yet."}</p>
          <p className="text-slate-500 text-sm mt-4">
            You will be able to view your schedule once the administrator publishes the timetable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Timetable</h1>
          <p className="text-slate-400">
            {timetable.teacher} • {timetable.department}
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-900/50 text-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            Published
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-700">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider bg-slate-800">
                Time
              </th>
              {days.map((day) => (
                <th
                  key={day}
                  className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider bg-slate-800"
                >
                  {day.charAt(0) + day.slice(1).toLowerCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {timeSlots.map((timeSlot) => (
              <tr key={timeSlot.index}>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300 bg-slate-800/50">
                  {timeSlot.label}
                </td>
                {days.map((day) => {
                  const slot = getSlotForDayAndTime(day, timeSlot.index);
                  return (
                    <td key={`${day}-${timeSlot.index}`} className="px-4 py-3">
                      {slot ? (
                        <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-3">
                          <p className="font-medium text-blue-200 text-sm">{slot.subject}</p>
                          <p className="text-xs text-blue-300/70">{slot.batch}</p>
                          <p className="text-xs text-blue-300/50">{slot.room}</p>
                        </div>
                      ) : (
                        <div className="h-full min-h-[60px]"></div>
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
  );
}
