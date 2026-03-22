import re

filepath = r'c:\Users\MOHAK\mohak-ai-tool\frontend\src\app\(dashboard)\scheduler\page.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add ValidationIssue interface
if 'interface ValidationIssue' not in content:
    content = content.replace(
        'interface VariantResult {',
        'interface ValidationIssue { batch: string; required: number; available: number; reason: string; }\ninterface VariantResult {'
    )

# 2. Add new states
state_target = '  const [genDiag, setGenDiag] = useState<string | null>(null);'
state_repl = '  const [genDiag, setGenDiag] = useState<string | null>(null);\n  const [genIssues, setGenIssues] = useState<ValidationIssue[] | null>(null);\n  const [generationStep, setGenerationStep] = useState<string | null>(null);\n  const [aiLogs, setAiLogs] = useState<string[]>([]);\n  const [aiCommand, setAiCommand] = useState<string>("");'
if 'genIssues' not in content:
    content = content.replace(state_target, state_repl)

# 3. Replace validateSchedulePossible
old_validate = '''  /* ── Validation: Check if schedule is possible ── */
  const validateSchedulePossible = (): { valid: boolean; error?: string } => {
    if (!state) return { valid: false, error: "No state loaded" };
    
    // Calculate total credits per batch
    const batchCredits = new Map<number, number>();
    state.subjects.forEach(s => {
      if (s.batch_id) {
        const current = batchCredits.get(s.batch_id) || 0;
        batchCredits.set(s.batch_id, current + s.credits);
      }
    });
    
    // Calculate available slots per batch
    // Available slots = days × available_time_slots
    const availableSlotsPerDay = AVAILABLE_SLOTS.length;
    const totalAvailableSlots = DAYS.length * availableSlotsPerDay;
    
    // Check each batch
    for (const [batchId, credits] of Array.from(batchCredits.entries())) {
      if (credits > totalAvailableSlots) {
        const batch = state.batches.find(b => b.id === batchId);
        return {
          valid: false,
          error: `Cannot generate schedule: ${batch?.name || 'Unknown batch'} requires ${credits} slots but only ${totalAvailableSlots} are available.`
        };
      }
    }
    
    return { valid: true };
  };'''

new_validate = '''  /* ── Validation: Check if schedule is possible ── */
  const validateSchedulePossible = (): { valid: boolean; issues?: ValidationIssue[] } => {
    if (!state) return { valid: false, issues: [{ batch: "System", required: 0, available: 0, reason: "No state loaded" }] };
    
    const batchCredits = new Map<number, number>();
    state.subjects.forEach(s => {
      if (s.batch_id) {
        const current = batchCredits.get(s.batch_id) || 0;
        batchCredits.set(s.batch_id, current + s.credits);
      }
    });

    const availableSlotsPerDay = AVAILABLE_SLOTS.length;
    const totalAvailableSlots = DAYS.length * availableSlotsPerDay;
    const issues: ValidationIssue[] = [];

    for (const [batchId, credits] of Array.from(batchCredits.entries())) {
      if (credits > totalAvailableSlots) {
        const batch = state.batches.find(b => b.id === batchId);
        issues.push({
          batch: batch?.name || "Unknown batch",
          required: credits,
          available: totalAvailableSlots,
          reason: "Time slots exceeded logic limits"
        });
      }
    }
    return { valid: issues.length === 0, issues };
  };'''

content = content.replace(old_validate, new_validate)

# 4. Replace handleGenerate
old_handleGenerate = '''  /* ── Generate variants ── */
  const handleGenerate = async () => {
    if (!selectedDeptName) return;
    
    // Validate before generation
    const validation = validateSchedulePossible();
    if (!validation.valid) {
      setGenDiag(validation.error || "Validation failed");
      return;
    }
    
    setGenerating(true); 
    setGenDiag(null);
    
    try {
      const res = await api<{ variants: VariantResult[] }>(`/api/scheduler/generate-variants/${encodeURIComponent(selectedDeptName)}`, { method: "POST" });
      
      console.log("GEN RESPONSE:", res);
      
      // Extract variants from response - handle multiple possible formats
      const variants = res?.variants || (res as any)?.runs || (res as any)?.data || [];
      console.log("EXTRACTED VARIANTS:", variants);
      
      // Convert variants to RunItem format
      const newRuns: RunItem[] = variants.map((v: VariantResult) => ({
        id: v.run_id || v.id || 0,
        status: v.status === "SUCCESS" ? "DRAFT" : "FAILED",
        solver_status: v.status || "FAILED",
        reason: v.reason || null,
        created_at: v.created_at || new Date().toISOString()
      }));
      
      console.log("CONVERTED RUNS:", newRuns);
      
      // Update runs state directly (NOT via state object)
      setRuns(prevRuns => {
        const updated = [...prevRuns, ...newRuns];
        console.log("RUNS STATE UPDATED:", updated.length, updated);
        return updated;
      });
      
      // Also update state.runs for consistency
      setState(prev => {
        if (!prev) return null;
        return { ...prev, runs: [...prev.runs, ...newRuns] };
      });
      
      // Set selected run to first successful variant
      const successRuns = newRuns.filter(r => r.solver_status === "SUCCESS");
      if (successRuns.length > 0) {
        console.log("SETTING SELECTED RUN:", successRuns[0].id);
        setSelectedRunId(successRuns[0].id);
      }
      
      // Show diagnostics for failures
      const failures = variants.filter((v: VariantResult) => v.status !== "SUCCESS");
      if (failures.length > 0) {
        setGenDiag(`${successRuns.length}/3 variants succeeded. ${failures.map((f: VariantResult) => f.reason || f.status).join("; ")}`);
      }
      
      // DISABLED: refreshState() was overwriting with stale data
      // await refreshState();
    } catch (err) {
      console.error("[Scheduler] Generation failed:", err);
      setGenDiag(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };'''

new_handleGenerate = '''  /* ── Generate variants ── */
  const handleGenerate = async () => {
    if (!selectedDeptName) return;
    
    const validation = validateSchedulePossible();
    if (!validation.valid) {
      setGenIssues(validation.issues || null);
      return;
    }
    
    setGenerating(true); 
    setGenIssues(null);
    setGenDiag(null);
    setGenerationStep("Validating...");
    
    try {
      // Small simulated async stage
      await new Promise(r => setTimeout(r, 600));
      setGenerationStep("Processing variants...");

      const res = await api<{ variants: VariantResult[] }>(`/api/scheduler/generate-variants/${encodeURIComponent(selectedDeptName)}`, { method: "POST" });
      
      // Extract variants from response
      const variants = res?.variants || (res as any)?.runs || (res as any)?.data || [];
      
      // Convert variants to RunItem format
      const newRuns: RunItem[] = variants.map((v: VariantResult) => ({
        id: v.run_id || v.id || 0,
        status: v.status === "SUCCESS" ? "DRAFT" : "FAILED",
        solver_status: v.status || "FAILED",
        reason: v.reason || null,
        created_at: v.created_at || new Date().toISOString()
      }));
      
      // Update runs state directly (NOT via state object)
      setRuns(prevRuns => [...prevRuns, ...newRuns]);
      
      // AUTO-SELECTION (MANDATORY)
      const successRuns = newRuns.filter(r => r.solver_status === "SUCCESS");
      let selectedRun = null;
      if (successRuns.length > 0) {
        // Sort by ID descending (latest first)
        selectedRun = successRuns.sort((a, b) => b.id - a.id)[0];
      } else if (newRuns.length > 0) {
        // Fallback to first run available
        selectedRun = newRuns[0];
      }

      if (selectedRun) {
        setSelectedRunId(selectedRun.id);
        // Force slot fetch immediately because selectedRunId changed
        hasFetchedGrid.current = false;
      }
      
      const failures = variants.filter((v: VariantResult) => v.status !== "SUCCESS");
      if (failures.length > 0 && successRuns.length === 0) {
        // All Failed
        setGenIssues([{
          batch: "Solver AI",
          required: 0,
          available: 0,
          reason: failures[0].reason || "Impossible parameters. Try reducing subjects or increasing slots."
        }]);
      } else if (failures.length > 0) {
        setGenDiag(`${successRuns.length} variants succeeded. Some failed: ${failures[0].reason}`);
      }
      
    } catch (err) {
      console.error("[Scheduler] Generation failed:", err);
      setGenDiag("Generation failed: Backend unreachable or solver err.");
    } finally {
      setGenerating(false);
      setGenerationStep(null);
    }
  };'''

content = content.replace(old_handleGenerate, new_handleGenerate)

# Check if handleGenerate substitution worked.
# It might fail if line endings are strictly \r\n, so we can try normalizing.
if new_handleGenerate not in content:
    content = content.replace(old_handleGenerate.replace('\n', '\r\n'), new_handleGenerate.replace('\n', '\r\n'))

if new_validate not in content:
    content = content.replace(old_validate.replace('\n', '\r\n'), new_validate.replace('\n', '\r\n'))

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated page.tsx logic natively via replace.")
