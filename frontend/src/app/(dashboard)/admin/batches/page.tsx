"use client";

import { useState } from "react";
import { useData } from "@/lib/hooks/useScheduler";
import { useOptimisticCrud } from "@/lib/hooks/useOptimisticCrud";
import { BatchModal } from "@/components/admin/BatchModal";
import { Button } from "@/components/ui/Button";
import { Plus, Users, Beaker, ChevronRight } from "lucide-react";
import { Select } from "@/components/ui/Select";

export default function BatchesAdminPage() {
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: depts, loading: deptsLoading } = useData<any[]>("/api/scheduler/departments");
  
  if (!selectedDeptId && depts && depts.length > 0) {
    setSelectedDeptId(depts[0].id);
  }

  const selectedDeptName = depts?.find(d => d.id === selectedDeptId)?.name.toLowerCase() || "";
  const { data: stateData, loading: stateLoading, refresh } = useData<any>(selectedDeptName ? `/api/scheduler/state/${selectedDeptName}` : "", [selectedDeptName]);

  const crud = useOptimisticCrud<any>("/api/batches", {
    setData: () => {}, // Handled by refresh
    refresh,
  });

  const batches = stateData?.batches || [];
  const parentBatches = batches.filter((b: any) => !b.is_lab && !b.parent_batch_id);
  
  // Group labs by parent
  const tree = parentBatches.map((parent: any) => ({
    ...parent,
    labs: batches.filter((b: any) => b.parent_batch_id === parent.id || (b.is_lab && b.name.includes(parent.name)))
  }));
  
  // Floating labs (no parent)
  const floatingLabs = batches.filter((b: any) => b.is_lab && !b.parent_batch_id && !tree.some((p:any) => p.labs.find((l:any) => l.id === b.id)));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Users className="h-6 w-6 text-teal-400" />
            Batch Management
          </h1>
          <p className="text-slate-400 mt-1">Manage parent batches and nested laboratory groups.</p>
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
           <Button variant="primary" onClick={() => setIsModalOpen(true)} className="gap-2">
             <Plus className="h-4 w-4" /> Add Batch
           </Button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-lg shadow-black/20">
        <div className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/50 flex justify-between items-center">
           <h2 className="font-semibold text-slate-200">Hierarchy View</h2>
           <span className="text-sm text-slate-400">{batches.length} total batches</span>
        </div>
        
        <div className="p-6">
          {stateLoading ? (
            <div className="space-y-4">
               {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-700/30 animate-pulse rounded-xl" />)}
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12">
               <Users className="h-12 w-12 text-slate-600 mx-auto mb-4" />
               <p className="text-slate-400">No batches found for this department.</p>
               <Button onClick={() => setIsModalOpen(true)} variant="ghost" className="mt-4">Create your first block</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {tree.map((parent: any) => (
                <div key={parent.id} className="rounded-xl border border-slate-700 bg-slate-900/50 overflow-hidden transition-all hover:border-slate-600">
                  <div className="px-5 py-4 flex items-center justify-between bg-slate-800/30">
                     <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-teal-500/20 flex items-center justify-center text-teal-400">
                           <Users className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200">{parent.name}</p>
                          <p className="text-xs text-slate-400">{parent.size} Students • Max {parent.max_classes_per_day} classes/day</p>
                        </div>
                     </div>
                     <span className="px-2.5 py-1 rounded-full bg-slate-700 text-xs font-medium text-slate-300">
                        Parent
                     </span>
                  </div>
                  
                  {parent.labs.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-700/50 space-y-2 bg-slate-900/80">
                       {parent.labs.map((lab: any) => (
                         <div key={lab.id} className="flex items-center gap-3 pl-6 relative">
                            {/* Tree connector line */}
                            <div className="absolute left-2.5 top-0 bottom-1/2 w-px bg-slate-700" />
                            <div className="absolute left-2.5 top-1/2 w-3 h-px bg-slate-700" />
                            
                            <div className="flex items-center justify-between w-full p-2.5 rounded-lg border border-slate-700/50 bg-slate-800 hover:bg-slate-700/50 transition-colors">
                              <div className="flex items-center gap-3">
                                <Beaker className="h-4 w-4 text-blue-400" />
                                <span className="font-medium text-sm text-slate-300">{lab.name}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-xs text-slate-500">{lab.size} Students</span>
                                <span className="px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium">
                                  Lab
                                </span>
                              </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
                </div>
              ))}
              
              {floatingLabs.map((lab: any) => (
                 <div key={lab.id} className="rounded-xl border border-slate-700 bg-slate-900/50 overflow-hidden">
                   <div className="px-5 py-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                           <Beaker className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200">{lab.name}</p>
                          <p className="text-xs text-slate-400">{lab.size} Students</p>
                        </div>
                     </div>
                     <span className="px-2 py-0.5 rounded border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium">
                        Floating Lab
                     </span>
                   </div>
                 </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BatchModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (data) => {
          const res = await crud.createItem(data);
          if (res) refresh();
          return res;
        }}
        departments={depts || []}
        parentBatches={parentBatches}
        selectedDept={selectedDeptId}
      />
    </div>
  );
}
