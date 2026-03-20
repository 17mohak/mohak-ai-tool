"use client";
import React, { useState, useEffect, useCallback } from "react";
import { api, fetchWithAuth } from "@/lib/api";
import { useTelemetry } from "@/lib/hooks/useTelemetry";

/* ── Types ─────────────────── */
interface Dept { id: number; name: string; }
interface Batch { id: number; name: string; size: number; parent_batch_id: number | null; is_lab: boolean; max_classes_per_day: number; }
interface Teacher { id: number; name: string; email: string | null; preferred_start_slot: number; preferred_end_slot: number; max_classes_per_day: number; }
interface Subject { id: number; name: string; code: string | null; credits: number; batch_id: number | null; batch_name: string; teacher_id: number | null; teacher_name: string; }
interface Pin { id: number; subject_id: number; subject_name: string; day: string; slot_index: number; }
interface Run { id: number; status: string; solver_status: string; reason: string | null; created_at: string | null; }
interface SlotData { id: number; day: string; slot_index: number; subject: string; teacher: string; room: string; batch: string; batch_id: number; is_lab: boolean; }
interface DeptState { department: Dept; batches: Batch[]; teachers: Teacher[]; subjects: Subject[]; pinned_slots: Pin[]; runs: Run[]; }

const DAYS = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"];
const DAY_SHORT = ["MON","TUE","WED","THU","FRI"];
const SLOTS = [{i:0,l:"07:30 - 08:30"},{i:1,l:"08:30 - 09:30"},{i:2,l:"09:30 - 10:30"},{i:3,l:"11:00 - 12:30"},{i:4,l:"14:00 - 15:30"},{i:5,l:"16:00 - 17:30"}];
const SLOT_SHORT = ["07:30 - 08:30","08:30 - 09:30","09:30 - 10:30","11:00 - 12:30","14:00 - 15:30","16:00 - 17:30"];

async function post(path: string, body?: any) {
  const r = await fetchWithAuth(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
  return r.json();
}
async function del(path: string) {
  await fetchWithAuth(path, { method: "DELETE" });
}
async function put(path: string, body: any) {
  const r = await fetchWithAuth(path, { method: "PUT", body: JSON.stringify(body) });
  return r.json();
}

/* ══════════════════════════════════════════
   MAIN WORKBENCH PAGE
   ══════════════════════════════════════════ */
export default function SchedulerWorkbench() {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [deptName, setDeptName] = useState("");
  const [state, setState] = useState<DeptState | null>(null);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [tab, setTab] = useState<"Subjects"|"Faculty"|"Leaves">("Subjects");
  const [activeVariant, setActiveVariant] = useState<number>(0);
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [generating, setGenerating] = useState(false);
  const { agentStatus } = useTelemetry();

  // Load departments
  useEffect(() => {
    api<any[]>("/api/scheduler/departments").then(d => {
      setDepts(d.map((x:any) => ({id:x.id, name:x.name})));
      if (d.length && !deptName) setDeptName(d[0].name);
    }).catch(()=>{});
  }, []);

  // Load department state when dept changes
  const loadState = useCallback(async () => {
    if (!deptName) return;
    try {
      const s = await api<DeptState>(`/api/scheduler/state/${encodeURIComponent(deptName)}`);
      setState(s);
      setBatchId(s.batches.find(b => !b.is_lab)?.id ?? null);
      setActiveVariant(0);
      // Load first run's slots if exists
      if (s.runs.length > 0) {
        const sl = await api<SlotData[]>(`/api/scheduler/runs/${s.runs[0].id}/slots`);
        setSlots(sl);
      } else { setSlots([]); }
    } catch { setState(null); setSlots([]); }
  }, [deptName]);

  useEffect(() => { loadState(); }, [loadState]);

  // Load slots when variant changes
  useEffect(() => {
    if (!state?.runs.length) return;
    const run = state.runs[activeVariant];
    if (!run) return;
    api<SlotData[]>(`/api/scheduler/runs/${run.id}/slots`).then(setSlots).catch(()=>setSlots([]));
  }, [activeVariant, state?.runs]);

  const generate = async () => {
    if (!deptName) return;
    setGenerating(true);
    try {
      await post(`/api/scheduler/generate-variants/${encodeURIComponent(deptName)}`);
      await loadState();
    } catch {}
    setGenerating(false);
  };

  const deptId = state?.department.id;
  const batches = state?.batches ?? [];
  const teachers = state?.teachers ?? [];
  const subjects = state?.subjects ?? [];
  const pins = state?.pinned_slots ?? [];
  const runs = state?.runs ?? [];

  // Filter grid slots by selected batch
  const gridSlots = batchId ? slots.filter((s: SlotData) => s.batch_id === batchId) : slots;
  const selectedBatch = batches.find((b: Batch) => b.id === batchId);

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0e1a] text-white flex flex-col overflow-hidden" style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
      {/* Top bar */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-xs font-bold">A</div>
          <span className="text-lg font-bold tracking-wide">ATLAS</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest ml-1">Skilltech University</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <a href="/" className="text-slate-400 hover:text-white transition">Dashboard</a>
          <a href="/timetable" className="text-slate-400 hover:text-white transition">Timetable</a>
          <span className="text-white font-medium border-b border-cyan-400 pb-0.5">Scheduler</span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ═══ LEFT PANEL ═══ */}
        <aside className="w-[380px] shrink-0 border-r border-white/5 flex flex-col overflow-y-auto scrollbar-hide">
          <div className="p-4 space-y-3">
            {/* Dept selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider w-12">Dept</span>
              <select value={deptName} onChange={e => setDeptName(e.target.value)}
                className="flex-1 bg-[#141927] border border-white/10 rounded-lg px-3 py-2 text-sm text-cyan-300 font-medium focus:outline-none focus:border-cyan-500/50">
                {depts.map((d: Dept) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <button onClick={loadState} className="p-2 rounded-lg bg-[#141927] border border-white/10 text-slate-400 hover:text-white">↻</button>
            </div>
            {/* Batch selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider w-12">Batch</span>
              <select value={batchId ?? ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBatchId(e.target.value ? +e.target.value : null)}
                className="flex-1 bg-[#141927] border border-white/10 rounded-lg px-3 py-2 text-sm text-purple-300 font-medium focus:outline-none focus:border-purple-500/50">
                <option value="">All Batches</option>
                {batches.filter((b: Batch) => !b.is_lab).map((b: Batch) => <option key={b.id} value={b.id}>{b.name}</option>)}
                {batches.filter((b: Batch) => b.is_lab).map((b: Batch) => <option key={b.id} value={b.id}>↳ {b.name}</option>)}
              </select>
            </div>
            {/* Tab switcher */}
            <div className="flex gap-1">
              {(["Subjects","Faculty","Leaves"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === t
                      ? t === "Subjects" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
                        : t === "Faculty" ? "bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-600/20"
                        : "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20"
                      : "bg-[#141927] text-slate-400 hover:text-white"
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
            {tab === "Subjects" && subjects.map((s: Subject) => (
              <div key={s.id} className="bg-[#141927] rounded-xl p-4 border border-white/5 hover:border-cyan-500/20 transition group">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-sm text-white leading-tight">{s.name}</h3>
                  <button onClick={async () => { await del(`/api/scheduler/subjects/${s.id}`); loadState(); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs transition">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">Batch</span>
                    <select value={s.batch_id ?? ""} onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => { await put(`/api/scheduler/subjects/${s.id}`, {...s, department_id: deptId, batch_id: e.target.value ? +e.target.value : null}); loadState(); }}
                      className="w-full mt-1 bg-[#0c1020] border border-white/10 rounded px-2 py-1.5 text-white">
                      {batches.map((b: Batch) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select></div>
                  <div><span className="text-slate-500">Teacher</span>
                    <select value={s.teacher_id ?? ""} onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => { await put(`/api/scheduler/subjects/${s.id}`, {...s, department_id: deptId, teacher_id: e.target.value ? +e.target.value : null}); loadState(); }}
                      className="w-full mt-1 bg-[#0c1020] border border-white/10 rounded px-2 py-1.5 text-white">
                      {teachers.map((t: Teacher) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select></div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-slate-500">LECS/WK:</span>
                  <input type="number" value={s.credits} min={1} max={6}
                    onChange={async e => { await put(`/api/scheduler/subjects/${s.id}`, {...s, department_id: deptId, credits: +e.target.value}); loadState(); }}
                    className="w-12 bg-[#0c1020] border border-white/10 rounded px-2 py-1 text-white text-center" />
                </div>
              </div>
            ))}
            {tab === "Faculty" && teachers.map((t: Teacher) => (
              <div key={t.id} className="bg-[#141927] rounded-xl p-4 border border-white/5 hover:border-purple-500/20 transition group">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-sm">{t.name}</h3>
                  <button onClick={async () => { await del(`/api/scheduler/teachers/${t.id}`); loadState(); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs transition">✕</button>
                </div>
                <div className="flex items-center gap-2 text-xs mb-2">
                  <span className="text-slate-500">AVAIL:</span>
                  <span className="bg-[#0c1020] border border-white/10 rounded px-2 py-1 text-white">{SLOT_SHORT[t.preferred_start_slot] ?? "07:30"}</span>
                  <span className="text-slate-500">→</span>
                  <span className="bg-[#0c1020] border border-white/10 rounded px-2 py-1 text-white">{SLOT_SHORT[t.preferred_end_slot] ?? "17:30"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">MAX/DAY:</span>
                  <input type="number" value={t.max_classes_per_day} min={1} max={8}
                    onChange={async e => { await put(`/api/scheduler/teachers/${t.id}`, {...t, department_id: deptId}); loadState(); }}
                    className="w-12 bg-[#0c1020] border border-white/10 rounded px-2 py-1 text-white text-center" />
                </div>
              </div>
            ))}
            {tab === "Leaves" && (
              <div className="text-center py-12 text-slate-500 text-sm">
                <p className="text-xs uppercase tracking-wider mb-2">History (0)</p>
                <p>No leave records yet.</p>
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="p-4 border-t border-white/5 space-y-3 shrink-0">
            {/* Variant toggles */}
            <div className="flex gap-2">
              {runs.slice(0,3).map((r: Run, i: number) => (
                <button key={r.id} onClick={() => setActiveVariant(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${activeVariant === i ? "bg-white/10 text-white border border-white/20" : "text-slate-500 hover:text-white"}`}>
                  ◉ V{i+1}
                </button>
              ))}
              {runs.length === 0 && <span className="text-xs text-slate-600">No variants yet</span>}
            </div>
            {/* Pinned slots */}
            <div className="bg-[#141927] rounded-lg px-4 py-2 text-center">
              <span className="text-xs text-amber-400">📌 Fixed Slots ({pins.length})</span>
            </div>
            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={loadState} className="flex-1 py-2.5 rounded-lg bg-[#1a1f35] text-sm font-medium text-slate-300 hover:bg-[#1e243d] transition">Save Changes</button>
              <button onClick={generate} disabled={generating}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 text-sm font-bold text-[#0a0e1a] hover:shadow-lg hover:shadow-cyan-500/20 transition disabled:opacity-50">
                {generating ? "Generating…" : "⚡ Generate 3 Variants"}
              </button>
            </div>
          </div>
        </aside>

        {/* ═══ RIGHT PANEL — TIMETABLE GRID ═══ */}
        <main className="flex-1 overflow-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Schedule — {selectedBatch?.name ?? "All Batches"}</h2>
            {agentStatus?.agentName === "Timetable AI" && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${agentStatus.taskStatus === "Running" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
                <span className="text-slate-400">{agentStatus.taskDescription}</span>
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-6 gap-px bg-white/5 rounded-xl overflow-hidden">
            {/* Header row */}
            <div className="bg-[#0f1322] px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Time</div>
            {DAY_SHORT.map(d => (
              <div key={d} className="bg-[#0f1322] px-3 py-2 text-xs font-semibold text-slate-400 uppercase text-center">{d}</div>
            ))}
            {/* Slot rows */}
            {SLOTS.map(slot => (
              <>
                <div key={`t-${slot.i}`} className="bg-[#0f1322] px-3 py-2 text-[11px] text-slate-500 flex items-start pt-3">{slot.l}</div>
                {DAYS.map(day => {
                  const cellSlots = gridSlots.filter(s => s.day === day && s.slot_index === slot.i);
                  return (
                    <div key={`${day}-${slot.i}`} className="bg-[#0f1322] p-1 min-h-[80px]">
                      {cellSlots.map(s => (
                        <div key={s.id} className={`rounded-lg p-2 mb-1 text-xs ${s.is_lab ? "bg-purple-900/40 border border-purple-500/20" : "bg-[#141e3a] border border-white/5"}`}>
                          <p className="font-semibold text-white truncate" title={s.subject}>{s.subject.length > 20 ? s.subject.slice(0,18)+"…" : s.subject}</p>
                          <p className="text-slate-400 mt-0.5">👤 {s.teacher}</p>
                          <div className="flex justify-between mt-0.5 text-[10px]">
                            <span className="text-slate-500">🏛 {s.room}</span>
                            {s.is_lab && <span className="text-purple-400 font-medium">Lab {s.batch.split("Lab ")[1] ?? ""}</span>}
                            {!s.is_lab && <span className="text-cyan-500/60">{s.batch.length > 12 ? s.batch.slice(0,10)+"…" : s.batch}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ))}
          </div>

          {gridSlots.length === 0 && (
            <div className="mt-20 text-center text-slate-600">
              <p className="text-4xl mb-3">📅</p>
              <p className="text-sm">No schedule data yet. Generate variants to see the timetable here.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
