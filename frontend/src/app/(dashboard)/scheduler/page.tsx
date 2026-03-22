"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api, fetchWithAuth } from "@/lib/api";
import { motion } from "framer-motion";

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
  created_at: string | null;
  slots?: SlotEntry[]; // Embedded slots from generation - PRIMARY source
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
interface ValidationIssue { batch: string; batch_id?: number; required: number; available: number; reason: string; }
interface VariantResult { 
  status: string; 
  variant: string; 
  run_id?: number; 
  reason?: string; 
  slots_created?: number;
  id?: number;
  solver_status?: string;
  created_at?: string | null;
  slots?: SlotEntry[]; // Embedded slots from generation response
}

/* ── Response normalizer helper ── */
const normalizeRuns = (res: any): RunItem[] => {
  if (!res) return [];
  // Handle direct array
  if (Array.isArray(res)) return res;
  // Handle { variants: [...] } format
  if (res.variants && Array.isArray(res.variants)) {
    return res.variants.map((v: VariantResult) => ({
      id: v.run_id || v.id || 0,
      status: v.status === "SUCCESS" ? "DRAFT" : "FAILED",
      solver_status: v.status || "FAILED",
      reason: v.reason || null,
      created_at: v.created_at || new Date().toISOString()
    }));
  }
  // Handle { runs: [...] } format
  if (res.runs && Array.isArray(res.runs)) return res.runs;
  // Handle { data: [...] } format
  if (res.data && Array.isArray(res.data)) return res.data;
  return [];
};
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

// Real-world time structure with breaks
const TIME_SLOTS = [
  { index: 0, label: "07:30 - 08:30", start_time: "07:30", end_time: "08:30", is_break: false, is_locked: false },
  { index: 1, label: "08:30 - 09:30", start_time: "08:30", end_time: "09:30", is_break: false, is_locked: false },
  { index: 2, label: "09:30 - 10:00", start_time: "09:30", end_time: "10:00", is_break: true, is_locked: false }, // BREAK
  { index: 3, label: "10:00 - 11:00", start_time: "10:00", end_time: "11:00", is_break: false, is_locked: false },
  { index: 4, label: "11:00 - 12:00", start_time: "11:00", end_time: "12:00", is_break: false, is_locked: false },
  { index: 5, label: "12:00 - 12:15", start_time: "12:00", end_time: "12:15", is_break: true, is_locked: false }, // BREAK
  { index: 6, label: "12:15 - 13:15", start_time: "12:15", end_time: "13:15", is_break: false, is_locked: false },
  { index: 7, label: "13:15 - 14:15", start_time: "13:15", end_time: "14:15", is_break: false, is_locked: false },
];

// Wednesday elective slots (10:00 - 12:00) - LOCKED
const WEDNESDAY_ELECTIVE_SLOTS = [3, 4]; // indices for 10:00-11:00 and 11:00-12:00

// Available slots for classes (excluding breaks)
const AVAILABLE_SLOTS = TIME_SLOTS.filter(s => !s.is_break);

// Deterministic color palette for teachers (6 distinct colors)
const TEACHER_COLORS = [
  { bg: "bg-blue-500/10", border: "border-blue-500/30", accent: "bg-blue-500/50", text: "text-blue-300" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", accent: "bg-emerald-500/50", text: "text-emerald-300" },
  { bg: "bg-amber-500/10", border: "border-amber-500/30", accent: "bg-amber-500/50", text: "text-amber-300" },
  { bg: "bg-rose-500/10", border: "border-rose-500/30", accent: "bg-rose-500/50", text: "text-rose-300" },
  { bg: "bg-cyan-500/10", border: "border-cyan-500/30", accent: "bg-cyan-500/50", text: "text-cyan-300" },
  { bg: "bg-violet-500/10", border: "border-violet-500/30", accent: "bg-violet-500/50", text: "text-violet-300" },
];

// Get deterministic color for a teacher based on their ID
const getTeacherColor = (teacherId: number) => {
  const colorIndex = Math.abs(teacherId) % TEACHER_COLORS.length;
  return TEACHER_COLORS[colorIndex];
};

type Tab = "subjects" | "faculty" | "unavailability";
type DragState = {
  slot: SlotEntry | null;
  newSubject?: SubjectItem | null;
  sourceDay: string | null;
  sourceSlotIndex: number | null;
};

export default function SchedulerPage() {
  /* ── Global state ── */
  const [deptList, setDeptList] = useState<DeptListItem[]>([]);
  const [selectedDeptName, setSelectedDeptName] = useState("");
  const [state, setState] = useState<DeptState | null>(null);
  const [runs, setRuns] = useState<RunItem[]>([]); // Direct runs state for immediate rendering
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
  const [genIssues, setGenIssues] = useState<ValidationIssue[] | null>(null);
  const [generationStep, setGenerationStep] = useState<string | null>(null);
  const [aiLogs, setAiLogs] = useState<string[]>([]);
  const [aiInput, setAiInput] = useState<string>("");
  const [aiCommand, setAiCommand] = useState<string>("");

  /* ── Pinned slots ── */
  const [pinsOpen, setPinsOpen] = useState(false);
  const [batchStructureOpen, setBatchStructureOpen] = useState(false);
  const [newPinSubject, setNewPinSubject] = useState<number | "">("");
  const [newPinDay, setNewPinDay] = useState<string>(DAYS[0]);
  const [newPinSlot, setNewPinSlot] = useState<number>(0);

  /* ── AI Action state ── */
  const [aiActionOpen, setAiActionOpen] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiDiff, setAiDiff] = useState<any[] | null>(null);
  const [aiDiag, setAiDiag] = useState<string | null>(null);

  /* ── Unavailability add ── */
  const [newUnavTeacher, setNewUnavTeacher] = useState<number | "">("");
  const [newUnavDay, setNewUnavDay] = useState<string>(DAYS[0]);
  const [newUnavSlot, setNewUnavSlot] = useState<number>(0);

  /* ── Drag and drop state ── */
  const [dragState, setDragState] = useState<DragState>({
    slot: null,
    newSubject: null,
    sourceDay: null,
    sourceSlotIndex: null,
  });
  const [draggedOverCell, setDraggedOverCell] = useState<{day: string, slotIndex: number, valid?: boolean} | null>(null);

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
        // Sync runs state
        setRuns(s.runs || []);
        // Auto-select first run
        const successRuns = s.runs.filter(r => r.solver_status === "SUCCESS");
        if (successRuns.length > 0) setSelectedRunId(successRuns[0].id);
        else setSelectedRunId(null);
      } catch (err) {
        console.error("[Scheduler] Failed to load state:", err);
        setError(err instanceof Error ? err.message : "Failed to load state");
        setState(null);
        setRuns([]);
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
      console.log("[refreshState] Fetching state for:", selectedDeptName);
      const s = await api<DeptState>(`/api/scheduler/state/${encodeURIComponent(selectedDeptName)}`);
      console.log("[refreshState] Received state with runs:", s.runs?.length || 0, s.runs);
      setState(s);
      // Sync runs state
      setRuns(s.runs || []);
      const successRuns = s.runs.filter(r => r.solver_status === "SUCCESS");
      console.log("[refreshState] Success runs:", successRuns.length);
      if (successRuns.length > 0) {
        const latestRun = successRuns.sort((a, b) => b.id - a.id)[0];
        console.log("[refreshState] Auto-selecting run:", latestRun.id);
        setSelectedRunId(latestRun.id);
      }
      else setSelectedRunId(null);
    } catch (err) {
      console.error("[Scheduler] Failed to refresh state:", err);
      setError(err instanceof Error ? err.message : "Failed to load state");
      setState(null);
      setRuns([]);
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

  /* ── Clear errors when batch changes ── */
  useEffect(() => {
    console.log(`[BATCH CHANGE] Clearing ALL errors. New batch: ${selectedBatchId}`);
    setGenIssues(null);
    setGenDiag(null);
    setError(null);  // Also clear API errors
  }, [selectedBatchId]);

  /* ── Load grid slots for selected run ── */
  // CRITICAL FIX: FULL TRACING + Local slots priority
  useEffect(() => {
    console.log("🧠🧠🧠 GRID useEffect TRIGGERED 🧠🧠🧠");
    console.log("   selectedRunId:", selectedRunId);
    console.log("   hasFetchedGrid.current:", hasFetchedGrid.current);
    console.log("   runs.length:", runs.length);
    
    if (!selectedRunId) {
      console.warn("⛔⛔⛔ No selectedRunId, clearing gridSlots");
      setGridSlots([]);
      return;
    }
    
    // PRIORITY 1: Check for embedded slots in local runs state
    const selectedRun = runs.find(r => r.id === selectedRunId);
    console.log("   selectedRun found:", !!selectedRun);
    console.log("   selectedRun.slots:", selectedRun?.slots?.length || 0);
    
    if (selectedRun?.slots && selectedRun.slots.length > 0) {
      console.log(`✅✅✅ USING LOCAL SLOTS: ${selectedRun.slots.length} slots`);
      setGridSlots(selectedRun.slots);
      hasFetchedGrid.current = true;
      console.log("✅✅✅ gridSlots SET from local, returning");
      return;
    }
    console.log("   No local slots, checking fetch guard...");
    
    // PRIORITY 2: Only fetch from backend if no local slots
    if (hasFetchedGrid.current) {
      console.log("   hasFetchedGrid.current is TRUE, skipping fetch");
      return;
    }
    
    console.log("📡📡📡 FETCHING FROM BACKEND 📡📡📡");
    hasFetchedGrid.current = true;

    const loadGrid = async () => {
      setGridLoading(true);
      try {
        // CRITICAL: Do NOT filter by batch_id - show ALL slots for the run
        let url = `/api/scheduler/runs/${selectedRunId}/slots`;
        // REMOVED: if (selectedBatchId) url += `?batch_id=${selectedBatchId}`;
        console.log(`[GRID] Fetching ALL slots for run ${selectedRunId} (no batch filter)`);
        
        // RAW FETCH - NO TRANSFORM
        console.log(`🌐🌐🌐 RAW FETCH: GET ${url}`);
        const fullUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${url}`;
        console.log(`🌐 FULL URL: ${fullUrl}`);
        
        const token = localStorage.getItem('token');
        const res = await fetch(fullUrl, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        
        console.log(`🌐 RAW RESPONSE STATUS: ${res.status}`);
        
        const text = await res.text();
        console.log(`🌐 RAW RESPONSE TEXT (first 500 chars):`, text.substring(0, 500));
        
        let data;
        try {
          data = JSON.parse(text);
          console.log(`🌐 PARSED DATA TYPE:`, typeof data);
          console.log(`🌐 PARSED DATA IS ARRAY:`, Array.isArray(data));
          console.log(`🌐 PARSED DATA LENGTH:`, data?.length || 0);
        } catch (parseErr) {
          console.error(`💥 JSON PARSE FAILED:`, parseErr);
          data = [];
        }
        
        const slots = Array.isArray(data) ? data : [];
        
        if (!slots || slots.length === 0) {
          console.warn("❌❌❌ NO SLOTS RETURNED FROM API");
        } else {
          console.log("✅✅✅ SETTING gridSlots from API:", slots.length);
          console.log("✅ FIRST SLOT:", slots[0]);
        }
        
        console.log(`🧠 FINAL gridSlots:`, slots.length);
        setLastApiCall({url: fullUrl, status: res.status, count: slots.length, rawResponse: text.substring(0, 200)});
        setGridSlots(slots);
      } catch (err: any) {
        console.error("💥💥💥 GRID LOAD FAILED:", err.message);
        setGridSlots([]);
      } finally { 
        console.log("[GRID] loadGrid complete, gridLoading = false");
        setGridLoading(false); 
      }
    };

    loadGrid();
  }, [selectedRunId, selectedBatchId, runs]);

  /* ── Validation: Check if schedule is possible for SELECTED batch only ── */
  const validateSchedulePossible = (): { valid: boolean; issues?: ValidationIssue[] } => {
    if (!state) return { valid: false, issues: [{ batch: "System", required: 0, available: 0, reason: "No state loaded" }] };
    
    // If no batch selected, skip validation (will validate all batches in backend)
    if (!selectedBatchId) {
      console.log("[Validation] No batch selected, skipping frontend validation");
      return { valid: true };
    }

    // Calculate required slots for SELECTED batch only
    const requiredSlots = state.subjects
      .filter(s => s.batch_id === selectedBatchId)
      .reduce((sum, s) => sum + s.credits, 0);

    // Calculate available slots for this specific batch
    // MUST MATCH BACKEND SOLVER: backend/app/modules/timetable_ai/solver.py
    // 4 regular days × 6 slots + 1 Wednesday × 4 slots = 28 total
    const REGULAR_DAY_SLOTS = 6;
    const WEDNESDAY_SLOTS = 4;  // 6 - 2 (elective lock)
    const REGULAR_DAYS = 4;     // Mon, Tue, Thu, Fri  
    const totalAvailableSlots = (REGULAR_DAYS * REGULAR_DAY_SLOTS) + WEDNESDAY_SLOTS; // 28

    const batch = state.batches.find(b => b.id === selectedBatchId);
    const batchName = batch?.name || "Unknown batch";

    console.log(`[VALIDATION] ========================================`);
    console.log(`[VALIDATION] selectedBatchId: ${selectedBatchId}`);
    console.log(`[VALIDATION] Batch Name: ${batchName}`);
    console.log(`[VALIDATION] Required slots: ${requiredSlots}`);
    console.log(`[VALIDATION] Available slots: ${totalAvailableSlots}`);
    console.log(`[VALIDATION] Calculation: ${REGULAR_DAYS} days × ${REGULAR_DAY_SLOTS} slots + Wednesday × ${WEDNESDAY_SLOTS} slots = ${totalAvailableSlots} (MUST MATCH SOLVER)`);
    console.log(`[VALIDATION] ========================================`);

    // Only block if required > available
    // Allow schedules where required < available (sparse schedules are OK)
    if (requiredSlots > totalAvailableSlots) {
      return {
        valid: false,
        issues: [{
          batch: batchName,
          batch_id: selectedBatchId,  // CRITICAL: Include batch_id for filtering
          required: requiredSlots,
          available: totalAvailableSlots,
          reason: `Batch requires ${requiredSlots} slots but only ${totalAvailableSlots} are available (28 total: 4 days × 6 slots + Wednesday × 4 slots)`
        }]
      };
    }

    return { valid: true };
  };

  /* ── Call backend validation with batch_id filter ── */
  const validateWithBackend = async (): Promise<{ valid: boolean; issues?: ValidationIssue[] }> => {
    if (!selectedDeptName) return { valid: false, issues: [{ batch: "System", required: 0, available: 0, reason: "No department selected" }] };
    if (!selectedBatchId) return { valid: true }; // No batch selected, skip

    // Find department ID from deptList
    const dept = deptList.find(d => d.name === selectedDeptName);
    if (!dept) return { valid: false, issues: [{ batch: "System", required: 0, available: 0, reason: "Department not found" }] };

    console.log(`[BACKEND VALIDATION] ========================================`);
    console.log(`[BACKEND VALIDATION] Calling /api/scheduler/validate/${dept.id}`);
    console.log(`[BACKEND VALIDATION] Request body: { batch_id: ${selectedBatchId} }`);
    console.log(`[BACKEND VALIDATION] selectedBatchId in frontend: ${selectedBatchId}`);

    try {
      const response = await fetchWithAuth(`/api/scheduler/validate/${dept.id}`, {
        method: "POST",
        body: JSON.stringify({ batch_id: selectedBatchId }),
      });
      const data = await response.json();

      console.log(`[BACKEND VALIDATION] Response:`, data);
      console.log(`[BACKEND VALIDATION] Response batch_id: ${data.batch_id}`);
      console.log(`[BACKEND VALIDATION] Available slots from backend: ${data.summary?.available_slots}`);

      // DEBUG: Check for batch_id mismatch
      if (data.batch_id !== selectedBatchId) {
        console.error(`[BACKEND VALIDATION] ⚠️ BATCH_ID MISMATCH!`);
        console.error(`[BACKEND VALIDATION] Expected: ${selectedBatchId}, Got: ${data.batch_id}`);
        console.error(`[BACKEND VALIDATION] DISCARDING response - backend returned wrong batch data`);
        return { valid: true }; // Ignore wrong batch responses
      }

      // Filter errors to ONLY include those for the selected batch
      // This is a safety net in case backend returns errors for other batches
      const filteredErrors = (data.errors || []).filter((err: any) => {
        // If error has no batch_id or batch_name, include it (system-level error)
        if (!err.batch_id && !err.batch_name) return true;
        // If error has batch_id, only include if it matches selectedBatchId
        if (err.batch_id && err.batch_id !== selectedBatchId) {
          console.warn(`[BACKEND VALIDATION] Filtering out error for wrong batch: ${err.batch_name || err.batch_id}`);
          return false;
        }
        // If error has batch_name, check if it matches selected batch name
        const selectedBatch = state?.batches.find(b => b.id === selectedBatchId);
        if (err.batch_name && selectedBatch && err.batch_name !== selectedBatch.name) {
          console.warn(`[BACKEND VALIDATION] Filtering out error for wrong batch: ${err.batch_name}`);
          return false;
        }
        return true;
      });

      if (filteredErrors.length > 0) {
        const issues: ValidationIssue[] = filteredErrors.map((err: any) => ({
          batch: err.batch_name || state?.batches.find(b => b.id === selectedBatchId)?.name || "Unknown",
          batch_id: selectedBatchId,  // CRITICAL: Tag with selected batch_id
          required: err.required_slots || 0,
          available: err.available_slots || data.summary?.available_slots || 28,
          reason: err.message || "Validation failed",
        }));
        return { valid: false, issues };
      }

      return { valid: true };
    } catch (err: any) {
      console.error(`[BACKEND VALIDATION] Error:`, err);
      return { valid: false, issues: [{ batch: "System", required: 0, available: 0, reason: err.message || "Backend validation failed" }] };
    }
  };

  /* ── Generate variants ── */
  const handleGenerate = async () => {
    console.log("🔥🔥🔥 GENERATE CLICKED 🔥🔥🔥");
    
    if (!selectedDeptName) {
      console.error("❌ NO DEPARTMENT SELECTED");
      setGenDiag("Error: No department selected");
      return;
    }
    
    console.log(`[GENERATE] Dept: ${selectedDeptName}, Batch: ${selectedBatchId || 'all'}`);
    
    // CRITICAL: Clear ALL stale state before starting
    console.log(`[GENERATE] Step 1: Clearing stale state...`);
    setGenIssues(null);
    setGenDiag(null);
    setRuns([]);
    setSelectedRunId(null);
    setGridSlots([]);
    hasFetchedGrid.current = false;
    
    // Frontend validation first
    console.log(`[GENERATE] Step 2: Frontend validation...`);
    const frontendValidation = validateSchedulePossible();
    console.log(`[GENERATE] Frontend validation result:`, frontendValidation);
    
    if (!frontendValidation.valid) {
      console.warn("❌ BLOCKED BY FRONTEND VALIDATION:", frontendValidation.issues);
      setGenIssues(frontendValidation.issues || null);
      return;
    }
    console.log(`[GENERATE] ✅ Frontend validation passed`);

    // Backend validation with batch_id filter
    console.log(`[GENERATE] Step 3: Backend validation...`);
    setGenerating(true);
    setGenerationStep("Validating with backend...");
    
    const backendValidation = await validateWithBackend();
    console.log(`[GENERATE] Backend validation result:`, backendValidation);
    
    if (!backendValidation.valid) {
      console.warn("❌ BLOCKED BY BACKEND VALIDATION:", backendValidation.issues);
      setGenIssues(backendValidation.issues || null);
      setGenerating(false);
      setGenerationStep(null);
      return;
    }
    console.log(`[GENERATE] ✅ Backend validation passed`);
    
    // Validation passed
    console.log(`[GENERATE] Step 4: Calling API...`);
    setGenIssues(null);
    setGenerationStep("Processing...");
    
    try {
      await new Promise(r => setTimeout(r, 300));
      setGenerationStep("Calling solver...");

      console.log(`[GENERATE] API CALL: POST /api/scheduler/generate-variants/${selectedDeptName}`);
      const res = await api<{ variants: VariantResult[] }>(`/api/scheduler/generate-variants/${encodeURIComponent(selectedDeptName)}`, { method: "POST" });
      
      console.log(`[GENERATE] API RESPONSE:`, res);
      
      // Extract variants from response
      const variants = res?.variants || (res as any)?.runs || (res as any)?.data || [];
      console.log(`[GENERATE] Extracted ${variants.length} variants`);
      
      if (!variants || variants.length === 0) {
        console.error("❌ NO VARIANTS IN RESPONSE");
        setGenDiag("Error: No schedules returned from solver");
        setGenerating(false);
        setGenerationStep(null);
        return;
      }
      
      console.log(`[GENERATE] Step 5: Normalizing runs...`);
      // Convert variants to RunItem format with embedded slots
      const newRuns: RunItem[] = variants.map((v: VariantResult, idx: number) => {
        console.log(`[GENERATE] Variant ${idx}:`, { id: v.run_id || v.id, status: v.status, hasSlots: !!(v as any).slots });
        return {
          id: v.run_id || v.id || 0,
          status: v.status === "SUCCESS" ? "DRAFT" : "FAILED",
          solver_status: v.status || "FAILED",
          reason: v.reason || null,
          created_at: v.created_at || new Date().toISOString(),
          slots: (v as any).slots || []
        };
      });
      
      console.log(`[GENERATE] Step 6: Setting runs state...`, newRuns.map(r => r.id));
      setRuns(newRuns);
      
      console.log(`[GENERATE] Step 7: Auto-selecting run...`);
      const successRuns = newRuns.filter(r => r.solver_status === "SUCCESS");
      console.log(`[GENERATE] Success runs: ${successRuns.length}`);
      
      let selectedRun = null;
      if (successRuns.length > 0) {
        selectedRun = successRuns.sort((a, b) => b.id - a.id)[0];
        console.log(`[GENERATE] Selected SUCCESS run:`, selectedRun.id);
      } else if (newRuns.length > 0) {
        selectedRun = newRuns[0];
        console.log(`[GENERATE] Selected first available run:`, selectedRun.id);
      }

      if (selectedRun) {
        console.log(`[GENERATE] Step 8: Setting selectedRunId to ${selectedRun.id}`);
        setSelectedRunId(selectedRun.id);
        console.log(`[GENERATE] ✅ selectedRunId SET`);
      } else {
        console.error(`❌ NO RUN TO SELECT!`);
        setGenDiag("Error: No schedule generated");
      }
      
      // Log any failures
      const failures = variants.filter((v: VariantResult) => v.status !== "SUCCESS");
      if (failures.length > 0 && successRuns.length === 0) {
        console.warn(`[GENERATE] All variants failed:`, failures[0].reason);
      } else if (failures.length > 0) {
        setGenDiag(`${successRuns.length} variants succeeded. Some failed: ${failures[0].reason}`);
      }
      
      console.log("🔥🔥🔥 GENERATION COMPLETE 🔥🔥🔥");
      
    } catch (err: any) {
      console.error("💥💥💥 GENERATE FAILED:", err);
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);
      setGenDiag(`Generation failed: ${err.message || "Backend error"}`);
    } finally {
      setGenerating(false);
      setGenerationStep(null);
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

  /* ── AI Engine Handlers ── */
  const handleAiAction = async (action: string, customInput?: string) => {
    if (!selectedRunId) return;
    setAiWorking(true);
    setAiDiag(null);
    setAiDiff(null);
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] AI: ${action}${customInput ? ` - "${customInput}"` : ""}`;
    setAiLogs(prev => [...prev.slice(-9), logEntry]);
    
    try {
      const res = await fetchWithAuth(`/api/scheduler/schedule/${encodeURIComponent(selectedDeptName)}/ai-action`, {
        method: "POST",
        body: JSON.stringify({ 
          action, 
          run_id: selectedRunId,
          prompt: customInput || undefined
        })
      });
      const data = await res.json();
      setAiDiag(data.message);
      
      const responseLog = `[${timestamp}] ✓ ${data.message}`;
      setAiLogs(prev => [...prev.slice(-9), responseLog]);
      
      if (data.diff && data.diff.length > 0) {
        setAiDiff(data.diff);
        const changesLog = `[${timestamp}] Changes: ${data.diff.length} slots modified`;
        setAiLogs(prev => [...prev.slice(-9), changesLog]);
        // Let the state map resolve the structural difference. Cards will natively fly using framer-motion layoutIds.
        await refreshState(); 
      }
    } catch (err: any) {
      const errorMsg = `AI Engine halted: ${err.message || "Collision detection timeout"}`;
      setAiDiag(errorMsg);
      setAiLogs(prev => [...prev.slice(-9), `[${timestamp}] ✗ ${errorMsg}`]);
    } finally {
      setAiWorking(false);
      setAiInput("");
    }
  };

  const handleAiCustomAction = () => {
    if (!aiInput.trim()) return;
    handleAiAction("custom", aiInput.trim());
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
  // DEBUG: Log gridSlots when they change
  useEffect(() => {
    if (gridSlots.length > 0) {
      console.log("🎯🎯🎯 gridSlots updated:", gridSlots.length);
      console.log("🎯 First slot RAW:", gridSlots[0]);
      console.log("🎯 Day values:", Array.from(new Set(gridSlots.map(s => s.day))));
      console.log("🎯 Slot indices:", Array.from(new Set(gridSlots.map(s => s.slot_index))).sort());
      console.log("🎯 DAYS constant:", DAYS);
      console.log("🎯 Batch IDs in slots:", Array.from(new Set(gridSlots.map(s => s.batch_id))));
      console.log("🎯 Selected batch ID (NOT filtering by this):", selectedBatchId);
    }
  }, [gridSlots, selectedBatchId]);
  
  // DEBUG: Normalize day values for mapping
  const normalizeDay = (day: string): string => {
    if (!day) return "";
    const upper = day.toUpperCase();
    // Handle both "MON" and "MONDAY" formats
    if (upper.startsWith("MON")) return "MONDAY";
    if (upper.startsWith("TUE")) return "TUESDAY";
    if (upper.startsWith("WED")) return "WEDNESDAY";
    if (upper.startsWith("THU")) return "THURSDAY";
    if (upper.startsWith("FRI")) return "FRIDAY";
    return upper;
  };
  
  // Build lookup map for efficient rendering
  const slotMap = useMemo(() => {
    const map = new Map<string, SlotEntry[]>();
    gridSlots.forEach(slot => {
      const normalizedDay = normalizeDay(slot.day);
      const key = `${normalizedDay}-${slot.slot_index}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(slot);
    });
    
    // DEBUG: Log map keys
    if (gridSlots.length > 0) {
      console.log("🗺️ SLOT MAP KEYS (first 10):", Array.from(map.keys()).slice(0, 10));
    }
    
    return map;
  }, [gridSlots]);
  
  const getCell = (day: string, slotIndex: number): SlotEntry[] => {
    const normalizedDay = normalizeDay(day);
    const key = `${normalizedDay}-${slotIndex}`;
    const slots = slotMap.get(key) || [];
    
    // DEBUG: Log EVERY cell lookup
    console.log(`getCell("${day}" → "${normalizedDay}", ${slotIndex}):`, slots.length, "slots");
    
    return slots;
  };

  // Use direct runs state for immediate updates - ALWAYS use local runs, NEVER state?.runs
  const successRuns = runs.filter(r => r.solver_status === "SUCCESS");
  
  // Derive selectedRun from local runs state (not global state)
  const selectedRun = runs.find(r => r.id === selectedRunId);
  
  // PRIORITY 5: Auto-Select Fallback - Prevent blank UI if no run is selected
  // FIX: Check for null/undefined, not falsy (run ID 0 is valid)
  useEffect(() => {
    const hasValidSelection = selectedRunId !== null && selectedRunId !== undefined;
    if (runs.length > 0 && !hasValidSelection) {
      // Prefer SUCCESS runs, but fallback to any run if all failed
      const successRun = runs.find(r => r.solver_status === "SUCCESS");
      const runToSelect = successRun || runs[0];
      if (runToSelect) {
        console.log(`[AUTO-SELECT] Selecting run ${runToSelect.id} (status: ${runToSelect.solver_status})`);
        setSelectedRunId(runToSelect.id);
        // Note: hasFetchedGrid reset is handled by useEffect when selectedRunId changes
      }
    }
  }, [runs, selectedRunId]);
  
  // TEMP FALLBACK: Force gridSlots from local runs if main effect fails
  useEffect(() => {
    console.log("🔧🔧🔧 FALLBACK EFFECT: Checking if gridSlots needs rescue 🔧🔧🔧");
    console.log("   selectedRunId:", selectedRunId);
    console.log("   gridSlots.length:", gridSlots.length);
    
    if (selectedRunId && gridSlots.length === 0) {
      const selectedRun = runs.find(r => r.id === selectedRunId);
      console.log("   selectedRun?.slots?.length:", selectedRun?.slots?.length || 0);
      
      if (selectedRun?.slots && selectedRun.slots.length > 0) {
        console.log("🔧🔧🔧 FALLBACK RESCUE: Setting gridSlots from local run 🔧🔧🔧");
        setGridSlots(selectedRun.slots);
      } else {
        console.log("   No local slots available for fallback");
      }
    }
  }, [selectedRunId, runs, gridSlots.length]);
  
  // RAW NETWORK STATUS for debugging
  const [lastApiCall, setLastApiCall] = useState<{url: string, status: number, count: number, rawResponse: string} | null>(null);

  /* ── Check if slot is pinned ── */
  const isPinnedSlot = (subjectId: number, day: string, slotIndex: number): boolean => {
    return state?.pinned_slots.some(
      p => p.subject_id === subjectId && p.day === day && p.slot_index === slotIndex
    ) || false;
  };

  /* ── Check for conflicts ── */
  const checkConflicts = (item: SlotEntry | SubjectItem, targetDay: string, targetSlotIndex: number, isNew: boolean = false): string[] => {
    const conflicts: string[] = [];
    const subjectId = isNew ? (item as SubjectItem).id : (item as SlotEntry).subject_id;
    const teacherId = isNew ? (item as SubjectItem).teacher_id : (item as SlotEntry).teacher_id;
    const teacherName = isNew ? (item as SubjectItem).teacher_name : (item as SlotEntry).teacher;
    const batchId = isNew ? (item as SubjectItem).batch_id : (item as SlotEntry).batch_id;
    const batchName = isNew ? (item as SubjectItem).batch_name : (item as SlotEntry).batch;
    const itemId = isNew ? null : (item as SlotEntry).id;
    
    // Check if target slot is a break
    const targetSlot = TIME_SLOTS.find(s => s.index === targetSlotIndex);
    if (targetSlot?.is_break) {
      conflicts.push("Cannot schedule during break time");
    }
    
    // Check if target slot is Wednesday elective (locked)
    if (targetDay === "WEDNESDAY" && WEDNESDAY_ELECTIVE_SLOTS.includes(targetSlotIndex)) {
      conflicts.push("Wednesday 10:00-12:00 is reserved for electives");
    }
    
    // Check if pinned
    if (!isNew && isPinnedSlot(subjectId, (item as SlotEntry).day, (item as SlotEntry).slot_index)) {
      conflicts.push("Pinned slot - cannot move");
    }
    
    // For Unassigned subject drag, it must only drop into EMPTY slots
    if (isNew) {
      const existingInCell = getCell(targetDay, targetSlotIndex);
      if (existingInCell.length > 0) {
        conflicts.push("Must drop unassigned courses onto empty slots");
      }
    }
    
    // Check teacher conflict
    const teacherConflict = gridSlots.find(
      s => s.id !== itemId && 
           s.teacher_id === teacherId && 
           s.day === targetDay && 
           s.slot_index === targetSlotIndex
    );
    if (teacherConflict) {
      conflicts.push(`Teacher conflict: ${teacherName} already teaching ${teacherConflict.subject}`);
    }
    
    // Check batch conflict
    const batchConflict = gridSlots.find(
      s => s.id !== itemId && 
           s.batch_id === batchId && 
           s.day === targetDay && 
           s.slot_index === targetSlotIndex
    );
    if (batchConflict) {
      conflicts.push(`Batch conflict: ${batchName} already has ${batchConflict.subject}`);
    }
    
    return conflicts;
  };

  const handleDragStart = (e: React.DragEvent, slot: SlotEntry, day: string, slotIndex: number) => {
    if (isPinnedSlot(slot.subject_id, day, slotIndex)) {
      e.preventDefault();
      setGenDiag("Cannot drag pinned slots");
      return;
    }
    setDragState({ slot, newSubject: null, sourceDay: day, sourceSlotIndex: slotIndex });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ slotId: slot.id, day, slotIndex }));
  };

  const handleSubjectDragStart = (e: React.DragEvent, subject: SubjectItem) => {
    setDragState({ slot: null, newSubject: subject, sourceDay: null, sourceSlotIndex: null });
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent, day: string, slotIndex: number) => {
    e.preventDefault();
    if (dragState.slot) {
      if (dragState.sourceDay === day && dragState.sourceSlotIndex === slotIndex) {
         e.dataTransfer.dropEffect = "move";
         setDraggedOverCell({ day, slotIndex, valid: true });
         return;
      }
      const conflicts = checkConflicts(dragState.slot, day, slotIndex);
      if (conflicts.length > 0) {
        e.dataTransfer.dropEffect = "none";
        setDraggedOverCell({ day, slotIndex, valid: false });
        return;
      }
    } else if (dragState.newSubject) {
      const conflicts = checkConflicts(dragState.newSubject, day, slotIndex, true);
      if (conflicts.length > 0) {
        e.dataTransfer.dropEffect = "none";
        setDraggedOverCell({ day, slotIndex, valid: false });
        // Optional diag for immediate feedback:
        // setGenDiag("Rejected: " + conflicts.join(" | "));
        return;
      }
      e.dataTransfer.dropEffect = "copy";
      setDraggedOverCell({ day, slotIndex, valid: true });
      return;
    }
    e.dataTransfer.dropEffect = "move";
    setDraggedOverCell({ day, slotIndex, valid: true });
  };

  const handleDragLeave = () => {
    setDraggedOverCell(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDay: string, targetSlotIndex: number) => {
    e.preventDefault();
    setDraggedOverCell(null);
    
    // --- MODE 1: ALLOCATE NEW SUBJECT FROM SIDEBAR ---
    if (dragState.newSubject) {
      const newSub = dragState.newSubject;
      const conflicts = checkConflicts(newSub, targetDay, targetSlotIndex, true);
      if (conflicts.length > 0) {
        setGenDiag("Rejected: " + conflicts.join(" | "));
        handleDragEnd();
        return;
      }
      
      const previousSlots = [...gridSlots];
      const tempId = -Math.round(Math.random() * 1000000);
      const newSlot: SlotEntry = {
        id: tempId,
        day: targetDay,
        slot_index: targetSlotIndex,
        subject: newSub.name,
        teacher: newSub.teacher_name,
        room: "—",
        batch: newSub.batch_name,
        batch_id: newSub.batch_id!,
        is_lab: newSub.name.toLowerCase().includes("lab"),
        teacher_id: newSub.teacher_id!,
        subject_id: newSub.id
      };
      
      setGridSlots(prev => [...prev, newSlot]);
      handleDragEnd();
      setGenDiag("Allocating new subject block...");

      try {
        const res = await fetchWithAuth(`/api/scheduler/schedule/${encodeURIComponent(selectedDeptName)}/allocate`, {
          method: "POST",
          body: JSON.stringify({ subject_id: newSub.id, day: targetDay, slot_index: targetSlotIndex, run_id: selectedRunId })
        });
        const data = await res.json();
        setGridSlots(prev => prev.map(s => s.id === tempId ? { ...s, id: data.slot_id } : s));
        setGenDiag(null);
      } catch (err: any) {
        setGridSlots(previousSlots);
        setGenDiag(`Reverted: ${err.message || "Allocation failed on server validation"}`);
      }
      return;
    }
    
    // --- MODE 2: MOVE EXISTING SLOT ---
    if (!dragState.slot || !dragState.sourceDay || dragState.sourceSlotIndex === null) return;
    
    const { slot, sourceDay, sourceSlotIndex } = dragState;
    if (sourceDay === targetDay && sourceSlotIndex === targetSlotIndex) {
      handleDragEnd();
      return;
    }

    const conflicts = checkConflicts(slot, targetDay, targetSlotIndex);
    if (conflicts.length > 0) {
      setGenDiag("Rejected: " + conflicts.join(" | "));
      handleDragEnd();
      return;
    }
    
    const previousSlots = [...gridSlots];
    
    setGridSlots(prev => prev.map(s => 
      s.id === slot.id ? { ...s, day: targetDay, slot_index: targetSlotIndex } : s
    ));
    
    handleDragEnd();
    setGenDiag("Moving slot...");

    try {
      await fetchWithAuth(`/api/scheduler/schedule/${encodeURIComponent(selectedDeptName)}/move`, {
        method: "POST",
        body: JSON.stringify({ slot_id: slot.id, new_day: targetDay, new_slot_index: targetSlotIndex })
      });
      setGenDiag(null); // Clear moving diag
    } catch (err: any) {
      setGridSlots(previousSlots);
      setGenDiag(`Reverted: ${err.message || "Drag failed on server validation"}`);
    }
  };

  const handleDragEnd = () => {
    setDragState({ slot: null, newSubject: null, sourceDay: null, sourceSlotIndex: null });
    setDraggedOverCell(null);
  };

  const teacherLimits = useMemo(() => {
    const limits = new Map<number, number>();
    state?.teachers.forEach(t => limits.set(t.id, t.max_classes_per_day));
    return limits;
  }, [state?.teachers]);

  const teacherLoadMap = useMemo(() => {
    const load = new Map<string, number>();
    gridSlots.forEach(s => {
      const key = `${s.day}-${s.teacher_id}`;
      load.set(key, (load.get(key) || 0) + 1);
    });
    return load;
  }, [gridSlots]);

  /* ── Unassigned Subjects computation ── */
  const unassignedSubjects = useMemo(() => {
    if (!state?.subjects) return [];
    return state.subjects.filter(s => {
      const allocCount = gridSlots.filter(g => g.subject_id === s.id).length;
      return allocCount < s.credits; 
    });
  }, [state?.subjects, gridSlots]);

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

  // DEBUG: Console log state on every render
  console.log("[RENDER] ========================================");
  console.log("[RENDER] GLOBAL STATE:", { 
    hasState: !!state, 
    stateRunsLength: state?.runs?.length || 0,
    stateBatchesLength: state?.batches?.length || 0 
  });
  console.log("[RENDER] LOCAL STATE:", { 
    genIssuesLength: genIssues?.length || 0, 
    genIssuesNull: genIssues === null,
    runsLength: runs.length, 
    selectedBatchId,
    selectedRunId 
  });
  if (genIssues && genIssues.length > 0) {
    console.log("[RENDER] genIssues content:", genIssues);
  }
  console.log("[RENDER] ========================================");

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] relative overflow-hidden bg-slate-950">
      {/* DEBUG PANEL - CRITICAL STATE MONITORING + RAW NETWORK */}
      <div className="bg-slate-950 border-b-2 border-indigo-500/50 p-3 text-[11px] font-mono">
        <div className="flex items-center justify-between mb-2">
          <div className="text-indigo-400 font-bold">🔥 RAW NETWORK TRACE</div>
          <div className="text-[10px] text-slate-500">Check browser console for detailed logs</div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          <div className={`px-2 py-1 rounded ${genIssues?.length ? "bg-red-950 border border-red-500/50" : "bg-slate-900"}`}>
            <div className="text-[9px] text-slate-500 uppercase">Issues</div>
            <div className={genIssues?.length ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>{genIssues?.length || 0}</div>
          </div>
          <div className={`px-2 py-1 rounded ${runs.length > 0 ? "bg-emerald-950 border border-emerald-500/50" : "bg-slate-900"}`}>
            <div className="text-[9px] text-slate-500 uppercase">Runs</div>
            <div className={runs.length > 0 ? "text-emerald-400 font-bold text-lg" : "text-slate-500 font-bold"}>{runs.length}</div>
          </div>
          <div className={`px-2 py-1 rounded ${selectedRunId ? "bg-emerald-950 border border-emerald-500/50" : "bg-amber-950 border border-amber-500/50"}`}>
            <div className="text-[9px] text-slate-500 uppercase">Selected</div>
            <div className={selectedRunId ? "text-emerald-400 font-bold text-lg" : "text-amber-400 font-bold"}>{selectedRunId || 'NONE'}</div>
          </div>
          <div className={`px-2 py-1 rounded ${gridSlots.length > 0 ? "bg-emerald-950 border border-emerald-500/50" : "bg-slate-900"}`}>
            <div className="text-[9px] text-slate-500 uppercase">Grid Slots</div>
            <div className={gridSlots.length > 0 ? "text-emerald-400 font-bold text-lg" : "text-slate-500 font-bold"}>{gridSlots.length}</div>
          </div>
          <div className="bg-slate-900 px-2 py-1 rounded">
            <div className="text-[9px] text-slate-500 uppercase">Success</div>
            <div className="text-slate-300 font-bold">{successRuns.length}</div>
          </div>
          <div className="bg-slate-900 px-2 py-1 rounded">
            <div className="text-[9px] text-slate-500 uppercase">Batch</div>
            <div className="text-slate-300 font-bold">{selectedBatchId || 'all'}</div>
          </div>
        </div>
        
        {/* RAW NETWORK STATUS */}
        {lastApiCall && (
          <div className={`mt-2 p-2 rounded border text-[10px] ${lastApiCall.count > 0 ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400' : 'bg-red-950/50 border-red-500/30 text-red-400'}`}>
            <div className="font-bold mb-1">🌐 LAST API CALL:</div>
            <div>URL: {lastApiCall.url}</div>
            <div>Status: {lastApiCall.status}</div>
            <div>Slots: {lastApiCall.count}</div>
            <div className="truncate">Raw: {lastApiCall.rawResponse}...</div>
          </div>
        )}
        
        {genIssues && genIssues.length > 0 && (
          <div className="mt-2 p-2 bg-red-950/50 border border-red-500/30 rounded text-red-400 text-[10px]">
            ⚠️ {genIssues.map(i => `${i.batch}: ${i.reason}`).join(' | ')}
          </div>
        )}
        {genDiag && (
          <div className="mt-2 p-2 bg-amber-950/50 border border-amber-500/30 rounded text-amber-400 text-[10px]">
            ℹ️ {genDiag}
          </div>
        )}
      </div>

      {/* Top Main Area */}
      <div className="flex flex-1 gap-4 overflow-hidden p-3 pb-0">
        
        {/* ═══ LEFT SIDEBAR (Controls & Tabs) ═══ */}
        <div className="w-[300px] flex flex-col gap-3 shrink-0 h-full">
          
          {/* Controls Panel (One Card) */}
          <div className="bg-slate-800 rounded-lg border border-slate-700/80 flex flex-col shrink-0 shadow-sm relative overflow-visible">
            {/* Dept and Batch Row */}
            <div className="p-3 border-b border-slate-700/50 flex gap-3 z-10">
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Department</label>
                <select
                  value={selectedDeptName}
                  onChange={e => setSelectedDeptName(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/50 rounded text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none truncate"
                >
                  {deptList.length === 0 ? <option value="">No depts</option> : deptList.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Batch Filter</label>
                <select
                  value={selectedBatchId ?? ""}
                  onChange={e => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700/50 rounded text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none truncate"
                >
                  <option value="">All Batches</option>
                  {buildBatchTree.length > 0 ? renderBatchOptions(buildBatchTree) : state?.batches.map(b => (
                    <option key={b.id} value={b.id}>{b.parent_batch_id ? "↳ " : ""}{b.name} ({b.size})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Collapsible Batch Structure */}
            {buildBatchTree.length > 0 && (
              <div className="border-b border-slate-700/50">
                 <button onClick={() => setBatchStructureOpen(!batchStructureOpen)}
                  className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 transition-colors">
                  <span className="flex items-center gap-1.5"><span className="text-slate-500">❖</span> Batch Structure</span>
                  <span className={`transform transition-transform ${batchStructureOpen ? "rotate-180" : ""}`}>▾</span>
                 </button>
                 {batchStructureOpen && (
                   <div className="px-3 pb-3 space-y-1 bg-slate-900/30 pt-1 shadow-inner relative z-0 max-h-48 overflow-y-auto custom-scrollbar">
                      {buildBatchTree.map(parent => (
                        <div key={parent.id} className="py-0.5">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.5)]"></div>
                            <span className="text-slate-300 font-bold truncate">{parent.name}</span>
                            <span className="text-slate-500 ml-auto bg-slate-800 px-1 py-0.5 rounded text-[9px]">{parent.size}</span>
                          </div>
                          {parent.children && parent.children.length > 0 && (
                            <div className="ml-3 mt-1 space-y-1 border-l border-slate-700/50 pl-2">
                              {parent.children.map(child => (
                                <div key={child.id} className="flex items-center gap-1.5 text-[10px]">
                                  <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                                  <span className="text-slate-400 font-medium truncate">{child.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="pt-2 mt-2 border-t border-slate-700/30 flex justify-end">
                        <button onClick={() => setHierarchyModalOpen(true)} className="text-[10px] text-indigo-400 font-medium hover:text-indigo-300 transition-colors">Visual map</button>
                      </div>
                   </div>
                 )}
              </div>
            )}

            {/* Collapsible Pinned Slots */}
            <div>
              <button onClick={() => setPinsOpen(!pinsOpen)}
                className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700/30 transition-colors rounded-b-lg">
                <span className="flex items-center gap-1.5"><span className="text-slate-500">📌</span> Pinned Slots ({state?.pinned_slots.length || 0})</span>
                <span className={`transform transition-transform ${pinsOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {pinsOpen && (
                <div className="px-3 pb-3 bg-slate-900/30 pt-1 border-t border-slate-700/30 shadow-inner rounded-b-lg">
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                    {state?.pinned_slots.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded p-1.5 text-[10px] border border-slate-700/50 hover:border-slate-600 transition-colors">
                        <span className="text-slate-300 truncate w-3/4 flex items-center gap-1">
                          <span className="font-bold text-slate-200 truncate">{p.subject_name}</span>
                          <span className="text-slate-500 shrink-0">• {DAY_SHORT[p.day]} S{p.slot_index}</span>
                        </span>
                        <button onClick={() => handleDeletePin(p.id)} className="text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300 w-5 h-5 rounded flex items-center justify-center transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 space-y-1.5 pt-2 border-t border-slate-700/50">
                    <select value={newPinSubject} onChange={e => setNewPinSubject(e.target.value ? Number(e.target.value) : "")}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/50">
                      <option value="">Select subject</option>
                      {state?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="flex gap-1.5">
                      <select value={newPinDay} onChange={e => setNewPinDay(e.target.value)}
                        className="flex-1 w-1/2 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/50">
                        {DAYS.map(d => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
                      </select>
                      <select value={newPinSlot} onChange={e => setNewPinSlot(Number(e.target.value))}
                        className="flex-1 w-1/2 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/50">
                        {AVAILABLE_SLOTS.map(s => {
                          // Disable Wednesday elective slots
                          const isWedElective = newPinDay === "WEDNESDAY" && WEDNESDAY_ELECTIVE_SLOTS.includes(s.index);
                          return (
                            <option key={s.index} value={s.index} disabled={isWedElective}>
                              {s.label} {isWedElective ? "(Elective)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <button onClick={handleAddPin} disabled={!newPinSubject}
                      className="w-full py-1.5 bg-indigo-600/80 text-white rounded text-[10px] font-bold hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-sm">
                      + Add Pin
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subjects/Faculty/Unav Tabs Card */}
          <div className="bg-slate-800 rounded-lg border border-slate-700/80 flex flex-col flex-1 overflow-hidden min-h-0 shadow-sm relative">
            <div className="flex border-b border-slate-700/80 bg-slate-900/50 shrink-0">
              {(["subjects", "faculty", "unavailability"] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                    tab === t ? "text-indigo-400 border-indigo-500 bg-slate-800" : "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50"
                  }`}>
                  {t === "unavailability" ? "Unavail." : t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar relative">
              {tab === "subjects" && (
                unassignedSubjects.length ? unassignedSubjects.map(s => (
                  <div key={s.id} 
                    draggable={true}
                    onDragStart={(e) => handleSubjectDragStart(e, s)}
                    onDragEnd={handleDragEnd}
                    className="bg-slate-900/40 rounded px-2.5 py-2 border border-slate-700/50 cursor-grab hover:bg-slate-700/40 hover:border-indigo-500/30 transition-all flex items-center gap-1.5 shadow-sm group h-9"
                  >
                    <span className="text-xs font-bold text-slate-200 truncate flex-1 group-hover:text-indigo-300 transition-colors min-w-0" title={s.name}>{s.name}</span>
                    <span className="flex gap-1 shrink-0">
                      {s.batch_name && <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 rounded whitespace-nowrap border border-indigo-500/20 font-medium truncate max-w-16" title={s.batch_name}>{s.batch_name}</span>}
                      {s.teacher_name && <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 rounded whitespace-nowrap border border-emerald-500/20 font-medium truncate max-w-16" title={s.teacher_name}>{s.teacher_name}</span>}
                      <span className="text-[9px] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded whitespace-nowrap border border-amber-500/20 shrink-0">
                        {s.credits - gridSlots.filter(g => g.subject_id === s.id).length}l
                      </span>
                    </span>
                  </div>
                )) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-emerald-400/80 p-4">
                    <span className="text-3xl mb-2 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)] block">✨</span>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-500/70">All Allocated</p>
                  </div>
                )
              )}

              {tab === "faculty" && (
                state?.teachers.length ? state.teachers.map(t => (
                  <div key={t.id} className="bg-slate-900/40 rounded px-2.5 py-2 border border-slate-700/50 flex flex-col gap-1 truncate hover:border-slate-600 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-200 truncate">{t.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400 font-medium">Max: {t.max_classes_per_day}</span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-medium truncate">{t.email || "No email"}</span>
                  </div>
                )) : <p className="text-xs text-slate-500 text-center py-8">No faculty found</p>
              )}

              {tab === "unavailability" && (
                <div className="flex flex-col h-full relative">
                  <div className="flex-1 space-y-1.5">
                    {state?.unavailabilities.length ? state.unavailabilities.map(u => (
                      <div key={u.id} className="bg-slate-900/40 rounded px-2.5 py-2 border border-slate-700/50 flex items-center justify-between hover:border-slate-600 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-200">{u.teacher_name}</span>
                          <span className="text-[9px] text-slate-500 font-medium">{DAY_SHORT[u.day]} • S{u.slot_index}</span>
                        </div>
                        <button onClick={() => handleDeleteUnav(u.id)} className="text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300 w-6 h-6 rounded flex items-center justify-center transition-colors">✕</button>
                      </div>
                    )) : <p className="text-[10px] text-slate-500 text-center py-8 uppercase tracking-wider font-bold">No unavailabilities</p>}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-1.5 shrink-0 bg-slate-800 z-10 sticky bottom-0">
                    <select value={newUnavTeacher} onChange={e => setNewUnavTeacher(e.target.value ? Number(e.target.value) : "")}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/50">
                      <option value="">Teacher</option>
                      {state?.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <div className="flex gap-1.5">
                      <select value={newUnavDay} onChange={e => setNewUnavDay(e.target.value)}
                        className="flex-1 w-1/2 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/50">
                        {DAYS.map(d => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
                      </select>
                      <select value={newUnavSlot} onChange={e => setNewUnavSlot(Number(e.target.value))}
                        className="flex-1 w-1/2 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500/50">
                        {AVAILABLE_SLOTS.map(s => {
                          // Disable Wednesday elective slots
                          const isWedElective = newUnavDay === "WEDNESDAY" && WEDNESDAY_ELECTIVE_SLOTS.includes(s.index);
                          return (
                            <option key={s.index} value={s.index} disabled={isWedElective}>
                              {s.label} {isWedElective ? "(Elective)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <button onClick={handleAddUnav} disabled={!newUnavTeacher}
                      className="w-full py-1.5 bg-indigo-600/80 text-white rounded text-[10px] font-bold hover:bg-indigo-600 disabled:opacity-40 transition-colors shadow-sm">
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {genDiag && <div className="p-2 border border-amber-500/30 bg-amber-500/10 rounded text-[10px] text-amber-300 leading-tight font-medium shadow-sm">{genDiag}</div>}
          {/* DEBUG: Error state - should only show API errors, not validation errors */}
          {error && (
            <div className="p-2 border border-red-500/30 bg-red-500/10 rounded text-[10px] text-red-300 leading-tight font-medium shadow-sm">
              <div className="font-bold mb-1">[DEBUG] API Error (not validation):</div>
              {error}
            </div>
          )}
        </div>

        {/* ═══ CENTER MAIN FOCUS (Timetable Grid) ═══ */}
        <div className="flex-1 flex flex-col w-[70%] min-w-0 bg-slate-800 rounded-lg border border-slate-700/80 shadow-md overflow-hidden relative">
          <div className="px-4 py-2 border-b border-slate-700/80 bg-slate-900/60 flex items-center justify-between shrink-0 h-[46px]">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-slate-200 text-[13px] tracking-widest uppercase">
                Timetable Grid
                {selectedRunId && <span className="text-indigo-400 font-bold ml-2 bg-indigo-500/10 px-1.5 py-0.5 rounded text-[10px] tracking-normal">RUN #{selectedRunId}</span>}
              </h2>
              {dragState.slot && (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider animate-pulse">
                  Moving {dragState.slot.subject}
                </span>
              )}
            </div>
            {gridLoading && <span className="text-[10px] text-indigo-400 font-bold animate-pulse tracking-widest uppercase bg-indigo-500/10 px-2 py-0.5 rounded">Syncing</span>}
          </div>

          {/* DEBUG INFO - Always visible during debugging */}
          <div className="p-2 bg-slate-900/50 border-b border-slate-700/50 text-[9px] font-mono text-slate-500">
            <div>DEBUG: genIssues={genIssues?.length || 0}, runs={runs.length}, selectedBatch={selectedBatchId || 'null'}</div>
          </div>

          {/* Generation Issues Panel */}
          {genIssues && genIssues.length > 0 && (
            <div className="p-4 bg-red-950/30 border-b border-red-500/30">
              <div className="flex items-start gap-3">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                  <h3 className="text-[12px] font-bold text-red-400 uppercase tracking-wider mb-2">Impossible Schedule Detected</h3>
                  <div className="space-y-2">
                    {genIssues.map((issue, idx) => {
                      // STRICT GUARD: Only render errors for selected batch
                      // DEBUG: Log what we're rendering
                      console.log(`[RENDER ERROR] Issue batch_id: ${issue.batch_id}, Selected: ${selectedBatchId}, Batch name: ${issue.batch}`);
                      
                      // If we have a batch_id in the issue and it doesn't match selected, skip
                      if (issue.batch_id && selectedBatchId && issue.batch_id !== selectedBatchId) {
                        console.warn(`[RENDER ERROR] SKIPPING - batch_id mismatch!`);
                        return null;
                      }
                      
                      // If no batch_id but batch name doesn't match selected batch name, skip
                      if (!issue.batch_id && selectedBatchId && state?.batches) {
                        const selectedBatch = state.batches.find(b => b.id === selectedBatchId);
                        if (selectedBatch && issue.batch !== selectedBatch.name && issue.batch !== "System" && issue.batch !== "Solver AI") {
                          console.warn(`[RENDER ERROR] SKIPPING - batch name mismatch! Issue: ${issue.batch}, Selected: ${selectedBatch.name}`);
                          return null;
                        }
                      }
                      
                      return (
                        <div key={idx} className="bg-red-900/20 rounded p-2 border border-red-500/20">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-bold text-slate-200">{issue.batch}</span>
                            <span className="text-slate-500">|</span>
                            <span className="text-amber-400">Req: {issue.required}</span>
                            <span className="text-emerald-400">Avail: {issue.available}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">{issue.reason}</p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 italic">Try reducing subjects or increasing available slots.</p>
                </div>
                <button onClick={() => setGenIssues(null)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
              </div>
            </div>
          )}

          {!selectedRunId ? (
            <div className="flex-1 flex items-center justify-center bg-slate-900/30 relative">
               <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-slate-900/20 to-transparent"></div>
              <button onClick={handleGenerate} disabled={generating || !selectedDeptName} 
                className="group z-10 flex flex-col items-center gap-4 p-8 rounded-2xl cursor-pointer hover:bg-indigo-500/5 transition-all text-center">
                <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] transition-all duration-500 relative">
                  {generating ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="w-8 h-8 border-[3px] border-indigo-500 border-t-transparent rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"/>
                  ) : (
                    <span className="text-3xl plugin-icon opacity-80 group-hover:opacity-100 transition-opacity">⚡</span>
                  )}
                  <div className="absolute inset-0 rounded-full bg-indigo-500/5 filter blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                </div>
                <div>
                  <p className="text-slate-200 font-bold text-[14px] group-hover:text-indigo-300 transition-colors uppercase tracking-widest">
                    {generating ? generationStep || "Synthesizing..." : "[ Generate Schedule ]"}
                  </p>
                  <p className="text-slate-500 text-[11px] font-medium mt-1.5 group-hover:text-slate-400 max-w-[200px] leading-relaxed transition-colors">Invoke AI constraint solver to create collision-free schedules automatically</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto custom-scrollbar bg-slate-950/20">
              <table className="w-full h-full min-w-[700px] border-collapse relative">
                <thead>
                  <tr>
                    <th className="w-16 sticky top-0 bg-slate-800/95 backdrop-blur z-20 border-b border-r border-slate-700/80 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.3)]"></th>
                    {DAYS.map((d, i) => (
                      <th key={d} className={`p-2.5 sticky top-0 bg-slate-800/95 backdrop-blur z-20 border-b border-r border-slate-700/80 last:border-r-0 text-center shadow-[0_2px_10px_-3px_rgba(0,0,0,0.3)]`}>
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">{DAY_SHORT[d]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map(ts => {
                    // Check if this is a break slot
                    const isBreak = ts.is_break;
                    // Check if this is Wednesday elective slot
                    const isWednesdayElective = (day: string) => day === "WEDNESDAY" && WEDNESDAY_ELECTIVE_SLOTS.includes(ts.index);
                    
                    return (
                    <tr key={ts.index} className={isBreak ? "bg-slate-900/30" : ""}>
                      <td className={`p-2 border-b border-r border-slate-700/60 align-middle text-center w-20 relative transition-colors ${isBreak ? "bg-slate-800/30" : "bg-slate-800/60 hover:bg-slate-800"}`}>
                        {isBreak ? (
                          <span className="text-[9px] font-bold text-amber-500/70 tracking-wider bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 block">BREAK</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 tracking-wider bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-700/50 block shadow-inner">{ts.label.replace(" – ", "-")}</span>
                        )}
                      </td>
                      {DAYS.map(day => {
                        const entries = getCell(day, ts.index);
                        // DEBUG: Log cells that should have content
                        if (gridSlots.length > 0 && ts.index === 0 && day === "MONDAY") {
                          console.log(`🎨 Rendering cell ${day}-${ts.index}:`, entries.length, "entries", entries);
                        }
                        const isDragOver = draggedOverCell?.day === day && draggedOverCell?.slotIndex === ts.index;
                        const isWedElective = isWednesdayElective(day);
                        let cellBgClasses = "transition-all duration-200 ";
                        
                        if (isBreak) {
                          cellBgClasses = "bg-slate-900/20 ";
                        } else if (isWedElective) {
                          cellBgClasses = "bg-emerald-500/5 ring-1 ring-inset ring-emerald-500/20 ";
                        } else if (isDragOver) {
                           cellBgClasses = draggedOverCell?.valid ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/50 " : "bg-red-500/10 ring-1 ring-inset ring-red-500/50 ";
                        } else {
                           cellBgClasses += "hover:bg-slate-700/20 ";
                        }
                        
                        return (
                          <td 
                            key={`${day}-${ts.index}`} 
                            className={`p-1.5 border-b border-r border-slate-700/50 last:border-r-0 align-top h-[110px] relative w-[18%] ${cellBgClasses}`}
                            onDragOver={(e) => !isBreak && !isWedElective && handleDragOver(e, day, ts.index)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => !isBreak && !isWedElective && handleDrop(e, day, ts.index)}
                          >
                            {/* Break indicator */}
                            {isBreak && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-[10px] font-bold text-slate-600 tracking-widest uppercase">Break</span>
                              </div>
                            )}
                            {/* Wednesday Elective indicator */}
                            {isWedElective && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-[9px] font-bold text-emerald-500/60 tracking-widest uppercase text-center">Elective<br/>Locked</span>
                              </div>
                            )}
                                {/* FORCED VISIBLE SLOT RENDER */}
                            {entries.length > 0 && (
                              <div style={{
                                position: "absolute",
                                top: 2,
                                left: 2,
                                right: 2,
                                bottom: 2,
                                background: "#ef4444",  // Red background - CANNOT MISS
                                border: "2px solid white",
                                borderRadius: "4px",
                                padding: "4px",
                                zIndex: 9999,
                                overflow: "auto"
                              }}>
                                {entries.map((e) => (
                                  <div key={e.id} style={{
                                    background: "white",
                                    color: "black",
                                    padding: "2px 4px",
                                    marginBottom: "2px",
                                    borderRadius: "2px",
                                    fontSize: "10px",
                                    fontWeight: "bold"
                                  }}>
                                    {e.subject || "NO SUB"} | {e.teacher || "NO TCHR"}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Show count even if 0 */}
                            <div style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              background: entries.length > 0 ? "#22c55e" : "#ef4444",
                              color: "white",
                              fontSize: "9px",
                              padding: "1px 3px",
                              borderRadius: "2px",
                              zIndex: 10000
                            }}>
                              {entries.length}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ BOTTOM BAR (Inline Footer) ═══ */}
      <div className="shrink-0 p-3 pt-2 w-full z-10 sticky bottom-0">
        <div className="bg-slate-800 rounded-lg border border-slate-700/80 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] p-2.5 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
             {/* Generate Actions */}
             <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleGenerate} disabled={generating || !selectedDeptName}
                  className="px-6 py-2 bg-indigo-600 text-white rounded font-bold text-xs uppercase tracking-wider hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-[0_2px_10px_rgba(79,70,229,0.2)] hover:shadow-[0_4px_15px_rgba(79,70,229,0.3)] whitespace-nowrap group">
                  {generating ? "Synthesizing..." : (
                    <span className="flex items-center gap-1.5"><span className="text-sm opacity-80 group-hover:scale-110 transition-transform">✨</span> Generate</span>
                  )}
                </button>
                {selectedRunId && successRuns.find(r => r.id === selectedRunId)?.status === "DRAFT" && (
                  <button onClick={handlePublish} className="px-4 py-2 bg-emerald-600 border border-emerald-500 text-white rounded font-bold text-xs uppercase tracking-wider hover:bg-emerald-500 transition-all shadow-[0_2px_10px_rgba(16,185,129,0.2)] hover:shadow-[0_4px_15px_rgba(16,185,129,0.3)] whitespace-nowrap">
                    Publish
                  </button>
                )}
             </div>

             {/* Variant selector */}
             {successRuns.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-md border border-slate-700/50 shadow-inner overflow-x-auto custom-scrollbar">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest pl-2 pr-1 shrink-0">Variants</span>
                  {successRuns.slice(0, 3).map((r, i) => (
                    <button key={r.id} onClick={() => setSelectedRunId(r.id)}
                      className={`px-3.5 py-1.5 rounded text-[11px] font-bold transition-all shrink-0 ${
                        r.id === selectedRunId 
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]" 
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent"
                      }`}>
                      V{i + 1}
                    </button>
                  ))}
                 </div>
              )}
           </div>

           {/* DEBUG UI - Always visible */}
           <div className="flex items-center gap-2 bg-slate-900/40 px-3 py-1.5 rounded border border-slate-700/50 shrink-0">
              <div className="text-[10px] text-amber-400 font-mono">
                Runs: <span className="font-bold">{runs.length}</span> | 
                Success: <span className="font-bold">{successRuns.length}</span> | 
                Selected: <span className="font-bold">{selectedRunId || "none"}</span>
              </div>
           </div>

           {/* AI Operator */}
          <div className="relative shrink-0">
            <button onClick={() => setAiActionOpen(!aiActionOpen)}
              className={`px-4 py-2 rounded font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all border shadow-sm ${
                aiActionOpen 
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(79,70,229,0.2)]" 
                  : "bg-slate-900 border-slate-700 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30"
              }`}>
              <span className="text-sm">🪄</span> Operator <span className={`text-[10px] transform transition-transform duration-300 ${aiActionOpen ? "rotate-180" : ""}`}>▴</span>
            </button>
            
            {aiActionOpen && (
              <div className="absolute bottom-[115%] right-0 w-[280px] bg-slate-800 border border-indigo-500/30 rounded-lg shadow-[0_5px_30px_rgba(0,0,0,0.5)] overflow-hidden origin-bottom-right z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="p-3 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur">
                   <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                     <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                     Live Overrides
                   </p>
                </div>
                {selectedRunId ? (
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <button onClick={() => handleAiAction("optimize")} disabled={aiWorking} className="px-3.5 py-2.5 bg-slate-900/40 hover:bg-indigo-600 text-[11px] font-semibold text-slate-300 hover:text-white rounded border border-slate-700/50 hover:border-indigo-500 transition-all text-left flex justify-between items-center group">
                      <span>Optimize Layout</span>
                      <span className="opacity-0 group-hover:opacity-100 transform translate-x-1 group-hover:translate-x-0 transition-all">→</span>
                    </button>
                    <button onClick={() => handleAiAction("reduce_clashes")} disabled={aiWorking} className="px-3.5 py-2.5 bg-slate-900/40 hover:bg-emerald-600 text-[11px] font-semibold text-slate-300 hover:text-white rounded border border-slate-700/50 hover:border-emerald-500 transition-all text-left flex justify-between items-center group">
                      <span>Remove Clashes</span>
                      <span className="opacity-0 group-hover:opacity-100 transform translate-x-1 group-hover:translate-x-0 transition-all">→</span>
                    </button>
                     <button onClick={() => handleAiAction("balance")} disabled={aiWorking} className="px-3.5 py-2.5 bg-slate-900/40 hover:bg-amber-600 text-[11px] font-semibold text-slate-300 hover:text-white rounded border border-slate-700/50 hover:border-amber-500 transition-all text-left flex justify-between items-center group">
                       <span>Balance Loads</span>
                       <span className="opacity-0 group-hover:opacity-100 transform translate-x-1 group-hover:translate-x-0 transition-all">→</span>
                     </button>

                     {/* Custom Input */}
                     <div className="mt-2 pt-2 border-t border-slate-700/30">
                       <div className="flex gap-1.5">
                         <input
                           type="text"
                           value={aiInput}
                           onChange={(e) => setAiInput(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && handleAiCustomAction()}
                           placeholder="Ask AI to modify schedule..."
                           disabled={aiWorking}
                           className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-[10px] text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500/50"
                         />
                         <button
                           onClick={handleAiCustomAction}
                           disabled={aiWorking || !aiInput.trim()}
                           className="px-2 py-1.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                         >
                           Send
                         </button>
                       </div>
                     </div>

                     {/* AI Logs */}
                     {aiLogs.length > 0 && (
                       <div className="mt-2 pt-2 border-t border-slate-700/30 max-h-24 overflow-y-auto custom-scrollbar">
                         <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Action Log</div>
                         <div className="space-y-0.5">
                           {aiLogs.slice(-5).map((log, idx) => (
                             <div key={idx} className="text-[9px] text-slate-400 font-mono truncate">
                               {log}
                             </div>
                           ))}
                         </div>
                       </div>
                     )}

                     {aiWorking && <div className="text-[10px] text-indigo-400 font-bold tracking-widest uppercase animate-pulse text-center pt-3 pb-1">Analyzing vectors</div>}
                    {aiDiag && !aiWorking && (
                      <div className="pt-2 mt-1.5 border-t border-slate-700/50 px-2 pb-1">
                        <p className="text-[10px] font-medium text-amber-400 leading-relaxed text-center">{aiDiag}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-5 text-[11px] font-medium text-amber-500/80 text-center flex flex-col items-center gap-2">
                    <span className="text-2xl">⚠️</span>
                    Waiting for initial variant.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ═══ HIERARCHY MODAL ═══ */}
      {hierarchyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200">Batch Structure Info</h3>
              <button onClick={() => setHierarchyModalOpen(false)} className="text-slate-500 hover:text-slate-300">✕</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3 custom-scrollbar">
               {buildBatchTree.map(parent => (
                  <div key={parent.id} className="bg-slate-900/50 rounded p-3 border border-slate-700/50">
                    <p className="text-xs font-bold text-indigo-300">{parent.name} <span className="text-slate-500 font-normal">({parent.size} slots)</span></p>
                    {parent.children && parent.children.length > 0 && (
                      <div className="mt-2 pl-3 border-l-2 border-slate-700/50 space-y-1.5">
                        {parent.children.map(child => (
                           <div key={child.id} className="text-[11px] text-slate-300 flex justify-between">
                             <span>{child.name}</span>
                             <span className="text-slate-500">{child.size} slots</span>
                           </div>
                        ))}
                      </div>
                    )}
                  </div>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* Added simple global styles to slim scrollbars for panel cleanups */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
}
