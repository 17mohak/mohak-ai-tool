"use client";

import { useState } from "react";
import { useData } from "@/lib/hooks/useScheduler";
import { useOptimisticCrud } from "@/lib/hooks/useOptimisticCrud";
import { SubjectModal } from "@/components/admin/SubjectModal";
import { Button } from "@/components/ui/Button";
import { Plus, BookOpen, GraduationCap, Users } from "lucide-react";
import { Select } from "@/components/ui/Select";

export default function SubjectsAdminPage() {
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: depts, loading: deptsLoading } = useData<any[]>("/api/scheduler/departments");
  
  if (!selectedDeptId && depts && depts.length > 0) {
    setSelectedDeptId(depts[0].id);
  }

  const selectedDeptName = depts?.find(d => d.id === selectedDeptId)?.name.toLowerCase() || "";
  const { data: stateData, loading: stateLoading, refresh } = useData<any>(selectedDeptName ? `/api/scheduler/state/${selectedDeptName}` : "", [selectedDeptName]);

  const crud = useOptimisticCrud<any>("/api/subjects", {
    setData: () => {},
    refresh,
  });

  const subjects = stateData?.subjects || [];
  const batches = stateData?.batches || [];
  const teachers = stateData?.teachers || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-emerald-400" />
            Subject Management
          </h1>
          <p className="text-slate-400 mt-1">Manage course offerings and mappings.</p>
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
           <Button variant="primary" onClick={() => setIsModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20">
             <Plus className="h-4 w-4" /> Add Subject
           </Button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-xs uppercase text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium">Subject</th>
                <th className="px-6 py-4 font-medium">Code & Credits</th>
                <th className="px-6 py-4 font-medium">Assigned Batch</th>
                <th className="px-6 py-4 font-medium">Assigned Faculty</th>
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
              ) : subjects.length === 0 ? (
                <tr>
                   <td colSpan={4} className="p-12 text-center text-slate-500">
                      <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No subjects found.</p>
                   </td>
                </tr>
              ) : (
                subjects.map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-200">{sub.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                         <span className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">{sub.code || "N/A"}</span>
                         <span className="text-slate-500">{sub.credits}Cr</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {sub.batch_name ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                          <Users className="h-3.5 w-3.5" />
                          {sub.batch_name}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {sub.teacher_name ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
                          <GraduationCap className="h-3.5 w-3.5" />
                          {sub.teacher_name}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SubjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (data) => {
          const res = await crud.createItem(data);
          if (res) refresh();
          return res;
        }}
        departments={depts || []}
        batches={batches}
        teachers={teachers}
        selectedDept={selectedDeptId}
      />
    </div>
  );
}
