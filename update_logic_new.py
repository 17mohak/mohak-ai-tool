import sys

def main():
    path = r"c:\Users\MOHAK\mohak-ai-tool\frontend\src\app\(dashboard)\scheduler\page.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Imports
    if "import { motion" not in content:
        content = content.replace('import { api, fetchWithAuth } from "@/lib/api";', 'import { api, fetchWithAuth } from "@/lib/api";\nimport { motion, AnimatePresence } from "framer-motion";\nimport { AnimatedBackground } from "@/components/ui/AnimatedBackground";')

    # 2. getCell logic (exact string replace)
    old_get_cell = """  const getCell = (day: string, slotIndex: number): SlotEntry[] => {
    const normalizedDay = normalizeDay(day);
    const key = `${normalizedDay}-${slotIndex}`;
    const slots = slotMap.get(key) || [];
    
    // DEBUG: Log EVERY cell lookup
    console.log(`getCell("${day}" → "${normalizedDay}", ${slotIndex}):`, slots.length, "slots");
    
    return slots;
  };"""

    new_get_cell = """  const getCell = (day: string, slotIndex: number): SlotEntry[] => {
    const entries = gridSlots.filter((s) => {
      return (
        normalizeDay(s.day) === normalizeDay(day) &&
        Number(s.slot_index) === Number(slotIndex)
      );
    });
    return entries;
  };"""
    content = content.replace(old_get_cell, new_get_cell)

    # 3. Data Scoping: unassignedSubjects
    old_unassigned = """  /* ── Unassigned Subjects computation ── */
  const unassignedSubjects = useMemo(() => {
    if (!state?.subjects) return [];
    return state.subjects.filter(s => {
      const allocCount = gridSlots.filter(g => g.subject_id === s.id).length;
      return allocCount < s.credits; 
    });
  }, [state?.subjects, gridSlots]);"""

    new_unassigned = """  /* ── Scoped Subjects & Faculty ── */
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
  }, [filteredSubjects, gridSlots]);"""
    content = content.replace(old_unassigned, new_unassigned)

    # 5. AI Operator action
    old_ai_action = "`/api/scheduler/schedule/${encodeURIComponent(selectedDeptName)}/ai-action`"
    new_ai_action = "`/api/mcp/execute`"
    content = content.replace(old_ai_action, new_ai_action)
    
    old_body = """body: JSON.stringify({ 
          action, 
          run_id: selectedRunId,
          prompt: customInput || undefined
        })"""
    new_body = """body: JSON.stringify({ 
          command: customInput || action, 
          context: { runId: selectedRunId, batchId: selectedBatchId }
        })"""
    content = content.replace(old_body, new_body)

    # 6. UI Rewrite
    return_str = '  return (\n    <div className="flex flex-col h-[calc(100vh-5rem)] relative overflow-hidden bg-slate-950">'
    return_idx = content.find(return_str)
    
    if return_idx == -1:
       print("FAILED TO FIND MAIN RETURN STATEMENT")
       sys.exit(1)
       
    top_code = content[:return_idx]
    
    with open("c:/Users/MOHAK/mohak-ai-tool/new_ui.tsx", "r", encoding="utf-8") as ui_file:
         new_ui = ui_file.read()

    new_content = top_code + new_ui

    with open(path, "w", encoding="utf-8") as f:
         f.write(new_content)

    print("Success: page.tsx updated")

if __name__ == "__main__":
    main()
