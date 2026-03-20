"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api, fetchWithAuth } from "@/lib/api";

/* ─── Types matching backend contracts ─── */
interface Dept { id: number; name: string }
interface BatchItem { id: number; name: string; size: number; parent_batch_id: number | null; is_lab: boolean; max_classes_per_day: number }
interface TeacherItem { id: number; name: string; email: string | null; preferred_start_slot: number; preferred_end_slot: number; max_classes_per_day: number }
interface SubjectItem { id: number; name: string; code: string | null; credits: number; batch_id: number | null; batch_name: string; teacher_id: number | null; teacher_name: string; department_id?: number }
interface PinnedSlotItem { id: number; subject_id: number; subject_name: string; day: string; slot_index: number }
interface UnavailItem { id: number; teacher_id: number; teacher_name: string; day: string; slot_index: number }
interface RunItem { id: number; status: string; solver_status: string; reason: string | null; created_at: string | null }
interface DeptState { department: Dept; batches: BatchItem[]; teachers: TeacherItem[]; subjects: SubjectItem[]; pinned_slots: PinnedSlotItem[]; unavailabilities: UnavailItem[]; runs: RunItem[] }
interface SlotEntry { id: number; day: string; slot_index: number; subject: string; teacher: string; room: string; batch: string; batch_id: number; is_lab: boolean }
interface VariantResult { status: string; variant: string; run_id?: number; reason?: string; slots_created?: number }
interface DeptListItem { id: number; name: string; batch_count: number; teacher_count: number; subject_count: number }

/* ─── Solver constants (source of truth: solver.py) ─── */
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const DAY_SHORT: Record<string, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri" };
const TIME_SLOTS = [
  { index: 0, label: "09:00 – 10:30" },
  { index: 1, label: "11:00 – 12:30" },
  { index: 2, label: "14:00 – 15:30" },
  { index: 3, label: "16:00 – 17:30" },
];

type Tab = "subjects" | "faculty" | "unavailability";

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

  /* ── Load department list ── */
  useEffect(() => {
    api<DeptListItem[]>("/api/scheduler/departments")
      .then((d) => { setDeptList(d); if (d.length > 0) setSelectedDeptName(d[0].name); })
      .catch(() => setError("Failed to load departments"))
      .finally(() => setLoading(false));
  }, []);

  /* ── Load department state ── */
  const loadState = useCallback(async () => {
    if (!selectedDeptName) return;
    setLoading(true); setError(null); setGenDiag(null);
    try {
      const s = await api<DeptState>(`/api/scheduler/state/${encodeURIComponent(selectedDeptName)}`);
      setState(s);
      // Auto-select first run
      const successRuns = s.runs.filter(r => r.solver_status === "SUCCESS");
      if (successRuns.length > 0) setSelectedRunId(successRuns[0].id);
      else setSelectedRunId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDeptName]);

  useEffect(() => { loadState(); }, [loadState]);

  /* ── Load grid slots for selected run ── */
  const loadGrid = useCallback(async () => {
    if (!selectedRunId) { setGridSlots([]); return; }
    setGridLoading(true);
    try {
      let url = `/api/scheduler/runs/${selectedRunId}/slots`;
      if (selectedBatchId) url += `?batch_id=${selectedBatchId}`;
      const slots = await api<SlotEntry[]>(url);
      setGridSlots(slots);
    } catch { setGridSlots([]); }
    finally { setGridLoading(false); }
  }, [selectedRunId, selectedBatchId]);

  useEffect(() => { loadGrid(); }, [loadGrid]);

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
      await loadState(); // refresh
    } catch (err) {
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
      await loadState();
    } catch (err) {
      setGenDiag(err instanceof Error ? err.message : "Publish failed");
    }
  };

  /* ── Pinned slot CRUD ── */
  const handleAddPin = async () => {
    if (!newPinSubject) return;
    try {
      await fetchWithAuth("/api/scheduler/pinned-slots", { method: "POST", body: JSON.stringify({ subject_id: newPinSubject, day: newPinDay, slot_index: newPinSlot }) });
      await loadState();
    } catch { setError("Failed to add pinned slot"); }
  };
  const handleDeletePin = async (id: number) => {
    try {
      await fetchWithAuth(`/api/scheduler/pinned-slots/${id}`, { method: "DELETE" });
      await loadState();
    } catch { setError("Failed to delete pinned slot"); }
  };

  /* ── Unavailability CRUD ── */
  const handleAddUnav = async () => {
    if (!newUnavTeacher) return;
    try {
      await fetchWithAuth("/api/scheduler/unavailability", { method: "POST", body: JSON.stringify({ teacher_id: newUnavTeacher, day: newUnavDay, slot_index: newUnavSlot }) });
      await loadState();
    } catch { setError("Failed to add unavailability"); }
  };
  const handleDeleteUnav = async (id: number) => {
    try {
      await fetchWithAuth(`/api/scheduler/unavailability/${id}`, { method: "DELETE" });
      await loadState();
    } catch { setError("Failed to delete unavailability"); }
  };

  /* ── Grid helpers ── */
  const getCell = (day: string, slotIndex: number): SlotEntry[] =>
    gridSlots.filter(s => s.day === day && s.slot_index === slotIndex);

  const successRuns = state?.runs.filter(r => r.solver_status === "SUCCESS") || [];

  /* ── Batch hierarchy display ── */
  const parentBatches = state?.batches.filter(b => !b.is_lab) || [];
  const labBatches = state?.batches.filter(b => b.is_lab) || [];

  if (loading && !state) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 animate-pulse">Loading scheduler...</div>
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
            {deptList.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>

        {/* Batch selector */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Batch Filter</label>
          <select
            value={selectedBatchId ?? ""}
            onChange={e => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">All Batches</option>
            {parentBatches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.size})</option>)}
            {labBatches.map(b => <option key={b.id} value={b.id}>↳ {b.name} (Lab, {b.size})</option>)}
          </select>
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
              {successRuns.map((r, i) => {
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
            <h2 className="font-semibold text-slate-200 text-sm">
              Timetable Preview
              {selectedRunId && <span className="text-slate-500 ml-2">Run #{selectedRunId}</span>}
            </h2>
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
                        return (
                          <td key={`${day}-${ts.index}`} className="px-1.5 py-1.5 border-r border-slate-700/30 last:border-r-0 align-top">
                            {entries.length > 0 ? (
                              <div className="space-y-1">
                                {entries.map(e => (
                                  <div key={e.id} className={`rounded-lg p-2 text-xs border ${
                                    e.is_lab
                                      ? "bg-purple-500/15 border-purple-500/30"
                                      : "bg-indigo-500/10 border-indigo-500/20"
                                  }`}>
                                    <p className="font-semibold text-slate-200 truncate">{e.subject}</p>
                                    <p className="text-slate-400 truncate mt-0.5">{e.teacher}</p>
                                    <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                                      <span>{e.room}</span>
                                      <span>{e.batch}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="h-14 flex items-center justify-center">
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
    </div>
  );
}
