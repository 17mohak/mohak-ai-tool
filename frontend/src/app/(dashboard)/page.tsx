"use client";

import { useState, useEffect } from "react";
import { Building2, Users, BookOpen, GraduationCap } from "lucide-react";
import { useData } from "@/lib/hooks/useScheduler";
import { useOptimisticCrud } from "@/lib/hooks/useOptimisticCrud";
import { EntityCard } from "@/components/dashboard/EntityCard";
import { FloatingActionButton } from "@/components/layout/FloatingActionButton";
import { DepartmentModal } from "@/components/admin/DepartmentModal";
import { BatchModal } from "@/components/admin/BatchModal";
import { SubjectModal } from "@/components/admin/SubjectModal";
import { FacultyModal } from "@/components/admin/FacultyModal";
import { SchedulePreviewCard } from "@/components/dashboard/SchedulePreviewCard";
import { Select } from "@/components/ui/Select";

interface DeptSummary { id: number; name: string; batch_count: number; teacher_count: number; subject_count: number; }

export default function DashboardPage() {
  // Global State for Dashboard View
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  
  // Modals state
  const [modalState, setModalState] = useState<{
    dept: boolean; batch: boolean; subject: boolean; faculty: boolean;
  }>({ dept: false, batch: false, subject: false, faculty: false });

  // 1. Fetch Departments List
  const { data: depts, loading: deptsLoading, refresh: refreshDepts, setData: setDepts } = useData<DeptSummary[]>("/api/scheduler/departments");

  // Auto-select first department if none selected
  useEffect(() => {
    if (depts && depts.length > 0 && !selectedDeptId) {
      setSelectedDeptId(depts[0].id);
    }
  }, [depts, selectedDeptId]);

  const selectedDeptName = depts?.find(d => d.id === selectedDeptId)?.name.toLowerCase() || "";
  
  // 2. Fetch Full State for Selected Department
  const { data: stateData, loading: stateLoading, refresh: refreshState, setData: setStateData } = 
    useData<any>(selectedDeptName ? `/api/scheduler/state/${selectedDeptName}` : "", [selectedDeptName]);

  // Provide optimistic hooks for each entity type
  const deptCrud = useOptimisticCrud<DeptSummary>("/api/scheduler/departments", {
    setData: setDepts as any,
    refresh: refreshDepts,
  });

  const batchCrud = useOptimisticCrud<any>("/api/scheduler/batches", {
    setData: (action) => setStateData((prev: any) => ({ ...prev, batches: typeof action === "function" ? action(prev?.batches || []) : action })),
    refresh: refreshState,
  });

  const subjectCrud = useOptimisticCrud<any>("/api/scheduler/subjects", {
    setData: (action) => setStateData((prev: any) => ({ ...prev, subjects: typeof action === "function" ? action(prev?.subjects || []) : action })),
    refresh: refreshState,
  });

  const facultyCrud = useOptimisticCrud<any>("/api/scheduler/teachers", {
    setData: (action) => setStateData((prev: any) => ({ ...prev, teachers: typeof action === "function" ? action(prev?.teachers || []) : action })),
    refresh: refreshState,
  });

  const openModal = (type: keyof typeof modalState) => setModalState(prev => ({ ...prev, [type]: true }));
  const closeModal = (type: keyof typeof modalState) => setModalState(prev => ({ ...prev, [type]: false }));

  // Helper arrays for modals
  const batchesList = stateData?.batches || [];
  const teachersList = stateData?.teachers || [];
  const parentBatches = batchesList.filter((b: any) => !b.is_lab && !b.parent_batch_id);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            System Overview
          </h1>
          <p className="text-slate-400 mt-1">Live data orchestration and management.</p>
        </div>
        
        <div className="w-full sm:w-64">
           <Select
             value={selectedDeptId || ""}
             onChange={(e) => setSelectedDeptId(Number(e.target.value))}
             disabled={deptsLoading}
           >
             {deptsLoading ? (
               <option value="">Loading context...</option>
             ) : (
               depts?.map(d => <option key={d.id} value={d.id}>{d.name} Workspace</option>)
             )}
           </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <EntityCard
          title="Departments"
          count={depts?.length || 0}
          icon={Building2}
          items={depts || []}
          onAdd={() => openModal('dept')}
          onViewAll={() => {}}
          isLoading={deptsLoading}
        />
        <EntityCard
          title="Batches & Labs"
          count={stateData?.batches?.length || 0}
          icon={Users}
          items={stateData?.batches || []}
          onAdd={() => openModal('batch')}
          onViewAll={() => {}}
          isLoading={stateLoading || !selectedDeptName}
        />
        <EntityCard
          title="Subjects"
          count={stateData?.subjects?.length || 0}
          icon={BookOpen}
          items={stateData?.subjects || []}
          onAdd={() => openModal('subject')}
          onViewAll={() => {}}
          isLoading={stateLoading || !selectedDeptName}
        />
        <EntityCard
          title="Faculty"
          count={stateData?.teachers?.length || 0}
          icon={GraduationCap}
          items={stateData?.teachers || []}
          onAdd={() => openModal('faculty')}
          onViewAll={() => {}}
          isLoading={stateLoading || !selectedDeptName}
        />
      </div>

      <div className="mt-8">
        <SchedulePreviewCard runs={stateData?.runs} deptName={stateData?.department?.name || selectedDeptName} />
      </div>

      {depts && (
        <>
          <DepartmentModal
            isOpen={modalState.dept}
            onClose={() => closeModal('dept')}
            onSubmit={deptCrud.createItem}
          />
          <BatchModal
            isOpen={modalState.batch}
            onClose={() => closeModal('batch')}
            onSubmit={batchCrud.createItem}
            departments={depts}
            parentBatches={parentBatches}
            selectedDept={selectedDeptId}
          />
          <SubjectModal
            isOpen={modalState.subject}
            onClose={() => closeModal('subject')}
            onSubmit={subjectCrud.createItem}
            departments={depts}
            batches={batchesList}
            teachers={teachersList}
            selectedDept={selectedDeptId}
          />
          <FacultyModal
            isOpen={modalState.faculty}
            onClose={() => closeModal('faculty')}
            onSubmit={facultyCrud.createItem}
            departments={depts}
            selectedDept={selectedDeptId}
          />
        </>
      )}

      <FloatingActionButton
        onAddDept={() => openModal('dept')}
        onAddBatch={() => openModal('batch')}
        onAddSubject={() => openModal('subject')}
        onAddFaculty={() => openModal('faculty')}
      />
    </div>
  );
}
