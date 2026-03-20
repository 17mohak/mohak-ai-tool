"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

/* ── Types ─────────────────────────────────── */
export interface DeptRow { id: number; name: string; batch_count: number; teacher_count: number; subject_count: number; }
export interface BatchRow { id: number; name: string; size: number; max_classes_per_day: number; department_id: number; parent_batch_id: number | null; is_lab: boolean; }
export interface TeacherRow { id: number; name: string; email: string | null; department_id: number; preferred_start_slot: number; preferred_end_slot: number; max_classes_per_day: number; }
export interface SubjectRow { id: number; name: string; code: string | null; credits: number; department_id: number; department_name: string; batch_id: number | null; batch_name: string; teacher_id: number | null; teacher_name: string; }
export interface RoomRow { id: number; name: string; capacity: number; is_lab: boolean; }
export interface PinnedSlotRow { id: number; subject_id: number; subject_name: string; day: string; slot_index: number; }
export interface UnavailRow { id: number; teacher_id: number; day: string; slot_index: number; }
export interface RunRow { id: number; department_id: number; department_name: string; status: string; solver_status: string; reason: string | null; created_at: string | null; }
export interface ValidationResult { department: string; department_id: number; can_generate: boolean; errors: { type: string; message: string }[]; warnings: { type: string; message: string }[]; summary: { batches: number; teachers: number; subjects: number; rooms: number }; }

/* ── Generic fetcher hook ──────────────────── */
export function useData<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<T>(path);
      setData(res);
    } catch (e: any) {
      setError(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, error, refresh, setData };
}
