"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { CalendarDays, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface RunItem {
  id: number;
  status: string;
  solver_status: string;
  reason: string | null;
  created_at: string | null;
}

interface SlotEntry {
  id: number;
  day: string;
  slot_index: number;
  subject: string;
  teacher: string;
  room: string;
  batch: string;
  is_lab: boolean;
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const DAY_SHORT: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri" };
const TIME_SLOTS = [
  { index: 0, label: "09:00" },
  { index: 1, label: "11:00" },
  { index: 2, label: "14:00" },
  { index: 3, label: "16:00" },
];

export function SchedulePreviewCard({ runs, deptName }: { runs?: RunItem[], deptName?: string }) {
  const [slots, setSlots] = useState<SlotEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const latestSuccessRun = runs?.filter(r => r.solver_status === "SUCCESS").sort((a,b) => b.id - a.id)[0];

  useEffect(() => {
    if (!latestSuccessRun) {
      setSlots([]);
      return;
    }

    const fetchSlots = async () => {
      setLoading(true);
      try {
        const data = await api<SlotEntry[]>(`/api/scheduler/runs/${latestSuccessRun.id}/slots`);
        setSlots(data || []);
      } catch (err) {
        console.error("Failed to fetch slots for preview", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [latestSuccessRun]);

  // If no department or no successful run exists
  if (!deptName || !latestSuccessRun) {
    return (
      <div className="col-span-1 md:col-span-2 xl:col-span-4 bg-slate-800 rounded-2xl border border-slate-700 p-8 flex flex-col items-center justify-center text-center shadow-lg group hover:border-slate-600 transition-colors">
        <div className="h-16 w-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
          <CalendarDays className="h-8 w-8 text-slate-500" />
        </div>
        <h3 className="font-semibold text-slate-200 text-lg">No schedule generated yet</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm">
          Run the AI timetable solver for <span className="text-indigo-400 font-medium">{deptName || "a department"}</span> to view the generated schedule preview here.
        </p>
        <Link href="/scheduler" className="mt-6 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 active:scale-95">
          Generate Schedule <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Get abbreviated names safely
  const formatSubj = (name: string) => name.length > 12 ? name.substring(0, 10) + '..' : name;
  const formatFac = (name: string) => name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

  const getSlot = (day: string, slotIndex: number) => {
    // Return first slot found for simple preview
    return slots.find(s => s.day === day && s.slot_index === slotIndex);
  };

  return (
    <div className="col-span-1 md:col-span-2 xl:col-span-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-lg shadow-black/20 overflow-hidden flex flex-col hover:border-slate-600 hover:shadow-indigo-500/5 transition-all duration-300">
      <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-indigo-400" />
          <h2 className="font-semibold text-slate-200">Live Schedule Preview</h2>
          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
            Run #{latestSuccessRun.id}
          </span>
        </div>
        <Link href="/scheduler" className="text-sm text-slate-400 hover:text-indigo-400 flex items-center gap-1 transition-colors">
          Open Workbench <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="p-6 relative">
        {loading ? (
          <div className="h-[200px] flex items-center justify-center animate-pulse">
            <div className="text-slate-500 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
              Loading grid...
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr>
                  <th className="p-2 border-b border-r border-slate-700 w-16 text-center text-xs text-slate-500 font-medium bg-slate-900/40">Time</th>
                  {DAYS.map(d => (
                    <th key={d} className="p-2 border-b border-slate-700 text-center text-xs font-medium text-slate-300 bg-slate-900/40 w-[18%]">
                      {DAY_SHORT[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map(time => (
                  <tr key={time.index} className="group/row">
                    <td className="p-2 border-r border-b border-slate-700 text-center text-xs text-slate-500 font-medium bg-slate-900/20">
                      {time.label}
                    </td>
                    {DAYS.map(d => {
                      const s = getSlot(d, time.index);
                      return (
                        <td key={`${d}-${time.index}`} className="p-1 border-b border-slate-700/50 h-16 w-[18%]">
                          {s ? (
                            <div className={`h-full w-full rounded-md border flex flex-col justify-center px-2 py-1 transition-colors cursor-default
                              ${s.is_lab 
                                ? "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/40" 
                                : "bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40"}`}
                            >
                              <div className="font-semibold text-[11px] sm:text-xs text-slate-200 truncate leading-tight">
                                {formatSubj(s.subject)}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className={`text-[9px] font-bold px-1 rounded ${s.is_lab ? "bg-blue-500/20 text-blue-300" : "bg-indigo-500/20 text-indigo-300"}`}>
                                  {formatFac(s.teacher)}
                                </span>
                                <span className="text-[10px] text-slate-500 truncate max-w-[50%]">{s.batch}</span>
                              </div>
                            </div>
                          ) : (
                           <div className="h-full w-full rounded border border-dashed border-slate-700/50 bg-slate-800/20 hover:bg-slate-700/30 transition-colors" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs">
           <div className="flex items-center gap-1.5 text-slate-400">
             <span className="w-3 h-3 rounded bg-indigo-500/20 border border-indigo-500/30" /> Lecture
           </div>
           <div className="flex items-center gap-1.5 text-slate-400">
             <span className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/30" /> Lab
           </div>
           <div className="flex items-center gap-1.5 text-slate-400 ml-auto">
             <AlertCircle className="h-3 w-3" /> Preview showing single batch overlap
           </div>
        </div>
      </div>
    </div>
  );
}
