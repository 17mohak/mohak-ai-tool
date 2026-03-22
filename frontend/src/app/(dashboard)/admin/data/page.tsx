"use client";

import { useEffect, useState, useMemo } from "react";
import { api, fetchWithAuth } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Department {
  id: number;
  name: string;
  batch_count?: number;
  teacher_count?: number;
  subject_count?: number;
}

interface Batch {
  id: number;
  name: string;
  size: number;
  max_classes_per_day: number;
  department_id: number;
  parent_batch_id: number | null;
  is_lab: boolean;
}

interface Subject {
  id: number;
  name: string;
  code: string | null;
  credits: number;
  department_id: number;
  batch_id: number | null;
  batch_name?: string;
  teacher_id: number | null;
  teacher_name?: string;
}

interface Teacher {
  id: number;
  name: string;
  email: string | null;
  department_id: number;
  max_classes_per_day: number;
  preferred_start_slot: number;
  preferred_end_slot: number;
}

interface Room {
  id: number;
  name: string;
  capacity: number;
  is_lab: boolean;
}

type ToastType = "success" | "error";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function DataManagementPage() {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // ─── Filters ───────────────────────────────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<number | "">("");
  const [selectedBatch, setSelectedBatch] = useState<number | "">("");
  
  // ─── Modals ─────────────────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<"dept" | "batch" | "subject" | "teacher" | "room" | null>(null);
  
  // ─── Load Data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAllData();
  }, []);
  
  const loadAllData = async () => {
    try {
      setLoading(true);
      const [depts, bats, subs, tchs, rms] = await Promise.all([
        api<Department[]>("/api/scheduler/departments"),
        api<Batch[]>("/api/scheduler/batches"),
        api<Subject[]>("/api/scheduler/subjects"),
        api<Teacher[]>("/api/scheduler/teachers"),
        api<Room[]>("/api/scheduler/rooms"),
      ]);
      
      setDepartments(depts);
      setBatches(bats);
      setSubjects(subs);
      setTeachers(tchs);
      setRooms(rms);
    } catch (err) {
      showToast("Failed to load data", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  // ─── Toast Helper ──────────────────────────────────────────────────────────
  const showToast = (message: string, type: ToastType = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };
  
  // ─── Derived Data (Filtered) ───────────────────────────────────────────────
  const filteredBatches = useMemo(() => {
    if (!selectedDept) return batches;
    return batches.filter(b => b.department_id === selectedDept);
  }, [batches, selectedDept]);
  
  const filteredSubjects = useMemo(() => {
    let subs = subjects;
    if (selectedDept) {
      subs = subs.filter(s => s.department_id === selectedDept);
    }
    if (selectedBatch) {
      subs = subs.filter(s => s.batch_id === selectedBatch);
    }
    return subs;
  }, [subjects, selectedDept, selectedBatch]);
  
  const filteredTeachers = useMemo(() => {
    if (!selectedDept) return teachers;
    return teachers.filter(t => t.department_id === selectedDept);
  }, [teachers, selectedDept]);
  
  // ─── Create Handlers ───────────────────────────────────────────────────────
  const handleCreateDept = async (data: { name: string }) => {
    try {
      const res = await fetchWithAuth("/api/scheduler/departments", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newDept = await res.json();
      setDepartments(prev => [...prev, { ...newDept, batch_count: 0, teacher_count: 0, subject_count: 0 }]);
      showToast(`Department "${data.name}" created`);
      setActiveModal(null);
    } catch (err) {
      showToast("Failed to create department", "error");
    }
  };
  
  const handleCreateBatch = async (data: { name: string; size: number; department_id: number; parent_batch_id?: number }) => {
    try {
      const res = await fetchWithAuth("/api/scheduler/batches", {
        method: "POST",
        body: JSON.stringify({ ...data, max_classes_per_day: 6 }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newBatch = await res.json();
      setBatches(prev => [...prev, { ...newBatch, is_lab: !!data.parent_batch_id }]);
      showToast(`Batch "${data.name}" created`);
      setActiveModal(null);
    } catch (err) {
      showToast("Failed to create batch", "error");
    }
  };
  
  const handleCreateSubject = async (data: { name: string; code: string; credits: number; department_id: number; batch_id?: number; teacher_id?: number }) => {
    try {
      const res = await fetchWithAuth("/api/scheduler/subjects", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newSubject = await res.json();
      
      // Enrich with names
      const batch = batches.find(b => b.id === data.batch_id);
      const teacher = teachers.find(t => t.id === data.teacher_id);
      
      setSubjects(prev => [...prev, {
        ...newSubject,
        batch_name: batch?.name,
        teacher_name: teacher?.name,
      }]);
      showToast(`Subject "${data.name}" created`);
      setActiveModal(null);
    } catch (err) {
      showToast("Failed to create subject", "error");
    }
  };
  
  const handleCreateTeacher = async (data: { name: string; email: string; department_id: number }) => {
    try {
      const res = await fetchWithAuth("/api/scheduler/teachers", {
        method: "POST",
        body: JSON.stringify({ ...data, max_classes_per_day: 4, preferred_start_slot: 0, preferred_end_slot: 8 }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newTeacher = await res.json();
      setTeachers(prev => [...prev, newTeacher]);
      showToast(`Teacher "${data.name}" created`);
      setActiveModal(null);
    } catch (err) {
      showToast("Failed to create teacher", "error");
    }
  };
  
  const handleCreateRoom = async (data: { name: string; capacity: number; is_lab: boolean }) => {
    try {
      const res = await fetchWithAuth("/api/scheduler/rooms", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newRoom = await res.json();
      setRooms(prev => [...prev, newRoom]);
      showToast(`Room "${data.name}" created`);
      setActiveModal(null);
    } catch (err) {
      showToast("Failed to create room", "error");
    }
  };
  
  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading data...</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Data Management</h1>
          <p className="text-slate-400 mt-1">Manage departments, batches, subjects, and faculty</p>
        </div>
      </div>
      
      {/* Global Filters */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <div className="flex gap-4 items-center">
          <span className="text-sm text-slate-400">Filter by:</span>
          <select
            value={selectedDept}
            onChange={e => {
              setSelectedDept(e.target.value ? Number(e.target.value) : "");
              setSelectedBatch("");
            }}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          
          <select
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value ? Number(e.target.value) : "")}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
          >
            <option value="">All Batches</option>
            {filteredBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          
          {(selectedDept || selectedBatch) && (
            <button
              onClick={() => { setSelectedDept(""); setSelectedBatch(""); }}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      
      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Departments Panel */}
        <DataPanel
          title="Departments"
          count={departments.length}
          onAdd={() => setActiveModal("dept")}
        >
          <div className="divide-y divide-slate-700">
            {departments.map(dept => (
              <div key={dept.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-200">{dept.name}</p>
                  <p className="text-xs text-slate-500">
                    {dept.batch_count || 0} batches · {dept.teacher_count || 0} teachers · {dept.subject_count || 0} subjects
                  </p>
                </div>
              </div>
            ))}
          </div>
        </DataPanel>
        
        {/* Batches Panel */}
        <DataPanel
          title={`Batches ${selectedDept ? "(filtered)" : ""}`}
          count={filteredBatches.length}
          onAdd={() => setActiveModal("batch")}
        >
          <div className="divide-y divide-slate-700">
            {filteredBatches.map(batch => (
              <div key={batch.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-200">{batch.name}</p>
                    {batch.is_lab && (
                      <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded">Lab</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Size: {batch.size}</p>
                </div>
              </div>
            ))}
            {filteredBatches.length === 0 && (
              <p className="py-4 text-center text-slate-500 text-sm">No batches found</p>
            )}
          </div>
        </DataPanel>
        
        {/* Subjects Panel */}
        <DataPanel
          title={`Subjects ${(selectedDept || selectedBatch) ? "(filtered)" : ""}`}
          count={filteredSubjects.length}
          onAdd={() => setActiveModal("subject")}
        >
          <div className="divide-y divide-slate-700 max-h-64 overflow-y-auto">
            {filteredSubjects.map(subj => (
              <div key={subj.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-200">{subj.name}</p>
                  <span className="text-xs text-slate-500">{subj.credits} credits</span>
                </div>
                <p className="text-xs text-slate-500">
                  {subj.code && <span className="font-mono mr-2">{subj.code}</span>}
                  {subj.batch_name && <span>Batch: {subj.batch_name}</span>}
                  {subj.teacher_name && <span className="ml-2">Teacher: {subj.teacher_name}</span>}
                </p>
              </div>
            ))}
            {filteredSubjects.length === 0 && (
              <p className="py-4 text-center text-slate-500 text-sm">No subjects found</p>
            )}
          </div>
        </DataPanel>
        
        {/* Teachers Panel */}
        <DataPanel
          title={`Faculty ${selectedDept ? "(filtered)" : ""}`}
          count={filteredTeachers.length}
          onAdd={() => setActiveModal("teacher")}
        >
          <div className="divide-y divide-slate-700 max-h-64 overflow-y-auto">
            {filteredTeachers.map(teacher => (
              <div key={teacher.id} className="py-3">
                <p className="font-medium text-slate-200">{teacher.name}</p>
                <p className="text-xs text-slate-500">
                  {teacher.email || "No email"} · Max {teacher.max_classes_per_day} classes/day
                </p>
              </div>
            ))}
            {filteredTeachers.length === 0 && (
              <p className="py-4 text-center text-slate-500 text-sm">No teachers found</p>
            )}
          </div>
        </DataPanel>
        
        {/* Rooms Panel - Full Width */}
        <DataPanel
          title="Rooms"
          count={rooms.length}
          onAdd={() => setActiveModal("room")}
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {rooms.map(room => (
              <div key={room.id} className="p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-200 text-sm">{room.name}</p>
                  {room.is_lab && (
                    <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded">Lab</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">Capacity: {room.capacity}</p>
              </div>
            ))}
          </div>
        </DataPanel>
      </div>
      
      {/* Modals */}
      {activeModal === "dept" && (
        <CreateModal title="Add Department" onClose={() => setActiveModal(null)}>
          <DepartmentForm onSubmit={handleCreateDept} />
        </CreateModal>
      )}
      
      {activeModal === "batch" && (
        <CreateModal title="Add Batch" onClose={() => setActiveModal(null)}>
          <BatchForm 
            departments={departments} 
            batches={batches.filter(b => !b.parent_batch_id)} 
            onSubmit={handleCreateBatch} 
          />
        </CreateModal>
      )}
      
      {activeModal === "subject" && (
        <CreateModal title="Add Subject" onClose={() => setActiveModal(null)}>
          <SubjectForm 
            departments={departments}
            batches={filteredBatches}
            teachers={filteredTeachers}
            onSubmit={handleCreateSubject}
          />
        </CreateModal>
      )}
      
      {activeModal === "teacher" && (
        <CreateModal title="Add Teacher" onClose={() => setActiveModal(null)}>
          <TeacherForm departments={departments} onSubmit={handleCreateTeacher} />
        </CreateModal>
      )}
      
      {activeModal === "room" && (
        <CreateModal title="Add Room" onClose={() => setActiveModal(null)}>
          <RoomForm onSubmit={handleCreateRoom} />
        </CreateModal>
      )}
      
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
              toast.type === "success" 
                ? "bg-green-600 text-white" 
                : "bg-red-600 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function DataPanel({ 
  title, 
  count, 
  children, 
  onAdd,
  className = ""
}: { 
  title: string; 
  count: number; 
  children: React.ReactNode; 
  onAdd: () => void;
  className?: string;
}) {
  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-200">{title}</h2>
          <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded-full">{count}</span>
        </div>
        <button
          onClick={onAdd}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          + Add
        </button>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function CreateModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">×</button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMS
// ═══════════════════════════════════════════════════════════════════════════════

function DepartmentForm({ onSubmit }: { onSubmit: (data: { name: string }) => void }) {
  const [name, setName] = useState("");
  
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name }); }} className="space-y-4">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Department Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          placeholder="e.g., Computer Science"
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded">
          Create
        </button>
      </div>
    </form>
  );
}

function BatchForm({ 
  departments, 
  batches,
  onSubmit 
}: { 
  departments: Department[]; 
  batches: Batch[];
  onSubmit: (data: { name: string; size: number; department_id: number; parent_batch_id?: number }) => void;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(60);
  const [deptId, setDeptId] = useState("");
  const [isLab, setIsLab] = useState(false);
  const [parentBatchId, setParentBatchId] = useState("");
  
  const availableParents = batches.filter(b => b.department_id === Number(deptId) && !b.parent_batch_id);
  
  return (
    <form 
      onSubmit={e => { 
        e.preventDefault(); 
        onSubmit({ 
          name, 
          size, 
          department_id: Number(deptId),
          ...(isLab && parentBatchId ? { parent_batch_id: Number(parentBatchId) } : {})
        }); 
      }} 
      className="space-y-4"
    >
      <div>
        <label className="block text-sm text-slate-400 mb-1">Department</label>
        <select
          value={deptId}
          onChange={e => setDeptId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          required
        >
          <option value="">Select department</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Batch Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            placeholder="e.g., CSE-A"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Size</label>
          <input
            type="number"
            value={size}
            onChange={e => setSize(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            min={1}
            required
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isLab"
          checked={isLab}
          onChange={e => setIsLab(e.target.checked)}
          className="rounded bg-slate-700 border-slate-600"
        />
        <label htmlFor="isLab" className="text-sm text-slate-400">This is a lab sub-batch</label>
      </div>
      
      {isLab && (
        <div>
          <label className="block text-sm text-slate-400 mb-1">Parent Batch</label>
          <select
            value={parentBatchId}
            onChange={e => setParentBatchId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            required={isLab}
          >
            <option value="">Select parent batch</option>
            {availableParents.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      
      <div className="flex justify-end gap-2">
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded">
          Create
        </button>
      </div>
    </form>
  );
}

function SubjectForm({ 
  departments, 
  batches, 
  teachers, 
  onSubmit 
}: { 
  departments: Department[]; 
  batches: Batch[]; 
  teachers: Teacher[]; 
  onSubmit: (data: { name: string; code: string; credits: number; department_id: number; batch_id?: number; teacher_id?: number }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState(3);
  const [deptId, setDeptId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  
  const availableBatches = batches.filter(b => b.department_id === Number(deptId));
  const availableTeachers = teachers.filter(t => t.department_id === Number(deptId));
  
  return (
    <form 
      onSubmit={e => { 
        e.preventDefault(); 
        onSubmit({ 
          name, 
          code, 
          credits, 
          department_id: Number(deptId),
          ...(batchId ? { batch_id: Number(batchId) } : {}),
          ...(teacherId ? { teacher_id: Number(teacherId) } : {}),
        }); 
      }} 
      className="space-y-4"
    >
      <div>
        <label className="block text-sm text-slate-400 mb-1">Department</label>
        <select
          value={deptId}
          onChange={e => setDeptId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          required
        >
          <option value="">Select department</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Subject Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            placeholder="e.g., Data Structures"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Code</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            placeholder="e.g., CS201"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm text-slate-400 mb-1">Credits</label>
        <input
          type="number"
          value={credits}
          onChange={e => setCredits(Number(e.target.value))}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          min={1}
          max={6}
          required
        />
      </div>
      
      {deptId && (
        <>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Batch (optional)</label>
            <select
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            >
              <option value="">Select batch</option>
              {availableBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-1">Teacher (optional)</label>
            <select
              value={teacherId}
              onChange={e => setTeacherId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            >
              <option value="">Select teacher</option>
              {availableTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </>
      )}
      
      <div className="flex justify-end gap-2">
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded">
          Create
        </button>
      </div>
    </form>
  );
}

function TeacherForm({ 
  departments, 
  onSubmit 
}: { 
  departments: Department[]; 
  onSubmit: (data: { name: string; email: string; department_id: number }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [deptId, setDeptId] = useState("");
  
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name, email, department_id: Number(deptId) }); }} className="space-y-4">
      <div>
        <label className="block text-sm text-slate-400 mb-1">Department</label>
        <select
          value={deptId}
          onChange={e => setDeptId(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          required
        >
          <option value="">Select department</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      
      <div>
        <label className="block text-sm text-slate-400 mb-1">Teacher Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          placeholder="e.g., Dr. Smith"
          required
        />
      </div>
      
      <div>
        <label className="block text-sm text-slate-400 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
          placeholder="smith@college.edu"
        />
      </div>
      
      <div className="flex justify-end gap-2">
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded">
          Create
        </button>
      </div>
    </form>
  );
}

function RoomForm({ onSubmit }: { onSubmit: (data: { name: string; capacity: number; is_lab: boolean }) => void }) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(60);
  const [isLab, setIsLab] = useState(false);
  
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ name, capacity, is_lab: isLab }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Room Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            placeholder="e.g., CR-101"
            required
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Capacity</label>
          <input
            type="number"
            value={capacity}
            onChange={e => setCapacity(Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200"
            min={1}
            required
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="roomIsLab"
          checked={isLab}
          onChange={e => setIsLab(e.target.checked)}
          className="rounded bg-slate-700 border-slate-600"
        />
        <label htmlFor="roomIsLab" className="text-sm text-slate-400">This is a lab room</label>
      </div>
      
      <div className="flex justify-end gap-2">
        <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded">
          Create
        </button>
      </div>
    </form>
  );
}
