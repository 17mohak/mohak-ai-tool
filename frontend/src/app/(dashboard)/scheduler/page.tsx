"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api, fetchWithAuth } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

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
        // DEBUG: Check token
        const token = localStorage.getItem("auth_token");
        console.log("🔐 AUTH DEBUG: Token exists:", !!token);
        console.log("🔐 AUTH DEBUG: Token first 20 chars:", token ? token.substring(0, 20) + "..." : "NONE");
        
        const response = await api<DeptListItem[] | { data: DeptListItem[] }>("/api/scheduler/departments");
        
        console.log("🔐 API DEBUG: Departments response:", response);
        
        // Normalize: handle both direct array and { data: array } formats (CASE B/C fix)
        const d = Array.isArray(response) 
          ? response 
          : (response as { data: DeptListItem[] })?.data || [];
        
        if (!Array.isArray(d)) {
          setError(`Invalid response format: expected array, got ${typeof d}`);
          setLoading(false);
          return;
        }
        
        console.log("🔐 API DEBUG: Departments loaded:", d.length);
        setDeptList(d);
        
        if (d.length > 0) {
          setSelectedDeptName(d[0].name);
        }
      } catch (err) {
        console.error("🔐 AUTH ERROR: Failed to load departments:", err);
        setError(err instanceof Error ? err.message : "Failed to load departments - check authentication");
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
      const res = await fetchWithAuth(`/api/mcp/execute`, {
        method: "POST",
        body: JSON.stringify({ 
          command: customInput || action, 
          context: { runId: selectedRunId, batchId: selectedBatchId }
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
    const entries = gridSlots.filter((s) => {
      return (
        normalizeDay(s.day) === normalizeDay(day) &&
        Number(s.slot_index) === Number(slotIndex)
      );
    });
    return entries;
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

  /* ── Scoped Subjects & Faculty ── */
  const filteredSubjects = useMemo(() => {
    if (!state?.subjects) return [];
    if (!selectedBatchId) return state.subjects;
    return state.subjects.filter(s => s.batch_id === selectedBatchId);
  }, [state?.subjects, selectedBatchId]);

  const filteredFaculty = useMemo(() => {
    if (!state?.teachers) return [];
    if (!selectedBatchId) return state.teachers;
    return state.teachers.filter(f =>
      (f as any).subjects?.some((s: any) => s.batch_id === selectedBatchId)
    );
  }, [state?.teachers, selectedBatchId]);

  const unassignedSubjects = useMemo(() => {
    return filteredSubjects.filter(s => {
      const allocCount = gridSlots.filter(g => g.subject_id === s.id).length;
      return allocCount < s.credits; 
    });
  }, [filteredSubjects, gridSlots]);

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
    const isAuthError = error.toLowerCase().includes("unauthorized") || 
                        error.toLowerCase().includes("401") ||
                        error.toLowerCase().includes("auth");
    
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-400 text-center">
          <p className="font-semibold">{isAuthError ? "Authentication Required" : "Error loading scheduler"}</p>
          <p className="text-sm mt-1">{error}</p>
          {isAuthError && (
            <p className="text-xs text-amber-400 mt-2">
              Please log in again to access the scheduler
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isAuthError && (
            <button 
              onClick={() => window.location.href = "/login"}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 transition-colors"
            >
              Go to Login
            </button>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty Departments State ── */
  if (deptList.length === 0) {
    // Check if token exists - if not, might be auth issue
    const token = typeof window !== 'undefined' ? localStorage.getItem("auth_token") : null;
    const mightBeAuthIssue = !token;
    
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-slate-400 text-center">
          <p className="font-semibold">{mightBeAuthIssue ? "Not Logged In" : "No departments found"}</p>
          <p className="text-sm mt-1">
            {mightBeAuthIssue 
              ? "Please log in to access the scheduler" 
              : "Create a department to get started"}
          </p>
          {mightBeAuthIssue && (
            <p className="text-xs text-amber-400 mt-2">
              No authentication token found
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {mightBeAuthIssue && (
            <button 
              onClick={() => window.location.href = "/login"}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 transition-colors"
            >
              Go to Login
            </button>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
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

  const COLOR_MAP: Record<string, string> = {
    "blue": "bg-blue-500/20 border-blue-500/50 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.2)]",
    "emerald": "bg-emerald-500/20 border-emerald-500/50 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)]",
    "amber": "bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]",
    "rose": "bg-rose-500/20 border-rose-500/50 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.2)]",
    "cyan": "bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.2)]",
    "violet": "bg-violet-500/20 border-violet-500/50 text-violet-200 shadow-[0_0_15px_rgba(139,92,246,0.2)]",
  };
  const TEACHER_COLORS = ["blue", "emerald", "violet", "amber", "rose", "cyan"];
  const getTeacherColorClass = (teacherId: number) => {
    const colorIndex = Math.abs(teacherId || 0) % TEACHER_COLORS.length;
    return COLOR_MAP[TEACHER_COLORS[colorIndex]];
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] relative overflow-hidden bg-[#0c0e12] font-inter text-slate-200">
      <AnimatedBackground />

      {/* Top Main Area */}
      <div className="flex flex-1 gap-6 p-6 z-10 overflow-hidden backdrop-blur-sm">
        
        {/* ═══ LEFT SIDEBAR (Controls & Tabs) ═══ */}
        <div className="w-[320px] flex flex-col gap-4 shrink-0 h-full">
          
          {/* Controls Panel (One Card) */}
          <div className="bg-[#111318]/60 border border-white/5 backdrop-blur-xl rounded-2xl flex flex-col shrink-0 shadow-2xl overflow-visible">
            {/* Dept and Batch Row */}
            <div className="p-4 border-b border-white/5 flex gap-3 z-10">
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] items-center gap-1.5 uppercase font-bold text-[#8ff5ff] mb-1.5 flex tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#primary]" /> Dept
                </label>
                <select
                  value={selectedDeptName}
                  onChange={e => setSelectedDeptName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c0e12]/80 border border-white/10 rounded-lg text-slate-200 text-xs focus:ring-1 focus:ring-[#8ff5ff]/50 hover:bg-[#171a1f] outline-none truncate transition-all shadow-inner"
                >
                  {deptList.length === 0 ? <option value="">No depts</option> : deptList.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] items-center gap-1.5 uppercase font-bold text-[#8ff5ff] mb-1.5 flex tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c180ff]" /> Batch
                </label>
                <select
                  value={selectedBatchId ?? ""}
                  onChange={e => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3 py-2 bg-[#0c0e12]/80 border border-white/10 rounded-lg text-slate-200 text-xs focus:ring-1 focus:ring-[#8ff5ff]/50 hover:bg-[#171a1f] outline-none truncate transition-all shadow-inner"
                >
                  <option value="">All Batches</option>
                  {buildBatchTree.length > 0 ? renderBatchOptions(buildBatchTree) : state?.batches.map(b => (
                    <option key={b.id} value={b.id}>{b.parent_batch_id ? "↳ " : ""}{b.name} ({b.size})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Collapsible Pins */}
            <div>
              <button onClick={() => setPinsOpen(!pinsOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-[#aaabb0] hover:text-[#f6f6fc] hover:bg-white/5 transition-colors rounded-b-2xl">
                <span className="flex items-center gap-2"><span className="text-lg">📌</span> Pinned Slots ({state?.pinned_slots.length || 0})</span>
                <span className={`transform transition-transform ${pinsOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {pinsOpen && (
                <div className="px-4 pb-4 bg-black/20 pt-2 border-t border-white/5 shadow-inner rounded-b-2xl">
                  {/* Pin Content - Simple version to save space */}
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                    {state?.pinned_slots.map(p => (
                      <div key={p.id} className="flex justify-between bg-[#171a1f] rounded-lg p-2 text-[10px] border border-white/5 hover:border-white/10">
                        <span className="truncate w-3/4"><span className="font-bold">{p.subject_name}</span> <span className="text-[#aaabb0]">• {DAY_SHORT[p.day]} S{p.slot_index}</span></span>
                        <button onClick={() => handleDeletePin(p.id)} className="text-[#ff716c] hover:bg-[#ff716c]/20 w-5 h-5 rounded transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subjects/Faculty Tabs Card */}
          <div className="bg-[#111318]/60 border border-white/5 backdrop-blur-xl rounded-2xl flex flex-col flex-1 overflow-hidden shadow-2xl relative">
            <div className="flex border-b border-white/5 bg-[#0c0e12]/40 shrink-0">
              {(["subjects", "faculty", "unavailability"] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 px-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    tab === t ? "text-[#8ff5ff] bg-white/5 shadow-[inset_0_-2px_0_#8ff5ff]" : "text-[#aaabb0] hover:text-[#f6f6fc] hover:bg-white/5"
                  }`}>
                  {t === "unavailability" ? "Unavail." : t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar relative">
              {tab === "subjects" && (
                unassignedSubjects.length ? unassignedSubjects.map(s => (
                  <motion.div key={s.id} 
                    draggable={true}
                    onDragStart={(e: any) => handleSubjectDragStart(e, s)}
                    onDragEnd={handleDragEnd}
                    whileHover={{ scale: 1.02 }}
                    className="bg-[#171a1f]/80 rounded-xl px-3 py-2.5 border border-white/5 cursor-grab active:cursor-grabbing hover:bg-[#23262c] hover:border-[#8ff5ff]/30 transition-all flex flex-col gap-1 shadow-md group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <div className="flex items-center justify-between">
                       <span className="text-xs font-bold text-[#f6f6fc] truncate group-hover:text-[#8ff5ff] transition-colors">{s.name}</span>
                       <span className="text-[9px] text-amber-300 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                         {s.credits - gridSlots.filter(g => g.subject_id === s.id).length} Req
                       </span>
                    </div>
                    <div className="flex gap-2">
                      {s.batch_name && <span className="text-[9px] text-[#c180ff] font-medium truncate">{s.batch_name}</span>}
                      {s.teacher_name && <span className="text-[9px] text-[#aaabb0] font-medium truncate">• {s.teacher_name}</span>}
                    </div>
                  </motion.div>
                )) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[#9bffce]/80 p-4">
                    <motion.span animate={{ scale: [1,1.1,1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-3xl mb-2 drop-shadow-[0_0_15px_rgba(155,255,206,0.5)]">✨</motion.span>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#9bffce]">All Allocated</p>
                  </div>
                )
              )}

              {tab === "faculty" && (
                filteredFaculty.length ? filteredFaculty.map(t => (
                  <div key={t.id} className="bg-[#171a1f]/80 rounded-xl px-3 py-2.5 border border-white/5 flex justify-between items-center hover:border-white/10 transition-colors shadow-sm">
                     <span className="text-xs font-bold text-[#f6f6fc] truncate">{t.name}</span>
                     <span className="text-[9px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-[#aaabb0] font-medium">Max {t.max_classes_per_day}</span>
                  </div>
                )) : <p className="text-xs text-[#aaabb0] text-center py-8">No faculty found</p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ CENTER MAIN FOCUS (Timetable Grid) ═══ */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0e12]/60 rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden relative backdrop-blur-2xl">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 bg-[#171a1f]/40 flex items-center justify-between shrink-0 h-[60px] backdrop-blur-md">
            <div className="flex items-center gap-4">
              <h2 className="font-space-grotesk font-bold text-[#f6f6fc] text-[14px] tracking-widest uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#8ff5ff] shadow-[0_0_10px_#8ff5ff]"></span>
                Ethereal Grid
                {selectedRunId && <span className="text-[#c180ff] font-bold ml-2 bg-[#c180ff]/10 border border-[#c180ff]/20 px-2 py-0.5 rounded-full text-[10px] tracking-normal shadow-[0_0_10px_rgba(193,128,255,0.2)]">V{selectedRunId}</span>}
              </h2>
              {dragState.slot && (
                <motion.span initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 uppercase tracking-widest shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                  Moving {dragState.slot.subject}
                </motion.span>
              )}
            </div>
            {gridLoading && <span className="text-[10px] text-[#8ff5ff] font-bold animate-pulse tracking-widest uppercase">Syncing...</span>}
          </div>

          {!selectedRunId ? (
            <div className="flex-1 flex flex-col items-center justify-center relative">
               <motion.button 
                 onClick={handleGenerate}
                 disabled={generating || !selectedDeptName}
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 className="relative group p-8 rounded-3xl z-20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#9c48ea]/30 to-[#00deec]/30 rounded-[3rem] blur-2xl group-hover:blur-3xl transition-all duration-500" />
                  <div className="relative bg-[#111318]/90 border border-white/10 backdrop-blur-3xl rounded-[2.5rem] p-12 flex flex-col items-center shadow-2xl overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                     {generating ? (
                        <div className="flex flex-col items-center gap-6">
                           <motion.div 
                             animate={{ rotate: 360 }} 
                             transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                             className="w-16 h-16 border-4 border-[#8ff5ff] border-t-transparent rounded-full drop-shadow-[0_0_15px_rgba(143,245,255,1)]"
                           />
                           <motion.div 
                             initial={{ opacity: 0, y: 10 }}
                             animate={{ opacity: 1, y: 0 }}
                             key={generationStep}
                             className="font-space-grotesk font-bold text-xl text-[#8ff5ff] uppercase tracking-widest drop-shadow-[0_0_10px_rgba(143,245,255,0.5)]"
                           >
                              {generationStep || "Validating..."}
                           </motion.div>
                        </div>
                     ) : (
                        <div className="flex flex-col items-center gap-4">
                           <motion.span 
                             animate={{ scale: [1, 1.1, 1] }} 
                             transition={{ duration: 2, repeat: Infinity }}
                             className="text-6xl drop-shadow-[0_0_20px_rgba(143,245,255,0.8)]"
                           >
                             ⚡
                           </motion.span>
                           <span className="font-space-grotesk text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#8ff5ff] to-[#c180ff] tracking-wide shrink-0 whitespace-nowrap px-4 py-2">
                              Generate a Smart Schedule
                           </span>
                        </div>
                     )}
                  </div>
               </motion.button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto custom-scrollbar p-6">
               <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr_1fr] gap-3 h-full pb-8">
                  {/* Headers */}
                  <div />
                  {DAYS.map(d => (
                     <div key={d} className="flex justify-center items-end pb-3 text-[11px] font-space-grotesk font-bold text-[#aaabb0] uppercase tracking-widest border-b border-light/5">
                        {DAY_SHORT[d]}
                     </div>
                  ))}
                  
                  {/* Rows */}
                  {TIME_SLOTS.map(ts => {
                     const isBreak = ts.is_break;
                     const isWednesdayElective = (day: string) => day === "WEDNESDAY" && WEDNESDAY_ELECTIVE_SLOTS.includes(ts.index);
                     
                     return (
                        <React.Fragment key={ts.index}>
                           <div className="flex flex-col items-center justify-center pt-2">
                              <span className="text-[10px] font-medium text-[#aaabb0] bg-white/5 px-2 py-1 rounded-full border border-white/5">{ts.start_time}</span>
                           </div>
                           {DAYS.map(day => {
                              const entries = getCell(day, ts.index);
                              const isDragOver = draggedOverCell?.day === day && draggedOverCell?.slotIndex === ts.index;
                              const isWedElective = isWednesdayElective(day);
                              
                              let cellClasses = "relative rounded-[1.25rem] p-2 transition-all duration-300 flex flex-col gap-2 min-h-[100px] border border-transparent ";
                              if (isBreak) cellClasses += "bg-[#111318]/40 border-white/5 opacity-50 ";
                              else if (isWedElective) cellClasses += "bg-[#005a3c]/10 border-[#006443]/30 ";
                              else if (isDragOver) cellClasses += draggedOverCell?.valid ? "bg-[#69f6b8]/20 border-[#69f6b8]/50 shadow-[0_0_20px_rgba(105,246,184,0.2)] " : "bg-[#ff716c]/20 border-[#ff716c]/50 ";
                              else cellClasses += "bg-[#171a1f]/60 hover:bg-[#23262c]/80 hover:border-white/10 hover:shadow-xl ";
                              
                              return (
                                 <div 
                                    key={`${day}-${ts.index}`}
                                    className={cellClasses}
                                    onDragOver={(e: any) => !isBreak && !isWedElective && handleDragOver(e, day, ts.index)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e: any) => !isBreak && !isWedElective && handleDrop(e, day, ts.index)}
                                 >
                                    {isBreak && <div className="absolute inset-0 flex items-center justify-center font-bold text-[10px] text-[#aaabb0] tracking-[0.2em] uppercase mix-blend-overlay">Break</div>}
                                    {isWedElective && <div className="absolute inset-0 flex items-center justify-center font-bold text-[9px] text-[#58e7ab] tracking-widest uppercase text-center opacity-40">Elective<br/>Locked</div>}
                                    
                                    <AnimatePresence>
                                       {entries.map(e => (
                                          <motion.div 
                                             layoutId={String(`slot-${e.id}`)}
                                             initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                             animate={{ opacity: 1, scale: 1, y: 0 }}
                                             exit={{ opacity: 0, scale: 0.9 }}
                                             whileHover={{ scale: 1.04, y: -2 }}
                                             className={`relative flex flex-col p-3 rounded-xl border backdrop-blur-2xl cursor-grab active:cursor-grabbing overflow-hidden ${getTeacherColorClass(e.teacher_id)}`}
                                             draggable
                                             onDragStart={(evt: any) => handleDragStart(evt, e, day, ts.index)}
                                             key={e.id}
                                          >
                                             <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                             <span className="font-space-grotesk font-bold text-xs truncate z-10 leading-tight">{e.subject}</span>
                                             <span className="text-[10px] opacity-80 mt-1 truncate z-10">{e.teacher}</span>
                                             <span className="text-[9px] uppercase tracking-widest opacity-60 mt-2 z-10 font-bold bg-black/20 self-start px-2 py-0.5 rounded-full">{e.batch}</span>
                                          </motion.div>
                                       ))}
                                    </AnimatePresence>
                                 </div>
                              );
                           })}
                        </React.Fragment>
                     );
                  })}
               </div>
            </div>
          )}
          
          {/* AI OPERATOR BOTTOM BAR (HUD) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[80%] max-w-[800px] z-50">
             <div className="bg-[#111318]/90 border border-white/10 backdrop-blur-3xl p-3 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2">
               
               {/* Activity Log (Mini) */}
               {aiLogs.length > 0 && (
                 <div className="px-4 py-2 border-b border-white/5 max-h-20 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                    {aiLogs.slice(-3).map((log, idx) => (
                       <motion.div initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} key={idx} className={`text-[10px] font-mono flex items-center gap-2 ${log.includes("✓") ? "text-[#9bffce]" : log.includes("✗") ? "text-[#ff716c]" : "text-[#aaabb0]"}`}>
                          {log}
                       </motion.div>
                    ))}
                 </div>
               )}

               <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8ff5ff] to-[#c180ff] flex items-center justify-center shadow-[0_0_15px_rgba(143,245,255,0.4)] shrink-0">
                     <span className="text-sm shadow-inner">🪄</span>
                  </div>
                  <input
                     type="text"
                     value={aiInput}
                     onChange={(e) => setAiInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleAiCustomAction()}
                     placeholder="Command the AI (e.g., 'Optimize layout', 'Move ML to Monday 1st slot')..."
                     disabled={aiWorking}
                     className="flex-1 bg-transparent border-none outline-none text-[#f6f6fc] text-sm placeholder:text-[#53555a] placeholder:font-medium font-inter h-10 px-2"
                  />
                  {aiWorking ? (
                     <div className="w-6 h-6 border-2 border-[#8ff5ff] border-t-transparent rounded-full animate-spin shrink-0 mr-2" />
                  ) : (
                     <button
                        onClick={handleAiCustomAction}
                        disabled={!aiInput.trim()}
                        className="px-5 py-2 bg-white/10 hover:bg-[#8ff5ff]/20 text-[#8ff5ff] rounded-full text-xs font-bold transition-all disabled:opacity-30 tracking-widest uppercase border border-white/5 hover:border-[#8ff5ff]/50"
                     >
                        Execute
                     </button>
                  )}
               </div>
             </div>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
}
