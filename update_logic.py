import re
import sys

def main():
    path = r"c:\Users\MOHAK\mohak-ai-tool\frontend\src\app\(dashboard)\scheduler\page.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Imports
    if "import { motion" not in content:
        content = content.replace('import { api, fetchWithAuth } from "@/lib/api";', 'import { api, fetchWithAuth } from "@/lib/api";\nimport { motion, AnimatePresence } from "framer-motion";\nimport { AnimatedBackground } from "@/components/ui/AnimatedBackground";')

    # 2. Logic: normalizeDay
    normalize_day_str = """  const normalizeDay = (day: string) =>
    day?.slice(0, 3).toUpperCase();"""
    
    # We will just replace the old getCell implementation completely.
    # The old getCell and slotMap are around: 
    # // Build lookup map for efficient rendering ... to ... return slots; }
    
    # We can use regex to remove slotMap and getCell entirely, and insert the new one.
    content = re.sub(
        r"// Build lookup map for efficient rendering.*?const getCell = \(.*?\) => \{.*?\n  \};\n+",
        "",
        content,
        flags=re.DOTALL
    )

    # Old gridSlots debug block ... we can remove or keep. Let's insert new normalizeDay and getCell before successRuns
    # We look for:
    # const successRuns = runs.filter(r => r.solver_status === "SUCCESS");
    
    new_get_cell = """
  const normalizeDay = (day: string) => day?.slice(0, 3).toUpperCase();

  const getCell = (day: string, slotIndex: number): SlotEntry[] => {
    const entries = gridSlots.filter((s) => {
      return (
        normalizeDay(s.day) === normalizeDay(day) &&
        Number(s.slot_index) === Number(slotIndex)
      );
    });
    return entries;
  };

  """
    content = content.replace("  const successRuns = runs.filter(r => r.solver_status === \"SUCCESS\");", new_get_cell + "  const successRuns = runs.filter(r => r.solver_status === \"SUCCESS\");")

    # 3. Data Scoping: unassignedSubjects and filteredFaculty
    content = re.sub(
        r"  /\* ── Unassigned Subjects computation ── \*/.*?  }, \[state\?\.subjects, gridSlots\]\);\n+",
        """  /* ── Scoped Subjects & Faculty ── */
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
""",
        content,
        flags=re.DOTALL
    )

    # 4. Filter lists in sidebar
    # Replace uses of state?.subjects with filteredSubjects in sidebar (not pins)
    content = content.replace("state?.subjects ? state.subjects.map", "filteredSubjects.length ? filteredSubjects.map")
    content = content.replace("state?.teachers.length ? state.teachers.map", "filteredFaculty.length ? filteredFaculty.map")
    
    # AI Operator action
    old_ai_action = "`/api/scheduler/schedule/${encodeURIComponent(selectedDeptName)}/ai-action`"
    new_ai_action = "`/api/mcp/execute`"
    content = content.replace(old_ai_action, new_ai_action)
    
    # Payload replacement for AI action
    old_body = "body: JSON.stringify({ \n          action, \n          run_id: selectedRunId,\n          prompt: customInput || undefined\n        })"
    new_body = "body: JSON.stringify({ \n          command: customInput || action, \n          context: { runId: selectedRunId, batchId: selectedBatchId }\n        })"
    content = content.replace(old_body, new_body)

    # 5. UI Rewrite
    # The entire return(...) section.
    # We find where:
    # console.log("[RENDER] ========================================");
    # finishes, and then replace everything until the end.
    
    return_idx = content.find('  return (\n    <div className="flex flex-col h-[calc(100vh-5rem)] relative overflow-hidden bg-slate-950">')
    if return_idx == -1:
       print("Failed to find exact main return statement. Trying fallback...")
       return_idx = content.rfind("  return (") # Last return in the file is the main component return!
       
    if return_idx == -1:
       print("Failed completely.")
       return
       
    top_code = content[:return_idx]
    
    # We supply the massive new UI!
    with open("c:/Users/MOHAK/mohak-ai-tool/new_ui.tsx", "r", encoding="utf-8") as ui_file:
         new_ui = ui_file.read()

    new_content = top_code + new_ui

    with open(path, "w", encoding="utf-8") as f:
         f.write(new_content)

    print("Success: page.tsx updated")

if __name__ == "__main__":
    main()
