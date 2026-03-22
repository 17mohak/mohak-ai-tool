import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export interface SubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  initialData?: any;
  departments: any[];
  batches: any[];
  teachers: any[];
  selectedDept?: number | null;
}

export function SubjectModal({ isOpen, onClose, onSubmit, initialData, departments, batches, teachers, selectedDept }: SubjectModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState(3);
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [batchId, setBatchId] = useState<number | "">("");
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || "");
      setCode(initialData?.code || "");
      setCredits(initialData?.credits || 3);
      setDepartmentId(initialData?.department_id || selectedDept || "");
      setBatchId(initialData?.batch_id || "");
      setTeacherId(initialData?.teacher_id || "");
    }
  }, [isOpen, initialData, selectedDept]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || departmentId === "") return;
    
    setIsSubmitting(true);
    const success = await onSubmit({
      name,
      code,
      credits: Number(credits),
      department_id: Number(departmentId),
      batch_id: batchId ? Number(batchId) : null,
      teacher_id: teacherId ? Number(teacherId) : null,
    });
    setIsSubmitting(false);
    
    if (success) onClose();
  };

  const filteredBatches = batches.filter(b => b.department_id === departmentId);
  const filteredTeachers = teachers.filter(t => t.department_id === departmentId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? "Edit Subject" : "New Subject"}
      description="Create a subject and map it to a batch and faculty member."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting || !name.trim() || departmentId === ""}>
            {isSubmitting ? "Saving..." : "Save Subject"}
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
            <label className="text-sm font-medium text-slate-300">Subject Name</label>
            <Input
              placeholder="e.g. Data Structures"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
            <label className="text-sm font-medium text-slate-300">Subject Code</label>
            <Input
              placeholder="e.g. CS201"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1">
            <label className="text-sm font-medium text-slate-300">Credits / Hours per week</label>
            <Input
              type="number"
              min={1}
              max={10}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 col-span-2 sm:col-span-1 border-b border-transparent">
             {/* Spacing placeholder to keep grid aligned */}
          </div>

          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium text-slate-300">Assigned Batch (Optional)</label>
            <Select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={isSubmitting || departmentId === ""}
            >
              <option value="">None / Floating Subject</option>
              {filteredBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name} {batch.is_lab ? "(Lab)" : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium text-slate-300">Assigned Faculty (Optional)</label>
             <Select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={isSubmitting || departmentId === ""}
            >
              <option value="">None / To Be Decided</option>
              {filteredTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </form>
    </Modal>
  );
}
