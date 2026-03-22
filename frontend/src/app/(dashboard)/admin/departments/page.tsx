"use client";

import { useState } from "react";
import { useData } from "@/lib/hooks/useScheduler";
import { useOptimisticCrud } from "@/lib/hooks/useOptimisticCrud";
import { DepartmentModal } from "@/components/admin/DepartmentModal";
import { Button } from "@/components/ui/Button";
import { Plus, Building2 } from "lucide-react";

export default function DepartmentsAdminPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: depts, loading, refresh, setData } = useData<any[]>("/api/scheduler/departments");

  const crud = useOptimisticCrud<any>("/api/departments", {
    setData,
    refresh,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Building2 className="h-6 w-6 text-indigo-400" />
            Departments
          </h1>
          <p className="text-slate-400 mt-1">Manage top-level organizational workspaces.</p>
        </div>
        
        <div className="flex items-center gap-3">
           <Button variant="primary" onClick={() => setIsModalOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20">
             <Plus className="h-4 w-4" /> Add Department
           </Button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/50 text-xs uppercase text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-medium">Department Name</th>
                <th className="px-6 py-4 font-medium text-center">Batches</th>
                <th className="px-6 py-4 font-medium text-center">Faculty</th>
                <th className="px-6 py-4 font-medium text-center">Subjects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50 bg-slate-800">
              {loading ? (
                <tr>
                   <td colSpan={4} className="p-6 text-center">
                      <div className="animate-pulse flex flex-col items-center">
                        <div className="h-4 w-1/3 bg-slate-700 rounded mb-2"></div>
                      </div>
                   </td>
                </tr>
              ) : !depts || depts.length === 0 ? (
                <tr>
                   <td colSpan={4} className="p-12 text-center text-slate-500">
                      <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>No departments found.</p>
                   </td>
                </tr>
              ) : (
                depts.map((d: any) => (
                  <tr key={d.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="px-6 py-4 font-medium text-slate-200">
                      <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm uppercase">
                            {d.name.substring(0,2)}
                         </div>
                         {d.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-slate-300 font-medium">
                        {d.batch_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-slate-300 font-medium">
                        {d.teacher_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-slate-300 font-medium">
                        {d.subject_count}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DepartmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (data) => {
          const res = await crud.createItem(data);
          if (res) refresh();
          return res;
        }}
      />
    </div>
  );
}
