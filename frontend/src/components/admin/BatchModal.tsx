import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  initialData?: any;
  departments: any[];
  parentBatches: any[];
  selectedDept?: number | null; // useful if creating from context
}

export function BatchModal({ isOpen, onClose, onSubmit, initialData, departments, parentBatches, selectedDept }: BatchModalProps) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(60);
  const [maxClasses, setMaxClasses] = useState(4);
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [parentBatchId, setParentBatchId] = useState<number | "">("");
  const [isLab, setIsLab] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setSize(initialData?.size || 60);
      setMaxClasses(initialData?.max_classes_per_day || 4);
      setDepartmentId(initialData?.department_id || selectedDept || "");
      setParentBatchId(initialData?.parent_batch_id || "");
      setIsLab(initialData?.is_lab || false);
    }
  }, [isOpen, initialData, selectedDept]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || departmentId === "") return;
    
    setIsSubmitting(true);
    const success = await onSubmit({
      name,
      size: Number(size),
      max_classes_per_day: Number(maxClasses),
      department_id: Number(departmentId),
      parent_batch_id: parentBatchId ? Number(parentBatchId) : null,
      is_lab: isLab
    });
    setIsSubmitting(false);
    
    if (success) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? "Edit Batch" : "New Batch"}
      description="Create parent batches or nested lab batches."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !name.trim() || departmentId === ""}>
            {isSubmitting ? "Saving..." : "Save Batch"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2 text-slate-200">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium text-slate-300">Department</label>
            <Select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={isSubmitting || !!selectedDept}
            >
              <option value="" disabled>Select Department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
            <label className="text-sm font-medium text-slate-300">Batch Name</label>
            <Input
              placeholder="e.g. SY Voyagers"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
            <label className="text-sm font-medium text-slate-300">Student Count</label>
            <Input
              type="number"
              min={1}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              disabled={isSubmitting}
            />
          </div>

          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium text-slate-300">Max Classes Per Day</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxClasses}
              onChange={(e) => setMaxClasses(Number(e.target.value))}
              disabled={isSubmitting}
            />
          </div>

          <div className="col-span-2 flex items-center gap-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 mt-2">
            <input
              type="checkbox"
              id="isLab"
              checked={isLab}
              onChange={(e) => setIsLab(e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
            />
            <div className="flex flex-col">
              <label htmlFor="isLab" className="text-sm font-medium text-slate-200 cursor-pointer">
                This is a Lab Batch
              </label>
              <span className="text-xs text-slate-400">Lab batches are usually subsets of parent batches.</span>
            </div>
          </div>

          {isLab && (
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium text-slate-300">Parent Batch (Optional)</label>
              <Select
                value={parentBatchId}
                onChange={(e) => setParentBatchId(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={isSubmitting}
              >
                <option value="">None (Top-level Lab)</option>
                {parentBatches.filter(b => b.department_id === departmentId).map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
