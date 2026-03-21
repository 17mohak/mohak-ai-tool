"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api, fetchWithAuth } from "@/lib/api";

/* ─── Types matching backend contracts ─── */
interface Dept { id: number; name: string }
interface BatchItem { 
  id: number; 
  name: string; 
  size: number; 
  parent_batch_id: number | null; 
  is_lab: boolean; 
  max_classes_per_day: number;
  children?: BatchItem[];
}
interface TeacherItem { 
  id: number; 
  name: string; 
  email: string | null; 
  preferred_start_slot: number; 
  preferred_end_slot: number; 
  max_classes_per_day: number 
}
interface SubjectItem { 
  id: number; 
  name: string; 
  code: string | null; 
  credits: number; 
  batch_id: number | null; 
  batch_name: string; 
  teacher_id: number | null; 
  teacher_name: string; 
  department_id?: number 
}
interface PinnedSlotItem { 
  id: number; 
  subject_id: number; 
  subject_name: string; 
  day: string; 
  slot_index: number 
}
interface UnavailItem { 
  id: number; 
  teacher_id: number; 
  teacher_name: string; 
  day: string; 
  slot_index: number 
}
interface RunItem { 
  id: number; 
  status: string; 
  solver_status: string; 
  reason: string | null; 
  created_at: string | null 
}
interface DeptState { 
  department: Dept; 
  batches: BatchItem[]; 
  teachers: TeacherItem[]; 
  subjects: SubjectItem[]; 
  pinned_slots: PinnedSlotItem[]; 
  unavailabilities: UnavailItem[]; 
  runs: RunItem[] 
}
interface SlotEntry { 
  id: number; 
  day: string; 
  slot_index: number; 
  subject: string; 
  teacher: string; 
  room: string; 
  batch: string; 
  batch_id: number; 
  is_lab: boolean;
  teacher_id: number;
  subject_id: number;
}
interface VariantResult { 
  status: string; 
  variant: string; 
  run_id?: number; 
  reason?: string; 
  slots_created?: number 
}
interface DeptListItem { 
  id: number; 
  name: string; 
  batch_count: number; 
  teacher_count: number; 
  subject_count: number 
}

/* ─── Solver constants (source of truth: solver.py) ─── */
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const DAY_SHORT: Record<string, string> = { 
  MONDAY: "Mon", 
  TUESDAY: "Tue", 
  WEDNESDAY: "Wed", 
  THURSDAY: "Thu", 
  FRIDAY: "Fri" 
};
const TIME_SLOTS = [
  { index: 0, label: "09:00 – 10:30" },
  { index: 1, label: "11:00 – 12:30" },
  { index: 2, label: "14:00 – 15:30" },
  { index: 3, label: "16:00 – 17:30" },
];

type Tab = "subjects" | "faculty" | "unavailability";
type DragState = {
  slot: SlotEntry | null;
  sourceDay: string | null;
  sourceSlotIndex: number | null;
};

export default function SchedulerPage() {
  /* ── Global state ── */
  const [deptList, setDeptList] = useState<DeptListItem[]>([]);
  const [selectedDeptName, setSelectedDeptName] = useState("");
  const [state, setState] = useState<DeptState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Left panel state ── */
  const [tab, setTab] = useState<Tab>("subjects");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  /* ── Right panel state ── */
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [gridSlots, setGridSlots] = useState<SlotEntry[]>([]);
  const [gridLoading, setGridLoading] = useState(false);

  /* ── Generate state ── */
  const [generating, setGenerating] = useState(false);
  const [genDiag, setGenDiag] = useState<string | null>(null);

  /* ── Pinned slots ── */
  const [pinsOpen, setPinsOpen] = useState(false);
  const [newPinSubject, setNewPinSubject] = useState<number | "">("");
  const [newPinDay, setNewPinDay] = useState<string>(DAYS[0]);
  const [newPinSlot, setNewPinSlot] = useState<number>(0);

  /* ── Unavailability add ── */
  const [newUnavTeacher, setNewUnavTeacher] = useState<number | "">("");
  const [newUnavDay, setNewUnavDay] = useState<string>(DAYS[0]);
  const [newUnavSlot, setNewUnavSlot] = useState<number>(0);

  /* ── Drag and drop state ── */
  const [dragState, setDragState] = useState<DragState>({
    slot: null,
    sourceDay: null,
    sourceSlotIndex: null,
  });
  const [draggedOverCell, setDraggedOverCell] = useState<{day: string, slotIndex: number} | null>(null);

  /* ── Hierarchy modal state ── */
  const [hierarchyModalOpen, setHierarchyModalOpen] = useState(false);

  /* ── Fetch guards to prevent double calls in Strict Mode ── */
  const hasFetchedDepartments = useRef(false);
  const hasFetchedState = useRef(false);
  const hasFetchedGrid = useRef(false);

  /* ── Load department list ── */
  useEffect(() => {
    if (hasFetchedDepartments.current) return;
    hasFetchedDepartments.current = true;

    const loadDepartments = async () => {
      try {
        const response = await api<DeptListItem[] | { data: DeptListItem[] }>("/api/scheduler/departments");
        
        // Normalize: handle both direct array and { data: array } formats (CASE B/C fix)
        const d = Array.isArray(response) 
          ? response 
          : (response as { data: DeptListItem[] })?.data || [];
        
        if (!Array.isArray(d)) {
          setError(`Invalid response format: expected array, got ${typeof d}`);
          setLoading(false);
          return;
        }
        
        setDeptList(d);
        
        if (d.length > 0) {
          setSelectedDeptName(d[0].name);
        }
      } catch (err) {
        console.error("[Scheduler] Failed to load departments:", err);
        setError(err instanceof Error ? err.message : "Failed to load departments");
      } finally {
        setLoading(false);
      }
    };

    loadDepartments();
  }, []);

  /* ── Load department state ── */
  useEffect(() => {
    if (!selectedDeptName) return;
    if (hasFetchedState.current) return;
    hasFetchedState.current = true;

    const loadState = async () => {
      setLoading(true); setError(null); setGenDiag(null);
      try {
        const s = await api<DeptState>(`/api/scheduler/state/${encodeURIComponent(selectedDeptName)}`);
        setState(s);
        // Auto-select first run
        const successRuns = s.runs.filter(r => r.solver_status === "SUCCESS");
        if (successRuns.length > 0) setSelectedRunId(successRuns[0].id);
        else setSelectedRunId(null);
      } catch (err) {
        console.error("[Scheduler] Failed to load state:", err);
        setError(err instanceof Error ? err.message : "Failed to load state");
        setState(null);
      } finally {
        setLoading(false);
      }
    };

    loadState();
  }, [selectedDeptName]);

  /* ── Manual refresh function for handlers ── */
  const refreshState = async () => {
    if (!selectedDeptName) return;
    setLoading(true);
    setError(null);
    setGenDiag(null);
    try {
      const s = await api<DeptState>(`/api/scheduler/state/${encodeURIComponent(selectedDeptName)}`);
      setState(s);
      const successRuns = s.runs.filter(r => r.solver_status === "SUCCESS");
      if (successRuns.length > 0) setSelectedRunId(successRuns[0].id);
      else setSelectedRunId(null);
    } catch (err) {
      console.error("[Scheduler] Failed to refresh state:", err);
      setError(err instanceof Error ? err.message : "Failed to load state");
      setState(null);
    } finally {
      setLoading(false);
    }
  };

  /* ── Reset fetch guards when dependencies change ── */
  useEffect(() => {
    hasFetchedState.current = false;
  }, [selectedDeptName]);

  useEffect(() => {
    hasFetchedGrid.current = false;
  }, [selectedRunId, selectedBatchId]);

  /* ── Load grid slots for selected run ── */
  useEffect(() => {
    if (!selectedRunId) { setGridSlots([]); return; }
    if (hasFetchedGrid.current) return;
    hasFetchedGrid.current = true;

    const loadGrid = async () => {
      setGridLoading(true);
      try {
        let url = `/api/scheduler/runs/${selectedRunId}/slots`;
        if (selectedBatchId) url += `?batch_id=${selectedBatchId}`;
        const slots = await api<SlotEntry[]>(url);
        setGridSlots(slots);
      } catch (err) {
        console.error("[Scheduler] Failed to load grid slots:", err);
        setGridSlots([]);
      } finally { setGridLoading(false); }
    };

    loadGrid();
  }, [selectedRunId, selectedBatchId]);

  /* ── Generate variants ── */
  const handleGenerate = async () => {
    if (!selectedDeptName) return;
    setGenerating(true); setGenDiag(null);
    try {
      const res = await api<{ variants: VariantResult[] }>(`/api/scheduler/generate-variants/${encodeURIComponent(selectedDeptName)}`, { method: "POST" });
      const successes = res.variants.filter(v => v.status === "SUCCESS");
      const failures = res.variants.filter(v => v.status !== "SUCCESS");
      if (failures.length > 0) {
        setGenDiag(`${successes.length}/3 variants succeeded. ${failures.map(f => f.reason || f.status).join("; ")}`);
      }
      await refreshState(); // refresh
    } catch (err) {
      console.error("[Scheduler] Generation failed:", err);
      setGenDiag(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  /* ── Publish run ── */
  const handlePublish = async () => {
    if (!selectedRunId) return;
    try {
      await api(`/api/scheduler/runs/${selectedRunId}/publish`, { method: "POST" });
      await refreshState();
    } catch (err) {
      console.error("[Scheduler] Publish failed:", err);
      setGenDiag(err instanceof Error ? err.message : "Publish failed");
    }
  };

  /* ── Pinned slot CRUD ── */
  const handleAddPin = async () => {
    if (!newPinSubject) return;
    try {
      await fetchWithAuth("/api/scheduler/pinned-slots", { method: "POST", body: JSON.stringify({ subject_id: newPinSubject, day: newPinDay, slot_index: newPinSlot }) });
      await refreshState();
    } catch (err) {
      console.error("[Scheduler] Failed to add pinned slot:", err);
      setError("Failed to add pinned slot");
    }
  };
  const handleDeletePin = async (id: number) => {
    try {
      await fetchWithAuth(`/api/scheduler/pinned-slots/${id}`, { method: "DELETE" });
      await refreshState();
    } catch (err) {
      console.error("[Scheduler] Failed to delete pinned slot:", err);
      setError("Failed to delete pinned slot");
    }
  };

  /* ── Unavailability CRUD ── */
  const handleAddUnav = async () => {
    if (!newUnavTeacher) return;
    try {
      await fetchWithAuth("/api/scheduler/unavailability", { method: "POST", body: JSON.stringify({ teacher_id: newUnavTeacher, day: newUnavDay, slot_index: newUnavSlot }) });
      await refreshState();
    } catch (err) {
      console.error("[Scheduler] Failed to add unavailability:", err);
      setError("Failed to add unavailability");
    }
  };
  const handleDeleteUnav = async (id: number) => {
    try {
      await fetchWithAuth(`/api/scheduler/unavailability/${id}`, { method: "DELETE" });
      await refreshState();
    } catch (err) {
      console.error("[Scheduler] Failed to delete unavailability:", err);
      setError("Failed to delete unavailability");
    }
  };

  /* ── Grid helpers ── */
  const getCell = (day: string, slotIndex: number): SlotEntry[] =>
    gridSlots.filter(s => s.day === day && s.slot_index === slotIndex);

  const successRuns = state?.runs.filter(r => r.solver_status === "SUCCESS") || [];

  /* ── Check if slot is pinned ── */
  const isPinnedSlot = (subjectId: number, day: string, slotIndex: number): boolean => {
    return state?.pinned_slots.some(
      p => p.subject_id === subjectId && p.day === day && p.slot_index === slotIndex
    ) || false;
  };

  /* ── Check for conflicts ── */
  const checkConflicts = (slot: SlotEntry, targetDay: string, targetSlotIndex: number): string[] => {
    const conflicts: string[] = [];
    
    // Check if pinned
    if (isPinnedSlot(slot.subject_id, slot.day, slot.slot_index)) {
      conflicts.push("Pinned slot - cannot move");
    }
    
    // Check teacher conflict
    const teacherConflict = gridSlots.find(
      s => s.id !== slot.id && 
           s.teacher_id === slot.teacher_id && 
           s.day === targetDay && 
           s.slot_index === targetSlotIndex
    );
    if (teacherConflict) {
      conflicts.push(`Teacher conflict: ${slot.teacher} already teaching ${teacherConflict.subject}`);
    }
    
    // Check batch conflict
    const batchConflict = gridSlots.find(
      s => s.id !== slot.id && 
           s.batch_id === slot.batch_id && 
           s.day === targetDay && 
           s.slot_index === targetSlotIndex
    );
    if (batchConflict) {
      conflicts.push(`Batch conflict: ${slot.batch} already has ${batchConflict.subject}`);
    }
    
    return conflicts;
  };

  /* ── Drag and drop handlers ── */
  const handleDragStart = (e: React.DragEvent, slot: SlotEntry, day: string, slotIndex: number) => {
    // Check if slot is pinned
    if (isPinnedSlot(slot.subject_id, day, slotIndex)) {
      e.preventDefault();
      setGenDiag("Cannot drag pinned slots");
      return;
    }
    
    setDragState({ slot, sourceDay: day, sourceSlotIndex: slotIndex });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ slotId: slot.id, day, slotIndex }));
  };

  const handleDragOver = (e: React.DragEvent, day: string, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDraggedOverCell({ day, slotIndex });
  };

  const handleDragLeave = () => {
    setDraggedOverCell(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDay: string, targetSlotIndex: number) => {
    e.preventDefault();
    setDraggedOverCell(null);
    
    if (!dragState.slot) return;
    
    // Check conflicts
    const conflicts = checkConflicts(dragState.slot, targetDay, targetSlotIndex);
    if (conflicts.length > 0) {
      setGenDiag(conflicts.join("; "));
      setDragState({ slot: null, sourceDay: null, sourceSlotIndex: null });
      return;
    }
    
    // Note: Backend API for moving slots - requires backend endpoint
    setGenDiag("Slot movement not yet implemented");
    setDragState({ slot: null, sourceDay: null, sourceSlotIndex: null });
  };

  const handleDragEnd = () => {
    setDragState({ slot: null, sourceDay: null, sourceSlotIndex: null });
    setDraggedOverCell(null);
  };

  /* ── Batch hierarchy display with tree structure ── */
  const buildBatchTree = useMemo(() => {
    if (!state?.batches) return [];
    
    const batchMap = new Map<number, BatchItem & { children: BatchItem[] }>();
    const rootBatches: (BatchItem & { children: BatchItem[] })[] = [];
    
    // Initialize all batches with children array
    state.batches.forEach(b => {
      batchMap.set(b.id, { ...b, children: [] });
    });
    
    // Build tree structure
    state.batches.forEach(b => {
      const batch = batchMap.get(b.id)!;
      if (b.parent_batch_id && batchMap.has(b.parent_batch_id)) {
        batchMap.get(b.parent_batch_id)!.children.push(batch);
      } else {
        rootBatches.push(batch);
      }
    });
    
    return rootBatches;
  }, [state?.batches]);

  /* ── Render batch options recursively ── */
  const renderBatchOptions = (batches: BatchItem[], depth = 0): JSX.Element[] => {
    return batches.flatMap(b => [
      <option key={b.id} value={b.id}>
        {"\u00A0".repeat(depth * 2)}{depth > 0 ? "↳ " : ""}{b.name} ({b.size})
      </option>,
      ...(b.children ? renderBatchOptions(b.children, depth + 1) : [])
    ]);
  };

  /* ── Loading State ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 animate-pulse">Loading scheduler...</div>
      </div>
    );
  }

  /* ── Error State ── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-400 text-center">
          <p className="font-semibold">Error loading scheduler</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  /* ── Empty Departments State ── */
  if (deptList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-slate-400 text-center">
          <p className="font-semibold">No departments found</p>
          <p className="text-sm mt-1">Create a department to get started</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-5rem)]">
      {/* ═══ LEFT PANEL ═══ */}
      <div className="w-[380px] shrink-0 flex flex-col gap-4 overflow-y-auto pr-2">
        {/* Department selector */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Department</label>
          <select
            value={selectedDeptName}
            onChange={e => setSelectedDeptName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/30"
          >
            {deptList.length === 0 ? (
              <option value="">No departments available</option>
            ) : (
              deptList.map(d => <option key={d.name} value={d.name}>{d.name}</option>)
            )}
          </select>
        </div>

        {/* Batch selector with hierarchy */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-slate-400 uppercase">Batch Filter</label>
            <button 
              onClick={() => setHierarchyModalOpen(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Edit Hierarchy
            </button>
          </div>
          <select
            value={selectedBatchId ?? ""}
            onChange={e => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">All Batches</option>
            {buildBatchTree.length > 0 ? renderBatchOptions(buildBatchTree) : (
              state?.batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.parent_batch_id ? "↳ " : ""}{b.name} ({b.size})
                </option>
              ))
            )}
          </select>
          
          {/* Batch hierarchy visualization */}
          {buildBatchTree.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/50">
              <p className="text-[10px] font-medium text-slate-500 uppercase mb-2">Batch Structure</p>
              <div className="space-y-1">
                {buildBatchTree.map(parent => (
                  <div key={parent.id}>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                      <span className="text-slate-300 font-medium">{parent.name}</span>
                      <span className="text-slate-500">({parent.size})</span>
                    </div>
                    {parent.children && parent.children.length > 0 && (
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-slate-700 pl-2">
                        {parent.children.map(child => (
                          <div key={child.id} className="flex items-center gap-2 text-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                            <span className="text-slate-400">{child.name}</span>
                            <span className="text-slate-600">Lab</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b border-slate-700">
            {(["subjects", "faculty", "unavailability"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                  tab === t ? "text-indigo-400 border-b-2 border-indigo-400 bg-slate-700/30" : "text-slate-400 hover:text-slate-200"
                }`}>
                {t === "unavailability" ? "Unavail." : t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* ── SUBJECTS TAB ── */}
            {tab === "subjects" && (
              state?.subjects.length ? state.subjects.map(s => (
                <div key={s.id} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50">
                  <p className="text-sm font-medium text-slate-200">{s.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="px-2 py-0.5 bg-slate-600/50 rounded">{s.credits} lec/wk</span>
                    {s.batch_name && <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded">{s.batch_name}</span>}
                    {s.teacher_name && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">{s.teacher_name}</span>}
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No subjects found</p>
            )}

            {/* ── FACULTY TAB ── */}
            {tab === "faculty" && (
              state?.teachers.length ? state.teachers.map(t => (
                <div key={t.id} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50">
                  <p className="text-sm font-medium text-slate-200">{t.name}</p>
                  {t.email && <p className="text-xs text-slate-400 mt-0.5">{t.email}</p>}
                  <div className="mt-1.5 flex gap-2 text-xs text-slate-400">
                    <span className="px-2 py-0.5 bg-slate-600/50 rounded">
                      Slots {t.preferred_start_slot}–{t.preferred_end_slot}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-600/50 rounded">
                      Max {t.max_classes_per_day}/day
                    </span>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No faculty found</p>
            )}

            {/* ── UNAVAILABILITY TAB ── */}
            {tab === "unavailability" && (
              <>
                {state?.unavailabilities.length ? state.unavailabilities.map(u => (
                  <div key={u.id} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600/50 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{u.teacher_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {DAY_SHORT[u.day] || u.day} · {TIME_SLOTS.find(s => s.index === u.slot_index)?.label || `Slot ${u.slot_index}`}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteUnav(u.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10">✕</button>
                  </div>
                )) : <p className="text-sm text-slate-500 mb-2">No unavailabilities recorded</p>}

                {/* Add unavailability form */}
                <div className="bg-slate-600/30 rounded-lg p-3 border border-slate-600/50 space-y-2">
                  <p className="text-xs font-medium text-slate-400 uppercase">Add Unavailability</p>
                  <select value={newUnavTeacher} onChange={e => setNewUnavTeacher(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200">
                    <option value="">Select teacher</option>
                    {state?.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select value={newUnavDay} onChange={e => setNewUnavDay(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200">
                      {DAYS.map(d => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
                    </select>
                    <select value={newUnavSlot} onChange={e => setNewUnavSlot(Number(e.target.value))}
                      className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200">
                      {TIME_SLOTS.map(s => <option key={s.index} value={s.index}>{s.label}</option>)}
                    </select>
                  </div>
                  <button onClick={handleAddUnav} disabled={!newUnavTeacher}
                    className="w-full px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Add
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pinned Slots */}
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <button onClick={() => setPinsOpen(!pinsOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-slate-300 hover:text-slate-100 transition-colors">
            <span>Pinned Slots ({state?.pinned_slots.length || 0})</span>
            <span className={`transform transition-transform ${pinsOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          {pinsOpen && (
            <div className="px-4 pb-4 space-y-2 border-t border-slate-700 pt-3">
              {state?.pinned_slots.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-slate-700/50 rounded p-2 text-xs">
                  <span className="text-slate-200">{p.subject_name} → {DAY_SHORT[p.day] || p.day} · {TIME_SLOTS.find(s => s.index === p.slot_index)?.label || `Slot ${p.slot_index}`}</span>
                  <button onClick={() => handleDeletePin(p.id)} className="text-red-400 hover:text-red-300 px-1">✕</button>
                </div>
              ))}
              {/* Add pin form */}
              <div className="space-y-2 pt-2 border-t border-slate-700/50">
                <select value={newPinSubject} onChange={e => setNewPinSubject(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200">
                  <option value="">Select subject</option>
                  {state?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <select value={newPinDay} onChange={e => setNewPinDay(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200">
                    {DAYS.map(d => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
                  </select>
                  <select value={newPinSlot} onChange={e => setNewPinSlot(Number(e.target.value))}
                    className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200">
                    {TIME_SLOTS.map(s => <option key={s.index} value={s.index}>{s.label}</option>)}
                  </select>
                </div>
                <button onClick={handleAddPin} disabled={!newPinSubject}
                  className="w-full px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Add Pin
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Generate + Variant Buttons */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
          {/* Variant toggles */}
          {successRuns.length > 0 && (
            <div className="flex gap-2">
              {successRuns.slice(0, 3).map((r, i) => {
                const label = `V${i + 1}`;
                const isActive = r.id === selectedRunId;
                return (
                  <button key={r.id} onClick={() => setSelectedRunId(r.id)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isActive ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}>
                    {label}
                    <span className="block text-[10px] mt-0.5 opacity-60">
                      {r.status === "PUBLISHED" ? "Published" : "Draft"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedDeptName}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? "Generating..." : "Generate 3 Variants"}
          </button>

          {selectedRunId && successRuns.find(r => r.id === selectedRunId)?.status === "DRAFT" && (
            <button
              onClick={handlePublish}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors"
            >
              Publish Selected Variant
            </button>
          )}
        </div>

        {/* Diagnostics */}
        {genDiag && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <p className="text-xs text-amber-300">{genDiag}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* ═══ RIGHT PANEL — TIMETABLE GRID ═══ */}
      <div className="flex-1 overflow-auto">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden h-full flex flex-col">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-slate-200 text-sm">
                Timetable Preview
                {selectedRunId && <span className="text-slate-500 ml-2">Run #{selectedRunId}</span>}
              </h2>
              {dragState.slot && (
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                  Dragging: {dragState.slot.subject}
                </span>
              )}
            </div>
            {gridLoading && <span className="text-xs text-slate-500 animate-pulse">Loading...</span>}
          </div>

          {!selectedRunId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-slate-400 text-sm">No schedule generated yet</p>
                <p className="text-slate-500 text-xs mt-1">Click &quot;Generate 3 Variants&quot; to create schedules</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-700/50 border-b border-slate-700">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase w-28">Time</th>
                    {DAYS.map(d => (
                      <th key={d} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">{DAY_SHORT[d]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {TIME_SLOTS.map(ts => (
                    <tr key={ts.index} className="hover:bg-slate-700/10">
                      <td className="px-3 py-2 text-xs font-medium text-slate-400 border-r border-slate-700/30 whitespace-nowrap">{ts.label}</td>
                      {DAYS.map(day => {
                        const entries = getCell(day, ts.index);
                        const isDragOver = draggedOverCell?.day === day && draggedOverCell?.slotIndex === ts.index;
                        
                        return (
                          <td 
                            key={`${day}-${ts.index}`} 
                            className={`px-1.5 py-1.5 border-r border-slate-700/30 last:border-r-0 align-top transition-colors ${
                              isDragOver ? "bg-indigo-500/20 ring-2 ring-indigo-500/50" : ""
                            }`}
                            onDragOver={(e) => handleDragOver(e, day, ts.index)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, day, ts.index)}
                          >
                            {entries.length > 0 ? (
                              <div className="space-y-1">
                                {entries.map(e => {
                                  const pinned = isPinnedSlot(e.subject_id, day, ts.index);
                                  return (
                                    <div 
                                      key={e.id} 
                                      draggable={!pinned}
                                      onDragStart={(ev) => handleDragStart(ev, e, day, ts.index)}
                                      onDragEnd={handleDragEnd}
                                      className={`rounded-lg p-2 text-xs border cursor-move transition-all ${
                                        e.is_lab
                                          ? "bg-purple-500/15 border-purple-500/30"
                                          : "bg-indigo-500/10 border-indigo-500/20"
                                      } ${pinned ? "opacity-60 cursor-not-allowed" : "hover:ring-2 hover:ring-indigo-500/30"} ${
                                        dragState.slot?.id === e.id ? "ring-2 ring-amber-500/50" : ""
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <p className="font-semibold text-slate-200 truncate">{e.subject}</p>
                                        {pinned && (
                                          <span className="text-[10px] text-amber-400" title="Pinned">📌</span>
                                        )}
                                      </div>
                                      <p className="text-slate-400 truncate mt-0.5">{e.teacher}</p>
                                      <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                                        <span>{e.room}</span>
                                        <span>{e.batch}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div 
                                className="h-14 flex items-center justify-center"
                                onDragOver={(e) => handleDragOver(e, day, ts.index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, day, ts.index)}
                              >
                                <span className="text-slate-700 text-xs">—</span>
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
          )}
        </div>
      </div>

      {/* ═══ HIERARCHY MODAL ═══ */}
      {hierarchyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-200">Batch Hierarchy Editor</h3>
              <button 
                onClick={() => setHierarchyModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-slate-400 mb-4">
                This shows the current batch hierarchy. To modify batch relationships, use the admin panel.
              </p>
              <div className="space-y-4">
                {buildBatchTree.length > 0 ? buildBatchTree.map(parent => (
                  <div key={parent.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                        <span className="text-indigo-400 font-semibold">{parent.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{parent.name}</p>
                        <p className="text-xs text-slate-400">Parent Batch • {parent.size} students</p>
                      </div>
                    </div>
                    {parent.children && parent.children.length > 0 && (
                      <div className="mt-3 ml-4 space-y-2 border-l-2 border-slate-600 pl-4">
                        {parent.children.map(child => (
                          <div key={child.id} className="flex items-center gap-3 bg-slate-600/30 rounded p-3">
                            <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center">
                              <span className="text-purple-400 text-xs font-semibold">{child.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-sm text-slate-300">{child.name}</p>
                              <p className="text-xs text-slate-500">Lab Batch • {child.size} students</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )) : (
                  <p className="text-sm text-slate-500 text-center py-8">No batches found</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end">
              <button 
                onClick={() => setHierarchyModalOpen(false)}
                className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
