"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DeptSummary {
  id: number;
  name: string;
  batch_count: number;
  teacher_count: number;
  subject_count: number;
}

export default function DashboardOverview() {
  const [depts, setDepts] = useState<DeptSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<DeptSummary[]>("/api/scheduler/departments")
      .then(setDepts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totals = {
    departments: depts.length,
    batches: depts.reduce((s, d) => s + d.batch_count, 0),
    teachers: depts.reduce((s, d) => s + d.teacher_count, 0),
    subjects: depts.reduce((s, d) => s + d.subject_count, 0),
  };

  const cards = [
    { title: "Departments", value: totals.departments, color: "text-indigo-400" },
    { title: "Batches", value: totals.batches, color: "text-teal-400" },
    { title: "Faculty", value: totals.teachers, color: "text-amber-400" },
    { title: "Subjects", value: totals.subjects, color: "text-rose-400" },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 p-5 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition-colors"
          >
            <p className="text-sm font-medium text-slate-400">{card.title}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {depts.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="font-semibold text-slate-100">Departments</h2>
          </div>
          <div className="divide-y divide-slate-700/50">
            {depts.map((d) => (
              <div key={d.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-700/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-sm font-bold">
                  {d.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-200 truncate">{d.name}</p>
                </div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>{d.batch_count} batches</span>
                  <span>{d.teacher_count} faculty</span>
                  <span>{d.subject_count} subjects</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
