"use client";

import { useState } from "react";
import { useData } from "@/lib/hooks/useScheduler";
import { useOptimisticCrud } from "@/lib/hooks/useOptimisticCrud";
import { FacultyModal } from "@/components/admin/FacultyModal";
import { Button } from "@/components/ui/Button";
import { Plus, GraduationCap, Clock } from "lucide-react";
import { Select } from "@/components/ui/Select";

export default function FacultyAdminPage() {
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: depts, loading: deptsLoading } = useData<any[]>("/api/scheduler/departments");
  
  if (!selectedDeptId && depts && depts.length > 0) {
    setSelectedDeptId(depts[0].id);
  }

  const selectedDeptName = depts?.find(d => d.id === selectedDeptId)?.name.toLowerCase() || "";
  const { data: stateData, loading: stateLoading, refresh } = useData<any>(selectedDeptName ? `/api/scheduler/state/${selectedDeptName}` : "", [selectedDeptName]);

  const crud = useOptimisticCrud<any>("/api/teachers", {
    setData: () => {},
    refresh,
  });

  const teachers = stateData?.teachers || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <GraduationCap className="h-6 w-6 text-purple-400" />
            Faculty Management
          </h1>
          <p className="text-slate-400 mt-1">Manage instructor access and scheduling preferences.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
           <Select
             value={selectedDeptId || ""}
             onChange={(e) => setSelectedDeptId(Number(e.target.value))}
             disabled={deptsLoading}
             className="w-48"
           >
             {deptsLoading ? <option value="">Loading...</option> : depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
           </Select>
           <Button variant="primary" onClick={() => setIsModalOpen(true)} className="gap-2 bg-purple-600 hover:bg-purple-500 shadow-purple-500/20">
             <Plus className="h-4 w-4" /> Add Faculty
           </Button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-xs uppercase text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium">Instructor</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Capacity</th>
                <th className="px-6 py-4 font-medium">Preferences</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 bg-slate-800">
              {stateLoading ? (
                <tr>
                   <td colSpan={4} className="p-6 text-center">
                      <div className="animate-pulse flex flex-col items-center">
                        <div className="h-4 w-1/3 bg-slate-700 rounded mb-2"></div>
                        <div className="h-4 w-1/4 bg-slate-700 rounded"></div>
                      </div>
                   </td>
                </tr>
              ) : teachers.length === 0 ? (
                <tr>
                   <td colSpan={4} className="p-12 text-center text-slate-500">
                      <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No faculty members found.</p>
                   </td>
                </tr>
              ) : (
                teachers.map((t: any) => (
                  <tr key={t.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-200">
                      <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs uppercase">
                            {t.name.split(" ").map((n:any) => n[0]).join("").substring(0,2)}
                         </div>
                         {t.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {t.email ? (
                        <a href={`mailto:${t.email}`} className="text-indigo-400 hover:underline">{t.email}</a>
                      ) : (
                        <span className="text-slate-500 italic">No email</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300">
                          {t.max_classes_per_day} classes/day
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-400 text-xs bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full w-fit">
                         <Clock className="h-3.5 w-3.5 text-amber-500" />
                         Slots {t.preferred_start_slot} — {t.preferred_end_slot}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FacultyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (data) => {
          const res = await crud.createItem(data);
          if (res) refresh();
          return res;
        }}
        departments={depts || []}
        selectedDept={selectedDeptId}
      />
    </div>
  );
}
